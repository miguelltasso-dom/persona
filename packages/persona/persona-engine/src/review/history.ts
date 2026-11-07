/** Review delivery for ordinary folders, with private Git objects and independent drafts. */
import { existsSync, realpathSync } from 'node:fs'
import { chmod, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { Assignment, Ticket } from '../core/model.ts'
import { confinePath } from '../executor/confine.ts'
import { GitReviewDelivery, type GitReviewOptions } from './git.ts'
import { HistoryGit } from './history-git.ts'
import { copyHistoryFiles, historyFileOps, historyFiles, historySegment, HistoryReviewError, parseHistoryJson, type HistoryFile, type HistoryFileOps } from './history-files.ts'
import { redactSecrets, testsClaimedOf } from './redact.ts'
import { applyHistoryTransaction, recoverHistoryTransactions, type HistoryReplacement } from './history-transaction.ts'
import { parseReviewRestorePointId, type ReviewRestorePointId } from './restore-point-id.ts'
import { REVIEW_PATCH_LIMIT_BYTES, type MergeMode, type ReviewAcceptResult, type ReviewApplyOptions, type ReviewDelivery, type ReviewFileChange,
  type ReviewFileConflict, type ReviewFileVersion, type ReviewRestorePoint, type ReviewSummary, type ReviewUndoResult, type ReviewWorktree } from './types.ts'

/** Default logical-byte limit, configurable per project through HistoryReviewOptions. */
export const HISTORY_COPY_LIMIT_BYTES: number = 256 * 1024 * 1024
/** Required lifetime of an automatic point before an application. */
export const HISTORY_RESTORE_RETENTION_MS: number = 30 * 24 * 60 * 60 * 1000

const historyQueues = new Map<string, Promise<void>>()

function canonicalPath(path: string): string {
  const absolute = resolve(path)
  let parent = absolute
  const missing: string[] = []
  while (!existsSync(parent)) {
    const next = dirname(parent)
    if (next === parent) return absolute
    missing.unshift(basename(parent))
    parent = next
  }
  return join(realpathSync(parent), ...missing)
}

/** Private history settings; paths and resource limits are explicit host inputs. */
export interface HistoryReviewOptions extends GitReviewOptions {
  projectId: string
  personaHome: string
  maxCopyBytes?: number
  gitTimeoutMs?: number
  fileOps?: HistoryFileOps
  now?: () => string
}

interface DraftRecord { version: 1; ticketId: string; assignmentId: string; base: string; applied?: string; restorePointId?: ReviewRestorePointId }
interface RestoreRecord extends ReviewRestorePoint { version: 1; before: string; after: string }
interface PlannedFile { path: string; version: ReviewFileVersion | null }

function sameVersion(a: ReviewFileVersion | null, b: ReviewFileVersion | null): boolean {
  return a === null ? b === null : b !== null && a.hash === b.hash && a.mode === b.mode
}

/**
 * Select the existing Git implementation by filesystem metadata without launching a process.
 * @param options - Project, private data directory, platform operations, and resource limits.
 * @returns Existing Git delivery or private history for an ordinary folder.
 */
export function createReviewDelivery(options: HistoryReviewOptions): ReviewDelivery {
  historySegment(options.projectId)
  let current = resolve(options.projectRoot)
  for (;;) {
    if (existsSync(join(current, '.git'))) return new GitReviewDelivery(options)
    const parent = dirname(current)
    if (parent === current) return new HistoryReviewDelivery(options)
    current = parent
  }
}

/** Private history for one ordinary project; construction and an empty summary create no files. */
export class HistoryReviewDelivery implements ReviewDelivery {
  private readonly root: string
  private readonly home: string
  private readonly history: string
  private readonly trees: string
  private readonly gitDir: string
  private readonly git: HistoryGit
  private readonly files: HistoryFileOps
  private readonly copyLimit: number
  private readonly patchLimit: number
  private readonly feedback: GitReviewDelivery

  /** @param options - Explicit project paths and validated resource limits. */
  constructor(private readonly options: HistoryReviewOptions) {
    this.root = canonicalPath(options.projectRoot)
    this.home = canonicalPath(options.personaHome)
    this.history = confinePath(join(this.home, 'history'), historySegment(options.projectId))
    this.trees = canonicalPath(options.worktreesRoot)
    this.gitDir = join(this.history, 'git')
    this.copyLimit = options.maxCopyBytes ?? HISTORY_COPY_LIMIT_BYTES
    this.patchLimit = options.patchLimitBytes ?? REVIEW_PATCH_LIMIT_BYTES
    const timeout = options.gitTimeoutMs ?? 30_000
    for (const value of [this.copyLimit, this.patchLimit, timeout]) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError('History review limits must be positive safe integers')
    }
    this.git = new HistoryGit({ git: options.git ?? 'git', directory: this.root, timeoutMs: timeout })
    this.files = options.fileOps ?? historyFileOps
    this.feedback = new GitReviewDelivery(options)
  }

  private serial<T>(work: () => Promise<T>, create = false): Promise<T> {
    const previous = historyQueues.get(this.history) ?? Promise.resolve()
    const result = previous.then(async () => {
      if (create) await mkdir(this.history, { recursive: true, mode: 0o700 })
      if (!existsSync(this.history)) return work()
      const lockPath = join(this.history, 'operation.lock')
      const acquire = async () => {
        try { return await open(lockPath, 'wx', 0o600) }
        catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
          const pid = Number(await readFile(lockPath, 'utf8'))
          let alive = true
          if (Number.isSafeInteger(pid) && pid > 0) {
            try { process.kill(pid, 0) } catch (failure) {
              if (failure instanceof Error && 'code' in failure && failure.code === 'ESRCH') alive = false
            }
          }
          if (alive) throw new HistoryReviewError('history_busy', 'Outra tarefa está atualizando esta pasta. Aguarde e tente de novo.')
          await rm(lockPath)
          return open(lockPath, 'wx', 0o600)
        }
      }
      const lock = await acquire()
      try {
        await lock.writeFile(String(process.pid))
        await recoverHistoryTransactions(this.root, this.history)
        return await work()
      } finally { await lock.close(); await rm(lockPath, { force: true }) }
    })
    const completed = result.then(() => {}, () => {})
    historyQueues.set(this.history, completed)
    void completed.then(() => { if (historyQueues.get(this.history) === completed) historyQueues.delete(this.history) })
    return result
  }

  private recordPath(id: string): string { return confinePath(join(this.history, 'drafts'), `${historySegment(id)}.json`) }
  private draftPath(id: string): string { return confinePath(this.trees, historySegment(id)) }
  private indexPath(id: string): string { return confinePath(join(this.history, 'indexes'), historySegment(id)) }

  private async record(id: string): Promise<DraftRecord | undefined> {
    let body: string
    try { body = await readFile(this.recordPath(id), 'utf8') }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined; throw error }
    const value = parseHistoryJson(body)
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1
      || !('ticketId' in value) || value.ticketId !== id || !('assignmentId' in value) || typeof value.assignmentId !== 'string'
      || !('base' in value) || typeof value.base !== 'string' || !/^[a-f\d]{40,64}$/u.test(value.base)
      || ('applied' in value && (typeof value.applied !== 'string' || !/^[a-f\d]{40,64}$/u.test(value.applied)))
      || ('restorePointId' in value && typeof value.restorePointId !== 'string')) {
      throw new HistoryReviewError('history_invalid', 'O histórico desta tarefa precisa ser verificado antes de continuar.')
    }
    return { version: 1, ticketId: id, assignmentId: value.assignmentId, base: value.base,
      ...'applied' in value && typeof value.applied === 'string' ? { applied: value.applied } : {},
      ...'restorePointId' in value && typeof value.restorePointId === 'string' ? { restorePointId: parseReviewRestorePointId(value.restorePointId) } : {} }
  }

  private async save(record: DraftRecord): Promise<void> {
    const target = this.recordPath(record.ticketId)
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    const temporary = `${target}.next`
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 })
    await rename(temporary, target)
  }

  private async initialize(): Promise<void> {
    await this.git.run(['--version'])
    await mkdir(join(this.history, 'empty-template'), { recursive: true, mode: 0o700 })
    await mkdir(join(this.history, 'indexes'), { recursive: true, mode: 0o700 })
    if (!existsSync(join(this.gitDir, 'HEAD'))) await this.git.run(['init', '--bare', `--template=${join(this.history, 'empty-template')}`, this.gitDir])
    const settings = { 'core.autocrlf': 'false', 'core.safecrlf': 'false', 'core.longpaths': 'true', 'core.fsmonitor': 'false', 'gc.auto': '0',
      'core.hooksPath': join(this.history, 'empty-template'), 'core.quotepath': 'false' }
    for (const [key, value] of Object.entries(settings)) await this.git.run([`--git-dir=${this.gitDir}`, 'config', key, value])
    await mkdir(join(this.gitDir, 'info'), { recursive: true })
    await writeFile(join(this.gitDir, 'info', 'exclude'), '~$*\nThumbs.db\ndesktop.ini\n*.tmp\n.git\n.git/\n')
  }

  /**
   * Copy a project snapshot into an isolated draft; never creates .git in the user's folder.
   * @param assignment - Task and assignment owning the draft.
   * @returns Private draft location, reusable across host restart.
   */
  async prepare(assignment: Pick<Assignment, 'id'> & { ticketId: string }): Promise<ReviewWorktree> {
    const id = historySegment(assignment.ticketId)
    let files: HistoryFile[] | undefined
    if (!existsSync(this.recordPath(id))) {
      await this.git.run(['--version'])
      files = await historyFiles(this.root, [this.home, this.trees], this.copyLimit)
    }
    return this.serial(async () => {
      const existing = await this.record(id)
      const path = this.draftPath(id)
      if (existing) {
        if (!existsSync(path)) throw new HistoryReviewError('history_invalid', 'Não encontramos os arquivos deste rascunho. Preserve o histórico e peça uma nova revisão.')
        return { ticketId: id, assignmentId: assignment.id, branch: `persona/${id}`, path }
      }
      const sourceFiles = files ?? await historyFiles(this.root, [this.home, this.trees], this.copyLimit)
      if (existsSync(path)) throw new HistoryReviewError('history_invalid', 'Já existe um rascunho sem histórico válido para esta tarefa. Verifique-o antes de continuar.')
      await this.initialize()
      await mkdir(path, { recursive: true, mode: 0o700 })
      try {
        await copyHistoryFiles(this.root, path, sourceFiles, this.files)
        const base = await this.git.snapshot(this.gitDir, path, this.indexPath(id), await historyFiles(path, [], this.copyLimit))
        await this.git.run([`--git-dir=${this.gitDir}`, 'update-ref', `refs/persona/base/${id}`, base])
        await this.save({ version: 1, ticketId: id, assignmentId: assignment.id, base })
      } catch (error) { await rm(path, { recursive: true, force: true }); throw error }
      return { ticketId: id, assignmentId: assignment.id, branch: `persona/${id}`, path }
    }, true)
  }

  private async draftTree(id: string): Promise<string> {
    const root = this.draftPath(id)
    return this.git.snapshot(this.gitDir, root, this.indexPath(id), await historyFiles(root, [], this.copyLimit))
  }

  private async changed(from: string, to: string): Promise<string[]> {
    return (await this.git.run([`--git-dir=${this.gitDir}`, 'diff', '--name-only', '-z', '--no-renames', from, to])).stdout.split('\0').filter(Boolean)
  }

  private currentTree(id: string): Promise<string> {
    return historyFiles(this.root, [this.home, this.trees], this.copyLimit)
      .then(files => this.git.snapshot(this.gitDir, this.root, this.indexPath(`${id}-current`), files))
  }

  private restorePath(id: ReviewRestorePointId): string { return confinePath(join(this.history, 'restore'), `${parseReviewRestorePointId(id)}.json`) }

  private async restoreRecord(id: ReviewRestorePointId): Promise<RestoreRecord> {
    let body: string
    try { body = await readFile(this.restorePath(id), 'utf8') }
    catch (error) { throw new HistoryReviewError('history_invalid', 'Não encontramos este ponto de restauração. Atualize o histórico e tente de novo.', error) }
    const value = parseHistoryJson(body)
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1
      || !('id' in value) || value.id !== id || !('ticketId' in value) || typeof value.ticketId !== 'string'
      || !('createdAt' in value) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || !('expiresAt' in value) || typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt))
      || !('before' in value) || typeof value.before !== 'string' || !/^[a-f\d]{40,64}$/u.test(value.before)
      || !('after' in value) || typeof value.after !== 'string' || !/^[a-f\d]{40,64}$/u.test(value.after)
      || !('state' in value) || (value.state !== 'available' && value.state !== 'undone' && value.state !== 'expired')
      || !('files' in value) || !Array.isArray(value.files)) {
      throw new HistoryReviewError('history_invalid', 'O ponto de restauração precisa ser verificado antes de continuar.')
    }
    const files: string[] = []
    for (const path of value.files) {
      if (typeof path !== 'string') throw new HistoryReviewError('history_invalid', 'Arquivo inválido no ponto de restauração.')
      confinePath(this.root, path)
      files.push(path)
    }
    return { version: 1, id, ticketId: historySegment(value.ticketId), createdAt: value.createdAt, expiresAt: value.expiresAt,
      before: value.before, after: value.after, state: value.state, files }
  }

  private pointView(point: RestoreRecord): ReviewRestorePoint {
    return { id: point.id, ticketId: point.ticketId, createdAt: point.createdAt, expiresAt: point.expiresAt,
      state: point.state === 'available' && Date.parse(point.expiresAt) <= Date.parse(this.options.now?.() ?? new Date().toISOString()) ? 'expired' : point.state,
      files: [...point.files] }
  }

  private async blob(version: ReviewFileVersion): Promise<Buffer> {
    const content = await this.git.run([`--git-dir=${this.gitDir}`, 'cat-file', 'blob', version.hash], undefined, this.copyLimit)
    if (content.truncated) throw new HistoryReviewError('copy_limit', 'Este arquivo excede o limite do rascunho. Aumente o limite antes de continuar.')
    return content.bytes
  }

  private async expectedHash(version: ReviewFileVersion | null): Promise<string | null> {
    return version === null ? null : createHash('sha256').update(await this.blob(version)).digest('hex')
  }

  /**
   * Summarize committed baseline versus current draft bytes, including uncommitted edits and new binaries.
   * @param ticket - Task and its claimed verification.
   * @returns Redacted, bounded review text; empty before prepare.
   */
  summary(ticket: Pick<Ticket, 'id' | 'assignments'>): Promise<ReviewSummary> {
    return this.serial(async () => {
      const record = await this.record(ticket.id)
      const empty: ReviewSummary = { ticketId: ticket.id, files: [], added: 0, deleted: 0, patch: '', patchTruncated: false,
        patchLimitBytes: this.patchLimit, secretsRedacted: false, testsClaimed: testsClaimedOf(ticket.assignments.at(-1)?.report?.summary) }
      if (!record) return empty
      const tree = await this.draftTree(ticket.id)
      const args = [`--git-dir=${this.gitDir}`, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames']
      const stat = await this.git.run([...args, '--numstat', '-z', record.base, tree])
      const files: ReviewFileChange[] = stat.stdout.split('\0').filter(Boolean).map((row) => {
        const [added, deleted, ...path] = row.split('\t')
        return { path: path.join('\t'), added: added === '-' ? 0 : Number(added), deleted: deleted === '-' ? 0 : Number(deleted) }
      })
      const diff = await this.git.run([...args, record.base, tree], undefined, Math.max(65536, this.patchLimit + 4096))
      const redacted = redactSecrets(diff.stdout)
      return { ...empty, files, added: files.reduce((sum, file) => sum + file.added, 0), deleted: files.reduce((sum, file) => sum + file.deleted, 0),
        patch: Buffer.from(redacted.text).subarray(0, this.patchLimit).toString('utf8'),
        patchTruncated: diff.truncated || Buffer.byteLength(redacted.text) > this.patchLimit, secretsRedacted: redacted.redacted }
    })
  }

  /**
   * Apply only the draft's changed files; shared-file changes block before any write.
   * @param ticket - Task to apply.
   * @param mode - Existing review policy, retained for compatibility.
   * @param options - Person's choices for the exact conflicting file versions.
   * @returns Applied result and restoration point, or an actionable conflict before writes.
   */
  accept(ticket: Pick<Ticket, 'id'>, mode: MergeMode, options: ReviewApplyOptions = {}): Promise<ReviewAcceptResult> {
    return this.serial(async () => {
      const record = await this.record(ticket.id)
      if (!record) throw new HistoryReviewError('history_invalid', 'Não encontramos o rascunho desta tarefa. Peça uma nova revisão.')
      if (record.applied) return { kind: 'merged', mode, ...record.restorePointId ? { restorePointId: record.restorePointId } : {} }
      const tree = await this.draftTree(ticket.id)
      const changed = await this.changed(record.base, tree)
      const current = await this.currentTree(ticket.id)
      const userChanged = new Set(await this.changed(record.base, current))
      const userVersions = await this.git.versions(this.gitDir, current)
      const personaVersions = await this.git.versions(this.gitDir, tree)
      const different = new Set(await this.changed(current, tree))
      const conflicts: ReviewFileConflict[] = changed.filter(path => userChanged.has(path) && different.has(path))
        .map(path => ({ path, user: userVersions.get(path) ?? null, persona: personaVersions.get(path) ?? null }))
      const resolutions = new Map((options.conflicts ?? []).map(item => [item.path, item]))
      if (resolutions.size !== (options.conflicts ?? []).length || [...resolutions.values()].some((item) => {
        const conflict = conflicts.find(entry => entry.path === item.path)
        return !conflict || !sameVersion(conflict.user, item.user) || !sameVersion(conflict.persona, item.persona)
      })) throw new HistoryReviewError('conflicts_changed', 'A comparação mudou desde a revisão. Compare os arquivos de novo antes de escolher uma versão.')
      if (conflicts.some(conflict => !resolutions.has(conflict.path))) return { kind: 'blocked',
        explanation: `Você e a persona mudaram o mesmo arquivo: ${conflicts.map(item => item.path).join(', ')}. Escolha qual versão manter antes de aplicar.`, conflicts }
      const plan: PlannedFile[] = []
      const reserved = new Set([...userVersions.keys(), ...personaVersions.keys()].map(path => process.platform === 'win32' ? path.toLowerCase() : path))
      for (const path of changed.filter(file => different.has(file))) {
        const version = personaVersions.get(path) ?? null
        const resolution = resolutions.get(path)
        if (!resolution) { plan.push({ path, version }); continue }
        switch (resolution.choice) {
          case 'keep_mine': break
          case 'keep_persona': plan.push({ path, version }); break
          case 'keep_both': {
            if (version === null) break
            const extension = extname(path)
            const name = basename(path, extension)
            let suffix = 1, duplicate: string
            do {
              // "(rascunho)" ALWAYS (Muse/Lumen, 05/11): the engine does not know the persona's name and the screen promises exactly this; a second copy is "(rascunho 2)".
              duplicate = join(dirname(path), `${name} (rascunho${suffix === 1 ? '' : ` ${suffix}`})${extension}`).replaceAll('\\', '/')
              suffix += 1
            } while (reserved.has(process.platform === 'win32' ? duplicate.toLowerCase() : duplicate) || existsSync(join(this.root, duplicate)))
            reserved.add(process.platform === 'win32' ? duplicate.toLowerCase() : duplicate)
            plan.push({ path: duplicate, version })
            break
          }
          default: { const unexpected: never = resolution.choice; throw new Error('Unsupported review choice', { cause: unexpected }) }
        }
      }
      return this.applyPlan(record, mode, current, tree, plan, userVersions)
    })
  }

  private async applyPlan(record: DraftRecord, mode: MergeMode, current: string, tree: string, plan: readonly PlannedFile[], userVersions: ReadonlyMap<string, ReviewFileVersion>): Promise<ReviewAcceptResult> {
    const staged = join(this.history, 'apply-snapshots', randomUUID())
    await mkdir(staged, { recursive: true, mode: 0o700 })
    try {
      const frozen: { path: string; source?: string }[] = []
      const replacements: HistoryReplacement[] = []
      for (const item of plan) {
        const expectedBefore = await this.expectedHash(userVersions.get(item.path) ?? null)
        if (item.version === null) {
          frozen.push({ path: item.path })
          replacements.push({ area: 'project', path: item.path, kind: 'remove', expectedBefore })
          continue
        }
        const source = confinePath(staged, item.path)
        await mkdir(dirname(source), { recursive: true })
        await writeFile(source, await this.blob(item.version))
        await chmod(source, item.version.mode === '100755' ? 0o755 : 0o644)
        frozen.push({ path: item.path, source })
        replacements.push({ area: 'project', path: item.path, kind: 'copy', source, expectedBefore })
      }
      const after = await this.git.updatedTree(this.gitDir, this.root, this.indexPath(`${record.ticketId}-after`), current, frozen)
      const createdAt = this.options.now?.() ?? new Date().toISOString()
      const point: RestoreRecord = { version: 1, id: parseReviewRestorePointId(randomUUID()), ticketId: record.ticketId, before: current, after,
        createdAt, expiresAt: new Date(Date.parse(createdAt) + HISTORY_RESTORE_RETENTION_MS).toISOString(), state: 'available', files: plan.map(item => item.path) }
      for (const [name, hash] of [['before', current], ['after', after]]) {
        await this.git.run([`--git-dir=${this.gitDir}`, 'update-ref', `refs/persona/restore/${point.id}/${name}`, hash!])
      }
      replacements.push({ area: 'metadata', path: `restore/${point.id}.json`, kind: 'text', content: `${JSON.stringify(point)}\n` },
        { area: 'metadata', path: `drafts/${record.ticketId}.json`, kind: 'text',
          content: `${JSON.stringify({ ...record, applied: tree, restorePointId: point.id })}\n` })
      await applyHistoryTransaction(this.root, this.history, replacements, this.files)
      return { kind: 'merged', mode, restorePointId: point.id }
    } finally { await rm(staged, { recursive: true, force: true }) }
  }

  /**
   * List automatic restoration points, exposing expiration without offering unsafe undo.
   * @returns Safe point metadata, newest first; no file contents or private paths.
   */
  listRestorePoints(): Promise<ReviewRestorePoint[]> {
    return this.serial(async () => {
      if (!existsSync(join(this.history, 'restore'))) return []
      const points: ReviewRestorePoint[] = []
      for (const file of await readdir(join(this.history, 'restore'))) {
        if (!file.endsWith('.json')) continue
        points.push(this.pointView(await this.restoreRecord(parseReviewRestorePointId(file.slice(0, -5)))))
      }
      return points.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    })
  }

  /**
   * Restore exact pre-application bytes once, refusing later edits and expired points.
   * @param restorePointId - Point returned by accept or listRestorePoints.
   * @returns Restored, expired, or a conflict that needs a person's review.
   */
  undoApply(restorePointId: ReviewRestorePointId): Promise<ReviewUndoResult> {
    return this.serial(async () => {
      const point = await this.restoreRecord(restorePointId)
      if (point.state === 'undone') return { kind: 'restored', restorePointId }
      if (this.pointView(point).state === 'expired') return { kind: 'expired', restorePointId }
      const later = new Set(await this.changed(point.after, await this.currentTree(point.ticketId)))
      const conflicts = point.files.filter(path => later.has(path))
      if (conflicts.length) return { kind: 'blocked', explanation: `Estes arquivos mudaram depois da aplicação: ${conflicts.join(', ')}. Preserve as alterações e revise antes de desfazer.` }
      const staged = join(this.history, 'undo', randomUUID())
      await mkdir(staged, { recursive: true, mode: 0o700 })
      try {
        const versions = await this.git.versions(this.gitDir, point.before)
        const appliedVersions = await this.git.versions(this.gitDir, point.after)
        const replacements: HistoryReplacement[] = []
        for (const path of point.files) {
          const version = versions.get(path)
          const expectedBefore = await this.expectedHash(appliedVersions.get(path) ?? null)
          if (version === undefined) { replacements.push({ area: 'project', path, kind: 'remove', expectedBefore }); continue }
          const source = confinePath(staged, path)
          await mkdir(dirname(source), { recursive: true })
          await writeFile(source, await this.blob(version))
          await chmod(source, version.mode === '100755' ? 0o755 : 0o644)
          replacements.push({ area: 'project', path, kind: 'copy', source, expectedBefore })
        }
        replacements.push({ area: 'metadata', path: `restore/${point.id}.json`, kind: 'text', content: `${JSON.stringify({ ...point, state: 'undone' })}\n` })
        const record = await this.record(point.ticketId)
        if (record?.restorePointId === point.id) replacements.push({ area: 'metadata', path: `drafts/${record.ticketId}.json`, kind: 'text',
          content: `${JSON.stringify({ version: 1, ticketId: record.ticketId, assignmentId: record.assignmentId, base: record.base })}\n` })
        await applyHistoryTransaction(this.root, this.history, replacements, this.files)
        return { kind: 'restored', restorePointId }
      } finally { await rm(staged, { recursive: true, force: true }) }
    })
  }

  /**
   * Request another revision under the existing mandate.
   * @param ticket - Task under review.
   * @param feedback - Person's requested changes.
   */
  requestChanges(ticket: Pick<Ticket, 'id' | 'mandate'>, feedback: string): Promise<void> { return this.feedback.requestChanges(ticket, feedback) }

  /**
   * Remove a known private draft, retaining private history objects.
   * @param ticket - Task whose draft is no longer needed.
   */
  discard(ticket: Pick<Ticket, 'id'>): Promise<void> {
    return this.serial(async () => {
      if (!await this.record(ticket.id)) return
      await rm(this.draftPath(ticket.id), { recursive: true, force: true })
      await rm(this.recordPath(ticket.id), { force: true })
    })
  }

  /**
   * Remove only recorded drafts whose tasks are no longer open; never initializes history for a text-only task.
   * @returns Removed task identifiers.
   */
  async sweepOrphans(): Promise<string[]> {
    if (!existsSync(join(this.history, 'drafts'))) return []
    const open = new Set(this.options.openTicketIds?.() ?? [])
    const removed: string[] = []
    for (const name of await readdir(join(this.history, 'drafts'))) {
      if (!name.endsWith('.json')) continue
      const id = historySegment(name.slice(0, -5))
      if (open.has(id)) continue
      await this.discard({ id })
      removed.push(id)
    }
    return removed
  }
}

/** Journaled file replacement with rollback before any review operation resumes. */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { confineAbsolute, confinePath } from '../executor/confine.ts'
import { HistoryReviewError, parseHistoryJson, type HistoryFileOps } from './history-files.ts'

/** A user-file or review-record replacement; all content is staged before writes begin. */
export type HistoryReplacement = { area: 'project' | 'metadata'; path: string; expectedBefore?: string | null } & (
  | { kind: 'copy'; source: string }
  | { kind: 'text'; content: string }
  | { kind: 'remove' }
)

interface Entry { area: 'project' | 'metadata'; path: string; before: string | null; after: string | null; started: boolean }
interface Journal { version: 1; phase: 'prepared' | 'applying' | 'committed'; entries: Entry[]; directories: string[] }

async function hash(path: string): Promise<string | null> {
  try {
    if (!(await lstat(path)).isFile()) throw new HistoryReviewError('unsafe_path', 'Este caminho deixou de ser um arquivo comum. Revise a pasta e tente de novo.')
    return createHash('sha256').update(await readFile(path)).digest('hex')
  }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null; throw error }
}

function target(root: string, metadata: string, entry: Pick<Entry, 'area' | 'path'>): string {
  const base = entry.area === 'project' ? root : metadata
  if (entry.area === 'project' && entry.path.split(/[/\\]/u).some(segment => segment.toLowerCase() === '.git')) {
    throw new HistoryReviewError('unsafe_path', 'O histórico não pode alterar os dados de outra ferramenta nesta pasta.')
  }
  if (entry.area === 'metadata' && !/^(?:drafts|restore)\/[\w-]+\.json$/u.test(entry.path)) {
    throw new HistoryReviewError('history_invalid', 'O registro da aplicação precisa ser verificado antes de continuar.')
  }
  const path = confinePath(base, entry.path)
  let parent = dirname(path)
  while (!existsSync(parent)) parent = dirname(parent)
  confineAbsolute(base, realpathSync(parent))
  return path
}

async function save(directory: string, journal: Journal): Promise<void> {
  const temp = join(directory, 'journal.next')
  await writeFile(temp, `${JSON.stringify(journal)}\n`, { mode: 0o600 })
  await rename(temp, join(directory, 'journal.json'))
}

function parseJournal(body: string): Journal {
  const value = parseHistoryJson(body)
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1
    || !('phase' in value) || !['prepared', 'applying', 'committed'].includes(String(value.phase))
    || !('entries' in value) || !Array.isArray(value.entries) || !('directories' in value) || !Array.isArray(value.directories)) {
    throw new HistoryReviewError('history_invalid', 'O registro da aplicação precisa ser verificado antes de continuar.')
  }
  const entries: Entry[] = []
  const inputs: readonly unknown[] = value.entries
  for (const entry of inputs) {
    if (typeof entry !== 'object' || entry === null || !('area' in entry) || (entry.area !== 'project' && entry.area !== 'metadata')
      || !('path' in entry) || typeof entry.path !== 'string' || !('started' in entry) || typeof entry.started !== 'boolean'
      || !('before' in entry) || !(entry.before === null || typeof entry.before === 'string' && /^[a-f\d]{64}$/u.test(entry.before))
      || !('after' in entry) || !(entry.after === null || typeof entry.after === 'string' && /^[a-f\d]{64}$/u.test(entry.after))) {
      throw new HistoryReviewError('history_invalid', 'O registro da aplicação contém um arquivo inválido.')
    }
    entries.push({ area: entry.area, path: entry.path, started: entry.started, before: entry.before, after: entry.after })
  }
  const directories: string[] = []
  for (const directory of value.directories) {
    if (typeof directory !== 'string') throw new HistoryReviewError('history_invalid', 'O registro da aplicação contém uma pasta inválida.')
    directories.push(directory)
  }
  const phase = value.phase
  if (phase !== 'prepared' && phase !== 'applying' && phase !== 'committed') throw new HistoryReviewError('history_invalid', 'Estado de aplicação inválido.')
  return { version: 1, phase, entries, directories }
}

async function restore(root: string, metadata: string, directory: string, journal: Journal): Promise<void> {
  for (const entry of journal.entries.filter(item => item.started)) {
    const current = await hash(target(root, metadata, entry))
    if (current !== entry.before && current !== entry.after) throw new HistoryReviewError('recovery_required',
      `“${entry.path}” mudou depois de uma aplicação interrompida. Preserve essa versão e revise a recuperação antes de continuar.`)
  }
  for (let index = journal.entries.length - 1; index >= 0; index -= 1) {
    const entry = journal.entries[index]!
    if (!entry.started) continue
    const destination = target(root, metadata, entry)
    if (await hash(destination) === entry.before) continue
    if (entry.before === null) await rm(destination, { force: true })
    else {
      const source = join(directory, 'before', String(index))
      if (await hash(source) !== entry.before) throw new HistoryReviewError('history_invalid', 'A cópia de recuperação deste arquivo está incompleta. Preserve a pasta e peça ajuda.')
      const temporary = `${destination}.persona-restore-${randomUUID()}.tmp`
      await copyFile(source, temporary)
      await rename(temporary, destination)
    }
  }
  for (const path of [...journal.directories].reverse()) {
    const directoryPath = target(root, metadata, { area: 'project', path })
    try { await rmdir(directoryPath) }
    catch (error) {
      // A concurrent user-created file makes the directory no longer ours to remove.
      if (!(error instanceof Error && 'code' in error && ['ENOTEMPTY', 'EEXIST', 'ENOENT', 'EISDIR'].includes(String(error.code)))) throw error
    }
  }
}

/**
 * Recover known interrupted applications before reading or modifying a project again.
 * @param root - User folder.
 * @param metadata - Private project history folder.
 */
export async function recoverHistoryTransactions(root: string, metadata: string): Promise<void> {
  const transactions = join(metadata, 'transactions')
  if (!existsSync(transactions)) return
  for (const name of await readdir(transactions)) {
    if (!/^[\w-]+$/u.test(name)) throw new HistoryReviewError('history_invalid', 'Há um registro de aplicação inválido. Preserve a pasta e peça ajuda.')
    const directory = confinePath(transactions, name)
    const file = join(directory, 'journal.json')
    if (!existsSync(file)) continue
    const journal = parseJournal(await readFile(file, 'utf8'))
    if (journal.phase !== 'committed') await restore(root, metadata, directory, journal)
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * Stage bytes, then replace each file atomically and roll back every completed replacement on failure.
 * @param root - User folder.
 * @param metadata - Private project history folder.
 * @param replacements - User files followed by private review-record updates.
 * @param operations - Platform copy implementation.
 */
export async function applyHistoryTransaction(root: string, metadata: string, replacements: readonly HistoryReplacement[], operations: HistoryFileOps): Promise<void> {
  const directory = join(metadata, 'transactions', randomUUID())
  await mkdir(join(directory, 'before'), { recursive: true, mode: 0o700 })
  await mkdir(join(directory, 'after'), { recursive: true, mode: 0o700 })
  const journal: Journal = { version: 1, phase: 'prepared', entries: [], directories: [] }
  const temporaries: string[] = []
  try {
    for (const replacement of replacements) {
      const index = journal.entries.length
      const destination = target(root, metadata, replacement)
      const before = await hash(destination)
      if (replacement.expectedBefore !== undefined && before !== replacement.expectedBefore) throw new HistoryReviewError('conflicts_changed',
        `“${replacement.path}” mudou depois da revisão. Compare as versões de novo antes de aplicar.`)
      if (before !== null) await operations.copyFile(destination, join(directory, 'before', String(index)))
      const staged = join(directory, 'after', String(index))
      if (replacement.kind === 'copy') await operations.copyFile(replacement.source, staged)
      else if (replacement.kind === 'text') await writeFile(staged, replacement.content, { mode: 0o600 })
      journal.entries.push({ area: replacement.area, path: replacement.path, before, after: await hash(staged), started: false })
    }
    await save(directory, journal)
    journal.phase = 'applying'
    for (let index = 0; index < journal.entries.length; index += 1) {
      const entry = journal.entries[index]!
      const destination = target(root, metadata, entry)
      if (await hash(destination) !== entry.before) throw new HistoryReviewError('conflicts_changed', `“${entry.path}” mudou durante a revisão. Tente aplicar de novo para comparar as versões.`)
      const parents: string[] = []
      let parent = dirname(destination)
      while (!existsSync(parent)) { parents.unshift(parent); parent = dirname(parent) }
      for (const missing of parents) {
        await mkdir(missing)
        if (entry.area === 'project') journal.directories.push(missing.slice(resolve(root).length + 1))
      }
      entry.started = true
      await save(directory, journal)
      if (entry.after === null) await rm(destination)
      else {
        const temporary = `${destination}.persona-apply-${randomUUID()}.tmp`
        temporaries.push(temporary)
        await operations.copyFile(join(directory, 'after', String(index)), temporary)
        await rename(temporary, destination)
      }
    }
    journal.phase = 'committed'
    await save(directory, journal)
  } catch (error) {
    try { await restore(root, metadata, directory, journal) }
    catch (rollbackError) { throw new HistoryReviewError('recovery_required', 'A aplicação foi interrompida e precisa de recuperação. Preserve a pasta e tente recuperar antes de continuar.', new AggregateError([error, rollbackError])) }
    await rm(directory, { recursive: true, force: true })
    if (error instanceof HistoryReviewError && error.code === 'conflicts_changed') throw error
    throw new HistoryReviewError('apply_failed', 'As mudanças não foram aplicadas; a pasta foi restaurada. Feche os arquivos abertos e tente de novo.', error)
  } finally {
    for (const temporary of temporaries) await rm(temporary, { force: true })
  }
  await rm(directory, { recursive: true, force: true })
}

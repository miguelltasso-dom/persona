import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { GitReviewDelivery } from '../src/review/git.ts'
import { createReviewDelivery, HISTORY_RESTORE_RETENTION_MS, HistoryReviewDelivery, type HistoryReviewOptions } from '../src/review/history.ts'
import { historyFileOps } from '../src/review/history-files.ts'
import { parseReviewRestorePointId } from '../src/review/restore-point-id.ts'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('excludes a private home inside the selected folder, including Windows path casing', async () => {
  const f = await fixture()
  const home = join(f.project, 'PersonaPrivate')
  await mkdir(home)
  await writeFile(join(home, 'private.txt'), 'must never enter the draft')
  await writeFile(join(f.project, 'a.txt'), 'public project content')
  const inputHome = process.platform === 'win32' ? home.toUpperCase() : home
  const delivery = new HistoryReviewDelivery({ ...f.options, projectRoot: process.platform === 'win32' ? f.project.toUpperCase() : f.project,
    personaHome: inputHome, worktreesRoot: join(inputHome, 'worktrees') })
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  expect(await readFile(join(draft.path, 'a.txt'), 'utf8')).toBe('public project content')
  expect(existsSync(join(draft.path, 'PersonaPrivate'))).toBe(false)
  expect((await delivery.summary({ id: 'task', assignments: [] })).files).toEqual([])
}, 30_000)

it('admits only valid restoration UUIDs and returns canonical identifiers', () => {
  expect(parseReviewRestorePointId('550E8400-E29B-41D4-A716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000')
  for (const invalid of ['', '../escape', 'task', '550e8400-e29b-01d4-a716-446655440000', '550e8400-e29b-41d4-z716-446655440000']) {
    expect(() => parseReviewRestorePointId(invalid)).toThrow(expect.objectContaining({ code: 'invalid_restore_point' }))
  }
})

async function fixture(overrides: Partial<HistoryReviewOptions> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'persona-history-'))
  roots.push(root)
  const project = join(root, 'documents')
  const home = join(root, 'persona')
  await mkdir(project)
  const options: HistoryReviewOptions = { projectId: 'project', personaHome: home, projectRoot: project,
    worktreesRoot: join(home, 'worktrees', 'project'), ...overrides }
  return { root, project, home, options }
}

it('does not initialize private history or a draft for construction and reads before file work', async () => {
  const f = await fixture({ git: 'persona-no-git-for-read-test' })
  const delivery = createReviewDelivery(f.options)
  expect(delivery).toBeInstanceOf(HistoryReviewDelivery)
  expect((await delivery.summary({ id: 'task', assignments: [] })).files).toEqual([])
  expect(await delivery.sweepOrphans()).toEqual([])
  expect(existsSync(f.home)).toBe(false)
  expect(existsSync(join(f.project, '.git'))).toBe(false)
})

it.each(['directory', 'worktree-file'] as const)('selects existing Git for a folder inside a repository identified by %s without spawning Git', async (kind) => {
  const f = await fixture({ git: 'persona-no-git-for-detection-test' })
  if (kind === 'directory') await mkdir(join(f.root, '.git'))
  else await writeFile(join(f.root, '.git'), 'gitdir: /existing/private/worktree\n')
  expect(createReviewDelivery(f.options)).toBeInstanceOf(GitReviewDelivery)
  expect(existsSync(f.home)).toBe(false)
})

it('copies ordinary documents and binary bytes, reviews uncommitted edits and applies without creating .git', async () => {
  const f = await fixture()
  const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0xff, 0x80, 13, 10])
  await writeFile(join(f.project, 'menu.docx'), docx)
  await writeFile(join(f.project, 'README.txt'), 'antes\r\n')
  const delivery = createReviewDelivery(f.options)
  const draft = await delivery.prepare({ id: 'assignment', ticketId: 'task' })
  expect(await readFile(join(draft.path, 'menu.docx'))).toEqual(docx)
  expect(await readFile(join(draft.path, 'README.txt'), 'utf8')).toBe('antes\r\n')
  await writeFile(join(draft.path, 'README.txt'), 'depois\r\n')
  await writeFile(join(draft.path, 'new.bin'), Buffer.from([0, 255, 1]))
  expect(await readFile(join(f.project, 'README.txt'), 'utf8')).toBe('antes\r\n')
  const summary = await delivery.summary({ id: 'task', assignments: [] })
  expect(summary.files.map(file => file.path)).toEqual(['README.txt', 'new.bin'])
  expect(summary.patch).toContain('depois')
  const accepted = await delivery.accept({ id: 'task' }, 'ff')
  if (accepted.kind !== 'merged' || !accepted.restorePointId) throw new Error('missing restore point')
  expect(accepted).toEqual({ kind: 'merged', mode: 'ff', restorePointId: accepted.restorePointId })
  expect(accepted.restorePointId).toMatch(/^[a-f\d-]{36}$/u)
  expect(await readFile(join(f.project, 'README.txt'), 'utf8')).toBe('depois\r\n')
  expect(await readFile(join(f.project, 'new.bin'))).toEqual(Buffer.from([0, 255, 1]))
  expect(await readFile(join(f.project, 'menu.docx'))).toEqual(docx)
  expect(existsSync(join(f.project, '.git'))).toBe(false)
  expect(existsSync(join(f.home, 'history', 'project', 'git', 'HEAD'))).toBe(true)
}, 30_000)

it('restores text, binary, deleted and added files byte for byte and keeps undo idempotent', async () => {
  const f = await fixture()
  const binary = Buffer.from([0x50, 0x4b, 0xff, 0, 13, 10, 0x80])
  await writeFile(join(f.project, 'menu.docx'), binary)
  await writeFile(join(f.project, 'deleted.txt'), 'restore me\r\n')
  const options = { ...f.options, now: () => '2026-11-04T12:00:00.000Z' }
  const delivery = new HistoryReviewDelivery(options)
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  await writeFile(join(draft.path, 'menu.docx'), Buffer.from([0, 1, 2]))
  await rm(join(draft.path, 'deleted.txt'))
  await writeFile(join(draft.path, 'added.txt'), 'new')
  const applied = await delivery.accept({ id: 'task' }, 'ff')
  if (applied.kind !== 'merged' || !applied.restorePointId) throw new Error('missing restore point')
  const points = await new HistoryReviewDelivery(options).listRestorePoints()
  expect(points).toEqual([{ id: applied.restorePointId, ticketId: 'task', createdAt: '2026-11-04T12:00:00.000Z', expiresAt: '2026-12-04T12:00:00.000Z',
    state: 'available', files: ['added.txt', 'deleted.txt', 'menu.docx'] }])
  expect(await delivery.undoApply(applied.restorePointId)).toEqual({ kind: 'restored', restorePointId: applied.restorePointId })
  expect(await readFile(join(f.project, 'menu.docx'))).toEqual(binary)
  expect(await readFile(join(f.project, 'deleted.txt'), 'utf8')).toBe('restore me\r\n')
  expect(existsSync(join(f.project, 'added.txt'))).toBe(false)
  await writeFile(join(f.project, 'menu.docx'), 'later user edit')
  expect(await delivery.undoApply(applied.restorePointId)).toEqual({ kind: 'restored', restorePointId: applied.restorePointId })
  expect(await readFile(join(f.project, 'menu.docx'), 'utf8')).toBe('later user edit')
  expect(existsSync(join(f.project, '.git'))).toBe(false)
}, 30_000)

it('rolls back all files, new directories and private records when installation fails midway', async () => {
  const f = await fixture()
  await writeFile(join(f.project, 'a.txt'), 'old a')
  await writeFile(join(f.project, 'z.txt'), 'old z')
  let fail = false
  const delivery = new HistoryReviewDelivery({ ...f.options, fileOps: { copyFile: async (source, destination) => {
    if (fail && destination.startsWith(f.project) && destination.includes('z.txt.persona-apply-')) throw new Error('locked by Office')
    await historyFileOps.copyFile(source, destination)
  } } })
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  await writeFile(join(draft.path, 'a.txt'), 'new a')
  await writeFile(join(draft.path, 'z.txt'), 'new z')
  await mkdir(join(draft.path, 'new'))
  await writeFile(join(draft.path, 'new', 'file.txt'), 'added')
  fail = true
  await expect(delivery.accept({ id: 'task' }, 'ff')).rejects.toMatchObject({ code: 'apply_failed' })
  expect(await readFile(join(f.project, 'a.txt'), 'utf8')).toBe('old a')
  expect(await readFile(join(f.project, 'z.txt'), 'utf8')).toBe('old z')
  expect(existsSync(join(f.project, 'new'))).toBe(false)
  expect(await delivery.listRestorePoints()).toEqual([])
  fail = false
  expect((await delivery.accept({ id: 'task' }, 'ff')).kind).toBe('merged')
}, 30_000)

it('expires undo at exactly thirty days without changing the applied files', async () => {
  const f = await fixture()
  let clock = Date.parse('2026-11-04T12:00:00.000Z')
  const delivery = new HistoryReviewDelivery({ ...f.options, now: () => new Date(clock).toISOString() })
  await writeFile(join(f.project, 'a.txt'), 'before')
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  await writeFile(join(draft.path, 'a.txt'), 'after')
  const result = await delivery.accept({ id: 'task' }, 'ff')
  if (result.kind !== 'merged' || !result.restorePointId) throw new Error('missing restore point')
  expect(HISTORY_RESTORE_RETENTION_MS).toBe(2_592_000_000)
  clock += HISTORY_RESTORE_RETENTION_MS - 1
  expect((await delivery.listRestorePoints())[0]?.state).toBe('available')
  clock += 1
  expect((await delivery.listRestorePoints())[0]?.state).toBe('expired')
  expect(await delivery.undoApply(result.restorePointId)).toEqual({ kind: 'expired', restorePointId: result.restorePointId })
  expect(await readFile(join(f.project, 'a.txt'), 'utf8')).toBe('after')
}, 30_000)

it('refuses undo when a person edited an applied file afterward', async () => {
  const f = await fixture()
  await writeFile(join(f.project, 'a.txt'), 'before')
  const delivery = new HistoryReviewDelivery(f.options)
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  await writeFile(join(draft.path, 'a.txt'), 'persona')
  const result = await delivery.accept({ id: 'task' }, 'ff')
  if (result.kind !== 'merged' || !result.restorePointId) throw new Error('missing restore point')
  await writeFile(join(f.project, 'a.txt'), 'my later edit')
  expect(await delivery.undoApply(result.restorePointId)).toEqual({ kind: 'blocked',
    explanation: 'Estes arquivos mudaram depois da aplicação: a.txt. Preserve as alterações e revise antes de desfazer.' })
  expect(await readFile(join(f.project, 'a.txt'), 'utf8')).toBe('my later edit')
}, 30_000)

it('recovers a persisted interrupted transaction before the next read', async () => {
  const f = await fixture()
  const history = join(f.home, 'history', 'project')
  const transaction = join(history, 'transactions', 'interrupted')
  await mkdir(join(transaction, 'before'), { recursive: true })
  await writeFile(join(transaction, 'before', '0'), 'original')
  await writeFile(join(f.project, 'a.txt'), 'interrupted new value')
  const digest = (text: string): string => createHash('sha256').update(text).digest('hex')
  await writeFile(join(transaction, 'journal.json'), JSON.stringify({ version: 1, phase: 'applying', directories: [], entries: [
    { area: 'project', path: 'a.txt', before: digest('original'), after: digest('interrupted new value'), started: true },
  ] }))
  expect((await new HistoryReviewDelivery(f.options).summary({ id: 'task', assignments: [] })).files).toEqual([])
  expect(await readFile(join(f.project, 'a.txt'), 'utf8')).toBe('original')
  expect(existsSync(transaction)).toBe(false)
})

it.each(['keep_mine', 'keep_persona', 'keep_both'] as const)('resolves a shared edit with %s without markers, then undoes to the pre-apply user version', async (choice) => {
  const f = await fixture()
  await writeFile(join(f.project, 'a.txt'), 'baseline\r\n')
  await writeFile(join(f.project, 'a (da persona).txt'), 'existing copy')
  await mkdir(join(f.project, 'a (da persona 2).txt'))
  const delivery = new HistoryReviewDelivery(f.options)
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  await writeFile(join(draft.path, 'a.txt'), 'persona version\r\n')
  await writeFile(join(f.project, 'a.txt'), 'user version\r\n')
  const blocked = await delivery.accept({ id: 'task' }, 'ff')
  if (blocked.kind !== 'blocked' || !blocked.conflicts?.[0]) throw new Error('expected file conflict')
  expect(blocked.conflicts.map(conflict => conflict.path)).toEqual(['a.txt'])
  expect(await readFile(join(f.project, 'a.txt'), 'utf8')).toBe('user version\r\n')
  const applied = await delivery.accept({ id: 'task' }, 'ff', { conflicts: [{ ...blocked.conflicts[0], choice }] })
  if (applied.kind !== 'merged' || !applied.restorePointId) throw new Error('missing restore point')
  const body = await readFile(join(f.project, 'a.txt'), 'utf8')
  expect(body).toBe(choice === 'keep_persona' ? 'persona version\r\n' : 'user version\r\n')
  expect(body).not.toContain('<<<<<<<')
  expect(body).not.toContain('>>>>>>>')
  const duplicate = join(f.project, 'a (da persona 3).txt')
  if (choice === 'keep_both') expect(await readFile(duplicate, 'utf8')).toBe('persona version\r\n')
  else expect(existsSync(duplicate)).toBe(false)
  expect(await delivery.undoApply(applied.restorePointId)).toEqual({ kind: 'restored', restorePointId: applied.restorePointId })
  expect(await readFile(join(f.project, 'a.txt'), 'utf8')).toBe('user version\r\n')
  expect(await readFile(join(f.project, 'a (da persona).txt'), 'utf8')).toBe('existing copy')
  expect(existsSync(duplicate)).toBe(false)
}, 30_000)

it('refuses stale conflict decisions and leaves every file unchanged until all conflicts are resolved', async () => {
  const f = await fixture()
  for (const name of ['a.txt', 'b.txt']) await writeFile(join(f.project, name), 'base')
  const delivery = new HistoryReviewDelivery(f.options)
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  for (const name of ['a.txt', 'b.txt']) {
    await writeFile(join(draft.path, name), 'persona')
    await writeFile(join(f.project, name), 'mine')
  }
  const blocked = await delivery.accept({ id: 'task' }, 'ff')
  if (blocked.kind !== 'blocked' || !blocked.conflicts?.[0]) throw new Error('expected conflicts')
  const decision = { ...blocked.conflicts[0], choice: 'keep_persona' as const }
  expect((await delivery.accept({ id: 'task' }, 'ff', { conflicts: [decision] })).kind).toBe('blocked')
  for (const name of ['a.txt', 'b.txt']) expect(await readFile(join(f.project, name), 'utf8')).toBe('mine')
  await writeFile(join(f.project, decision.path), 'newer user version')
  await expect(delivery.accept({ id: 'task' }, 'ff', { conflicts: [decision] })).rejects.toMatchObject({ code: 'conflicts_changed' })
  expect(await readFile(join(f.project, decision.path), 'utf8')).toBe('newer user version')
  expect(await delivery.listRestorePoints()).toEqual([])
}, 30_000)

it('does not invent a conflict when the person and persona produced identical bytes', async () => {
  const f = await fixture()
  await writeFile(join(f.project, 'a.txt'), 'base')
  const delivery = new HistoryReviewDelivery(f.options)
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  await writeFile(join(draft.path, 'a.txt'), 'same new version')
  await writeFile(join(f.project, 'a.txt'), 'same new version')
  expect((await delivery.accept({ id: 'task' }, 'ff')).kind).toBe('merged')
  expect(await readFile(join(f.project, 'a.txt'), 'utf8')).toBe('same new version')
}, 30_000)

it('keeps both versions of a delete-versus-edit conflict without reviving the user-deleted filename', async () => {
  const f = await fixture()
  await writeFile(join(f.project, 'a.txt'), 'base')
  const delivery = new HistoryReviewDelivery(f.options)
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  await writeFile(join(draft.path, 'a.txt'), 'persona edit')
  await rm(join(f.project, 'a.txt'))
  const blocked = await delivery.accept({ id: 'task' }, 'ff')
  if (blocked.kind !== 'blocked' || !blocked.conflicts?.[0]) throw new Error('expected deletion conflict')
  expect(blocked.conflicts[0].user).toBeNull()
  const applied = await delivery.accept({ id: 'task' }, 'ff', { conflicts: [{ ...blocked.conflicts[0], choice: 'keep_both' }] })
  if (applied.kind !== 'merged' || !applied.restorePointId) throw new Error('missing restore point')
  expect(existsSync(join(f.project, 'a.txt'))).toBe(false)
  expect(await readFile(join(f.project, 'a (da persona).txt'), 'utf8')).toBe('persona edit')
  await delivery.undoApply(applied.restorePointId)
  expect(existsSync(join(f.project, 'a.txt'))).toBe(false)
  expect(existsSync(join(f.project, 'a (da persona).txt'))).toBe(false)
}, 30_000)

it('serializes two delivery instances preparing the same task without overwriting the first draft', async () => {
  const f = await fixture()
  await writeFile(join(f.project, 'a.txt'), 'original')
  const copy = vi.fn((source: string, destination: string) => historyFileOps.copyFile(source, destination))
  const options = { ...f.options, fileOps: { copyFile: copy } }
  const [first, second] = await Promise.all([
    new HistoryReviewDelivery(options).prepare({ id: 'a', ticketId: 'task' }),
    new HistoryReviewDelivery(options).prepare({ id: 'b', ticketId: 'task' }),
  ])
  expect(first.path).toBe(second.path)
  expect(copy).toHaveBeenCalledOnce()
}, 30_000)

it('refuses a linked source directory and leaves its target untouched', async () => {
  const f = await fixture()
  const external = join(f.root, 'external')
  await mkdir(external)
  await writeFile(join(external, 'private.txt'), 'outside project')
  await symlink(external, join(f.project, 'linked'), 'junction')
  await expect(new HistoryReviewDelivery(f.options).prepare({ id: 'a', ticketId: 'task' })).rejects.toMatchObject({ code: 'unsafe_path' })
  expect(await readFile(join(external, 'private.txt'), 'utf8')).toBe('outside project')
  expect(existsSync(f.home)).toBe(false)
})

it('reports damaged private JSON without creating a draft or silently emptying the history', async () => {
  const f = await fixture()
  const metadata = join(f.home, 'history', 'project', 'drafts')
  await mkdir(metadata, { recursive: true })
  await writeFile(join(metadata, 'task.json'), '{broken')
  await expect(new HistoryReviewDelivery(f.options).summary({ id: 'task', assignments: [] })).rejects.toMatchObject({ code: 'history_invalid' })
  expect(existsSync(f.options.worktreesRoot)).toBe(false)
  expect(existsSync(join(f.project, '.git'))).toBe(false)
})

it('blocks recovery when a person changed the interrupted file to an unknown newer version', async () => {
  const f = await fixture()
  const transaction = join(f.home, 'history', 'project', 'transactions', 'interrupted')
  await mkdir(join(transaction, 'before'), { recursive: true })
  await writeFile(join(transaction, 'before', '0'), 'original')
  await writeFile(join(f.project, 'a.txt'), 'newer user edit')
  const digest = (text: string): string => createHash('sha256').update(text).digest('hex')
  await writeFile(join(transaction, 'journal.json'), JSON.stringify({ version: 1, phase: 'applying', directories: [], entries: [
    { area: 'project', path: 'a.txt', before: digest('original'), after: digest('applied'), started: true },
  ] }))
  await expect(new HistoryReviewDelivery(f.options).summary({ id: 'task', assignments: [] })).rejects.toMatchObject({ code: 'recovery_required' })
  expect(await readFile(join(f.project, 'a.txt'), 'utf8')).toBe('newer user edit')
  expect(existsSync(join(transaction, 'journal.json'))).toBe(true)
})

it('applies the reviewed immutable bytes even when the runner edits its draft during application', async () => {
  const f = await fixture()
  await writeFile(join(f.project, 'a.txt'), 'baseline')
  let draftFile = '', changeDuringApply = false
  const delivery = new HistoryReviewDelivery({ ...f.options, fileOps: { copyFile: async (source, destination) => {
    if (changeDuringApply && destination.includes('transactions') && destination.includes('after')) {
      changeDuringApply = false
      await writeFile(draftFile, 'unreviewed later change')
    }
    await historyFileOps.copyFile(source, destination)
  } } })
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  draftFile = join(draft.path, 'a.txt')
  await writeFile(draftFile, 'reviewed version')
  changeDuringApply = true
  expect((await delivery.accept({ id: 'task' }, 'ff')).kind).toBe('merged')
  expect(await readFile(join(f.project, 'a.txt'), 'utf8')).toBe('reviewed version')
  expect(await readFile(draftFile, 'utf8')).toBe('unreviewed later change')
}, 30_000)

it('refuses a user edit made after comparison but before installation', async () => {
  const f = await fixture()
  const userFile = join(f.project, 'a.txt')
  await writeFile(userFile, 'baseline')
  let changeDuringApply = false
  const delivery = new HistoryReviewDelivery({ ...f.options, fileOps: { copyFile: async (source, destination) => {
    if (changeDuringApply && destination.includes('transactions') && destination.includes('after')) {
      changeDuringApply = false
      await writeFile(userFile, 'newer user version')
    }
    await historyFileOps.copyFile(source, destination)
  } } })
  const draft = await delivery.prepare({ id: 'a', ticketId: 'task' })
  await writeFile(join(draft.path, 'a.txt'), 'persona')
  changeDuringApply = true
  await expect(delivery.accept({ id: 'task' }, 'ff')).rejects.toMatchObject({ code: 'conflicts_changed' })
  expect(await readFile(userFile, 'utf8')).toBe('newer user version')
  expect(await delivery.listRestorePoints()).toEqual([])
}, 30_000)

it('configures private history safely and excludes Office, Windows and nested repository metadata', async () => {
  const f = await fixture()
  await mkdir(join(f.project, 'nested', '.git'), { recursive: true })
  await writeFile(join(f.project, 'nested', '.git', 'config'), 'private git metadata')
  await writeFile(join(f.project, 'nested', 'document.txt'), 'ordinary nested content')
  for (const file of ['~$menu.docx', 'Thumbs.db', 'desktop.ini', 'scratch.tmp']) await writeFile(join(f.project, file), 'temporary')
  const draft = await createReviewDelivery(f.options).prepare({ id: 'a', ticketId: 'task' })
  expect(await readFile(join(draft.path, 'nested', 'document.txt'), 'utf8')).toBe('ordinary nested content')
  expect(existsSync(join(draft.path, 'nested', '.git'))).toBe(false)
  for (const file of ['~$menu.docx', 'Thumbs.db', 'desktop.ini', 'scratch.tmp']) expect(existsSync(join(draft.path, file))).toBe(false)
  const config = await readFile(join(f.home, 'history', 'project', 'git', 'config'), 'utf8')
  expect(config).toMatch(/autocrlf = false/u)
  expect(config).toMatch(/safecrlf = false/u)
  expect(config).toMatch(/longpaths = true/u)
  expect(config).toMatch(/fsmonitor = false/u)
  expect(config).toMatch(/auto = 0/u)
  expect(await readFile(join(f.home, 'history', 'project', 'git', 'info', 'exclude'), 'utf8'))
    .toBe('~$*\nThumbs.db\ndesktop.ini\n*.tmp\n.git\n.git/\n')
}, 30_000)

it('uses injected copy operations and keeps a prepared draft reusable across restart', async () => {
  const f = await fixture()
  await writeFile(join(f.project, 'a.txt'), 'original')
  const copy = vi.fn((source: string, destination: string) => historyFileOps.copyFile(source, destination))
  const options = { ...f.options, fileOps: { copyFile: copy } }
  const first = await createReviewDelivery(options).prepare({ id: 'a', ticketId: 'task' })
  await writeFile(join(first.path, 'a.txt'), 'draft edit')
  const again = await createReviewDelivery(options).prepare({ id: 'b', ticketId: 'task' })
  expect(again.path).toBe(first.path)
  expect(await readFile(join(again.path, 'a.txt'), 'utf8')).toBe('draft edit')
  expect(copy).toHaveBeenCalledOnce()
}, 30_000)

it('reports missing Git and excessive copy size before changing the source folder', async () => {
  const f = await fixture()
  await writeFile(join(f.project, 'large.txt'), 'large')
  await expect(createReviewDelivery({ ...f.options, git: 'persona-no-such-git' }).prepare({ id: 'a', ticketId: 'task' }))
    .rejects.toMatchObject({ code: 'git_unavailable', message: 'Não conseguimos preparar o rascunho. Reabra ou reinstale a Persona para restaurar o componente necessário.' })
  expect(existsSync(f.home)).toBe(false)
  await expect(createReviewDelivery({ ...f.options, maxCopyBytes: 2 }).prepare({ id: 'a', ticketId: 'task' }))
    .rejects.toMatchObject({ code: 'copy_limit' })
  expect(existsSync(f.home)).toBe(false)
  expect(await readFile(join(f.project, 'large.txt'), 'utf8')).toBe('large')
})

it.each(['../escape', 'a/b', 'a\\b', '.', 'bad:id'])('rejects unsafe project id %s before creating private paths', async (id) => {
  const f = await fixture()
  expect(() => createReviewDelivery({ ...f.options, projectId: id })).toThrow()
  expect(existsSync(f.home)).toBe(false)
})

it('sweeps recorded closed drafts without removing an open draft or user files', async () => {
  const f = await fixture()
  await writeFile(join(f.project, 'source.txt'), 'original')
  const delivery = createReviewDelivery({ ...f.options, openTicketIds: () => ['open'] })
  const closed = await delivery.prepare({ id: 'a', ticketId: 'closed' })
  const open = await delivery.prepare({ id: 'b', ticketId: 'open' })
  expect(await delivery.sweepOrphans()).toEqual(['closed'])
  expect(existsSync(closed.path)).toBe(false)
  expect(existsSync(open.path)).toBe(true)
  expect(await readFile(join(f.project, 'source.txt'), 'utf8')).toBe('original')
  expect(existsSync(join(f.project, '.git'))).toBe(false)
}, 30_000)

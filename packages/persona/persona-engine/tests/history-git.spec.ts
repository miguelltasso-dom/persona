import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { HistoryGit } from '../src/review/history-git.ts'
import { HistoryReviewError } from '../src/review/history-files.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return { ...original, open: vi.fn(original.open) }
})

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(open).mockClear()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'persona-history-git-'))
  roots.push(root)
  const source = join(root, 'preços.xlsx')
  await writeFile(source, Buffer.from([0x50, 0x4b, 0xff, 0]))
  const git = new HistoryGit({ git: 'git', directory: root, timeoutMs: 30_000 })
  const error = new HistoryReviewError('git_failed', 'Não conseguimos atualizar o histórico desta pasta.')
  vi.spyOn(git, 'run').mockImplementation(async (args) => {
    if (args.includes('hash-object')) throw error
    return { stdout: '', bytes: Buffer.alloc(0), truncated: false }
  })
  const snapshot = () => git.snapshot(join(root, 'private'), root, join(root, 'index'),
    [{ path: 'preços.xlsx', bytes: 4, mode: '100644' }])
  return { source, error, snapshot }
}

it.each(['EACCES', 'EPERM', 'EBUSY'])('names the unreadable spreadsheet and the recovery action after Git fails (%s)', async (code) => {
  const f = await fixture()
  vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error('sharing violation'), { code }))
  await expect(f.snapshot()).rejects.toMatchObject({ code: 'file_unavailable',
    message: 'Feche “preços.xlsx” no Excel, Word ou outro aplicativo e tente de novo. Se continuar, confira a permissão do arquivo.' })
  expect(open).toHaveBeenCalledWith(f.source, 'r')
})

it('retains a repository failure when the source is readable and closes the diagnostic file handle', async () => {
  const f = await fixture()
  await expect(f.snapshot()).rejects.toBe(f.error)
  expect(open).toHaveBeenCalledWith(f.source, 'r')
  const diagnostic = vi.mocked(open).mock.results[0]
  if (diagnostic?.type !== 'return') throw new Error('missing diagnostic file handle')
  expect((await diagnostic.value).fd).toBe(-1)
  await rm(f.source)
})

it('retains the Git failure if the source disappeared instead of reporting a sharing violation', async () => {
  const f = await fixture()
  vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
  await expect(f.snapshot()).rejects.toBe(f.error)
})

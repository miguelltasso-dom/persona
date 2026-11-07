import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { HistoryReviewError, type HistoryFileOps } from '../src/index.ts'
import { copyHistoryFiles } from '../src/review/history-files.ts'

/** SW-5: the platform layer's actionable line reaches the person; anything else gets the generic one. */
async function folder(): Promise<{ source: string; destination: string; remove(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'persona-copy-errors-'))
  const source = join(root, 'source')
  const destination = join(root, 'draft')
  await mkdir(source)
  await mkdir(destination)
  await writeFile(join(source, 'planilha.xlsx'), 'x')
  return { source, destination, remove: () => rm(root, { recursive: true, force: true }) }
}

const FILE = { path: 'planilha.xlsx', bytes: 1, mode: '100644' as const }

it('an actionable HistoryReviewError from the file layer is kept as it is (OneDrive, locked file, long path)', async () => {
  const dir = await folder()
  try {
    const actionable = new HistoryReviewError('file_unavailable', 'Feche “planilha.xlsx” no Excel, Word ou outro aplicativo e tente de novo.')
    const ops: HistoryFileOps = { copyFile: () => Promise.reject(actionable) }
    await expect(copyHistoryFiles(dir.source, dir.destination, [FILE], ops)).rejects.toBe(actionable)
  } finally { await dir.remove() }
})

it('any other failure still gets the generic line with the file name and keeps the cause for the local log', async () => {
  const dir = await folder()
  try {
    const raw = Object.assign(new Error('EIO: i/o error'), { code: 'EIO' })
    const ops: HistoryFileOps = { copyFile: () => Promise.reject(raw) }
    const failure = await copyHistoryFiles(dir.source, dir.destination, [FILE], ops).then(() => undefined, (error: unknown) => error)
    expect(failure).toBeInstanceOf(HistoryReviewError)
    expect((failure as HistoryReviewError).message).toBe('Não conseguimos copiar “planilha.xlsx”. Feche o arquivo, confirme que ele está disponível neste computador e tente de novo.')
    expect((failure as HistoryReviewError).cause).toBe(raw)
  } finally { await dir.remove() }
})

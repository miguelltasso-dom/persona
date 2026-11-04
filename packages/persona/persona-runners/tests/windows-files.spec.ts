import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, toNamespacedPath } from 'node:path'
import { expect, it } from 'vitest'
import { createWindowsHistoryFileOps, type WindowsHistoryIo } from '../src/workspace/windows-files.ts'

it('hydrates each cloud file before copying it into an independent draft', async () => {
  const calls: string[] = []
  const io: WindowsHistoryIo = {
    hydrate: async (path, timeout) => { calls.push(`hydrate:${path}:${String(timeout)}`) },
    copy: async (source, destination) => { calls.push(`copy:${source}:${destination}`) },
  }
  const source = resolve('project', 'menu.docx')
  const dest = resolve('draft', 'menu.docx')
  await createWindowsHistoryFileOps({ hydrationTimeoutMs: 1234 }, io).copyFile(source, dest)
  expect(calls).toEqual([
    `hydrate:${toNamespacedPath(source)}:1234`,
    `copy:${toNamespacedPath(source)}:${toNamespacedPath(dest)}`,
  ])
})

it('reports cloud, locked and long-path failures with actionable filenames', async () => {
  const root = resolve('OneDrive')
  const source = join(root, 'planilha.xlsx')
  const codeError = (code: string): Error => Object.assign(new Error('internal detail'), { code })
  const failure = (code: string): WindowsHistoryIo => ({
    hydrate: async () => { throw codeError(code) },
    copy: async () => { throw new Error('unexpected copy') },
  })
  await expect(createWindowsHistoryFileOps({ cloudRoots: [root] }, failure('ENOENT')).copyFile(source, 'draft'))
    .rejects.toMatchObject({ reason: 'cloud_file_unavailable', fileName: 'planilha.xlsx', message: expect.stringContaining('OneDrive') })
  await expect(createWindowsHistoryFileOps({}, failure('EBUSY')).copyFile(source, 'draft'))
    .rejects.toMatchObject({ reason: 'file_locked', fileName: 'planilha.xlsx', message: expect.stringContaining('Feche') })
  await expect(createWindowsHistoryFileOps({}, failure('ENAMETOOLONG')).copyFile(source, 'draft'))
    .rejects.toMatchObject({ reason: 'path_too_long', fileName: 'planilha.xlsx', message: expect.stringContaining('mais curta') })
})

it('copies a real long-path file without sharing subsequent draft writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'persona-long-file-'))
  try {
    const longDir = join(root, ...Array.from({ length: 8 }, () => 'long-directory-name-'.repeat(2)))
    await mkdir(toNamespacedPath(longDir), { recursive: true })
    const source = join(longDir, 'source.xlsx')
    const dest = join(longDir, 'draft.xlsx')
    await writeFile(toNamespacedPath(source), 'original')
    await createWindowsHistoryFileOps().copyFile(source, dest)
    await writeFile(toNamespacedPath(dest), 'altered')
    expect(await readFile(toNamespacedPath(source), 'utf8')).toBe('original')
    expect(await readFile(toNamespacedPath(dest), 'utf8')).toBe('altered')
  } finally {
    await rm(toNamespacedPath(root), { recursive: true, force: true })
  }
})

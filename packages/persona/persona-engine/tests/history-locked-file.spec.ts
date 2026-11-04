import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { HistoryReviewDelivery } from '../src/review/history.ts'

async function withExclusiveFile(file: string, action: () => Promise<void>): Promise<void> {
  // The lock owner exits within the case budget even if the test worker disappears.
  const script = `$f=[System.IO.File]::Open('${file.replaceAll("'", "''")}', 'Open', 'ReadWrite', 'None'); `
    + "try { [Console]::Out.WriteLine('LOCKED'); [Console]::Out.Flush(); Start-Sleep -Seconds 45 } finally { $f.Dispose() }"
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const closed = new Promise<void>((resolve) => { child.once('close', () => resolve()) })
  child.stderr.resume()
  try {
    await new Promise<void>((resolve, reject) => {
      let output = ''
      const timer = setTimeout(() => reject(new Error('exclusive file lock was not ready within 20s')), 20_000)
      const onData = (chunk: Buffer): void => {
        output = `${output}${chunk.toString('utf8')}`.slice(-1024)
        if (output.includes('LOCKED')) { clearTimeout(timer); resolve() }
      }
      child.stdout.on('data', onData)
      child.once('error', (error) => { clearTimeout(timer); reject(error) })
      child.once('close', () => { clearTimeout(timer); reject(new Error('exclusive file lock exited before readiness')) })
    })
    await action()
  } finally {
    if (child.exitCode === null) child.kill()
    await closed
  }
}

// FileShare.None is a Windows sharing rule; POSIX does not reject reads this way.
it.skipIf(process.platform !== 'win32')('keeps bytes intact and names the locked spreadsheet, then applies and undoes after release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'persona-history-lock-'))
  try {
    const project = join(root, 'documents')
    const home = join(root, 'private')
    await mkdir(project)
    const original = Buffer.from([0x50, 0x4b, 0, 0xff, 13, 10])
    await writeFile(join(project, 'preços.xlsx'), original)
    await writeFile(join(project, 'cardápio.docx'), original)
    const delivery = new HistoryReviewDelivery({ projectId: 'native-lock', projectRoot: project,
      personaHome: home, worktreesRoot: join(home, 'drafts') })
    const draft = await delivery.prepare({ id: 'assignment', ticketId: 'ticket' })
    await writeFile(join(draft.path, 'preços.xlsx'), Buffer.from([1, 2, 3]))
    await writeFile(join(draft.path, 'cardápio.docx'), Buffer.from([4, 5, 6]))
    await withExclusiveFile(join(project, 'preços.xlsx'), async () => {
      await expect(delivery.accept({ id: 'ticket' }, 'ff')).rejects.toMatchObject({ code: 'file_unavailable',
        message: 'Feche “preços.xlsx” no Excel, Word ou outro aplicativo e tente de novo. Se continuar, confira a permissão do arquivo.' })
      expect(await readFile(join(project, 'cardápio.docx'))).toEqual(original)
    })
    expect(await readFile(join(project, 'preços.xlsx'))).toEqual(original)
    const applied = await delivery.accept({ id: 'ticket' }, 'ff')
    if (applied.kind !== 'merged' || applied.restorePointId === undefined) throw new Error('missing restore point')
    expect(await readFile(join(project, 'preços.xlsx'))).toEqual(Buffer.from([1, 2, 3]))
    expect(await readFile(join(project, 'cardápio.docx'))).toEqual(Buffer.from([4, 5, 6]))
    expect((await delivery.undoApply(applied.restorePointId)).kind).toBe('restored')
    expect(await readFile(join(project, 'preços.xlsx'))).toEqual(original)
    expect(await readFile(join(project, 'cardápio.docx'))).toEqual(original)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 60_000) // The native case owns multiple Git processes and a PowerShell readiness handshake.

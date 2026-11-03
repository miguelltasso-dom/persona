import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { auditDesktopIpc } from '../src/ipc-audit.ts'

const src = join(dirname(fileURLToPath(import.meta.url)), '../src')

describe('desktop IPC sender audit', () => {
  it('fails if any ipcMain.handle/on registration skips sender validation', () => {
    const rows = auditDesktopIpc(src)
    expect(rows.length).toBeGreaterThan(10)
    const unguarded = rows.filter(row => !row.guarded)
    expect(unguarded, JSON.stringify(unguarded, null, 2)).toEqual([])
  })
})

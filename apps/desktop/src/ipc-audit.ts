/** Inventory of desktop IPC registrations. Every channel must validate the sender. */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HANDLE = /ipcMain\.(?:handle|on)\(\s*([^,\n]+)/gu
const GUARD_SOURCES = [
  'assertDesktopSender', 'assertSender', 'assertMainApplication', 'assertOwner', 'assertProductSender',
  String.raw`authorize\(`, String.raw`this\.owned\(`, String.raw`this\.assertSender\(`, String.raw`event\.sender`,
]
const GUARD = new RegExp(GUARD_SOURCES.join('|'), 'u')

export interface IpcChannelAudit {
  readonly file: string
  readonly channel: string
  readonly guarded: boolean
}

/**
 * Enumerate `ipcMain.handle` / `ipcMain.on` in desktop src and whether the file guards the sender.
 * @param srcDir - `apps/desktop/src`.
 */
export function auditDesktopIpc(srcDir?: string): IpcChannelAudit[] {
  const root = srcDir ?? join(dirname(fileURLToPath(import.meta.url)), '.')
  const files = collectTs(root)
  const out: IpcChannelAudit[] = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(HANDLE)) {
      const channel = (match[1] ?? '').trim()
      const start = match.index ?? 0
      const window = text.slice(start, Math.min(text.length, start + 700))
      out.push({ file, channel, guarded: GUARD.test(window) })
    }
  }
  return out
}

function collectTs(dir: string): string[] {
  const names = readdirSync(dir, { withFileTypes: true })
  const out: string[] = []
  for (const entry of names) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'updates' || entry.name === 'client') continue
      out.push(...collectTs(path))
      continue
    }
    if (entry.name.endsWith('.ts')) out.push(path)
  }
  return out
}

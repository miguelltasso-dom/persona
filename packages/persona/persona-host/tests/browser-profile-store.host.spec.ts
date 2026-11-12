import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BROWSER_PROFILES_FILE, loadBrowserProfiles, saveBrowserProfiles, type BrowserProfileStoreIo } from '../src/browser/profile-store.ts'

const PROFILES = [{ id: 'p-1', name: 'Loja' }]
const GRANTS = { bia: ['p-1'] }

function memoryIo(files: Map<string, string>): BrowserProfileStoreIo & { renames: string[] } {
  const renames: string[] = []
  return {
    renames,
    read: path => files.get(path),
    write: (path, text) => { files.set(path, text) },
    rename: (from, to) => { renames.push(`${from}->${to}`); const text = files.get(from) ?? ''; files.delete(from); files.set(to, text) },
    mkdir: () => undefined,
  }
}

describe('browser profile store', () => {
  it('a missing file is an empty list', () => {
    expect(loadBrowserProfiles('C:\\data', memoryIo(new Map()))).toEqual({ profiles: [], grants: {} })
  })

  it('unreadable or hand-edited content is an empty list, not a crash', () => {
    const files = new Map([[join('C:\\data', BROWSER_PROFILES_FILE), '{ not json']])
    expect(loadBrowserProfiles('C:\\data', memoryIo(files))).toEqual({ profiles: [], grants: {} })
    files.set(join('C:\\data', BROWSER_PROFILES_FILE), JSON.stringify({ profiles: [{ id: 1 }], grants: {} }))
    expect(loadBrowserProfiles('C:\\data', memoryIo(files))).toEqual({ profiles: [], grants: {} })
    files.set(join('C:\\data', BROWSER_PROFILES_FILE), JSON.stringify({ profiles: PROFILES, grants: { bia: 'p-1' } }))
    expect(loadBrowserProfiles('C:\\data', memoryIo(files))).toEqual({ profiles: [], grants: {} })
  })

  it('round-trips through an atomic rename', () => {
    const files = new Map<string, string>()
    const io = memoryIo(files)
    saveBrowserProfiles('C:\\data', { profiles: PROFILES, grants: GRANTS }, io)
    expect(io.renames).toHaveLength(1)
    expect(io.renames[0]?.endsWith(`->${join('C:\\data', BROWSER_PROFILES_FILE)}`)).toBe(true)
    expect(loadBrowserProfiles('C:\\data', io)).toEqual({ profiles: PROFILES, grants: GRANTS })
  })

  it('writes into the data folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'persona-profiles-'))
    saveBrowserProfiles(root, { profiles: PROFILES, grants: GRANTS })
    expect(loadBrowserProfiles(root)).toEqual({ profiles: PROFILES, grants: GRANTS })
  })
})

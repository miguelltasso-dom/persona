import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backupPersonaHome, restorePersonaBackup, shouldSkipBackupPath } from '../src/backup.ts'

describe('persona backup', () => {
  it('skips plaintext vault secrets and env files', () => {
    expect(shouldSkipBackupPath('.env')).toBe(true)
    expect(shouldSkipBackupPath('vault/plaintext/key.txt')).toBe(true)
    expect(shouldSkipBackupPath('secrets.json')).toBe(true)
    expect(shouldSkipBackupPath('id.pem')).toBe(true)
    expect(shouldSkipBackupPath('db/persona.db')).toBe(false)
    expect(shouldSkipBackupPath('vault/sealed.json')).toBe(false)
  })

  it('backs up a home and restores only after confirmation, keeping a safety copy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'persona-backup-'))
    const home = join(root, 'home')
    await mkdir(join(home, 'db'), { recursive: true })
    await mkdir(join(home, 'vault', 'plaintext'), { recursive: true })
    await writeFile(join(home, 'db', 'persona.db'), 'sqlite')
    await writeFile(join(home, '.env'), 'SECRET=1')
    await writeFile(join(home, 'vault', 'plaintext', 'key.txt'), 'sk-live')
    await writeFile(join(home, 'notes.md'), 'ok')
    const zip = join(root, 'persona.zip')
    await backupPersonaHome(home, zip)
    await expect(restorePersonaBackup({ home, archivePath: zip, confirmed: false })).rejects.toThrow(/confirmation/u)
    const restored = await restorePersonaBackup({
      home, archivePath: zip, confirmed: true, now: () => new Date('2026-11-03T18:00:00.000Z'),
    })
    expect(restored.safetyCopy).toContain('.safety-')
    expect(await readFile(join(home, 'db', 'persona.db'), 'utf8')).toBe('sqlite')
    expect(await readFile(join(home, 'notes.md'), 'utf8')).toBe('ok')
    await expect(readFile(join(home, '.env'), 'utf8')).rejects.toThrow()
  })
})

import { Context } from '@deepseek-ai/cordis'
import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import Provider from '../src/plugin.ts'
import { VaultUnavailableError, VaultStorageError } from '../src/errors.ts'
import { vaultBackend } from '../src/backend.ts'

const roots: string[] = []
const dispose: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const stop of dispose.splice(0)) await stop()
  vi.unstubAllEnvs(); vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(join(tmpdir(), 'persona-vault-provider-'))) throw new Error('Unexpected test root')
    rmSync(root, { recursive: true, force: true })
  }
})
function temporary(): string { const root = mkdtempSync(join(tmpdir(), 'persona-vault-provider-')); roots.push(root); return root }
async function boot(path: string): Promise<Provider> {
  const ctx = new Context()
  const fiber = ctx.plugin(Provider, { path })
  dispose.push(async () => { await fiber.dispose() })
  await fiber
  return ctx.personaVault
}

it('keeps Web boot available while vault writes fail with an actionable typed error', async () => {
  vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '')
  const path = join(temporary(), 'persona-vault.json')
  const vault = await boot(path)
  expect(vault.availability).toBe('unavailable')
  expect(vault.status()).toEqual({ available: false, protection: 'unavailable' })
  expect(() => vault.assertAvailable()).toThrow(VaultUnavailableError)
  expect(await vault.vault.get('owner', 'dsh')).toBeUndefined()
  expect(await vault.listRecords()).toEqual([])
  await expect(vault.vault.set('owner', 'dsh', 'synthetic-secret')).rejects.toBeInstanceOf(VaultUnavailableError)
  await expect(vault.set(credentialRef('TEST_PERSONA_KEY'), 'synthetic-secret')).rejects.toMatchObject({ code: 'vault_unavailable' })
  expect(existsSync(path)).toBe(false)
  expect(await vault.describe(credentialRef('TEST_PERSONA_KEY'))).toMatchObject({ writable: false })
})

it('requires an explicit harness cipher, warns, and restores only sealed values after restart', async () => {
  vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const root = temporary(); const path = join(root, 'persona-vault.json')
  const vault = await boot(path)
  expect(vault.availability).toBe('test')
  expect(existsSync(path)).toBe(true)
  const ref = credentialRef('TEST_PERSONA_KEY')
  const key = credentialKey('persona-test', 'grant')
  await vault.set(ref, 'synthetic-api-secret')
  await vault.modifyRecord(key, async () => ({ kind: 'grant', payload: { access: 'synthetic-oauth-secret', refresh: 'synthetic-refresh-secret' } }))
  await vault.vault.setAccount('owner', 'claude', 'work', 'synthetic-account-secret', 'Trabalho')
  const disk = readFileSync(path, 'utf8')
  for (const secret of ['synthetic-api-secret', 'synthetic-oauth-secret', 'synthetic-refresh-secret', 'synthetic-account-secret']) expect(disk).not.toContain(secret)
  expect(JSON.stringify(vault.snapshot())).not.toContain('synthetic-oauth-secret')
  const restored = await boot(path)
  expect(await restored.resolve(ref)).toMatchObject({ value: 'synthetic-api-secret', source: 'persona-vault' })
  expect(await restored.readRecord(key)).toEqual({ kind: 'grant', payload: { access: 'synthetic-oauth-secret', refresh: 'synthetic-refresh-secret' } })
  expect(await restored.vault.getAccount('owner', 'claude', 'work')).toBe('synthetic-account-secret')
  expect(warn).toHaveBeenCalled()
  expect(JSON.stringify(warn.mock.calls)).not.toContain('synthetic-')
  expect(readdirSync(root)).toEqual(['persona-vault.json'])
})

it('quarantines corrupt JSON without logging its contents and creates a clean file', async () => {
  vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const path = join(temporary(), 'persona-vault.json')
  writeFileSync(path, '{synthetic-corrupt-secret')
  const vault = await boot(path)
  expect(existsSync(`${path}.bad`)).toBe(true)
  expect(readFileSync(`${path}.bad`, 'utf8')).toBe('{synthetic-corrupt-secret')
  expect(vault.snapshot()).toMatchObject({ refs: {}, records: {}, connections: [] })
  expect(JSON.stringify(warn.mock.calls)).not.toContain('synthetic-corrupt-secret')
})

it('rolls back failed durable writes and serializes concurrent record updates', async () => {
  vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const path = join(temporary(), 'persona-vault.json')
  const vault = await boot(path)
  const key = credentialKey('persona-test', 'key')
  await vault.modifyRecord(key, async () => ({ kind: 'api-key', key: 'initial-synthetic' }))
  await Promise.all(['second-synthetic', 'last-synthetic'].map(secret => vault.modifyRecord(key, async () => ({ kind: 'api-key', key: secret }))))
  expect(await vault.readRecord(key)).toEqual({ kind: 'api-key', key: 'last-synthetic' })
  renameSync(path, `${path}.backup`); mkdirSync(path)
  await expect(vault.modifyRecord(key, async () => ({ kind: 'api-key', key: 'failed-synthetic' }))).rejects.toBeInstanceOf(VaultStorageError)
  expect(await vault.readRecord(key)).toEqual({ kind: 'api-key', key: 'last-synthetic' })
  expect(readFileSync(`${path}.backup`, 'utf8')).not.toContain('failed-synthetic')
  await expect(vault.vault.set('owner', 'dsh', 'failed-connection')).rejects.toBeInstanceOf(VaultStorageError)
  expect(await vault.vault.get('owner', 'dsh')).toBeUndefined()
})

it('never admits the harness cipher inside Electron, even when explicitly requested', () => {
  expect(vaultBackend(true, true, true)).toBe('available')
  expect(() => vaultBackend(true, false, true)).toThrow(VaultUnavailableError)
  expect(vaultBackend(false, false, false)).toBe('unavailable')
})

it('keeps only local browser-session records in memory without IPC or a vault file', async () => {
  vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '')
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const path = join(temporary(), 'persona-vault.json')
  const vault = await boot(path)
  const key = credentialKey('client-connection', 'browser-session')
  const record = { kind: 'api-key' as const, key: 'synthetic-local-browser-session' }
  expect(await vault.modifyRecord(key, () => Promise.resolve(record))).toEqual(record)
  expect(await vault.readRecord(key)).toEqual(record)
  expect(await vault.describeRecord(key)).toEqual({ configured: true, writable: true, kind: 'api-key' })
  expect(await vault.listRecords()).toEqual([{ key, kind: 'api-key' }])
  expect(JSON.stringify(vault.snapshot())).not.toContain(record.key)
  expect(existsSync(path)).toBe(false)
  expect(warn).not.toHaveBeenCalled()
  const restarted = await boot(path)
  expect(await restarted.readRecord(key)).toBeUndefined()
  await vault.deleteRecord(key)
  expect(await vault.readRecord(key)).toBeUndefined()
  expect(await vault.listRecords()).toEqual([])
  expect(existsSync(path)).toBe(false)
})

it('keeps the Web browser exception out of provider and edge credentials', async () => {
  vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '')
  const path = join(temporary(), 'persona-vault.json')
  const vault = await boot(path)
  for (const scope of ['provider', 'persona-edge', 'client-connection-other']) {
    const key = credentialKey(scope, 'token')
    await expect(vault.modifyRecord(key, () => Promise.resolve({ kind: 'grant', payload: 'synthetic-provider-token' })))
      .rejects.toBeInstanceOf(VaultUnavailableError)
    await expect(vault.deleteRecord(key)).rejects.toBeInstanceOf(VaultUnavailableError)
  }
  await expect(vault.sealInviteToken('test-invite', 'synthetic-edge-token')).rejects.toBeInstanceOf(VaultUnavailableError)
  expect(vault.status()).toEqual({ available: false, protection: 'unavailable' })
  expect(existsSync(path)).toBe(false)
})

it('persists browser-session records sealed when a cipher is explicitly available', async () => {
  vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const path = join(temporary(), 'persona-vault.json')
  const vault = await boot(path)
  const key = credentialKey('client-connection', 'browser-session')
  const record = { kind: 'api-key' as const, key: 'synthetic-local-browser-session' }
  await vault.modifyRecord(key, () => Promise.resolve(record))
  const file = readFileSync(path, 'utf8')
  expect(file).not.toContain(record.key)
  expect(vault.snapshot().records[key]?.sealed).toBeDefined()
  const restarted = await boot(path)
  expect(await restarted.readRecord(key)).toEqual(record)
})

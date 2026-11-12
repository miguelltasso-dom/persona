import { existsSync, readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { CofreSecrets, VAULT_TELEGRAM, createMemoryCipher, createPersonaVault } from '@deepseek-ai/dsh-persona-vault'
import { ProductRepos, ScreenRepos, VaultRepos, openTempStore, type TempStore } from '@deepseek-ai/dsh-persona-store'
import { CofreEntries, CofreEntryError } from '../src/cofre-entries.ts'
import { CofreMigration, connectorSlot } from '../src/cofre-migrate.ts'

/**
 * Carbon P0-09 (colheita S1): the Cofre keeps its promise. A secret entered from the screen can never land on the slot of a connector, the
 * migration leaves NO plaintext behind (revoked rows, versions, the backup made before it), and what is left is never exported.
 * Written RED first (each test reproduces the audit's steps), then the fix.
 */

const temps: TempStore[] = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function setup() {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  const vault = new VaultRepos(handle.store)
  const screens = new ScreenRepos(handle.store)
  const secrets = new CofreSecrets(createPersonaVault(createMemoryCipher()))
  const entries = new CofreEntries({ screens, vault, secrets, workspaceOf: () => 'ws' })
  return { handle, product, vault, secrets, entries }
}

const RESERVED = ['connector:imap', 'connector:github.webhook.secret', 'code:gmail', 'default'] as const

it('a secret entered on the screen can never land on a connector slot: a caller-chosen id is refused and the sealed secret stays what it was', async () => {
  const { secrets, entries } = await setup()
  await secrets.put('pp', 'connector:imap', 'segredo-real-do-imap')
  await secrets.put('pp', 'connector:github.webhook.secret', 'segredo-real-do-webhook')
  await secrets.put('pp', 'code:gmail', 'JBSWY3DPEHPK3PXP')
  for (const id of RESERVED) {
    await expect(entries.saveKey({ projectId: 'pp', authorId: 'ana', service: 'x', secret: 'forjado', id }), `saveKey ${id}`).rejects.toBeInstanceOf(CofreEntryError)
    await expect(entries.saveLogin({ projectId: 'pp', authorId: 'ana', site: 'x.com', username: 'u', password: 'forjado', id }), `saveLogin ${id}`).rejects.toBeInstanceOf(CofreEntryError)
    expect(() => entries.saveCompany({ projectId: 'pp', authorId: 'ana', legalName: 'X Ltda', document: '12.345.678/0001-90', id }), `saveCompany ${id}`).toThrow(CofreEntryError)
  }
  expect(await secrets.read('pp', 'connector:imap')).toBe('segredo-real-do-imap')
  expect(await secrets.read('pp', 'connector:github.webhook.secret')).toBe('segredo-real-do-webhook')
  expect(await secrets.read('pp', 'code:gmail')).toBe('JBSWY3DPEHPK3PXP')
  expect(entries.list('pp')).toEqual([]) // nothing was written either
})

it('removing by a reserved id never drops a sealed connector secret (the screen can neither overwrite nor delete it)', async () => {
  const { secrets, entries } = await setup()
  await secrets.put('pp', 'connector:github.webhook.secret', 'segredo-real-do-webhook')
  for (const id of RESERVED) await entries.remove('pp', id)
  expect(await secrets.read('pp', 'connector:github.webhook.secret')).toBe('segredo-real-do-webhook')
})

it('an id that is not an entry of this project is refused too (an id from the network never creates one)', async () => {
  const { entries } = await setup()
  await expect(entries.saveKey({ projectId: 'pp', authorId: 'ana', service: 'x', secret: 'segredo', id: 'cofre-key-que-nao-existe' })).rejects.toBeInstanceOf(CofreEntryError)
  expect(entries.list('pp')).toEqual([])
})

it('editing an entry the Cofre created still works (the guard is not a lock on the screen)', async () => {
  const { entries, secrets } = await setup()
  const created = await entries.saveKey({ projectId: 'pp', authorId: 'ana', service: 'Stripe', secret: 'sk-1' })
  expect(created.id).toMatch(/^cofre-key-/u)
  const edited = await entries.saveKey({ projectId: 'pp', authorId: 'ana', service: 'Stripe live', id: created.id }) // without retyping: keeps the sealed value
  expect(edited.fields.service).toBe('Stripe live')
  expect(await secrets.read('pp', created.id)).toBe('sk-1')
  const rotated = await entries.saveKey({ projectId: 'pp', authorId: 'ana', service: 'Stripe live', secret: 'sk-2', id: created.id })
  expect(rotated.hasSecret).toBe(true)
  expect(await secrets.read('pp', created.id)).toBe('sk-2')
})

function withOldToken(vault: VaultRepos): void {
  // An older build kept the token as a record body; it was rotated (the old value is a revoked row with its own versions) and the new one is active.
  vault.createRecord({ id: 'r-old', workspaceId: 'ws', projectId: 'pp', kind: 'memory', body: '111111:token-antigo-do-telegram', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: VAULT_TELEGRAM })
  vault.updateRecord('r-old', '111111:token-antigo-do-telegram-v2', 'ana')
  vault.revokeRecord('r-old')
  vault.createRecord({ id: 'r-new', workspaceId: 'ws', projectId: 'pp', kind: 'memory', body: '222222:token-novo-do-telegram', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: VAULT_TELEGRAM })
  vault.updateRecord('r-new', '222222:token-novo-do-telegram', 'ana')
}

it('the boot sweep leaves NO plaintext of a connector token: not the active row, not a revoked one, not any version', async () => {
  const { handle, product, vault, secrets } = await setup()
  withOldToken(vault)
  await new CofreMigration({ product, vault, secrets }).run()
  expect(await secrets.read('pp', connectorSlot(VAULT_TELEGRAM))).toBe('222222:token-novo-do-telegram')
  const rows = JSON.stringify(handle.store.db.prepare('SELECT body FROM vault_record UNION ALL SELECT body FROM vault_version').all())
  expect(rows).not.toContain('token-novo-do-telegram')
  expect(rows).not.toContain('token-antigo-do-telegram')
  expect(handle.store.db.prepare('SELECT COUNT(*) AS total FROM vault_record WHERE fact_key = ?').get(VAULT_TELEGRAM)?.total).toBe(0)
})

it('the BYTES of the main database file and of its WAL carry no token after the sweep (a deleted row still leaves its text in the page until the page is zeroed)', async () => {
  const { handle, product, vault, secrets } = await setup()
  withOldToken(vault)
  await new CofreMigration({ product, vault, secrets }).run()
  const main = readFileSync(handle.path)
  const wal = existsSync(`${handle.path}-wal`) ? readFileSync(`${handle.path}-wal`) : Buffer.alloc(0)
  for (const token of ['token-novo-do-telegram', 'token-antigo-do-telegram']) {
    expect(main.includes(token), `${token} in the main file`).toBe(false)
    expect(wal.includes(token), `${token} in the WAL`).toBe(false)
  }
})

it('an install whose OLD sweep already ran (nothing left to move) still gets its main file compacted ONCE: the text of the rows it erased is gone from the bytes', async () => {
  const { handle, product, vault, secrets } = await setup()
  vault.createRecord({ id: 'r-legacy', workspaceId: 'ws', projectId: 'pp', kind: 'memory', body: '555555:token-legado-do-telegram', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: VAULT_TELEGRAM })
  // How the OLDER build erased (plain SQL, no secure_delete): body replaced by a tombstone, fact key cleared; the page kept the text.
  handle.store.db.exec("UPDATE vault_record SET body = 'Conteúdo movido para o Cofre.', fact_key = NULL, status = 'revoked' WHERE id = 'r-legacy'")
  handle.store.db.exec("DELETE FROM vault_version WHERE target_kind = 'record' AND target_id = 'r-legacy'") // …and its versions
  handle.store.checkpointWal()
  expect(readFileSync(handle.path).includes('token-legado-do-telegram'), 'the premise: the page still has it').toBe(true)
  expect((await new CofreMigration({ product, vault, secrets }).run()).migrated).toBe(0) // nothing to move this time
  expect(readFileSync(handle.path).includes('token-legado-do-telegram')).toBe(false)
  expect((await new CofreMigration({ product, vault, secrets }).run()).migrated).toBe(0) // and the second boot does not rebuild the file again
  expect(handle.store.needsSecretCompaction()).toBe(false)
})

it('a LATER erasure of a secret row is zeroed at once (secure_delete is on while a secret is erased, and only then)', async () => {
  const { handle, vault } = await setup()
  vault.createRecord({ id: 'r-late', workspaceId: 'ws', projectId: 'pp', kind: 'memory', body: '999999:token-tardio-do-telegram', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: VAULT_TELEGRAM })
  vault.purgeSecretFacts([VAULT_TELEGRAM])
  handle.store.checkpointWal()
  expect(readFileSync(handle.path).includes('token-tardio-do-telegram')).toBe(false)
  // …and the pragma is not left on for the rest of the database (the scale spec's p95 depends on it): the connection is back to what it was.
  expect(Number((handle.store.db.prepare('PRAGMA secure_delete').get() as { secure_delete: number }).secure_delete)).toBe(0)
})

it('the backup made BEFORE the sweep does not keep the token in clear either (it is scrubbed after the sweep)', async () => {
  const { handle, product, vault, secrets } = await setup()
  withOldToken(vault)
  const backup = handle.store.backupNow() // what the store takes before a schema migration: a full copy, plaintext included
  expect(readFileSync(backup).includes('token-novo-do-telegram')).toBe(true) // the premise: the copy really has it
  await new CofreMigration({ product, vault, secrets }).run()
  const bytes = readFileSync(backup)
  expect(bytes.includes('token-novo-do-telegram')).toBe(false)
  expect(bytes.includes('token-antigo-do-telegram')).toBe(false)
})

it('Keel 12:15: erasing a secret leaves nothing in the WAL either, by itself: purgeSecretFacts truncates the log (no manual checkpoint is needed to read clean bytes)', async () => {
  const { handle, vault } = await setup()
  vault.createRecord({ id: 'r-wal', workspaceId: 'ws', projectId: 'pp', kind: 'memory', body: '777777:token-no-wal-do-telegram', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: VAULT_TELEGRAM })
  vault.purgeSecretFacts([VAULT_TELEGRAM])
  const wal = existsSync(`${handle.path}-wal`) ? readFileSync(`${handle.path}-wal`) : Buffer.alloc(0)
  expect(readFileSync(handle.path).includes('token-no-wal-do-telegram'), 'the main file').toBe(false)
  expect(wal.includes('token-no-wal-do-telegram'), 'the WAL').toBe(false)
})

it('Keel 12:15: the same for purgeSecret(id), the erasure of ONE record by id', async () => {
  const { handle, vault } = await setup()
  vault.createRecord({ id: 'r-wal2', workspaceId: 'ws', projectId: 'pp', kind: 'memory', body: '888888:outro-token-no-wal', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: VAULT_TELEGRAM })
  vault.purgeSecret('r-wal2')
  const wal = existsSync(`${handle.path}-wal`) ? readFileSync(`${handle.path}-wal`) : Buffer.alloc(0)
  expect(readFileSync(handle.path).includes('outro-token-no-wal'), 'the main file').toBe(false)
  expect(wal.includes('outro-token-no-wal'), 'the WAL').toBe(false)
})

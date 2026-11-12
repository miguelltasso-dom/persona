import { afterEach, expect, it } from 'vitest'
import { CofreSecrets, VAULT_TELEGRAM, createMemoryCipher, createPersonaVault } from '@deepseek-ai/dsh-persona-vault'
import { ProductRepos, VaultRepos, openTempStore, type TempStore } from '@deepseek-ai/dsh-persona-store'
import { CofreMigration, connectorSlot, GITHUB_WEBHOOK_FACT } from '../src/cofre-migrate.ts'
import { CofreSecretVault } from '../src/cofre-secrets.ts'

/**
 * H15b: a connector token that older builds wrote as the body of a Cofre record is plaintext in SQLite. The boot sweep seals it,
 * purges the record (body, fact key and every version) and the reader answers from the sealed slot from then on.
 */

const temps: TempStore[] = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function setup(): Promise<{ product: ProductRepos; vault: VaultRepos; secrets: CofreSecrets; store: TempStore['store'] }> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  const vault = new VaultRepos(handle.store)
  vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
    body: '123456:token-do-telegram', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: VAULT_TELEGRAM,
  })
  vault.updateRecord('r1', '123456:token-do-telegram', 'ana')
  return { product, vault, secrets: new CofreSecrets(createPersonaVault(createMemoryCipher())), store: handle.store }
}

it('moves a connector token to the sealed store and leaves no plaintext in SQLite', async () => {
  const { product, vault, secrets, store } = await setup()
  expect(await new CofreSecretVault(vault, product).get('pp', 'ana', VAULT_TELEGRAM)).toBe('123456:token-do-telegram')
  expect((await new CofreMigration({ product, vault, secrets }).run()).migrated).toBe(1)
  expect(await secrets.read('pp', connectorSlot(VAULT_TELEGRAM))).toBe('123456:token-do-telegram')
  expect(vault.findActiveFact('pp', VAULT_TELEGRAM)).toBeUndefined()
  const rows = store.db.prepare('SELECT body FROM vault_record UNION ALL SELECT body FROM vault_version').all()
  expect(JSON.stringify(rows)).not.toContain('token-do-telegram')
  expect(await new CofreSecretVault(vault, product, secrets).get('pp', 'ana', VAULT_TELEGRAM)).toBe('123456:token-do-telegram')
})

it('runs twice without moving anything the second time', async () => {
  const { product, vault, secrets } = await setup()
  expect((await new CofreMigration({ product, vault, secrets }).run()).migrated).toBe(1)
  expect((await new CofreMigration({ product, vault, secrets }).run()).migrated).toBe(0)
  expect(await secrets.read('pp', connectorSlot(VAULT_TELEGRAM))).toBe('123456:token-do-telegram')
})

it('moves the GitHub webhook secret too, and the SQLite keeps no trace of it', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  const vault = new VaultRepos(handle.store)
  vault.createRecord({
    id: 'hook', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
    body: 'segredo-do-webhook-123', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: GITHUB_WEBHOOK_FACT,
  })
  const secrets = new CofreSecrets(createPersonaVault(createMemoryCipher()))
  expect((await new CofreMigration({ product, vault, secrets }).run()).migrated).toBe(1)
  expect(await secrets.read('pp', connectorSlot(GITHUB_WEBHOOK_FACT))).toBe('segredo-do-webhook-123')
  expect(vault.findActiveFact('pp', GITHUB_WEBHOOK_FACT)).toBeUndefined()
  const rows = handle.store.db.prepare('SELECT body FROM vault_record UNION ALL SELECT body FROM vault_version').all()
  expect(JSON.stringify(rows)).not.toContain('segredo-do-webhook-123')
  expect((await new CofreMigration({ product, vault, secrets }).run()).migrated).toBe(0)
})

it('keeps the plaintext when the sealed store refuses, and purges nothing', async () => {
  const { product, vault } = await setup()
  const refusing = new CofreSecrets(createPersonaVault({
    seal: () => Promise.reject(new Error('sem DPAPI')),
    open: () => Promise.reject(new Error('sem DPAPI')),
  }))
  await expect(new CofreMigration({ product, vault, secrets: refusing }).run()).rejects.toThrow('sem DPAPI')
  expect(vault.findActiveFact('pp', VAULT_TELEGRAM)?.body).toBe('123456:token-do-telegram')
})

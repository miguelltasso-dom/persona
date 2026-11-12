import { afterEach, expect, it } from 'vitest'
import { CofreSecrets, assertNoPlaintextSecrets, createMemoryCipher, createPersonaVault } from '@deepseek-ai/dsh-persona-vault'
import { ScreenRepos, openTempStore, type TempStore } from '@deepseek-ai/dsh-persona-store'
import { OAuthVault, OAuthVaultError, oauthSlot } from '../src/oauth-vault.ts'

/**
 * Item 26, wave B (host): the OAuth tokens of an MCP server live sealed in the Cofre, the screen sees only metadata, and the refresh of one
 * connection runs once even when two callers ask at the same time (the provider refuses the second attempt).
 */

const temps: TempStore[] = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function vault(): Promise<{ vault: OAuthVault; secrets: CofreSecrets }> {
  const handle = await openTempStore()
  temps.push(handle)
  const secrets = new CofreSecrets(createPersonaVault(createMemoryCipher()))
  return {
    vault: new OAuthVault({ screens: new ScreenRepos(handle.store), secrets, now: () => '2026-11-12T03:00:00.000Z' }),
    secrets,
  }
}

it('keeps the tokens sealed and shows only who is connected', async () => {
  const { vault: store, secrets } = await vault()
  const view = await store.save('pp', {
    provider: 'mcp.notion.com',
    account: 'ana@padaria.com',
    tokens: { accessToken: 'at-secret', refreshToken: 'rt-secret', scope: 'read write', expiresAt: '2026-11-12T04:00:00.000Z' },
  })
  expect(view).toEqual({
    provider: 'mcp.notion.com',
    account: 'ana@padaria.com',
    scope: 'read write',
    expiresAt: '2026-11-12T04:00:00.000Z',
    updatedAt: '2026-11-12T03:00:00.000Z',
  })
  expect(JSON.stringify(store.list('pp'))).not.toContain('at-secret')
  expect(await secrets.read('pp', oauthSlot('mcp.notion.com', 'ana@padaria.com'))).toContain('at-secret')
  expect((await store.tokens('pp', 'mcp.notion.com', 'ana@padaria.com'))?.refreshToken).toBe('rt-secret')
})

it('refreshes one connection once, even when two callers ask together', async () => {
  const { vault: store } = await vault()
  await store.save('pp', { provider: 'mcp.notion.com', account: 'ana', tokens: { accessToken: 'old', refreshToken: 'rt' } })
  let calls = 0
  const refresh = async (): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> => {
    calls += 1
    await new Promise(resolve => setTimeout(resolve, 20))
    return { accessToken: 'new', refreshToken: 'rt2', expiresAt: '2026-11-12T05:00:00.000Z' }
  }
  const [first, second] = await Promise.all([
    store.rotate('pp', 'mcp.notion.com', 'ana', refresh),
    store.rotate('pp', 'mcp.notion.com', 'ana', refresh),
  ])
  expect(calls).toBe(1)
  expect(first.accessToken).toBe('new')
  expect(second.accessToken).toBe('new')
  expect(store.list('pp')[0]?.expiresAt).toBe('2026-11-12T05:00:00.000Z')
  expect((await store.tokens('pp', 'mcp.notion.com', 'ana'))?.accessToken).toBe('new')
})

it('forgets a connection: no sealed token and no metadata', async () => {
  const { vault: store } = await vault()
  await store.save('pp', { provider: 'mcp.stripe.com', account: 'ana', tokens: { accessToken: 'at' } })
  await store.drop('pp', 'mcp.stripe.com', 'ana')
  expect(store.list('pp')).toEqual([])
  expect(await store.tokens('pp', 'mcp.stripe.com', 'ana')).toBeUndefined()
})

it('an unreadable sealed value asks the person to connect again, and a missing connection is refused', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const secrets = new CofreSecrets(createPersonaVault(createMemoryCipher()))
  const store = new OAuthVault({ screens: new ScreenRepos(handle.store), secrets })
  await secrets.put('pp', oauthSlot('mcp.x.com', 'ana'), 'not json')
  await expect(store.tokens('pp', 'mcp.x.com', 'ana')).rejects.toBeInstanceOf(OAuthVaultError)
  await expect(store.rotate('pp', 'mcp.y.com', 'ana', async () => ({ accessToken: 'x' }))).rejects.toBeInstanceOf(OAuthVaultError)
  expect(() => assertNoPlaintextSecrets({ connections: [] }, ['not json'])).not.toThrow()
})

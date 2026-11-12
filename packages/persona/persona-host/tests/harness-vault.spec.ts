import { afterEach, expect, it } from 'vitest'
import { CofreSecrets, createMemoryCipher, createPersonaVault } from '@deepseek-ai/dsh-persona-vault'
import { ScreenRepos, openTempStore, type TempStore } from '@deepseek-ai/dsh-persona-store'
import { CofreCodes } from '../src/cofre-2fa.ts'
import type { HarnessIdentity } from '../src/harness-routines.ts'
import { VaultCodePorts } from '../src/harness-vault.ts'

/**
 * Item 15, the persona's side of the 2FA card: `ask_vault_code` opens a pending request for the owner and answers with its id and
 * deadline only — the digits go to the sealed store when she fills them and never travel back through this port.
 */

const temps: TempStore[] = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

const who: HarnessIdentity = {
  workspaceId: 'ws',
  projectId: 'pp',
  personaId: 'p1',
  initiator: 'person-request',
  autonomy: 'asked',
  callId: 'c1',
}

async function port(sealable: boolean): Promise<{ port: VaultCodePorts; codes: CofreCodes }> {
  const handle = await openTempStore()
  temps.push(handle)
  const codes = new CofreCodes({
    screens: new ScreenRepos(handle.store),
    secrets: new CofreSecrets(createPersonaVault(createMemoryCipher())),
  })
  return { port: new VaultCodePorts({ codes, sealable: () => sealable }), codes }
}

it('opens a pending request for the owner and answers with no digit', async () => {
  const { port: vaultCode, codes } = await port(true)
  const result = vaultCode.open(who, { reason: 'O banco mandou um código.', login: 'Banco', ticketId: 't1' })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(Object.keys(result).sort()).toEqual(['expiresAt', 'ok', 'requestId'])
  const request = codes.get('pp', result.requestId)
  expect(request?.state).toBe('pending')
  expect(request?.reason).toBe('O banco mandou um código.')
  expect(request?.site).toBe('Banco')
  expect(request?.ticketId).toBe('t1')
})

it('refuses, and opens nothing, when the sealed store cannot keep the digits', async () => {
  const { port: vaultCode, codes } = await port(false)
  expect(vaultCode.open(who, { reason: 'O banco mandou um código.' })).toMatchObject({ ok: false, code: 'unavailable' })
  expect(codes.list('pp')).toEqual([])
})

it('P2-01: the refusal the model relays speaks to the owner in the second person, never of "a pessoa"', async () => {
  const { port: vaultCode } = await port(false)
  const result = vaultCode.open(who, { reason: 'O banco mandou um código.' })
  expect(result).toMatchObject({ ok: false, code: 'unavailable' })
  const message = result.ok ? '' : result.message
  expect(message).not.toMatch(/\b(?:à|a|da|de|pela)\s+pessoa\b/iu)
  expect(message).toMatch(/você/u) // (\b is ASCII-only: it would not see the end of an accented word)
  expect(message).toMatch(/Cofre/u)
})

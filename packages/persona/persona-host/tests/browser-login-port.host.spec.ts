import { describe, expect, it, vi } from 'vitest'
import { SecretMask } from '../src/browser/blind-typing.ts'
import { BrowserLoginPorts } from '../src/browser/login-port.ts'
import type { HarnessIdentity } from '../src/harness-routines.ts'

const WHO: HarnessIdentity = {
  workspaceId: 'ws',
  projectId: 'pp',
  personaId: 'bia',
  initiator: 'person-request',
  autonomy: 'asked',
  callId: 'c1',
}

const LOJA = { id: 'l1', title: 'Loja', site: 'https://loja.exemplo.com.br', username: 'ana@loja.com.br' }

function port(extra: Partial<ConstructorParameters<typeof BrowserLoginPorts>[0]> = {}) {
  const mask = new SecretMask()
  const typed = vi.fn(async () => ({ typed: true, line: 'digitei a senha de Loja na página; confira e conclua o login' }))
  const instance = new BrowserLoginPorts({
    liveSessionOf: () => ({ port: 9222 }),
    loginsOf: () => [LOJA],
    secretOf: async () => 'senha-secreta-123',
    mask,
    now: () => 1_000,
    type: typed,
    ...extra,
  })
  return { instance, mask, typed }
}

describe('COLHEITA 15b: browser_login', () => {
  it('types the Cofre password into the page and answers with words, never the value', async () => {
    const { instance, mask, typed } = port()
    const result = await instance.open(WHO, { login: 'loja', ticketId: 't1' })
    expect(result).toMatchObject({ ok: true, typed: true })
    expect(JSON.stringify(result)).not.toContain('senha-secreta-123')
    expect(typed).toHaveBeenCalledWith(expect.objectContaining({ entry: LOJA, password: 'senha-secreta-123', port: 9222 }))
    // The value is masked in the host's outputs from the moment it is read.
    expect(mask.redact('log: senha-secreta-123', 2_000)).toBe('log: ••••••')
  })

  it('refuses when the turn has no browser, when the login is unknown and when it has no password', async () => {
    expect(await port({ liveSessionOf: () => undefined }).instance.open(WHO, { login: 'loja', ticketId: 't1' }))
      .toMatchObject({ ok: false, code: 'unavailable' })
    expect(await port({ loginsOf: () => [] }).instance.open(WHO, { login: 'loja', ticketId: 't1' }))
      .toMatchObject({ ok: false, code: 'not-found' })
    expect(await port({ secretOf: async () => undefined }).instance.open(WHO, { login: 'loja', ticketId: 't1' }))
      .toMatchObject({ ok: false, code: 'not-found', message: /não tem senha guardada/u })
  })

  it('an ambiguous name is refused instead of guessing which account to fill', async () => {
    const other = { id: 'l2', title: 'Loja antiga', site: 'https://velha.exemplo.com.br', username: 'ana@velha.com.br' }
    const { instance, typed } = port({ loginsOf: () => [LOJA, other] })
    expect(await instance.open(WHO, { login: 'loja', ticketId: 't1' })).toMatchObject({ ok: false, code: 'not-found' })
    expect(typed).not.toHaveBeenCalled()
  })
})

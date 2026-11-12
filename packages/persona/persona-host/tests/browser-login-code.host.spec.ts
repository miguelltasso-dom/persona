/**
 * Carbon P1-04 (colheita snapshot 1): the six digits the owner fills in the card reach the page without the model: `browser_login` with `code: true` finds the persona's own filled request, checks it is for THIS
 * login, types the digits into the field the persona focused (only on the login's own site), and only then spends them. RED first: the port knew only the password.
 */
import { harnessMcpTools } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, it, vi } from 'vitest'
import { BLIND_CODE_NO_FIELD, SecretMask } from '../src/browser/blind-typing.ts'
import { BrowserLoginPorts, LOGIN_FAILED } from '../src/browser/login-port.ts'
import * as loginTool from '../src/browser/login-tool.ts'
import { harnessMcpPorts } from '../src/harness-dispatch.ts'
import type { HarnessIdentity } from '../src/harness-routines.ts'

const WHO: HarnessIdentity = { workspaceId: 'ws', projectId: 'pp', personaId: 'bia', initiator: 'person-request', autonomy: 'asked', callId: 'c1' }
const BANCO = { id: 'l1', title: 'Banco', site: 'https://banco.exemplo.com.br', username: 'ana' }
const LOJA = { id: 'l2', title: 'Loja', site: 'https://loja.exemplo.com.br', username: 'ana' }
const CODE = '482913'
const REQUEST = { id: 'cofre-code-1', projectId: 'pp', personaId: 'bia', ticketId: 't1', reason: 'O banco mandou um código.', site: 'Banco', state: 'filled' as const, createdAt: '2026-11-12T10:00:00.000Z', expiresAt: '2026-11-12T10:10:00.000Z', filledAt: '2026-11-12T10:01:00.000Z' }

function rig(over: { request?: typeof REQUEST | undefined; peek?: string | undefined; type?: (code: string) => { typed: boolean; line: string } } = {}) {
  const mask = new SecretMask()
  const codes = {
    filledFor: vi.fn(() => ('request' in over ? over.request : REQUEST)),
    peek: vi.fn(() => Promise.resolve('peek' in over ? over.peek : CODE)),
    take: vi.fn(() => Promise.resolve(CODE)),
  }
  const typeCode = vi.fn(({ code }: { code: string }) => Promise.resolve((over.type ?? (() => ({ typed: true, line: 'digitei' })))(code)))
  const ports = new BrowserLoginPorts({
    liveSessionOf: () => ({ port: 9222 }),
    loginsOf: () => [BANCO, LOJA],
    secretOf: () => Promise.resolve('Banco#Sol-2026'),
    mask, now: () => 1_000, codes, typeCode: typeCode as never,
  })
  return { ports, mask, codes, typeCode }
}

describe('browser_login with code: the owner\'s six digits go into the page, never through the model', () => {
  it('types the digits of the persona\'s own filled request into the login\'s page, spends them once typed, masks them, and answers with a sentence of ours', async () => {
    const { ports, mask, codes, typeCode } = rig()
    const result = await ports.open(WHO, { login: 'banco', ticketId: 't1', code: true })
    expect(result).toEqual({ ok: true, typed: true, message: 'digitei o código de 6 dígitos de Banco na página; confira e conclua o login' })
    expect(codes.filledFor).toHaveBeenCalledWith('pp', { personaId: 'bia', ticketId: 't1' })
    expect(typeCode).toHaveBeenCalledWith(expect.objectContaining({ entry: BANCO, code: CODE, port: 9222 }))
    expect(codes.take).toHaveBeenCalledWith('pp', 'cofre-code-1') // spent only after it was typed
    expect(mask.redact(`o código é ${CODE}`, 2_000)).not.toContain(CODE)
    expect(JSON.stringify(result)).not.toContain(CODE)
  })

  it('a careless typing line, or an error that carries the digits, never reaches the model; the code is NOT spent when nothing was typed', async () => {
    const careless = rig({ type: code => ({ typed: false, line: `digitei ${code} e a página disse ok` }) })
    const result = await careless.ports.open(WHO, { login: 'banco', ticketId: 't1', code: true })
    expect(result).toEqual({ ok: true, typed: false, message: LOGIN_FAILED })
    expect(careless.codes.take).not.toHaveBeenCalled() // the owner's code is kept for another try
    const throwing = rig()
    throwing.typeCode.mockRejectedValueOnce(new Error(`CDP recusou ${CODE}`))
    const failed = await throwing.ports.open(WHO, { login: 'banco', ticketId: 't1', code: true })
    expect(JSON.stringify(failed)).not.toContain(CODE)
    expect(failed).toMatchObject({ ok: true, typed: false })
    expect(throwing.codes.take).not.toHaveBeenCalled()
  })

  it('a page with no field for the code says so in our words and keeps the code', async () => {
    const noField = rig({ type: () => ({ typed: false, line: BLIND_CODE_NO_FIELD }) })
    expect(await noField.ports.open(WHO, { login: 'banco', ticketId: 't1', code: true })).toEqual({ ok: true, typed: false, message: BLIND_CODE_NO_FIELD })
    expect(noField.codes.take).not.toHaveBeenCalled()
  })

  it('refuses without typing when nobody filled a card for this Task, and never reads the digits', async () => {
    const none = rig({ request: undefined })
    const result = await none.ports.open(WHO, { login: 'banco', ticketId: 't1', code: true })
    expect(result).toMatchObject({ ok: false, code: 'not-found', message: expect.stringMatching(/ask_vault_code/u) as unknown as string })
    expect(none.codes.peek).not.toHaveBeenCalled()
    expect(none.typeCode).not.toHaveBeenCalled()
  })

  it('the owner filled the card for ANOTHER login (or the request names none): refused, nothing typed, nothing read', async () => {
    const other = rig({ request: { ...REQUEST, site: 'Loja' } })
    expect(await other.ports.open(WHO, { login: 'banco', ticketId: 't1', code: true })).toMatchObject({ ok: false, code: 'mismatch' })
    const nameless = rig({ request: { ...REQUEST, site: undefined as unknown as string } })
    expect(await nameless.ports.open(WHO, { login: 'banco', ticketId: 't1', code: true })).toMatchObject({ ok: false, code: 'mismatch' })
    for (const attempt of [other, nameless]) {
      expect(attempt.codes.peek).not.toHaveBeenCalled()
      expect(attempt.typeCode).not.toHaveBeenCalled()
    }
  })

  it('without a browser, with an unknown login, or with no code book wired: refused in words, nothing read', async () => {
    const noBrowser = new BrowserLoginPorts({ liveSessionOf: () => undefined, loginsOf: () => [BANCO], secretOf: () => Promise.resolve('x'), mask: new SecretMask(), codes: { filledFor: () => REQUEST, peek: () => Promise.resolve(CODE), take: () => Promise.resolve(CODE) } })
    expect(await noBrowser.open(WHO, { login: 'banco', ticketId: 't1', code: true })).toMatchObject({ ok: false, code: 'unavailable' })
    expect(await rig().ports.open(WHO, { login: 'inexistente', ticketId: 't1', code: true })).toMatchObject({ ok: false, code: 'not-found', message: loginTool.LOGIN_UNKNOWN })
    const noBook = new BrowserLoginPorts({ liveSessionOf: () => ({ port: 9222 }), loginsOf: () => [BANCO], secretOf: () => Promise.resolve('x'), mask: new SecretMask() })
    expect(await noBook.open(WHO, { login: 'banco', ticketId: 't1', code: true })).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('without code: true the port still types the PASSWORD, as before, and never touches the code book', async () => {
    const { ports, codes } = rig()
    const typed = vi.fn(() => Promise.resolve({ typed: true, line: 'x' }))
    const same = new BrowserLoginPorts({ liveSessionOf: () => ({ port: 9222 }), loginsOf: () => [BANCO], secretOf: () => Promise.resolve('Banco#Sol-2026'), mask: new SecretMask(), now: () => 1_000, type: typed as never, codes })
    expect(await same.open(WHO, { login: 'banco', ticketId: 't1' })).toMatchObject({ ok: true, typed: true, message: expect.stringMatching(/senha de Banco/u) as unknown as string })
    expect(codes.filledFor).not.toHaveBeenCalled()
    void ports
  })
})

describe('the tool reaches the port with the flag, and says what to do next', () => {
  async function callWith(args: Record<string, unknown>): Promise<{ input: unknown; answer: string }> {
    let input: unknown
    const ports = harnessMcpPorts({
      identityOf: () => WHO,
      browserLogin: { open: (_who: HarnessIdentity, given: unknown) => { input = given; return Promise.resolve({ ok: true as const, typed: true, message: 'digitei o código de 6 dígitos de Banco na página; confira e conclua o login' }) } },
    } as never, {})
    const answer = await ports.call?.({ tool: 'browser_login', run: { personaId: 'bia', ticketId: 't1', assignmentId: 'a1' }, args, callId: 'c1' }) ?? ''
    return { input, answer }
  }

  it('code: true is passed on; anything else is the password path', async () => {
    expect((await callWith({ login: 'banco', code: true })).input).toEqual({ login: 'banco', ticketId: 't1', code: true })
    expect((await callWith({ login: 'banco' })).input).toEqual({ login: 'banco', ticketId: 't1' })
    expect((await callWith({ login: 'banco', code: 'sim' })).input).toEqual({ login: 'banco', ticketId: 't1' }) // only the boolean true counts
  })

  it('the model is told, in the tool\'s own words, to end the turn after asking and to type the code through browser_login', () => {
    const tools = harnessMcpTools({ personaId: 'bia', ticketId: 't1', assignmentId: 'a1' }, { tools: ['ask_vault_code', 'browser_login'], call: () => Promise.resolve('{}') }, 'read')
    const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
    expect(byName.ask_vault_code?.description).toMatch(/code true/u)
    expect(byName.browser_login?.description).toMatch(/code true/u)
    expect(byName.browser_login?.inputSchema).toMatchObject({ properties: { login: {}, code: { type: 'boolean' } } })
  })
})

/**
 * Carbon P0-02 (colheita snapshot 1): the Cofre password and the 2FA digits never reach the model. These specs are written RED first: each one fails on the code that shipped in snapshot 1.
 *
 *  - `browser_login` answers with a sentence the PORT builds (never the text the typing returned);
 *  - the mask knows every shape a secret takes on its way through a page (percent, form `+`, JSON, base64 at any alignment) and says whether a window is open;
 *  - the CDP client does not hang when the tab closes, and a command that never answers is rejected;
 *  - the watch of the address bar runs AFTER the call returned, and sends the tab to `about:blank` when the secret lands in the URL.
 */
import { createMcpGateway } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, it, vi } from 'vitest'
import * as blind from '../src/browser/blind-typing.ts'
import { CdpConnection } from '../src/browser/cdp.ts'
import * as loginPort from '../src/browser/login-port.ts'
import { BrowserLoginPorts } from '../src/browser/login-port.ts'
import * as loginTool from '../src/browser/login-tool.ts'
import type { HarnessIdentity } from '../src/harness-routines.ts'

const WHO: HarnessIdentity = { workspaceId: 'ws', projectId: 'pp', personaId: 'bia', initiator: 'person-request', autonomy: 'asked', callId: 'c1' }
const LOJA = { id: 'l1', title: 'Loja', site: 'https://loja.exemplo.com.br', username: 'ana@loja.com.br' }
const PASSWORD = 'Padaria#Lua-2026'

function port(typing: (password: string) => { typed: boolean; line: string }, mask = new blind.SecretMask()): { instance: BrowserLoginPorts; mask: blind.SecretMask } {
  const instance = new BrowserLoginPorts({
    liveSessionOf: () => ({ port: 9222 }),
    loginsOf: () => [LOJA],
    secretOf: () => Promise.resolve(PASSWORD),
    mask,
    now: () => 1_000,
    type: ({ password }) => Promise.resolve(typing(password)),
  })
  return { instance, mask }
}

describe('P0-02: browser_login answers only with sentences of ours', () => {
  it('typed: the sentence is the port\'s own, whatever the typing wrote (a careless typing cannot carry the value, the page or anything else)', async () => {
    const { instance } = port(secret => ({ typed: true, line: `digitei ${secret} e a página disse: bem-vinda, Ana (saldo R$ 10)` }))
    const result = await instance.open(WHO, { login: 'loja', ticketId: 't1' })
    expect(result).toEqual({ ok: true, typed: true, message: 'digitei a senha de Loja na página; confira e conclua o login' })
  })

  it('not typed: a sentence the product knows passes; any other text becomes the generic sentence', async () => {
    const known = blind.BLIND_LOGIN_LINES['origem-diferente']
    const passes = await port(() => ({ typed: false, line: known })).instance.open(WHO, { login: 'loja', ticketId: 't1' })
    expect(passes).toEqual({ ok: true, typed: false, message: known })
    const noSite = await port(() => ({ typed: false, line: loginTool.LOGIN_NO_SITE })).instance.open(WHO, { login: 'loja', ticketId: 't1' })
    expect(noSite).toMatchObject({ ok: true, typed: false, message: loginTool.LOGIN_NO_SITE })

    const careless = await port(secret => ({ typed: false, line: `erro ao digitar ${secret}: ${'x'.repeat(400)}` })).instance.open(WHO, { login: 'loja', ticketId: 't1' })
    expect(careless).toMatchObject({ ok: true, typed: false })
    expect(JSON.stringify(careless)).not.toContain(PASSWORD)
    expect((careless as { message: string }).message).toBe('não consegui digitar a senha; nada foi concluído')
  })

  it('the typing that throws never puts its message (it may carry the value) in the answer', async () => {
    const instance = new BrowserLoginPorts({
      liveSessionOf: () => ({ port: 9222 }),
      loginsOf: () => [LOJA],
      secretOf: () => Promise.resolve(PASSWORD),
      mask: new blind.SecretMask(),
      now: () => 1_000,
      type: () => Promise.reject(new Error(`CDP recusou o texto ${PASSWORD}`)),
    })
    const result = await instance.open(WHO, { login: 'loja', ticketId: 't1' })
    expect(JSON.stringify(result)).not.toContain(PASSWORD)
    expect(result).toMatchObject({ ok: true, typed: false, message: 'não consegui digitar a senha; nada foi concluído' })
  })

  it('a title that happens to hold the value is masked in the sentence as a last layer', async () => {
    const instance = new BrowserLoginPorts({
      liveSessionOf: () => ({ port: 9222 }),
      loginsOf: () => [{ ...LOJA, title: `Loja ${PASSWORD}` }],
      secretOf: () => Promise.resolve(PASSWORD),
      mask: new blind.SecretMask(),
      now: () => 1_000,
      type: () => Promise.resolve({ typed: true, line: 'x' }),
    })
    const result = await instance.open(WHO, { login: PASSWORD, ticketId: 't1' })
    expect(JSON.stringify(result)).not.toContain(PASSWORD)
  })
})

describe('P0-02 (Keel, 12/11): a password that reaches the address bar AFTER the call returned is told to the owner, in fixed words', () => {
  function withWatch(outcome: blind.BlindWatchOutcome, leaks: loginPort.LoginLeak[]): BrowserLoginPorts {
    return new BrowserLoginPorts({
      liveSessionOf: () => ({ port: 9222 }),
      loginsOf: () => [LOJA],
      secretOf: () => Promise.resolve(PASSWORD),
      mask: new blind.SecretMask(),
      now: () => 1_000,
      type: () => Promise.resolve({ typed: true, line: 'x', watch: Promise.resolve(outcome) }),
      onLeak: (leak) => { leaks.push(leak) },
    })
  }

  it('the watch says the value reached the URL: the host is told who and which login, never the value, and the model still reads only the typed sentence', async () => {
    const leaks: loginPort.LoginLeak[] = []
    const result = await withWatch('vazou-na-url', leaks).open(WHO, { login: 'loja', ticketId: 't9' })
    expect(result).toEqual({ ok: true, typed: true, message: 'digitei a senha de Loja na página; confira e conclua o login' })
    await Promise.resolve() // the watch settles after the answer
    await Promise.resolve()
    expect(leaks).toEqual([{ projectId: 'pp', personaId: 'bia', ticketId: 't9', loginId: 'l1', title: 'Loja' }])
    expect(JSON.stringify(leaks)).not.toContain(PASSWORD)
  })

  it('a clean watch, or one that could not run to the end, tells nobody', async () => {
    const leaks: loginPort.LoginLeak[] = []
    await withWatch('limpo', leaks).open(WHO, { login: 'loja', ticketId: 't9' })
    await withWatch('interrompida', leaks).open(WHO, { login: 'loja', ticketId: 't9' })
    await Promise.resolve()
    await Promise.resolve()
    expect(leaks).toEqual([])
  })

  it('the book keeps the fixed record: which login, no address, no value', () => {
    const leak: loginPort.LoginLeak = { projectId: 'pp', personaId: 'bia', ticketId: 't9', loginId: 'l1', title: 'Loja' }
    expect(loginPort.loginLeakActivity(leak, '2026-11-12T04:00:00.000Z')).toEqual({
      verb: 'browser_leak', target: { kind: 'cofre-login', id: 'l1', title: 'Loja' }, initiator: 'persona-initiative', status: 'done', undoable: false, at: '2026-11-12T04:00:00.000Z',
    })
    expect(loginPort.LOGIN_LEAK_LINE).toBe('a senha apareceu no endereço da página; fechei a aba')
  })
})

describe('P0-02: the mask knows the shapes a secret takes on its way through a page', () => {
  const SECRET = 'Padaria#Lua 2026"x\\y'

  it('percent, form-encoded (+ for a space), JSON-escaped and lower-case percent forms are masked', () => {
    const mask = new blind.SecretMask()
    mask.add(SECRET, 0)
    const shapes = [
      SECRET,
      encodeURIComponent(SECRET),
      encodeURIComponent(SECRET).replace(/%20/gu, '+'),
      encodeURIComponent(SECRET).replace(/%[0-9A-F]{2}/gu, hex => hex.toLowerCase()), // some servers write the escapes in lower case (%2f)
      JSON.stringify(SECRET).slice(1, -1),
    ]
    for (const shape of shapes) expect(mask.redact(`antes ${shape} depois`, 1_000), shape).toBe(`antes ${blind.MASK} depois`)
  })

  it('base64 (and base64url) at every alignment is masked, as in a Basic header or a JSON body', () => {
    const mask = new blind.SecretMask()
    mask.add(SECRET, 0)
    for (const prefix of ['', 'a', 'ab', 'abc']) {
      for (const suffix of ['', 'z', 'zy', 'zyx']) {
        const body = Buffer.from(`${prefix}${SECRET}${suffix}`)
        for (const encoded of [body.toString('base64'), body.toString('base64url')]) {
          expect(mask.redact(`Authorization: Basic ${encoded}`, 1_000), `${prefix}|${suffix}`).not.toBe(`Authorization: Basic ${encoded}`)
          expect(mask.redact(`x=${encoded}&y=1`, 1_000)).toContain(blind.MASK)
        }
      }
    }
  })

  it('a short secret (the six digits of a code) is masked; unrelated text is untouched; the window ends', () => {
    const mask = new blind.SecretMask()
    expect(mask.live(0)).toBe(false)
    mask.add('482913', 0, 600_000)
    expect(mask.live(1_000)).toBe(true)
    expect(mask.redact('o código 482913 chegou; pedido 7731', 1_000)).toBe(`o código ${blind.MASK} chegou; pedido 7731`)
    expect(mask.live(600_001)).toBe(false)
    expect(mask.redact('o código 482913 chegou', 600_001)).toBe('o código 482913 chegou')
  })
})

describe('P0-02: the gateway of the host masks what any product tool answers (the Cofre password and the 2FA digits)', () => {
  const hooks = { report: () => undefined, recall: () => '', ask: () => undefined }

  function gatewayAnswering(text: string, mask: blind.SecretMask): ReturnType<typeof createMcpGateway> {
    return createMcpGateway({
      hooks,
      harness: { tools: ['board_list'], call: () => Promise.resolve(text) },
      onlyWired: true,
      redact: value => mask.redact(value, 1_000), // the same call the host wires: `this.browser.mask.redact(text, Date.now())`
    })
  }

  async function answer(gateway: ReturnType<typeof createMcpGateway>): Promise<string> {
    const lease = gateway.openTurn({ run: { personaId: 'bia', ticketId: 't1', assignmentId: 'a1' }, toolLevel: 'write', worktree: 'C:/tmp' })
    return (await gateway.call(lease.token, 'board_list', {})).content
  }

  it('the password, in any shape a tool could echo it, never reaches the model', async () => {
    const mask = new blind.SecretMask()
    mask.add(PASSWORD, 0)
    for (const shape of [PASSWORD, encodeURIComponent(PASSWORD), Buffer.from(`user:${PASSWORD}`).toString('base64')]) {
      const content = await answer(gatewayAnswering(`{"ok":true,"eco":"${shape}"}`, mask))
      expect(content).not.toContain(shape)
      expect(content).toContain(blind.MASK)
    }
  })

  it('the six digits the owner typed never reach the model', async () => {
    const mask = new blind.SecretMask()
    mask.add('482913', 0)
    const content = await answer(gatewayAnswering('{"ok":true,"message":"o código 482913 foi preenchido"}', mask))
    expect(content).not.toContain('482913')
    expect(content).toContain(blind.MASK)
  })
})

/** A socket the test drives by hand (the real one needs a DevTools server). */
class FakeSocket extends EventTarget {
  readonly sent: string[] = []
  closed = false
  send(data: string): void { this.sent.push(data) }
  close(): void { this.closed = true; this.dispatchEvent(new Event('close')) }
  answer(id: number, result: unknown): void { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id, result }) })) }
}

describe('P0-02: the CDP client does not hang', () => {
  it('a tab that closes rejects every command that was waiting, and the next one', async () => {
    const socket = new FakeSocket()
    const connection = CdpConnection.over(socket as unknown as WebSocket)
    const waiting = connection.send('Runtime.evaluate', { expression: '1' })
    socket.dispatchEvent(new Event('close'))
    await expect(waiting).rejects.toThrow(/fechou/u)
    await expect(connection.send('Runtime.evaluate')).rejects.toThrow(/fechou/u)
  })

  it('a socket error rejects what was waiting', async () => {
    const socket = new FakeSocket()
    const connection = CdpConnection.over(socket as unknown as WebSocket)
    const waiting = connection.send('Runtime.evaluate')
    socket.dispatchEvent(new Event('error'))
    await expect(waiting).rejects.toThrow()
  })

  it('a command that is never answered is rejected after its timeout, and an answer in time still resolves', async () => {
    vi.useFakeTimers()
    try {
      const socket = new FakeSocket()
      const connection = CdpConnection.over(socket as unknown as WebSocket)
      const silent = connection.send('Runtime.evaluate', {}, 5_000)
      const caught = expect(silent).rejects.toThrow(/não respondeu/u)
      await vi.advanceTimersByTimeAsync(5_001)
      await caught
      const quick = connection.send<{ ok: boolean }>('Runtime.evaluate', {}, 5_000)
      socket.answer(2, { ok: true })
      await expect(quick).resolves.toEqual({ ok: true })
    } finally {
      vi.useRealTimers()
    }
  })
})

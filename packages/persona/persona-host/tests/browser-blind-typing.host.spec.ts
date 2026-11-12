import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findChrome } from '../src/browser/chrome.ts'
import { launchChrome, type ChromeSession } from '../src/browser/launch.ts'
import { CdpConnection, cdpTargets } from '../src/browser/cdp.ts'
import { BLIND_CODE_NO_FIELD, MASK, SecretMask, typeLoginBlind } from '../src/browser/blind-typing.ts'
import { allowRealChrome } from './host-harness.ts'

allowRealChrome() // this spec opens a REAL Chrome on purpose (the guard in src/browser/launch.ts refuses it everywhere else under Vitest)
const chrome = findChrome()

const LOGIN = '<!doctype html><meta charset="utf-8"><form method="post" action="/in"><input name="user"><input type="password" name="pw"><button>Entrar</button></form>'
const OTP = '<!doctype html><meta charset="utf-8"><input type="password" name="pw"><input name="user"><input id="otp" name="codigo" autocomplete="one-time-code"><button>Confirmar</button>'
const LEAK = '<!doctype html><meta charset="utf-8"><input type="password" name="pw"><script>setTimeout(() => { location.href = "/?pw=" + encodeURIComponent(document.querySelector("input[type=password]").value) }, 300)</script>'

let server: Server
let base = ''
let session: ChromeSession
let profileDir = ''

/** Point the profile's first page at a URL and wait until the document is ready. */
async function navigate(url: string): Promise<void> {
  const page = (await cdpTargets(session.port)).find(target => target.type === 'page')
  if (page === undefined) throw new Error('sem página')
  const connection = await CdpConnection.open(page.webSocketDebuggerUrl)
  try {
    await connection.send('Page.navigate', { url })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const ready = await connection.send<{ result?: { value?: unknown } }>('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })
      if (ready.result?.value === 'complete') return
      await new Promise<void>((resolve) => { setTimeout(resolve, 50) })
    }
    throw new Error('a página não carregou')
  } finally {
    connection.close()
  }
}

/** The address of the profile's first page. */
async function pageUrl(): Promise<string> {
  const page = (await cdpTargets(session.port)).find(target => target.type === 'page')
  return page?.url ?? ''
}

/** The value of the first field matching a selector (the test is allowed to look; the product never does). */
async function valueOf(selector: string): Promise<string> {
  const page = (await cdpTargets(session.port)).find(target => target.type === 'page')
  if (page === undefined) throw new Error('sem página')
  const connection = await CdpConnection.open(page.webSocketDebuggerUrl)
  try {
    const value = await connection.send<{ result?: { value?: unknown } }>('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})?.value ?? ''`, returnByValue: true })
    return typeof value.result?.value === 'string' ? value.result.value : ''
  } finally {
    connection.close()
  }
}

/** The value the field holds (the test is allowed to look; the product never does). */
async function fieldValue(): Promise<string> {
  const page = (await cdpTargets(session.port)).find(target => target.type === 'page')
  if (page === undefined) throw new Error('sem página')
  const connection = await CdpConnection.open(page.webSocketDebuggerUrl)
  try {
    const value = await connection.send<{ result?: { value?: unknown } }>('Runtime.evaluate', {
      expression: 'document.querySelector("input[type=password]")?.value ?? ""',
      returnByValue: true,
    })
    return typeof value.result?.value === 'string' ? value.result.value : ''
  } finally {
    connection.close()
  }
}

describe.skipIf(chrome === undefined)('COLHEITA 15b: the Cofre password goes into the page without the model seeing it', () => {
  beforeAll(async () => {
    server = createServer((request, response) => {
      const url = request.url ?? '/'
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(url.startsWith('/leak') ? LEAK : url.startsWith('/otp') ? OTP : LOGIN)
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('sem porta')
    base = `http://127.0.0.1:${String(address.port)}`
    profileDir = mkdtempSync(join(tmpdir(), 'persona-blind-'))
    session = await launchChrome({ chrome: chrome!, profileDir, headless: true })
  }, 60_000)

  afterAll(async () => {
    // Best effort under a parallel suite: a Chrome that already died must not fail the file, and a keep-alive socket must not
    // hold the server open.
    try { await session?.close() } catch (error) { void error }
    server?.closeAllConnections()
    await new Promise<void>((resolve) => { server?.close(() => { resolve() }) })
    try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch (error) { void error }
  }, 60_000)

  it('Chrome’s own password manager is off in the product profile', () => {
    const prefs = JSON.parse(readFileSync(join(profileDir, 'Default', 'Preferences'), 'utf8')) as {
      credentials_enable_service?: boolean
      profile?: { password_manager_enabled?: boolean }
    }
    expect(prefs.credentials_enable_service).toBe(false)
    expect(prefs.profile?.password_manager_enabled).toBe(false)
  })

  it('types into the password field of the exact origin and returns no value', async () => {
    await navigate(`${base}/login`)
    const result = await typeLoginBlind({ port: session.port, origin: base, password: 'segredo-do-cofre-123', watchMs: 300, pollMs: 100 })
    expect(result).toMatchObject({ ok: true, origin: base })
    expect(JSON.stringify(result)).not.toContain('segredo-do-cofre-123')
    expect(await fieldValue()).toBe('segredo-do-cofre-123')
    // The watch of the address bar runs after the call returned and ends clean when nothing leaked.
    if (result.ok) expect(await result.watch).toBe('limpo')
  }, 30_000)

  it('returns right after typing: the watch of the address bar does not hold the turn (P0-02)', async () => {
    await navigate(`${base}/login`)
    const started = Date.now()
    const result = await typeLoginBlind({ port: session.port, origin: base, password: 'segredo-rapido-1', watchMs: 4_000, pollMs: 100 })
    expect(result.ok).toBe(true)
    expect(Date.now() - started).toBeLessThan(2_500)
    if (result.ok) expect(await result.watch).toBe('limpo')
  }, 30_000)

  it('refuses a page of another origin, typing nothing', async () => {
    await navigate(`${base}/login`)
    const result = await typeLoginBlind({ port: session.port, origin: 'http://127.0.0.1:1', password: 'nao-deve-entrar', watchMs: 100 })
    expect(result).toMatchObject({ ok: false, reason: 'sem-pagina' })
    expect(JSON.stringify(result)).not.toContain('nao-deve-entrar')
  }, 30_000)

  it('P1-04: types the six digits into the one-time-code field of the exact origin, never into the password field, and returns no value', async () => {
    await navigate(`${base}/otp`)
    const result = await typeLoginBlind({ port: session.port, origin: base, password: '482913', field: 'code', watchMs: 300, pollMs: 100 })
    expect(result).toMatchObject({ ok: true, origin: base })
    expect(JSON.stringify(result)).not.toContain('482913')
    expect(await valueOf('#otp')).toBe('482913')
    expect(await valueOf('input[type=password]')).toBe('')
    if (result.ok) expect(await result.watch).toBe('limpo')
  }, 30_000)

  it('P1-04: the code goes into the field the persona focused, whichever it is', async () => {
    await navigate(`${base}/otp`)
    const page = (await cdpTargets(session.port)).find(target => target.type === 'page')
    const connection = await CdpConnection.open(page!.webSocketDebuggerUrl)
    try { await connection.send('Runtime.evaluate', { expression: 'document.querySelector("input[name=user]").focus()' }) } finally { connection.close() }
    const result = await typeLoginBlind({ port: session.port, origin: base, password: '135790', field: 'code', watchMs: 200, pollMs: 100 })
    expect(result.ok).toBe(true)
    expect(await valueOf('input[name=user]')).toBe('135790')
    expect(await valueOf('#otp')).toBe('')
    if (result.ok) await result.watch
  }, 30_000)

  it('P1-04: a page with no field for the code types nothing and says so in words; another origin is refused', async () => {
    await navigate(`${base}/login`)
    const none = await typeLoginBlind({ port: session.port, origin: base, password: '482913', field: 'code', watchMs: 100 })
    expect(none).toMatchObject({ ok: false, reason: 'sem-campo', line: BLIND_CODE_NO_FIELD })
    expect(JSON.stringify(none)).not.toContain('482913')
    expect(await valueOf('input[type=password]')).toBe('')
    const other = await typeLoginBlind({ port: session.port, origin: 'http://127.0.0.1:1', password: '482913', field: 'code', watchMs: 100 })
    expect(other).toMatchObject({ ok: false, reason: 'sem-pagina' })
  }, 30_000)

  it('a password that lands in the address bar is reported by the watch AND the tab is sent to about:blank (P0-02)', async () => {
    await navigate(`${base}/leak`)
    const result = await typeLoginBlind({ port: session.port, origin: base, password: 'vaza-123', watchMs: 5_000, pollMs: 100 })
    expect(result.ok).toBe(true) // typed: the call does not wait for the leak
    expect(JSON.stringify(result)).not.toContain('vaza-123')
    if (!result.ok) return
    expect(await result.watch).toBe('vazou-na-url')
    expect(await pageUrl()).toBe('about:blank')
  }, 30_000)
})

describe('SecretMask', () => {
  it('masks the secret and its URL-encoded form while it is live, and stops after the window', () => {
    const mask = new SecretMask()
    mask.add('a b&c', 0, 600_000)
    expect(mask.redact('texto a b&c fim', 1_000)).toBe(`texto ${MASK} fim`)
    expect(mask.redact('url a%20b%26c fim', 1_000)).toBe(`url ${MASK} fim`)
    expect(mask.redact('form a+b%26c fim', 1_000)).toBe(`form ${MASK} fim`) // P0-02: `application/x-www-form-urlencoded` writes a space as +
    expect(mask.redact('texto a b&c fim', 600_001)).toBe('texto a b&c fim')
  })
})

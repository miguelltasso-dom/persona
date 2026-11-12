import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { profileByName, profileFolder, profileGranted, profileNameTaken } from '../src/browser/profiles.ts'
import { BrowserService } from '../src/browser/service.ts'
import type { ChromeSession } from '../src/browser/launch.ts'
import { browserMcpServer } from '../src/browser/server.ts'
import { TURN_IDLE_MS } from '../src/browser/turn.ts'
import { openTurnBrowser, browserTurnOpener } from '../src/browser/turn-browser.ts'

const PROFILES = [{ id: 'p-1', name: 'Loja' }, { id: 'p-2', name: 'WhatsApp da loja' }]
const PERSONA = { kind: 'persona', id: 'bia' } as const
const OTHER = { kind: 'persona', id: 'teo' } as const
const PERSON = { kind: 'person', id: 'owner' } as const

describe('browser profiles', () => {
  it('compares names ignoring case and extra spaces', () => {
    expect(profileNameTaken(PROFILES, '  loja ')).toBe(true)
    expect(profileNameTaken(PROFILES, 'LOJA', 'p-1')).toBe(false)
    expect(profileNameTaken(PROFILES, 'Caixa')).toBe(false)
    expect(profileByName(PROFILES, ' whatsapp  da LOJA ')?.id).toBe('p-2')
  })

  it('grants one profile, or every profile with *', () => {
    expect(profileGranted({ bia: ['p-1'] }, 'bia', 'p-1')).toBe(true)
    expect(profileGranted({ bia: ['p-1'] }, 'bia', 'p-2')).toBe(false)
    expect(profileGranted({ bia: ['*'] }, 'bia', 'p-9')).toBe(true)
    expect(profileGranted({}, 'bia', 'p-1')).toBe(false)
  })

  it('puts each profile in its own folder', () => {
    expect(profileFolder('C:\\data', 'p-1')).toBe(join('C:\\data', 'browser-profiles', 'p-1'))
  })
})

function service(launches: { profileDir: string; headless: boolean }[] = []): { browser: BrowserService; dataRoot: string } {
  let tick = 0
  const dataRoot = mkdtempSync(join(tmpdir(), 'persona-browser-'))
  const browser = new BrowserService({
    dataRoot,
    now: () => { tick += 1000; return tick },
    chrome: () => ({ path: 'C:\\Chrome\\chrome.exe', version: '157.0.1.1' }),
    launch: async ({ profileDir, headless }) => {
      launches.push({ profileDir, headless })
      const session: ChromeSession = { port: 9000 + launches.length, pid: 1, version: 'Chrome/157.0.1.1', close: async () => undefined }
      return session
    },
  })
  return { browser, dataRoot }
}

describe('BrowserService', () => {
  it('creates, renames and refuses duplicate names', () => {
    const { browser } = service()
    const profile = browser.create('Loja')
    expect(browser.profiles()).toHaveLength(1)
    expect(() => browser.create(' loja ')).toThrow(/já existe/u)
    browser.rename(profile.id, 'Caixa')
    expect(browser.profiles()[0]?.name).toBe('Caixa')
    expect(() => { browser.rename(profile.id, '') }).toThrow(/nome/u)
  })

  it('tells the host to persist after a profile or a grant changes', () => {
    let changes = 0
    const browser = new BrowserService({
      dataRoot: mkdtempSync(join(tmpdir(), 'persona-browser-')),
      onChange: () => { changes += 1 },
    })
    const profile = browser.create('Loja')
    browser.grant('bia', profile.id)
    browser.revoke('bia', profile.id)
    browser.rename(profile.id, 'Caixa')
    expect(changes).toBe(4)
  })

  it('a persona without a grant cannot take the turn; with one it can, and another waits', () => {
    const { browser } = service()
    const profile = browser.create('Loja')
    expect(browser.takeTurn(profile.id, PERSONA)).toEqual({ ok: false, reason: 'no-grant' })
    browser.grant('bia', profile.id)
    expect(browser.takeTurn(profile.id, PERSONA).ok).toBe(true)
    expect(browser.takeTurn(profile.id, OTHER)).toMatchObject({ ok: false, reason: 'busy' })
    expect(browser.takeTurn(profile.id, PERSON).ok).toBe(true)
    expect(browser.holderOf(profile.id)).toEqual(PERSON)
  })

  it('opens one Chrome per profile, only for the holder, and reuses it', async () => {
    const launches: { profileDir: string; headless: boolean }[] = []
    const { browser, dataRoot } = service(launches)
    const profile = browser.create('Loja')
    browser.grant('bia', profile.id)
    await expect(browser.open(profile.id, PERSONA)).rejects.toThrow(/outra pessoa/u)
    browser.takeTurn(profile.id, PERSONA)
    const first = await browser.open(profile.id, PERSONA)
    const second = await browser.open(profile.id, PERSONA)
    expect(second).toEqual(first)
    expect(launches).toHaveLength(1)
    expect(launches[0]?.profileDir).toBe(profileFolder(dataRoot, profile.id))
    // The shared window is visible: the person takes the turn in the same Chrome instead of a second, empty one.
    expect(launches[0]?.headless).toBe(false)
    expect(browser.state(profile.id)).toMatchObject({ running: true, holder: PERSONA })
    await browser.close(profile.id)
    expect(browser.state(profile.id)?.running).toBe(false)
  })

  it('a turn gets the browser of its profile: by name, or the first one it was granted', async () => {
    const launches: { profileDir: string; headless: boolean }[] = []
    const { browser } = service(launches)
    const shop = browser.create('Loja')
    const whats = browser.create('WhatsApp da loja')
    browser.grant('bia', shop.id)
    const only = await browser.sessionFor('bia')
    expect(only.profile.id).toBe(shop.id)
    expect(only.session.port).toBeGreaterThan(0)
    browser.grant('bia', whats.id)
    const fallback = await browser.sessionFor('bia')
    expect(fallback.profile.id).toBe(shop.id)
    const named = await browser.sessionFor('bia', 'whatsapp da loja')
    expect(named.profile.id).toBe(whats.id)
    await expect(browser.sessionFor('bia', 'Pessoal')).rejects.toThrow(/não tem o perfil/u)
    await expect(browser.sessionFor('teo')).rejects.toThrow(/nenhum perfil/u)
    expect(launches).toHaveLength(2)
  })

  it('a persona that lost the turn cannot open the browser', async () => {
    const { browser } = service()
    const profile = browser.create('Loja')
    browser.grant('bia', profile.id)
    browser.takeTurn(profile.id, PERSONA)
    await browser.open(profile.id, PERSONA)
    browser.takeTurn(profile.id, PERSON)
    await expect(browser.open(profile.id, PERSONA)).rejects.toThrow(/outra pessoa/u)
  })

  it('an open Chrome keeps the turn past the idle lapse; the person taking it stops the persona', async () => {
    let clock = 0
    const taken: string[] = []
    const browser = new BrowserService({
      dataRoot: mkdtempSync(join(tmpdir(), 'persona-browser-')),
      now: () => clock,
      chrome: () => ({ path: 'C:\\Chrome\\chrome.exe', version: '157.0.1.1' }),
      launch: async () => ({ port: 9222, pid: 1, version: undefined, close: async () => undefined }),
      onTakeover: (holder) => { taken.push(holder.id) },
    })
    const profile = browser.create('Loja')
    browser.grant('bia', profile.id)
    await browser.sessionFor('bia')
    clock += TURN_IDLE_MS * 10
    expect(browser.holderOf(profile.id)).toEqual(PERSONA)
    expect(browser.takeTurn(profile.id, OTHER)).toMatchObject({ ok: false, reason: 'busy' })
    expect(browser.takeTurn(profile.id, PERSON).ok).toBe(true)
    expect(taken).toEqual(['bia'])
    await expect(browser.open(profile.id, PERSONA)).rejects.toThrow(/outra pessoa/u)
  })

  it('hands a turn its browser server and gives the turn back', async () => {
    const { browser } = service()
    const profile = browser.create('Loja')
    browser.grant('bia', profile.id)
    const turn = await openTurnBrowser({ service: browser, personaId: 'bia', serverPath: 'C:\\app\\mcp.js', node: 'C:\\app\\node.exe' })
    expect(turn.profile.id).toBe(profile.id)
    expect(turn.server.name).toBe('browser')
    expect(turn.server.args).toContain(`http://127.0.0.1:${String(turn.session.port)}`)
    // `upload_file` may only read the profile's empty folder: nothing of the person's disk is reachable.
    expect(turn.server.args).toContain(`--workspace=${browser.uploadFolder(profile.id)}`)
    expect(browser.holderOf(profile.id)).toEqual(PERSONA)
    turn.release()
    expect(browser.holderOf(profile.id)).toBeUndefined()
    await expect(openTurnBrowser({ service: browser, personaId: 'teo', serverPath: 'C:\\app\\mcp.js' })).rejects.toThrow(/nenhum perfil/u)
  })
})

describe('browserTurnOpener', () => {
  it('refuses Cursor and a persona without a profile before any Chrome starts', async () => {
    const launches: { profileDir: string; headless: boolean }[] = []
    const { browser } = service(launches)
    const profile = browser.create('Loja')
    browser.grant('bia', profile.id)
    const open = browserTurnOpener({ service: browser, serverPath: 'C:\\app\\mcp.js', carriesMcp: cli => cli !== 'cursor' })
    expect(await open({ personaId: 'bia', cli: 'cursor' })).toMatchObject({ ok: false, reason: 'sem-navegador' })
    expect(await open({ personaId: 'teo', cli: 'claude' })).toMatchObject({ ok: false, reason: 'sem-perfil' })
    expect(launches).toHaveLength(0)
  })

  it('a busy profile leaves the turn without the browser instead of failing it', async () => {
    const { browser } = service()
    const profile = browser.create('Loja')
    browser.grant('bia', profile.id)
    browser.grant('teo', profile.id)
    const open = browserTurnOpener({ service: browser, serverPath: 'C:\\app\\mcp.js', carriesMcp: () => true })
    const first = await open({ personaId: 'bia', cli: 'claude' })
    expect(first.ok).toBe(true)
    expect(await open({ personaId: 'teo', cli: 'claude' })).toMatchObject({ ok: false, reason: 'sem-vez', line: /usando este perfil/u })
    if (first.ok) first.browser.release()
  })

  it('says Chrome is missing in words', async () => {
    const browser = new BrowserService({ dataRoot: mkdtempSync(join(tmpdir(), 'persona-browser-')), chrome: () => undefined })
    const profile = browser.create('Loja')
    browser.grant('bia', profile.id)
    const open = browserTurnOpener({ service: browser, serverPath: 'C:\\app\\mcp.js', carriesMcp: () => true })
    expect(await open({ personaId: 'bia', cli: 'claude' })).toMatchObject({ ok: false, reason: 'sem-chrome', line: /Chrome não está instalado/u })
  })
})

describe('browserMcpServer', () => {
  it('attaches the DevTools MCP to the profile Chrome, with nothing sent out and no script of its own', () => {
    const server = browserMcpServer({ port: 9222, serverPath: 'C:\\app\\chrome-devtools-mcp.js', node: 'C:\\app\\node.exe' })
    expect(server).toEqual({
      name: 'browser',
      command: 'C:\\app\\node.exe',
      args: [
        'C:\\app\\chrome-devtools-mcp.js',
        '--browserUrl', 'http://127.0.0.1:9222',
        '--no-javascriptEvaluation',
        '--no-usageStatistics',
        '--no-performanceCrux',
      ],
    })
  })
})

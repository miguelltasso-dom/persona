import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BrowserHost, browserRefusal } from '../src/browser/host.ts'
import { loadBrowserProfiles } from '../src/browser/profile-store.ts'

function host(options: { dataRoot?: string; onTakeover?: (previous: { kind: 'persona' | 'person'; id: string }) => void; chrome?: boolean } = {}): BrowserHost {
  return new BrowserHost({
    dataRoot: options.dataRoot ?? mkdtempSync(join(tmpdir(), 'persona-browser-host-')),
    serverPath: 'C:\\app\\mcp.js',
    carriesMcp: cli => cli !== 'cursor',
    chrome: () => options.chrome === false ? undefined : { path: 'C:\\Chrome\\chrome.exe', version: '157.0.1.1' },
    ...(options.onTakeover === undefined ? {} : { onTakeover: options.onTakeover }),
  })
}

describe('BrowserHost', () => {
  it('stores the profiles and grants and reads them back on boot', () => {
    const dataRoot = mkdtempSync(join(tmpdir(), 'persona-browser-host-'))
    const first = host({ dataRoot })
    first.create('Loja')
    const profile = first.service.profiles()[0]
    if (profile === undefined) throw new Error('sem perfil')
    first.grant('bia', profile.id)
    expect(loadBrowserProfiles(dataRoot)).toMatchObject({ profiles: [{ name: 'Loja' }], grants: { bia: [profile.id] } })
    const second = host({ dataRoot })
    expect(second.service.profiles()).toHaveLength(1)
    expect(second.service.granted('bia', profile.id)).toBe(true)
  })

  it('shows who drives, which personas may and which profile is each one default', () => {
    const browser = host()
    browser.create('Loja')
    browser.create('Pessoal')
    const [shop, personal] = browser.service.profiles()
    if (shop === undefined || personal === undefined) throw new Error('sem perfis')
    browser.grant('bia', personal.id)
    browser.grant('bia', shop.id)
    browser.grant('teo', personal.id)
    const view = browser.view()
    expect(view.chrome).toMatchObject({ path: 'C:\\Chrome\\chrome.exe', version: '157.0.1.1' })
    expect(view.profiles.map(profile => profile.name)).toEqual(['Loja', 'Pessoal'])
    // Creation order decides the default: Bia was granted both, so "Loja" (created first) is hers; Teo only has "Pessoal".
    expect(view.profiles.find(profile => profile.id === personal.id)?.defaultsFor).toEqual(['teo'])
    expect(view.profiles.find(profile => profile.id === shop.id)?.defaultsFor).toEqual(['bia'])
    expect(view.profiles.find(profile => profile.id === shop.id)?.personas).toEqual(['bia'])
  })

  it('the person takes the window from a persona, which stops driving, and gives it back', () => {
    const taken: string[] = []
    const browser = host({ onTakeover: (previous) => { taken.push(previous.id) } })
    browser.create('Loja')
    const profile = browser.service.profiles()[0]
    if (profile === undefined) throw new Error('sem perfil')
    browser.grant('bia', profile.id)
    expect(browser.service.takeTurn(profile.id, { kind: 'persona', id: 'bia' }).ok).toBe(true)
    expect(browser.take(profile.id, 'owner')).toEqual({ ok: true })
    expect(taken).toEqual(['bia'])
    expect(browser.view().profiles[0]?.holder).toEqual({ kind: 'person', id: 'owner' })
    browser.release(profile.id, 'owner')
    expect(browser.view().profiles[0]?.holder).toBeUndefined()
  })

  it('says Chrome is missing instead of failing the screen', () => {
    const browser = host({ chrome: false })
    expect(browser.view().chrome).toBeUndefined()
  })

  it('boots without the DevTools server file: the screen works and a turn is told the browser is unavailable', async () => {
    const browser = new BrowserHost({
      dataRoot: mkdtempSync(join(tmpdir(), 'persona-browser-host-')),
      serverPath: '',
      carriesMcp: () => true,
      chrome: () => ({ path: 'C:\\Chrome\\chrome.exe', version: '157.0.1.1' }),
    })
    browser.create('Loja')
    const profile = browser.service.profiles()[0]
    if (profile === undefined) throw new Error('sem perfil')
    browser.grant('bia', profile.id)
    expect(browser.view().profiles).toHaveLength(1)
    expect(await browser.opener({ personaId: 'bia', cli: 'claude' })).toEqual({
      ok: false,
      reason: 'sem-navegador',
      line: 'o navegador não está disponível nesta instalação',
    })
  })

  it('turns a browser refusal into the sentence the screen shows', () => {
    expect(browserRefusal(new Error('qualquer'))).toBeUndefined()
    const browser = host()
    expect(() => { browser.create('') }).toThrow(/nome/u)
  })
})

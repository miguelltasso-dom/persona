import { Context } from '@deepseek-ai/cordis'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect } from 'vitest'
import { launchChrome } from '../src/browser/launch.ts'
import { scratchBrowserRoot } from '../src/browser/scratch-root.ts'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Higiene dos testes de navegador (Gauge 12/11, achado do Forge): o diretório de perfis do host em memória era um caminho FIXO compartilhado por todos os specs (`tmpdir/persona-browser-profiles`);
 * um grant deixado por um spec fazia account-swap-policy/team-offer tentarem abrir o Chrome de VERDADE. Agora: (1) cada host em memória tem a sua pasta, (2) o reset entre testes revoga os grants,
 * (3) sob o Vitest o launcher real recusa abrir Chrome sem o marcador `allowRealChrome()`.
 */
const { host } = bindHostFile()
const made: string[] = []
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
}
const grantsOf = (h: PersonaHost): Record<string, readonly string[]> => ({ ...h.browser.service.grantsOf() })
const tempProfileDir = (): string => { const dir = mkdtempSync(join(tmpdir(), 'persona-guard-')); made.push(dir); return dir }

describe('a pasta de perfis do navegador é POR host', () => {
  it('cada chamada devolve uma pasta nova, vazia e dentro do tmp (nada dentro do checkout)', () => {
    const a = scratchBrowserRoot()
    const b = scratchBrowserRoot()
    made.push(a, b)
    expect(a).not.toBe(b)
    expect(a.startsWith(tmpdir())).toBe(true)
    expect(existsSync(a) && existsSync(b)).toBe(true)
    expect(a).not.toBe(join(tmpdir(), 'persona-browser-profiles')) // o caminho fixo antigo, que vazava grants entre specs
  })

  it('dois hosts em memória não compartilham perfis nem grants', async () => {
    const a = host()
    seed(a)
    a.browser.create('Perfil da loja')
    const profileId = a.browser.view().profiles[0]?.id ?? ''
    expect(profileId).not.toBe('')
    a.browser.grant('p1', profileId)
    expect(grantsOf(a)).toEqual({ p1: [profileId] })
    const ctx = new Context()
    try {
      const other = new PersonaHost(ctx)
      expect(other.browser.view().profiles).toEqual([]) // o outro host não vê o perfil nem o grant do primeiro
      expect(grantsOf(other)).toEqual({})
    } finally { await ctx.fiber.dispose() }
  })
})

describe('o reset entre testes não deixa grant de navegador para o teste seguinte', () => {
  it('1º teste: concede um perfil à persona', () => {
    const h = host()
    seed(h)
    h.browser.create('Perfil')
    h.browser.grant('p1', h.browser.view().profiles[0]?.id ?? '')
    expect(Object.values(grantsOf(h)).flat()).toHaveLength(1)
  })

  it('2º teste (mesmo host do arquivo): nenhum grant sobrou do anterior', () => {
    const h = host()
    expect(Object.values(grantsOf(h)).flat()).toEqual([])
  })
})

describe('Chrome REAL só abre em spec marcado', () => {
  it('sem spawnImpl e sem o marcador, o launcher RECUSA (não abre janela no desktop de quem roda os testes)', async () => {
    expect(process.env.PERSONA_TEST_REAL_CHROME).toBeUndefined()
    const profileDir = tempProfileDir()
    await expect(launchChrome({ chrome: { path: join(profileDir, 'chrome-que-nao-existe.exe'), version: undefined }, profileDir, headless: true, waitMs: 200 })).rejects.toThrow(/real Chrome launch blocked in a test/u)
  })

  it('com spawnImpl (um Chrome de mentira) o launcher continua funcionando: o guarda só barra o spawn REAL', async () => {
    const profileDir = tempProfileDir()
    const error = await launchChrome({
      chrome: { path: 'fake-chrome', version: undefined }, profileDir, headless: true, waitMs: 150,
      spawnImpl: () => { throw new Error('fake spawn chamado') },
    }).catch((caught: unknown) => caught)
    expect(String(error)).toContain('fake spawn chamado') // a falha é do fake, não do bloqueio
    expect(String(error)).not.toMatch(/real Chrome launch blocked/u)
  })

  it('o marcador libera o spawn real (testado sem abrir nada: o Chrome apontado não existe)', async () => {
    process.env.PERSONA_TEST_REAL_CHROME = '1'
    try {
      const profileDir = tempProfileDir()
      const error = await launchChrome({ chrome: { path: join(profileDir, 'chrome-que-nao-existe.exe'), version: undefined }, profileDir, headless: true, waitMs: 300 }).catch((caught: unknown) => caught)
      expect(String(error)).not.toMatch(/real Chrome launch blocked/u) // passou do guarda; falhou depois, porque o executável não existe
    } finally { delete process.env.PERSONA_TEST_REAL_CHROME }
  })
})

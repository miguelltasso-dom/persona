import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { Station } from '../src/station/station.ts'
import { FEATURE_OFF_REASON, FEATURE_OFF_TEXT, SURFACE_REMOTES, type Surface } from '../src/surface-gates.ts'

/**
 * D-113 "desligado ESTÁ desligado de verdade" (Gauge, 12/11, o teste que a 3ª auditoria do Carbon pediu): um host REAL no padrão do PRODUTO (`flagDefaults: 'production'`, banco em ARQUIVO, nada
 * trocado depois do boot como faz o teste da tabela) recusa CADA chamada de CADA superfície com `feature-off` e o texto da pessoa, e não faz nenhum efeito: não toca a rede, não lê nem escreve
 * `station.json`, não pergunta ao Tailscale, não monta o gate da Estação. E o espelho: ligar UMA superfície liga só as chamadas dela.
 * Quatro superfícies em construção (invite, channels, skillImport, station) ficam DESLIGADAS; o navegador compartilhado fica LIGADO (Keel 09:21) e só um `0`/`false` explícito o desliga.
 */
const SCOPE = { workspaceId: 'ws', projectId: 'pp' } as const
const SURFACES_WITH_LISTS = ['invite', 'channels', 'skillImport', 'station'] as const satisfies readonly Surface[]
const LISTS: Readonly<Record<(typeof SURFACES_WITH_LISTS)[number], readonly string[]>> = {
  invite: Object.keys(SURFACE_REMOTES).filter(name => SURFACE_REMOTES[name] === 'invite'),
  channels: Object.keys(SURFACE_REMOTES).filter(name => SURFACE_REMOTES[name] === 'channels'),
  skillImport: Object.keys(SURFACE_REMOTES).filter(name => SURFACE_REMOTES[name] === 'skillImport'),
  station: Object.keys(SURFACE_REMOTES).filter(name => SURFACE_REMOTES[name] === 'station'),
}

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/** Um host de verdade: banco em ARQUIVO numa pasta temporária, no padrão do produto (a não ser que `config` mude). */
function bootHost(config: { surfaces?: Partial<Record<Surface, boolean>>; production?: boolean } = {}): { h: PersonaHost; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'persona-d113-'))
  const ctx = new Context()
  const h = new PersonaHost(ctx, {
    databasePath: join(dir, 'p.db'),
    ...(config.production === false ? {} : { flagDefaults: 'production' as const }),
    ...(config.surfaces === undefined ? {} : { surfaces: config.surfaces }),
  })
  cleanups.push(async () => { await ctx.fiber.dispose(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.sessionMemberId = 'ana'
  return { h, dir }
}

/** Chama uma Remote pelo NOME, do jeito que o fio chama (passa pelo funil), e devolve o `reason` da recusa ('ran' se rodou, 'error:<msg>' se falhou por outro motivo). */
async function callByName(h: PersonaHost, name: string): Promise<string> {
  const method = (h as unknown as Record<string, ((request: unknown, signal?: AbortSignal) => unknown) | undefined>)[name]
  if (typeof method !== 'function') return 'missing'
  try {
    const result = method.call(h, { ...SCOPE, actorId: 'ana', code: 'AAAA-BBBB', running: false, url: 'https://example.invalid/repo', inviteId: 'x', requestId: 'x', personaId: 'x', channelId: 'x' }, new AbortController().signal)
    if (result !== null && typeof result === 'object' && 'then' in result) await (result as Promise<unknown>)
    return 'ran'
  } catch (error) {
    if (error instanceof RemoteFault) {
      expect(error.message, `${name}: o texto da pessoa`).toBe(FEATURE_OFF_TEXT)
      return error.details.reason ?? 'fault'
    }
    return `error:${error instanceof Error ? error.message : String(error)}`
  }
}

describe('o host REAL no padrão do produto', () => {
  it('resolve as QUATRO superfícies em construção como DESLIGADAS e o navegador compartilhado como LIGADO (decisão do Keel 09:21, P0-01 fechado), e diz qual padrão decidiu', () => {
    const { h } = bootHost()
    expect(h.surfaces).toMatchObject({ invite: false, station: false, channels: false, skillImport: false, sharedBrowser: true, defaults: 'production' })
  })

  it('sharedBrowser: LIGADO no produto (nenhuma das chamadas dele é recusada); `Config.surfaces.sharedBrowser = false` e PERSONA_SURFACE_SHARED_BROWSER=0 o desligam, e aí TODAS são recusadas com feature-off', async () => {
    const names = Object.keys(SURFACE_REMOTES).filter(name => SURFACE_REMOTES[name] === 'sharedBrowser')
    expect(names.length, 'a lista do navegador compartilhado existe').toBeGreaterThan(0)
    const on = bootHost()
    for (const name of names) expect(on.h.remoteGuard.surfaceOff(name), `${name} ligada por padrão`).toBe(false)
    const byConfig = bootHost({ surfaces: { sharedBrowser: false } })
    expect(byConfig.h.surfaces.sharedBrowser).toBe(false)
    const refused: Record<string, string> = {}
    for (const name of names) refused[name] = await callByName(byConfig.h, name)
    expect(refused).toEqual(Object.fromEntries(names.map(name => [name, FEATURE_OFF_REASON])))
    vi.stubEnv('PERSONA_SURFACE_SHARED_BROWSER', '0')
    const byEnv = bootHost()
    expect(byEnv.h.surfaces.sharedBrowser, 'PERSONA_SURFACE_SHARED_BROWSER=0 desliga').toBe(false)
    expect(byEnv.h.surfaces.invite, 'e não mexe nas outras').toBe(false)
  })

  it('as listas têm o tamanho que o Keel/Tally aprovaram: invite 17, channels 5, skillImport 4, station 4', () => {
    expect(LISTS.invite).toHaveLength(17)
    expect(LISTS.channels).toHaveLength(5)
    expect(LISTS.skillImport).toHaveLength(4)
    expect(LISTS.station).toHaveLength(4)
  })

  for (const surface of SURFACES_WITH_LISTS) {
    it(`${surface}: CADA uma das ${String(LISTS[surface].length)} chamadas é recusada com feature-off antes de rodar (nenhuma "escapa" por ser async, por ser stream ou por ter o argumento errado)`, async () => {
      const { h } = bootHost()
      const outcomes: Record<string, string> = {}
      for (const name of LISTS[surface]) outcomes[name] = await callByName(h, name)
      expect(outcomes).toEqual(Object.fromEntries(LISTS[surface].map(name => [name, FEATURE_OFF_REASON])))
    })
  }

  it('o miolo continua respondendo (só as superfícies caíram): ping, listProjects, o convite LOCAL e a tarefa', async () => {
    const { h } = bootHost()
    for (const name of ['ping', 'listProjects', 'listTasks', 'listPersonas', 'issueInvite']) {
      const outcome = await callByName(h, name)
      expect(outcome, name).not.toBe(FEATURE_OFF_REASON)
    }
  })

  it('OFF de verdade: nenhuma chamada de superfície toca a rede, nem pergunta ao Tailscale, nem escreve o estado da Estação', async () => {
    const { h, dir } = bootHost()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const viewSpy = vi.spyOn(Station.prototype, 'view') // `view()` é quem pergunta ao Tailscale (execFile)
    const redeemSpy = vi.spyOn(Station.prototype, 'redeem')
    const setRunningSpy = vi.spyOn(Station.prototype, 'setRunning')
    for (const surface of SURFACES_WITH_LISTS) for (const name of LISTS[surface]) await callByName(h, name)
    expect(fetchSpy, 'nenhum fetch').not.toHaveBeenCalled()
    expect(viewSpy, 'o Tailscale não é perguntado').not.toHaveBeenCalled()
    expect(redeemSpy).not.toHaveBeenCalled()
    expect(setRunningSpy, 'nada segura o Windows acordado').not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'station.json')), 'nenhum station.json lido/escrito').toBe(false)
    expect(h.orchestration.stationGate, 'nenhum gate de Estação nos turnos').toBeUndefined()
  })
})

describe('o espelho: ligar UMA superfície liga só as chamadas dela', () => {
  for (const on of SURFACES_WITH_LISTS) {
    it(`só ${on} ligada: o funil deixa passar as chamadas dela e continua recusando as das outras`, () => {
      const { h } = bootHost({ surfaces: { [on]: true } })
      for (const surface of SURFACES_WITH_LISTS) {
        for (const name of LISTS[surface]) expect(h.remoteGuard.surfaceOff(name), `${name} (${surface}) com só ${on} ligada`).toBe(surface !== on)
      }
    })
  }

  it('sob o Vitest (sem production) NENHUMA das 30 está desligada: as suítes continuam provando o código', () => {
    const { h } = bootHost({ production: false })
    for (const surface of SURFACES_WITH_LISTS) for (const name of LISTS[surface]) expect(h.remoteGuard.surfaceOff(name), name).toBe(false)
  })

  // O efeito do convite (era um RED em staging: o `RemoteTeamHost` tinha o interruptor `enabled`, mas o host não o ligava à superfície; o Bolt ligou, `enabled: () => this.surfaces.invite`).
  it('o efeito do CONVITE: no host do produto o RemoteTeamHost está DESLIGADO (nada retoma uma equipe de um build anterior, nada faz poll, nenhum socket); com a superfície ligada, ligado', () => {
    const off = bootHost()
    expect(off.h.surfaces.invite).toBe(false)
    expect(off.h.remoteTeam.isEnabled(), 'o interruptor do convite acompanha a superfície').toBe(false)
    const on = bootHost({ surfaces: { invite: true } })
    expect(on.h.remoteTeam.isEnabled()).toBe(true)
  })
})

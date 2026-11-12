/**
 * REGRESSÃO do Carbon, rodada 2 (`colheita-s1-fix.md`), P0-01 — a colisão entre P0-05 (o runner quente guarda o navegador) e P1-10 (a vez do perfil volta no `idle`): na 2ª Tarefa da Bia, o acerto
 * de cache do `warmRunners` DEVOLVIA a vez que acabara de pegar (`browser?.release()`), e `BrowserService.open()` não repovoava o `openers` com o Chrome já aberto. Com isso, durante a 2ª Tarefa
 *   • a Bia ficava sem `holderOf` (qualquer outra persona podia tomar o Chrome e as duas clicavam na mesma janela);
 *   • "Assumir controle" não achava a Bia para parar; o 2FA/`browser_login` (que leem `liveSessionOf`) recusavam; e a vez expirava em 2 min parada.
 *
 * O cenário INDEPENDENTE do dono (Forge): o host em processo com o `BrowserService` REAL (perfil "Loja" concedido à Bia e ao Téo) e um Chrome de mentira (`chrome`/`launch` do serviço), a cadeia REAL
 * `resolveFor` → `browserOf` → turno do perfil → runner quente; o runner é um stub que só diz `idle`. Sem IA, sem Chrome, sem CLI. Cada cenário tem antes uma OBSERVAÇÃO (a 1ª Tarefa teve o navegador e a vez
 * voltou no `idle`, com o Chrome aberto). O veredito é PURO e provado nos dois lados, e há uma rodada com o DEFEITO reintroduzido pelo lado de fora (a vez devolvida no acerto do cache) para provar que o cenário o acusa.
 */
import { Context } from '@deepseek-ai/cordis'
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it, onTestFinished } from 'vitest'
import PersonaHost from '../../persona-host/src/index.ts'
import type { HostRunnerRequest } from '../../persona-host/src/runner.ts'

const SCOPE = { workspaceId: 'ws', projectId: 'pp' } as const
const MINUTE = 60_000

/** Quem dirige o perfil agora, como o serviço diz. */
export type Holder = { readonly kind: string; readonly id: string } | undefined

/** O veredito, PURO: a persona que tem a Tarefa aberta tem de ser quem dirige o perfil (vazio = certo). */
export function holdsProblems(holder: Holder, personaId: string, when: string): string[] {
  if (holder === undefined) return [`${personaId} ficou sem a vez do perfil ${when}: outra persona pode tomar o Chrome`]
  if (holder.kind !== 'persona' || holder.id !== personaId) return [`${when}: quem dirige o perfil é ${holder.kind}:${holder.id}, não ${personaId}`]
  return []
}

/** O veredito, PURO: uma persona SEM a vez não pode ter recebido o servidor do navegador no turno dela (vazio = certo). */
export function strayBrowserProblems(servers: readonly string[], personaId: string): string[] {
  return servers.includes('browser') ? [`${personaId} recebeu o navegador de outra persona (mcp__browser__*) no turno dela`] : []
}

describe('P0-01 — vereditos do cenário (puros)', () => {
  it('quem tem a vez passa; sem dono ou outro dono é acusado; o navegador na mão de quem não tem a vez é acusado', () => {
    expect(holdsProblems({ kind: 'persona', id: 'bia' }, 'bia', 'na 2ª Tarefa')).toEqual([])
    expect(holdsProblems(undefined, 'bia', 'na 2ª Tarefa')).toHaveLength(1)
    expect(holdsProblems({ kind: 'persona', id: 'teo' }, 'bia', 'na 2ª Tarefa')).toHaveLength(1)
    expect(holdsProblems({ kind: 'person', id: 'ana' }, 'bia', 'na 2ª Tarefa')).toHaveLength(1)
    expect(strayBrowserProblems([], 'teo')).toEqual([])
    expect(strayBrowserProblems(['browser'], 'teo')).toHaveLength(1)
  })
})

interface Stub {
  readonly runner: Runner
  readonly key: string
  disposed: number
  fire(event: RunnerEvent): void
}

interface Rig {
  readonly h: PersonaHost
  readonly profileId: string
  readonly launches: { count: number }
  readonly clock: { now: number }
  readonly requests: HostRunnerRequest[]
  readonly stubs: Stub[]
}

/**
 * O host com a Bia e o Téo (claude), o perfil "Loja" concedido aos dois e um Chrome de mentira.
 * @param defective - Reintroduz o defeito POR FORA: a vez da 2ª aquisição é devolvida na hora (o que o `browser?.release()` do acerto de cache fazia).
 */
function world(defective = false): Rig {
  const ctx = new Context()
  const h = new PersonaHost(ctx, { databasePath: ':memory:', browserServerPath: 'fake-chrome-devtools-mcp.js' })
  onTestFinished(async () => { await ctx.fiber.dispose() })
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['bia', 'Bia'], ['teo', 'Téo']] as const) {
    h.createPersona({
      ...SCOPE, id, name, title: 'Cargo', description: 'x', personality: 'Clara.', instructions: 'Ajude.', avatarKind: 'gallery', avatarRef: name.toLowerCase(),
      runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
    })
  }
  const launches = { count: 0 }
  const clock = { now: Date.now() }
  // The service takes its Chrome and its clock from its deps: a fake Chrome that "launches" at once, and a clock the scenario moves.
  const deps = (h.browser.service as unknown as { deps: Record<string, unknown> }).deps
  deps.chrome = () => ({ path: 'C:/fake/chrome.exe', version: '1' })
  deps.launch = () => { launches.count += 1; return Promise.resolve({ port: 9222, pid: 1, version: 'fake', close: () => Promise.resolve() }) }
  deps.now = () => clock.now
  const profile = h.browser.service.create('Loja')
  h.browser.service.grant('bia', profile.id)
  h.browser.service.grant('teo', profile.id)
  const requests: HostRunnerRequest[] = []
  const stubs: Stub[] = []
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    if (request !== undefined) requests.push(request)
    const listeners = new Set<(event: RunnerEvent) => void>()
    const stub: Stub = {
      key: `${request?.personId ?? '?'}#${String(stubs.length)}`, disposed: 0,
      fire: (event) => { for (const listener of listeners) listener(event) },
      runner: {
        ensureSession: () => Promise.resolve(),
        deliver: () => Promise.resolve(),
        cancel: () => Promise.resolve(),
        status: () => 'idle',
        whenIdle: () => Promise.resolve(),
        onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
        capabilities: () => ({ steer: false, removeQueued: false, reportsInputTaken: false, background: false, tools: 'mcp', resume: false }),
        dispose: () => { stub.disposed += 1; return Promise.resolve() },
      } as Runner,
    }
    stubs.push(stub)
    return Promise.resolve(stub.runner)
  }
  if (defective) {
    const real = h.orchestration.browserOf
    let taken = 0
    h.orchestration.browserOf = async (personaId, cli) => {
      const browser = await real?.(personaId, cli)
      taken += 1
      if (browser !== undefined && taken >= 2) browser.release() // the old `browser?.release()` on the cache hit: the turn just taken goes back before the Task starts
      return browser
    }
  }
  return { h, profileId: profile.id, launches, clock, requests, stubs }
}

/** The runner of one Task of a persona, the way the host resolves it before a turn (a message would be absorbed by the open Task, so the resolve is driven directly). */
function resolve(rig: Rig, personaId: string, ticketId: string): Promise<Runner> {
  const call = (rig.h.orchestration as unknown as { resolveFor(persona: unknown, projectId: string, mode: string, purpose: string, onFirstToken: undefined, answerOnly: boolean, ticketId: string): Promise<Runner> }).resolveFor
  return call.call(rig.h.orchestration, rig.h.product.getPersona(personaId), 'pp', 'asked', 'task', undefined, false, ticketId)
}

const serversOf = (rig: Rig, personaId: string): string[] => {
  const last = rig.requests.filter(request => request.personId === personaId && request.purpose === 'task').at(-1)
  return (last?.extraMcpServers ?? []).map(server => server.name)
}
const holderOf = (rig: Rig): Holder => rig.h.browser.service.holderOf(rig.profileId)

/** A 1ª Tarefa da Bia teve o navegador e TERMINOU (o runner diz `idle`: a vez volta, o Chrome fica aberto). */
async function firstTaskEnded(rig: Rig): Promise<Runner> {
  const runner = await resolve(rig, 'bia', 't1')
  rig.stubs[0]!.fire({ type: 'idle', sessionId: 'worker-t1', at: new Date().toISOString() })
  return runner
}

describe('P0-01 — a 2ª Tarefa da Bia com o navegador (host em processo, BrowserService real, Chrome de mentira)', () => {
  it('OBSERVAÇÃO: a 1ª Tarefa da Bia recebe o navegador e a vez do perfil; no `idle` a vez VOLTA e o Chrome continua aberto (um só lançamento)', async () => {
    const rig = world()
    await resolve(rig, 'bia', 't1')
    expect(serversOf(rig, 'bia'), 'a 1ª Tarefa da Bia não recebeu o navegador').toContain('browser')
    expect(holdsProblems(holderOf(rig), 'bia', 'na 1ª Tarefa')).toEqual([])
    expect(rig.launches.count).toBe(1)
    rig.stubs[0]!.fire({ type: 'idle', sessionId: 'worker-t1', at: new Date().toISOString() })
    expect(holderOf(rig), 'no idle a vez devia voltar (P1-10)').toBeUndefined()
    expect(rig.h.browser.service.state(rig.profileId)?.running, 'o Chrome devia continuar aberto').toBe(true)
  })

  it('A — na 2ª Tarefa (acerto do cache do runner quente) a Bia MANTÉM a vez do perfil', async () => {
    const rig = world()
    const first = await firstTaskEnded(rig)
    const second = await resolve(rig, 'bia', 't2')
    expect(second, 'a 2ª Tarefa devia ser servida pelo runner quente da 1ª (o acerto de cache é o caminho do defeito)').toBe(first)
    expect(holdsProblems(holderOf(rig), 'bia', 'na 2ª Tarefa')).toEqual([])
  })

  it('B — durante a 2ª Tarefa o Téo NÃO pega o Chrome: o turno dele sai sem o navegador e a Bia segue dirigindo', async () => {
    const rig = world()
    await firstTaskEnded(rig)
    await resolve(rig, 'bia', 't2')
    await resolve(rig, 'teo', 't3')
    expect(strayBrowserProblems(serversOf(rig, 'teo'), 'teo')).toEqual([])
    expect(holdsProblems(holderOf(rig), 'bia', 'depois do Téo tentar')).toEqual([])
    expect(rig.launches.count, 'o Téo não pode abrir um segundo Chrome do mesmo perfil').toBe(1)
  })

  it('C — a vez da 2ª Tarefa não expira por tempo parada (3 min depois a Bia ainda dirige e o Téo segue sem o navegador)', async () => {
    const rig = world()
    await firstTaskEnded(rig)
    await resolve(rig, 'bia', 't2')
    rig.clock.now += 3 * MINUTE
    expect(holdsProblems(holderOf(rig), 'bia', 'depois de 3 min parada')).toEqual([])
    await resolve(rig, 'teo', 't3')
    expect(strayBrowserProblems(serversOf(rig, 'teo'), 'teo')).toEqual([])
  })

  it('D — "Assumir controle" na 2ª Tarefa PARA a Bia: o runner quente dela é despejado e descartado, e a vez é da pessoa', async () => {
    const rig = world()
    await firstTaskEnded(rig)
    await resolve(rig, 'bia', 't2')
    rig.h.takeBrowserProfile({ ...SCOPE, profileId: rig.profileId })
    await new Promise<void>((done) => { setTimeout(done, 20) }) // the eviction does not wait for the CLI (it disposes in the background)
    expect([...rig.h.orchestration.warmRunners.keys()].filter(key => key.startsWith('pp:bia:')), 'o runner quente da Bia devia ter sido despejado').toEqual([])
    expect(rig.stubs[0]!.disposed, 'o runner da Bia devia ter sido descartado (o processo do CLI morre)').toBeGreaterThan(0)
    expect(holderOf(rig)).toMatchObject({ kind: 'person' })
  })

  it('E — 2FA/browser_login na 2ª Tarefa: a sessão viva do navegador é a da Bia (a porta do Chrome), e ao fim da Tarefa a vez volta e o Téo pode usar', async () => {
    const rig = world()
    await firstTaskEnded(rig)
    await resolve(rig, 'bia', 't2')
    const live = rig.h.browser.service.liveSessionOf('bia')
    expect(live, 'liveSessionOf(bia) vazio na 2ª Tarefa: o browser_login/2FA recusaria com "unavailable"').toBeDefined()
    expect(live?.port).toBe(9222)
    expect(live?.profile.id).toBe(rig.profileId)
    // the 2nd Task ends: the turn goes back (no leaked lease) and the next persona can drive the profile
    rig.stubs[0]!.fire({ type: 'idle', sessionId: 'worker-t2', at: new Date().toISOString() })
    expect(holderOf(rig), 'ao fim da 2ª Tarefa a vez devia voltar').toBeUndefined()
    await resolve(rig, 'teo', 't3')
    expect(serversOf(rig, 'teo'), 'depois que a Bia terminou, o Téo devia poder usar o navegador').toContain('browser')
  })

  it('PROVA DO CENÁRIO: com o defeito reintroduzido por fora (a vez devolvida no acerto do cache) o veredito de A ACUSA a Bia sem a vez', async () => {
    const rig = world(true)
    await firstTaskEnded(rig)
    await resolve(rig, 'bia', 't2')
    expect(holdsProblems(holderOf(rig), 'bia', 'na 2ª Tarefa')).toHaveLength(1)
    expect(rig.h.browser.service.liveSessionOf('bia'), 'com a vez perdida o 2FA/browser_login ficaria sem sessão').toBeUndefined()
  })
})

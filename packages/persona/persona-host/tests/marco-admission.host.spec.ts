import { Context } from '@deepseek-ai/cordis'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'
import { sayOn, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * Marco DOGFOOD, E6 (teto de turnos por projeto, pausa aos 95%, durável) e E8 (paralelo sem fome, vaga justa): VERMELHO ATÉ O FORGE APLICAR
 * `project-admission.ts` (contrato: .maestri/tmp/forge/marco/contrato-m2-m3.md). Gauge, 12/11 14:5x. Staging, fora da árvore.
 *
 * Nomes do Forge usados: host.projectAdmission.admit(projectId, origin) / loadOf / events; doc de tela `project_ceiling`;
 * host.orchestration.budget.setLimits({ global, perProject }); linha do canal com id project-pause:<projeto>:<dia>:<turns|quota>.
 * Dia local = h.timezoneOffsetMinutes (aqui -180): a virada é 03:00Z.
 */
const WS = { workspaceId: 'ws' } as const
const DAY = '2026-11-12'
const NOON = '2026-11-12T15:00:00.000Z' // 12:00 em São Paulo
const NEXT_MIDNIGHT = '2026-11-13T03:00:00.000Z' // 00:00 local do dia seguinte

const contexts: Context[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  // Windows keeps the SQLite file open for a moment after dispose: retry, and never fail a test over a temp folder.
  for (const dir of dirs.splice(0)) { try { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) } catch { /* temp folder, the OS cleans it */ } }
}, 60_000)

interface Bed { readonly h: PersonaHost; readonly clock: { iso: string }; readonly dbPath: string }

/** Host SEM timers reais (a janela, o laço e as filas giram só no relógio e nas chamadas do teste), no padrão do produto. */
function openBed(dbPath: string, clock: { iso: string }, fresh: boolean): Bed {
  const ctx = new Context()
  contexts.push(ctx)
  const h = new PersonaHost(ctx, { databasePath: dbPath, engineRetryPollMs: 0, remoteTeamPollMs: 0, flagDefaults: 'production' })
  h.orchestration.now = () => clock.iso
  h.timezoneOffsetMinutes = () => -180
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  if (fresh) {
    seedJourney(h, [])
    seedProject(h, { id: 'loja', name: 'Loja', team: [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }, { id: 'cai', name: 'Cai', title: 'Design' }] })
    seedProject(h, { id: 'obra', name: 'Obra', team: [{ id: 'duda', name: 'Duda', title: 'Coordenação', coordination: true }] })
    h.sessionMemberId = 'ana'
  }
  return { h, clock, dbPath }
}

function freshBed(): Bed {
  const dir = mkdtempSync(join(tmpdir(), 'marco-adm-'))
  dirs.push(dir)
  return openBed(join(dir, 'p.db'), { iso: NOON }, true)
}

interface Admission { ok: boolean; why?: string; load: { state: string; turns: { used: number; max: number }; pct: number } }
interface AdmissionApi {
  admit(projectId: string, origin: string): Admission
  loadOf(projectId: string): Admission['load']
  events(projectId: string): Array<{ kind: string; reason: string; pct: number }>
}
const admissionOf = (h: PersonaHost): AdmissionApi => {
  const api = (h as unknown as { projectAdmission?: AdmissionApi }).projectAdmission
  expect(api, 'costura C4 do Forge: host.projectAdmission (project-admission.ts ainda não está no host)').toBeDefined()
  return api as AdmissionApi
}
const setCeiling = (h: PersonaHost, projectId: string, turnsPerDay: number): void => { h.screens.screens.put(projectId, 'project_ceiling', 'v1', { turnsPerDay, tokensPerDay: 0, pausePct: 95 }) }
const pauseLines = (h: PersonaHost, projectId: string, day: string, reason: string): boolean => h.events.has(`project-pause:${projectId}:${day}:${reason}`)

describe('E6: teto de turnos por projeto (admit), pausa aos 95% como evento, retomada sozinha e durável', () => {
  it('o time (origem quadro) para aos 95% do teto, a pessoa ainda passa até 100%, o outro projeto não é afetado, e há UM evento e UMA linha no canal', () => {
    const { h } = freshBed()
    const adm = admissionOf(h)
    setCeiling(h, 'loja', 20)
    let granted = 0
    let firstRefusal: Admission | undefined
    for (let index = 0; index < 40 && firstRefusal === undefined; index += 1) {
      const answer = adm.admit('loja', 'quadro')
      if (answer.ok) granted += 1; else firstRefusal = answer
    }
    expect(granted, 'turnos do time antes de bater nos 95% de um teto de 20').toBe(19)
    expect(firstRefusal?.why).toBe('project-reserve')
    expect(adm.loadOf('loja').state).toBe('reserve')
    expect(adm.admit('obra', 'quadro').ok, 'o teto de loja não pode parar a obra').toBe(true)
    expect(adm.admit('loja', 'person').ok, 'a pessoa ainda passa na reserva').toBe(true)
    const full = adm.admit('loja', 'person')
    expect(full.ok).toBe(false)
    expect(full.why).toBe('project-full')
    expect(adm.loadOf('loja').turns.used, 'o contador sobe NO admit e não passa do teto').toBe(20)
    const kinds = adm.events('loja').map(event => `${event.kind}:${event.reason}`)
    expect(kinds).toEqual(['pause:turns', 'full:turns'])
    expect(pauseLines(h, 'loja', DAY, 'turns'), 'a linha da pausa no canal, id determinístico').toBe(true)
    for (let index = 0; index < 5; index += 1) adm.admit('loja', 'quadro') // insistir não repete evento nem linha
    expect(adm.events('loja')).toHaveLength(2)
  })

  it('virar o relógio (meia-noite LOCAL = 03:00Z) retoma sozinho: 1 evento resume, contador do dia novo em 1, sem ação humana', () => {
    const { h, clock } = freshBed()
    const adm = admissionOf(h)
    setCeiling(h, 'loja', 20)
    for (let index = 0; index < 25; index += 1) adm.admit('loja', 'quadro')
    expect(adm.loadOf('loja').state).not.toBe('open')
    clock.iso = '2026-11-13T02:59:00.000Z' // ainda é o dia 12 às 23:59 locais
    expect(adm.admit('loja', 'quadro').ok, 'um minuto antes da virada ainda está pausado').toBe(false)
    clock.iso = NEXT_MIDNIGHT
    expect(adm.admit('loja', 'quadro').ok, 'na virada retoma').toBe(true)
    expect(adm.loadOf('loja').turns.used).toBe(1)
    expect(adm.events('loja').filter(event => event.kind === 'resume')).toHaveLength(1)
  })

  it('DURÁVEL: reabrir o host no MESMO arquivo (a queda das 03:30) não zera o contador, não repete o evento nem a linha, e o teto continua valendo', async () => {
    const first = freshBed()
    const adm = admissionOf(first.h)
    setCeiling(first.h, 'loja', 20)
    for (let index = 0; index < 25; index += 1) adm.admit('loja', 'quadro')
    const before = { used: adm.loadOf('loja').turns.used, events: adm.events('loja').length }
    expect(before.events).toBeGreaterThanOrEqual(1)
    await contexts.shift()?.fiber.dispose() // a queda: fecha o primeiro host
    const second = openBed(first.dbPath, first.clock, false)
    const again = admissionOf(second.h)
    expect(again.loadOf('loja').turns.used, 'a queda não pode burlar o teto').toBe(before.used)
    expect(again.admit('loja', 'quadro').ok, 'continua pausado depois de reabrir').toBe(false)
    expect(again.events('loja'), 'o evento não se repete').toHaveLength(before.events)
    expect(pauseLines(second.h, 'loja', DAY, 'turns')).toBe(true)
  })

  it('COTA: tokensPerDay 100000 (input+output do livro-caixa do projeto no dia local; o cache não conta): 95% => time recusado com motivo quota, pessoa passa até 100%, a virada do dia retoma', () => {
    const { h, clock } = freshBed()
    h.sessionMemberId = 'ana'
    const adm = admissionOf(h)
    h.screens.screens.put('loja', 'project_ceiling', 'v1', { turnsPerDay: 200, tokensPerDay: 100_000, pausePct: 95 })
    let counter = 0
    const spend = (projectId: string, inputTokens: number, outputTokens: number, at: string, cache = 0): void => {
      counter += 1
      h.recordTurnLedger({ ...WS, projectId, entry: { id: `q-${counter}`, personaId: 'lia', engine: 'claude', kind: 'execution', inputTokens, outputTokens, cacheReadTokens: cache, cacheWriteTokens: 0, layers: { system: 0, tools: 0, required: 0, subject: 0, recall: 0, message: 0 }, at, origin: 'measured' } })
    }
    spend('loja', 60_000, 34_000, NOON) // 94%
    spend('loja', 0, 0, NOON, 900_000) // cache NÃO conta: continua 94%
    expect(adm.admit('loja', 'quadro').ok, '94% ainda é aberto (e o cache lido não entra na conta)').toBe(true)
    spend('loja', 500, 500, NOON) // 95%
    const refused = adm.admit('loja', 'quadro')
    expect(refused.ok).toBe(false)
    expect(refused.why).toBe('project-reserve')
    expect(adm.events('loja').map(event => `${event.kind}:${event.reason}`)).toEqual(['pause:quota'])
    expect(adm.events('loja')[0]?.pct).toBeGreaterThanOrEqual(95)
    expect(pauseLines(h, 'loja', DAY, 'quota')).toBe(true)
    expect(adm.admit('loja', 'person').ok, 'a pessoa ainda passa na reserva').toBe(true)
    spend('loja', 4_000, 1_000, NOON) // 100%
    const full = adm.admit('loja', 'person')
    expect(full.ok).toBe(false)
    expect(full.why).toBe('project-full')
    expect(adm.admit('obra', 'quadro').ok, 'a cota de loja não para a obra').toBe(true)
    clock.iso = NEXT_MIDNIGHT // o dia local virou: o uso de ontem não conta mais
    expect(adm.admit('loja', 'quadro').ok).toBe(true)
    expect(adm.events('loja').filter(event => event.kind === 'resume')).toHaveLength(1)
  })
})

/** One turn the host started on a runner: the project it belongs to, who and what for. */
interface Start { readonly project: string; readonly persona: string; readonly purpose: string }

/** Um runner que SEGURA cada turno até o teste soltar, em ordem de início: mede o pico de concorrência e a ordem em que os turnos começam POR PROJETO. */
function heldRunners(h: PersonaHost): { starts: Start[]; tasks: Start[]; peak: () => number; releaseNext: () => boolean; releaseAll: () => void } {
  const starts: Start[] = []
  const tasks: Start[] = [] // the FIRST delivery of each Task session (a warm runner delivers to the same Task several times inside ONE slot: that is one Task starting, not three)
  const seenSessions = new Set<string>()
  const pending: Array<() => void> = []
  let active = 0
  let peak = 0
  h.orchestration.runnerFactory = (request?: { projectId?: string; personaName?: string; purpose?: string }) => {
    const runner = createFakeRunner()
    const who: Start = { project: request?.projectId ?? '?', persona: request?.personaName ?? '?', purpose: request?.purpose ?? '?' }
    return Promise.resolve({
      ...runner,
      deliver: async (...args: Parameters<typeof runner.deliver>) => {
        starts.push(who)
        const sessionKey = `${who.project}:${String(args[0])}`
        if (!seenSessions.has(sessionKey)) { seenSessions.add(sessionKey); if (who.purpose === 'task') tasks.push(who) } // only a TASK session is a Task start: the coordinator's talk turns (triage) are not
        active += 1
        peak = Math.max(peak, active)
        await new Promise<void>((resolve) => { pending.push(resolve) })
        active -= 1
        await runner.deliver(...args)
      },
    })
  }
  return {
    starts,
    tasks,
    peak: () => peak,
    releaseNext: () => { const next = pending.shift(); next?.(); return next !== undefined },
    releaseAll: () => { for (const next of pending.splice(0)) next() },
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Pede 4 pedidos (3 na Loja, 1 na Obra) e solta os turnos UM de cada vez, na ordem em que começam, até a fila esvaziar (quieta por 1,5 s). */
async function runFour(h: PersonaHost): Promise<{ starts: Start[]; tasks: Start[]; peak: number }> {
  const held = heldRunners(h)
  sayOn(h, 'loja', 'l1', '@Lia tarefa 1 da loja')
  sayOn(h, 'loja', 'l2', '@Bia tarefa 2 da loja')
  sayOn(h, 'loja', 'l3', '@Cai tarefa 3 da loja')
  sayOn(h, 'obra', 'o1', '@Duda tarefa 1 da obra')
  let quiet = 0
  for (let waited = 0; quiet < 1500 && waited < 20_000; waited += 25) {
    if (held.releaseNext()) quiet = 0; else quiet += 25
    await sleep(25)
  }
  held.releaseAll()
  return { starts: [...held.starts], tasks: [...held.tasks], peak: held.peak() }
}

const orderOf = (starts: readonly Start[]): string => starts.map(start => `${start.project}/${start.persona}/${start.purpose}`).join(' > ')

describe('E8: paralelo sem fome (vaga justa entre projetos)', () => {
  it('CONTROLE DO AMBIENTE: com os limites padrão os pedidos dos 2 projetos começam turnos nos DOIS projetos (o runner falso, a identificação por projeto e a medição funcionam)', async () => {
    const { h } = freshBed()
    const result = await runFour(h)
    const projects = new Set(result.starts.map(start => start.project))
    expect([...projects].sort(), `ordem de início: ${orderOf(result.starts)}`).toEqual(['loja', 'obra'])
    expect(result.starts.length, `ordem de início: ${orderOf(result.starts)}`).toBeGreaterThanOrEqual(4)
    expect(new Set(result.tasks.map(start => start.project)).size, `Tarefas: ${orderOf(result.tasks)}`).toBe(2) // as Tarefas (1ª entrega por sessão) também vêm dos 2 projetos
  })

  it('com 1 vaga: ninguém passa fome, o pico de concorrência é 1, e a Obra não espera as 3 da Loja (rodízio entre projetos)', async () => {
    const { h } = freshBed()
    const budget = (h.orchestration as unknown as { budget?: { setLimits?: (limits: { global: number; perProject: number }) => void } }).budget
    expect(typeof budget?.setLimits, 'costura do Forge: host.orchestration.budget.setLimits').toBe('function')
    budget?.setLimits?.({ global: 1, perProject: 1 })
    const result = await runFour(h)
    expect(result.tasks.length, `nenhum pedido pode ficar em "Aguardando vaga" sem retomada: as 4 Tarefas começaram (Tarefas: ${orderOf(result.tasks)}; entregas: ${orderOf(result.starts)})`).toBeGreaterThanOrEqual(4)
    expect(result.peak, 'pico de concorrência ≤ limite').toBeLessThanOrEqual(1)
    // The fairness is about SLOTS, and the unit that holds a slot is the whole Task turn (the coordinator's triage, the Task session and its follow-ups are several sessions and many deliveries
    // inside ONE grant), which no runner-side count can tell apart from three separate Tasks (observed: loja x3 deliveries before the Obra's, with the grants Loja, Obra, Loja, Loja). So the
    // order is read where the grants are made: `budget.granted` (Forge, read-only, projects in the order they received a slot). My runner still proves what it can see alone: nothing is
    // starved (every request produced Task deliveries in both projects) and the concurrency never passed 1.
    const granted = (h.orchestration as unknown as { budget?: { granted?: readonly string[] } }).budget?.granted
    expect(granted, 'costura do Forge: host.orchestration.budget.granted (a ordem das vagas)').toBeDefined()
    const firstObra = granted?.indexOf('obra') ?? -1
    expect(firstObra, `a Obra nunca recebeu vaga (vagas: ${String(granted?.join(' > '))}; entregas: ${orderOf(result.starts)})`).toBeGreaterThanOrEqual(0)
    expect(firstObra, `a Obra tem de ter a 2ª vaga, não a última (vagas: ${String(granted?.join(' > '))}; entregas: ${orderOf(result.starts)})`).toBeLessThanOrEqual(1)
  })
})

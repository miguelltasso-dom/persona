/**
 * As TRÊS superfícies que o Tally deixou sem cobertura depois de fechar os vazamentos DM → #geral (Keel 07:44, Tally 07:46): uma Tarefa NASCIDA DE UMA DM PRIVADA (ana ↔ Bia/Guia) tem o texto da DM como
 * título e, quando a persona pergunta, a pergunta como `attention.question`. Quem está FORA da DM (o Gus, membro do projeto compartilhado) pode ler isso por:
 *   S1  "Enquanto você estava fora" (`getWhileAway`): a lista "esperando você", as entregas, as iniciativas da proatividade e os alertas do vigia usam `ticket.title` e não olham a sessão;
 *   S2  a Tarefa REVISADA e a Tarefa PASSADA a um colega (`pass_forward`): o pedido de revisão ("Revisar: <título>"), o bilhete e o cartão levam o título da Tarefa de DM para fora dela.
 *
 * Era VERMELHO (5 vazamentos em it.fails); o Tally fechou (P1-DM-2, 12/11) e viraram testes normais. Em processo (host real, 0 IA), projeto COMPARTILHADO (um membro só lê
 * os compartilhados). Cada cenário tem antes uma OBSERVAÇÃO que prova que o escritor RODOU e que o DONO enxerga o segredo (controle: o dado existe e o dono pode vê-lo), para um verde nunca ser vazio.
 * O leitor de fora é a SESSÃO (`sessionMemberId`), não o `actorId` do pedido.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it as vitestIt, onTestFinished } from 'vitest'
import type PersonaHost from '../../persona-host/src/index.ts'
import type { HostRunnerRequest } from '../../persona-host/src/runner.ts'
import { geralChannelId, it, openJourney, seedJourney, seedProject } from '../../persona-host/tests/journeys/journey-host.ts'

const SEGREDO = 'FESTA-SURPRESA-JOAO-4821'
const CLOCK = '2026-11-03T15:00:00.000Z'
const LATER = '2026-11-07T15:00:00.000Z'
const P = { workspaceId: 'ws', projectId: 'sh' } as const
const ARTIFACTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'regressao')

/** O veredito, PURO: onde o segredo da DM aparece no que um leitor de fora lê (vazio = em lugar nenhum). */
export function dmLeakProblems(where: string, outsideView: unknown): string[] {
  return JSON.stringify(outsideView).includes(SEGREDO) ? [`o segredo da DM apareceu no que um leitor de fora lê (${where})`] : []
}

describe('DM → superfícies — veredito do cenário (puro)', () => {
  it('o segredo ausente passa; presente em qualquer campo é acusado com o lugar', () => {
    expect(dmLeakProblems('Enquanto você estava fora', { events: [], waiting: [] })).toEqual([])
    expect(dmLeakProblems('Enquanto você estava fora', { waiting: [{ title: SEGREDO }] })).toEqual(['o segredo da DM apareceu no que um leitor de fora lê (Enquanto você estava fora)'])
  })
})

interface World {
  readonly h: PersonaHost
  /** What the fake Claude of Bia and Téo says when a turn ends (not used in the scripted world). */
  readonly reply: { text: string }
}

/** Projeto COMPARTILHADO "sh" (Guia = coordenação, Bia, Téo), a Ana (dona), o Gus (membro, fora das DMs) e duas DMs privadas (ana ↔ Bia, ana ↔ Guia). `scripted`: as respostas roteirizadas do host. */
function open(scripted: boolean): World {
  const h = openJourney()
  seedJourney(h)
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Texto' }, { id: 'teo', name: 'Téo', title: 'Arte' }] })
  h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'member' })
  h.createDm({ id: 'dm-bia', ...P, participantA: 'ana', participantB: 'bia' })
  h.createDm({ id: 'dm-guia', ...P, participantA: 'ana', participantB: 'guia' })
  h.teamworkEnabled = true
  const reply = { text: `Sobre a ${SEGREDO}: você prefere o fundo azul ou o verde?` }
  if (scripted) return { h, reply }
  for (const id of ['bia', 'teo']) h.product.updatePersona({ ...h.product.getPersona(id)!, runner: { kind: 'cli', cli: 'claude', model: 'default' } }, 'sh')
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.orchestration.turnClose = true
  const wasScripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = wasScripted })
  let said: string | undefined
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const text = said; said = undefined; return text }, set: () => undefined })
  h.orchestration.runnerFactory = (_request?: HostRunnerRequest) => {
    const listeners = new Set<(event: RunnerEvent) => void>()
    const runner: Runner = {
      ensureSession: () => Promise.resolve(),
      deliver: (sessionId) => { said = reply.text; for (const listener of listeners) listener({ type: 'idle', sessionId, at: new Date().toISOString() }); return Promise.resolve() },
      cancel: () => Promise.resolve(),
      status: () => 'idle',
      whenIdle: () => Promise.resolve(),
      onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      capabilities: () => ({ steer: false, removeQueued: false, reportsInputTaken: false, background: false, tools: 'mcp', resume: false }),
    }
    return Promise.resolve(runner)
  }
  return { h, reply }
}

/** O pedido de trabalho com palavras secretas na DM privada (`dm-guia`: a Coordenação, que no host roteirizado chega à revisão da pessoa; `dm-bia`: a Bia). */
function privateRequest(h: PersonaHost, dm: 'dm-guia' | 'dm-bia'): void {
  const body = dm === 'dm-guia' ? `preciso de um plano da ${SEGREDO}, é segredo, só entre nós dois` : `Bia, monte o plano da ${SEGREDO}: é segredo, só entre nós dois, o João não pode saber`
  h.postMessage({ id: `req-${dm}`, ...P, streamKind: 'dm', ownerId: dm, body, actorId: 'ana', subjectId: `req-${dm}`, occurredAt: CLOCK })
}

const tasksOf = (h: PersonaHost, name: string) => h.orchestration.runtime('sh').repo.tickets.list().filter(ticket => ticket.execution?.name === name)

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sh')
}

/** Reads as Gus: the host decides WHO is reading from the session (`sessionMemberId`), never from the `actorId` of the request. */
function asGus<T>(h: PersonaHost, read: () => T): T {
  const before = h.sessionMemberId
  h.sessionMemberId = 'gus'
  try { return read() } finally { h.sessionMemberId = before }
}

/** Tudo o que o Gus lê do projeto: "Enquanto você estava fora", a lista de Tarefas e o #geral inteiro (corpo e cartões tipados). */
function outsideView(h: PersonaHost): { readonly whileAway: unknown; readonly tasks: unknown; readonly geral: unknown } {
  return asGus(h, () => ({
    whileAway: h.getWhileAway({ ...P }),
    tasks: h.listTasks({ ...P }),
    geral: h.listMessages({ ...P, streamKind: 'channel', ownerId: geralChannelId(h, 'sh'), actorId: 'gus', afterSeq: 0, limit: 200 }).events,
  }))
}

function keepEvidence(name: string, evidence: unknown): void {
  mkdirSync(ARTIFACTS, { recursive: true })
  writeFileSync(join(ARTIFACTS, `dm-superficies-${name}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
}

/** Aceita a revisão como a pessoa (a entrega da Coordenação fica pronta e a Tarefa fecha), como na jornada J2. */
async function acceptDelivery(h: PersonaHost, ticketId: string): Promise<void> {
  const accepted = await h.acceptReview({ ...P, ticketId, mode: 'ff' })
  if (accepted.kind === 'blocked') h.runTicketCommand({ ...P, ticketId, command: 'complete', reason: '' })
}

describe('S1 "Enquanto você estava fora" — o que um membro de FORA da DM lê (host em processo, 0 IA)', () => {
  // A janela do "Enquanto você estava fora" é UMA por projeto, aberta na primeira leitura (desde o começo, `since` = 1970) e estável até `dismissWhileAway`: por isso o Gus lê PRIMEIRO e o dono lê
  // DEPOIS, a mesma janela, como CONTROLE de que o segredo está lá para quem pode ver (sem isto um "sem vazamento" podia ser só uma janela vazia: `dismissWhileAway` a reabre em "agora").
  /** O Gus lê primeiro; o dono lê a mesma janela depois (controle). */
  function bothRead(h: PersonaHost): { readonly gus: ReturnType<PersonaHost['getWhileAway']>; readonly owner: ReturnType<PersonaHost['getWhileAway']> } {
    const gus = asGus(h, () => h.getWhileAway({ ...P }))
    return { gus, owner: h.getWhileAway({ ...P }) }
  }

  it('OBSERVAÇÃO (controle): a DM é privada ao Gus e o DONO enxerga a Tarefa da DM com o título na lista de Tarefas', async () => {
    const { h } = open(true)
    privateRequest(h, 'dm-bia')
    await settle(h)
    expect(JSON.stringify(h.listTasks({ ...P })), 'o dono não vê a Tarefa da DM na lista: o cenário não exercita nada').toContain(SEGREDO)
    const dm = asGus(h, () => h.listMessages({ ...P, streamKind: 'dm', ownerId: 'dm-bia', actorId: 'gus', afterSeq: 0, limit: 20 }).events)
    expect(JSON.stringify(dm), 'o Gus leu a DM privada').not.toContain(SEGREDO)
    expect(JSON.stringify(asGus(h, () => h.listTasks({ ...P }))), 'a lista de Tarefas do Gus leva o título (já corrigido pelo Tally)').not.toContain(SEGREDO)
  }, 60_000)

  /** A Bia perguntou na DM (a Tarefa espera a RESPOSTA da pessoa); o Gus lê a janela primeiro, o dono depois. */
  async function waitingWorld(): Promise<{ readonly question: string | undefined; readonly gus: ReturnType<PersonaHost['getWhileAway']>; readonly owner: ReturnType<PersonaHost['getWhileAway']> }> {
    const { h } = open(false)
    privateRequest(h, 'dm-bia')
    await settle(h)
    return { question: tasksOf(h, 'Bia')[0]?.attention?.question, ...bothRead(h) }
  }

  it('OBSERVAÇÃO: a Bia deixou a pergunta na Tarefa e o DONO a vê em "esperando você" com o título', async () => {
    const { question, owner } = await waitingWorld()
    expect(question, 'a Bia não deixou a pergunta na Tarefa: o cenário não exercita "esperando você"').toContain(SEGREDO)
    expect(JSON.stringify(owner.waiting), 'o dono não vê a Tarefa em "esperando você": o cenário não exercita nada').toContain(SEGREDO)
  }, 60_000)

  vitestIt('(vazamento fechado) — "esperando você": a Tarefa de uma DM que espera a resposta NÃO aparece com o título para o Gus (waiting, byPersona)', async () => {
    const { gus, owner } = await waitingWorld()
    keepEvidence('esperando', { gus: { waiting: gus.waiting, byPersona: gus.byPersona }, dono: { waiting: owner.waiting } })
    expect(dmLeakProblems('Enquanto você estava fora: esperando você', { waiting: gus.waiting, byPersona: gus.byPersona })).toEqual([])
  }, 60_000)

  /** A Tarefa da DM (a Coordenação, que chega à revisão) é ACEITA: a entrega aparece em "Enquanto você estava fora". */
  async function deliveredWorld(): Promise<{ readonly gus: ReturnType<PersonaHost['getWhileAway']>; readonly owner: ReturnType<PersonaHost['getWhileAway']> }> {
    const { h } = open(true)
    privateRequest(h, 'dm-guia')
    await settle(h)
    await acceptDelivery(h, tasksOf(h, 'Guia')[0]!.id)
    return bothRead(h)
  }

  it('OBSERVAÇÃO: a entrega aceita aparece para o DONO em "Enquanto você estava fora" com o título', async () => {
    const { owner } = await deliveredWorld()
    expect(JSON.stringify(owner.events), 'o dono não vê a entrega: o cenário não exercita nada').toContain(SEGREDO)
  }, 60_000)

  vitestIt('(vazamento fechado) — a ENTREGA aceita de uma Tarefa de DM NÃO aparece com o título para o Gus (events, byPersona)', async () => {
    const { gus, owner } = await deliveredWorld()
    keepEvidence('entrega', { gus: { events: gus.events, byPersona: gus.byPersona }, dono: { events: owner.events } })
    expect(dmLeakProblems('Enquanto você estava fora: entregas', { events: gus.events, byPersona: gus.byPersona })).toEqual([])
  }, 60_000)

  /** A Bia perguntou na DM, a Tarefa parou, e a iniciativa da proatividade dispara dias depois (autonomia "propõe"). */
  async function initiativeWorld(): Promise<{ readonly question: string | undefined; readonly fired: boolean; readonly gus: ReturnType<PersonaHost['getWhileAway']>; readonly owner: ReturnType<PersonaHost['getWhileAway']> }> {
    const { h } = open(false)
    privateRequest(h, 'dm-bia')
    await settle(h)
    const question = tasksOf(h, 'Bia')[0]?.attention?.question
    h.orchestration.now = () => LATER
    h.setAutonomy({ ...P, personaId: 'bia', mode: 'propose', proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
    const fired = h.proactivity.fire('sh', 'bia', 'routine', 'Revisar o projeto e propor o próximo passo')
    return { question, fired, ...bothRead(h) }
  }

  it('OBSERVAÇÃO: a iniciativa dispara sobre a Tarefa parada com pergunta e o DONO a vê em "Enquanto você estava fora"', async () => {
    const { question, fired, owner } = await initiativeWorld()
    expect(question, 'a Bia não deixou a pergunta na Tarefa: o cenário não exercita a iniciativa').toContain(SEGREDO)
    expect(fired, 'a iniciativa não disparou').toBe(true)
    expect(owner.events.some(event => event.kind === 'proposal'), 'o dono não vê a iniciativa: o cenário não exercita nada').toBe(true)
  }, 60_000)

  // só os EVENTOS da iniciativa (a lista "esperando você", da mesma Tarefa, é o cenário de cima)
  vitestIt('(vazamento fechado) — a INICIATIVA da proatividade ("Desbloquear: <título>") NÃO aparece com o título para o Gus (events)', async () => {
    const { gus, owner } = await initiativeWorld()
    keepEvidence('iniciativa', { gus: { events: gus.events }, dono: { events: owner.events } })
    expect(dmLeakProblems('Enquanto você estava fora: iniciativa', gus.events)).toEqual([])
  }, 60_000)

  /** Uma Tarefa de DM em andamento e parada há 4 dias: o vigia alerta. */
  async function watchdogWorld(): Promise<{ readonly alerts: number; readonly gus: ReturnType<PersonaHost['getWhileAway']>; readonly owner: ReturnType<PersonaHost['getWhileAway']> }> {
    const { h } = open(true)
    privateRequest(h, 'dm-bia') // right after the request the Task is "doing" and nobody has finished
    h.orchestration.now = () => LATER
    const alerts = h.proactivity.tickWatchdog('sh', 1000).length
    return { alerts, ...bothRead(h) }
  }

  it('OBSERVAÇÃO: o vigia alerta sobre a Tarefa de DM parada e o DONO vê o alerta em "Enquanto você estava fora"', async () => {
    const { alerts, owner } = await watchdogWorld()
    expect(alerts, 'o vigia não alertou: o cenário não exercita nada').toBeGreaterThan(0)
    expect(owner.events.some(event => event.kind === 'watchdog'), 'o dono não vê o alerta do vigia: o cenário não exercita nada').toBe(true)
  }, 60_000)

  vitestIt('(vazamento fechado) — o ALERTA do vigia sobre uma Tarefa de DM NÃO aparece com o título para o Gus (events)', async () => {
    const { gus, owner } = await watchdogWorld()
    keepEvidence('vigia', { gus: { events: gus.events }, dono: { events: owner.events } })
    expect(dmLeakProblems('Enquanto você estava fora: vigia', gus.events)).toEqual([])
  }, 60_000)
})

describe('S2 a Tarefa REVISADA e a Tarefa PASSADA a um colega — o título da DM sai pelo pedido de revisão e pelo bilhete? (host em processo, 0 IA)', () => {
  vitestIt('a REVISÃO da Tarefa de uma DM ("Revisar: <título>") NÃO leva o título para a lista de Tarefas, o #geral nem o "Enquanto você estava fora" do Gus', async () => {
    const { h } = open(true)
    h.screens.screens.put('sh', 'review_policy', 'v1', { mode: 'always', reviewer: { kind: 'coordination' } })
    privateRequest(h, 'dm-bia')
    await settle(h)
    const mine = JSON.stringify(h.listTasks({ ...P }))
    expect(mine, 'o dono não vê a Tarefa da DM na lista: o cenário não exercita nada').toContain(SEGREDO)
    const view = outsideView(h)
    keepEvidence('revisao', { view, dono: h.listTasks({ ...P }).map(task => task.title) })
    expect(dmLeakProblems('a revisão da Tarefa de DM', view)).toEqual([])
  }, 60_000)

  /** A Bia (Tarefa de DM) passa o trabalho ao Téo com um título e um bilhete que carregam as palavras da DM; o Gus lê tudo (a janela do "Enquanto você estava fora" é a PRIMEIRA leitura). */
  async function passWorld(): Promise<{ readonly passed: unknown; readonly teoTasks: number; readonly ownerTasks: string; readonly view: ReturnType<typeof outsideView>; readonly titles: string[] }> {
    const { h } = open(true)
    privateRequest(h, 'dm-bia')
    const passed = h.handoffs.ask({
      projectId: 'sh', fromTicketId: tasksOf(h, 'Bia')[0]!.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: `Arte do plano da ${SEGREDO}`, callId: 'pf1', kind: 'next',
      note: { done: [`Texto do plano da ${SEGREDO}`], needed: ['Arte do cartaz'], files: [], decisions: [] },
    })
    await settle(h)
    const view = outsideView(h)
    return { passed, teoTasks: tasksOf(h, 'Téo').length, ownerTasks: JSON.stringify(h.listTasks({ ...P })), view, titles: h.listTasks({ ...P }).map(task => task.title) }
  }

  it('OBSERVAÇÃO: a passagem foi aceita, o colega recebeu a Tarefa e o DONO a vê com o título e o bilhete', async () => {
    const { passed, teoTasks, ownerTasks } = await passWorld()
    expect(passed, JSON.stringify(passed)).toMatchObject({ ok: true })
    expect(teoTasks, 'o colega não recebeu a Tarefa: o cenário não exercita nada').toBeGreaterThan(0)
    expect(ownerTasks, 'o dono não vê a Tarefa do colega com o título/bilhete').toContain(SEGREDO)
  }, 60_000)

  vitestIt('(vazamento fechado) — PASS_FORWARD: o título e o bilhete NÃO chegam ao Gus pela lista de Tarefas (note), o #geral nem o "Enquanto você estava fora" (a revisão "Revisar: <título>")', async () => {
    const { view, titles } = await passWorld()
    keepEvidence('pass-forward', { view, dono: titles })
    expect(dmLeakProblems('a Tarefa passada a um colega', view)).toEqual([])
  }, 60_000)
})

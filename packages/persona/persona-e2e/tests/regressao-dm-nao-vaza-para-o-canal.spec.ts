/**
 * LACUNA que o Tally deixou sem testar (pedido do Keel 05:53): uma Tarefa NASCIDA DE UMA DM PRIVADA (ana ↔ Bia) tem `ticket.title` derivado do texto da DM e, quando a Bia pergunta, uma pergunta
 * (`ticket.attention.question`) escrita para a Ana. Os escritores do host que postam no #geral — o cartão "Bom dia" (`morningTasks` → `MorningBriefHost`), a cobrança "esperando você"
 * (`PersonWaiting`) e a proposta de tarefa (`TaskProposalHost`, "Posso destravar “título”?" + a pergunta como motivo) — leem TODAS as Tarefas do projeto sem olhar de que conversa nasceram.
 * Quem lê o #geral e NÃO participa da DM (um outro membro do projeto compartilhado) pode ler o título/texto privado?
 *
 * VERMELHO se vazar, TRAVA VERDE se não: cada escritor tem o seu cenário; o que vazar fica em `it.fails` (vermelho esperado, com a evidência em artifacts/regressao/dm-para-canal-*.json),
 * o que não vazar fica NORMAL. Em processo (host real, runner falso, 0 IA), num projeto COMPARTILHADO (um membro só lê projetos compartilhados; o Pessoal é só do dono). Cada cenário tem antes um
 * teste de OBSERVAÇÃO que prova que o escritor RODOU (o cartão existe no #geral que o Gus lê), que a Tarefa da DM existe com o segredo no título/pergunta, que a DM é mesmo privada para o Gus e,
 * no "Bom dia", que o cartão lista Tarefas de verdade (controle: a Tarefa do #geral aparece), para que um verde nunca seja um verde vazio.
 * `PERSONA_SHOW_RED=1` roda os vermelhos como testes normais (para ver a falha).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it as vitestIt, onTestFinished } from 'vitest'
import type PersonaHost from '../../persona-host/src/index.ts'
import type { HostRunnerRequest } from '../../persona-host/src/runner.ts'
import { it, geralChannelId, openJourney, sayOn, seedJourney, seedProject } from '../../persona-host/tests/journeys/journey-host.ts'

const SEGREDO = 'FESTA-SURPRESA-JOAO-4821'
const CLOCK = '2026-11-03T15:00:00.000Z'
/** Four days later: past the 3 days after which the team asks, and past the 2 days after which a Task is "parada". */
const LATER = '2026-11-07T15:00:00.000Z'
/** The shared project the scenarios live in. */
const P = { workspaceId: 'ws', projectId: 'sh' } as const
const SHOW_RED = process.env.PERSONA_SHOW_RED === '1'
const expectedRed = SHOW_RED ? vitestIt : vitestIt.fails
const ARTIFACTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'regressao')

/** O veredito, PURO: onde o segredo da DM aparece no que um leitor de fora lê (vazio = em lugar nenhum). */
export function dmLeakProblems(where: string, outsideView: unknown): string[] {
  return JSON.stringify(outsideView).includes(SEGREDO) ? [`o segredo da DM apareceu no que um leitor de fora lê (${where})`] : []
}

describe('DM → canal — veredito do cenário (puro)', () => {
  it('o segredo ausente passa; presente (no corpo ou num campo tipado) é acusado com o lugar', () => {
    expect(dmLeakProblems('Bom dia', [{ body: 'Bom dia, equipe' }])).toEqual([])
    expect(dmLeakProblems('Bom dia', [{ body: `Hoje: ${SEGREDO}` }])).toEqual(['o segredo da DM apareceu no que um leitor de fora lê (Bom dia)'])
    expect(dmLeakProblems('Bom dia', [{ body: 'Hoje', dailyBrief: { today: [{ title: SEGREDO }] } }])).toHaveLength(1)
  })
})

interface World {
  readonly h: PersonaHost
  /** What the fake Claude of Bia and Téo says when a turn ends (not used in the scripted world). */
  readonly reply: { text: string }
}

/**
 * Host com um projeto COMPARTILHADO "sh" (Guia = coordenação, Bia, Téo), o dono (ana) e um colega (gus, membro, que NÃO está na DM); uma DM privada ana ↔ Bia.
 * `scripted`: as respostas roteirizadas do próprio host (a Tarefa vai a "doing" e, no flush, à revisão com entrega, como na jornada J2); senão, o Claude FALSO das duas personas.
 */
function open(scripted = false): World {
  const h = openJourney()
  seedJourney(h)
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Texto' }, { id: 'teo', name: 'Téo', title: 'Arte' }] })
  h.createMember({ id: 'gus', ...P, displayName: 'Gus', handle: 'gus', role: 'member' })
  h.createDm({ id: 'dm-bia', ...P, participantA: 'ana', participantB: 'bia' })
  h.createDm({ id: 'dm-guia', ...P, participantA: 'ana', participantB: 'guia' })
  h.teamworkEnabled = true // the real app has the team behaviors ON; Vitest builds them OFF
  const reply = { text: 'Pronto, deixei o plano no rascunho.' }
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
      deliver: (sessionId) => {
        said = reply.text
        for (const listener of listeners) listener({ type: 'idle', sessionId, at: new Date().toISOString() })
        return Promise.resolve()
      },
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

/** The person asks Bia, in the PRIVATE DM, for a piece of work whose words are secret: a Task is born there. */
function privateRequest(h: PersonaHost): void {
  h.postMessage({ id: 'dm1', ...P, streamKind: 'dm', ownerId: 'dm-bia', body: `Bia, monte o plano da ${SEGREDO}: é segredo, só entre nós dois, o João não pode saber`, actorId: 'ana', subjectId: 'dm1', occurredAt: CLOCK })
}

const tasksOf = (h: PersonaHost, name: string) => h.orchestration.runtime('sh').repo.tickets.list().filter(ticket => ticket.execution?.name === name)

/** Reads as Gus: the host decides WHO is reading from the session (`sessionMemberId`), never from the `actorId` of the request. */
function asGus<T>(h: PersonaHost, read: () => T): T {
  const before = h.sessionMemberId
  h.sessionMemberId = 'gus'
  try { return read() } finally { h.sessionMemberId = before }
}

/** What Gus, a colleague who is NOT in the DM, reads of #geral: every line the host hands him (body and the typed fields of the cards). */
const outsideChannel = (h: PersonaHost) => asGus(h, () => h.listMessages({ ...P, streamKind: 'channel', ownerId: geralChannelId(h, 'sh'), actorId: 'gus', afterSeq: 0, limit: 200 }).events)

/** The same host, asked what Gus sees of the DM itself: nothing (the control that the DM is private to him). */
const outsideDm = (h: PersonaHost) => asGus(h, () => h.listMessages({ ...P, streamKind: 'dm', ownerId: 'dm-bia', actorId: 'gus', afterSeq: 0, limit: 50 }).events)

function keepEvidence(name: string, evidence: unknown): void {
  mkdirSync(ARTIFACTS, { recursive: true })
  writeFileSync(join(ARTIFACTS, `dm-para-canal-${name}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
}

describe('DM → canal — a Tarefa nascida de uma DM privada não vaza para quem está fora dela (host em processo, 0 IA)', () => {
  it('OBSERVAÇÃO (controle): o Gus lê o #geral do projeto mas NÃO a DM; a Tarefa nasce na DM e o título dela traz o texto privado', async () => {
    const { h } = open()
    privateRequest(h)
    await h.orchestration.flush('sh')
    const ticket = tasksOf(h, 'Bia')[0]
    expect(ticket, 'a DM não gerou uma Tarefa para a Bia').toBeDefined()
    expect(`${ticket!.title} ${ticket!.execution?.assignment ?? ''}`, 'o título/enunciado da Tarefa não traz o texto privado: o cenário não prova nada').toContain(SEGREDO)
    expect(h.orchestration.conversationOfTicket('sh', ticket!.id)?.streamKind).toBe('dm')
    expect(JSON.stringify(outsideDm(h)), 'o Gus leu a DM privada').not.toContain(SEGREDO)
    sayOn(h, 'sh', 'g1', 'Bom dia, pessoal')
    expect(JSON.stringify(outsideChannel(h)), 'o Gus não lê o #geral do projeto compartilhado: os cenários abaixo não provariam nada').toContain('Bom dia, pessoal')
  })

  vitestIt('TRAVA — os cartões do time (team-cards) escrevem na conversa da própria Tarefa (a DM): o #geral não recebe o segredo', async () => {
    const { h } = open()
    privateRequest(h)
    await h.orchestration.flush('sh')
    expect(tasksOf(h, 'Bia').length, 'a DM não gerou uma Tarefa para a Bia').toBeGreaterThan(0)
    expect(dmLeakProblems('o #geral depois do pedido privado', outsideChannel(h))).toEqual([])
  }, 60_000)
})

describe('DM → canal — o cartão "Bom dia" do #geral (Tarefa em andamento)', () => {
  /** A Tarefa da DM (Bia) e uma do próprio #geral (Téo, o controle) em andamento; o cartão pedido na hora. */
  function brief(): { readonly h: PersonaHost; readonly card: unknown[]; readonly outcome: string } {
    const { h } = open(true) // scripted: right after the request each Task is "doing" (running) and nobody has finished
    privateRequest(h)
    sayOn(h, 'sh', 'c1', '@Téo monte o cartaz do pão de queijo')
    expect(tasksOf(h, 'Bia').length, 'a Tarefa da DM não nasceu').toBeGreaterThan(0)
    expect(tasksOf(h, 'Téo').length, 'a Tarefa do #geral não nasceu').toBeGreaterThan(0)
    const result = h.postDailyBriefNow({ ...P })
    return { h, card: outsideChannel(h).filter(event => event.actorId === 'guia'), outcome: result.outcome }
  }

  it('OBSERVAÇÃO: o cartão saiu no #geral (outcome "posted") e lista a Tarefa do PRÓPRIO #geral (controle: o cartão lista Tarefas em andamento)', () => {
    const { card, outcome } = brief()
    expect(outcome).toBe('posted')
    expect(card.length, 'o cartão não está no #geral que o Gus lê').toBeGreaterThan(0)
    expect(JSON.stringify(card), 'o cartão não lista a Tarefa em andamento do #geral: um verde aqui não provaria nada').toMatch(/Téo|cartaz/u)
  }, 60_000)

  expectedRed('VERMELHO (vazamento) — o cartão "Bom dia" NÃO cita o título da Tarefa que nasceu de uma DM privada', () => {
    const { h, card } = brief()
    keepEvidence('bom-dia', { card, dmVisivelAoGus: outsideDm(h).length })
    expect(dmLeakProblems('o cartão Bom dia do #geral', card)).toEqual([])
  }, 60_000)
})

describe('DM → canal — a cobrança "esperando você" do #geral (Tarefa pronta, 4 dias na revisão)', () => {
  async function waitingLine(): Promise<{ readonly h: PersonaHost; readonly outcome: string; readonly lines: unknown[]; readonly column: string | undefined }> {
    const { h } = open(true) // scripted: the Coordenação's Task ends in the person's review with a delivery (journey J2); the request is in HER private DM
    h.postMessage({ id: 'dm2', ...P, streamKind: 'dm', ownerId: 'dm-guia', body: `preciso de um plano da ${SEGREDO}, é segredo, só entre nós dois`, actorId: 'ana', subjectId: 'dm2', occurredAt: CLOCK })
    await h.orchestration.flush('sh')
    const ticket = tasksOf(h, 'Guia')[0]
    const column = ticket === undefined ? undefined : h.orchestration.kanban('sh').find(card => card.ticketId === ticket.id)?.column
    h.orchestration.now = () => LATER
    const outcome = h.personWaiting.check('sh')
    return { h, outcome, lines: outsideChannel(h).filter(event => event.subjectId === 'person-waiting'), column }
  }

  it('OBSERVAÇÃO: a Tarefa da DM está na revisão e a cobrança saiu no #geral (outcome "posted")', async () => {
    const { outcome, lines, column } = await waitingLine()
    expect(column, 'a Tarefa da DM não está esperando a revisão da pessoa: o cenário não exercita a cobrança').toBe('review')
    expect(outcome).toBe('posted')
    expect(lines.length, 'a cobrança não está no #geral que o Gus lê').toBeGreaterThan(0)
  }, 60_000)

  expectedRed('VERMELHO (vazamento) — a cobrança NÃO cita o título da Tarefa que nasceu de uma DM privada', async () => {
    const { h, lines } = await waitingLine()
    keepEvidence('cobranca', { lines, dmVisivelAoGus: outsideDm(h).length })
    expect(dmLeakProblems('a cobrança "esperando você" do #geral', lines)).toEqual([])
  }, 60_000)
})

describe('DM → canal — a proposta de tarefa do #geral (a Bia perguntou na DM e a pergunta ficou parada)', () => {
  const QUESTION = `Sobre a ${SEGREDO}: você prefere o fundo azul ou o verde?`
  async function proposal(): Promise<{ readonly h: PersonaHost; readonly offered: number; readonly flushed: boolean; readonly cards: unknown[]; readonly attention: string | undefined }> {
    const { h, reply } = open()
    reply.text = QUESTION
    privateRequest(h)
    await h.orchestration.flush('sh')
    const attention = tasksOf(h, 'Bia')[0]?.attention?.question
    h.orchestration.now = () => LATER
    h.setAutonomy({ ...P, personaId: 'bia', mode: 'propose', proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
    const offered = h.taskProposals.offer({ ...P, personaId: 'bia', nowIso: LATER })
    const flushed = h.taskProposals.flush('sh', LATER)
    return { h, offered, flushed, cards: outsideChannel(h).filter(event => event.id.startsWith('proposal-card:')), attention }
  }

  it('OBSERVAÇÃO: a Tarefa da DM ficou esperando uma resposta (com a pergunta) e a proposta saiu no #geral', async () => {
    const { offered, flushed, cards, attention } = await proposal()
    expect(attention, 'a Tarefa da DM não guardou a pergunta da Bia: o cenário não exercita a proposta "destravar"').toContain(SEGREDO)
    expect(offered, 'nenhuma proposta foi montada').toBeGreaterThan(0)
    expect(flushed).toBe(true)
    expect(cards.length, 'o cartão de proposta não está no #geral que o Gus lê').toBeGreaterThan(0)
  }, 60_000)

  expectedRed('VERMELHO (vazamento) — a proposta ("Posso destravar “título”?" + a pergunta como motivo) NÃO traz o texto da DM privada', async () => {
    const { h, cards } = await proposal()
    keepEvidence('proposta', { cards, dmVisivelAoGus: outsideDm(h).length })
    expect(dmLeakProblems('a proposta de tarefa do #geral', cards)).toEqual([])
  }, 60_000)
})

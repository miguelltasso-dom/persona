/**
 * EQUIPE-REAL (Atlas 21:25, pergunta do Miguel: "estão trabalhando como uma equipe real de pessoas?") — "Um dia da equipe" de ponta a ponta
 * no HOST REAL (PersonaHost, SQLite, relógio injetado) com o runner ROTEIRIZADO: 0 IA, 0 chamada paga.
 *
 * O DIA LIMPO (um host só; é o transcrito que o Atlas mostra ao Miguel): a pessoa faz UM pedido de campanha → a Coordenação divide por
 * função → a Bia passa o trabalho ao Teo (bilhete) → o Teo pede ajuda ao Caio → o Teo pede a opinião do time sobre o cartaz (imagem) →
 * a pessoa conclui o texto → no dia seguinte o "Bom dia" (sem IA) → três dias depois uma persona travada numa pergunta propõe.
 * O que polui um transcrito (plano que contrata, pedidos repetidos por @menção, mensagem de persona, rotina própria, revisão sem veredito,
 * conclusão em duas chamadas) roda em MUNDOS À PARTE, cada um com a sua prova e a sua guarda, e nunca entra no transcrito.
 *
 * Cada comportamento é um teste: `it` = passa hoje; `it.fails` = LACUNA/DEFEITO com a assertiva do comportamento exigido (vira teste normal
 * quando o dono entregar). Limite honesto: o runner roteirizado não escolhe por função nem escreve de verdade; o que ele NÃO prova
 * (roteamento por função com IA, qualidade do resumo, a imagem DESCRITA pelo modelo) fica para a rodada real.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ProactivityRepos, RoutineRepos } from '@deepseek-ai/dsh-persona-store'
import { describe, expect, it as vitestIt } from 'vitest'
import type { Ticket } from '../../persona-engine/src/index.ts'
import { ProactivityHost } from '../../persona-host/src/proactivity.ts'
import { createProactivityScheduler } from '../../persona-host/src/proactivity-wire.ts'
import { TeamStateBook } from '../../persona-host/src/team-state.ts'
import { SCOPE, openJourneyFile, seedJourney } from '../../persona-host/tests/journeys/journey-host.ts'
import { ARTIFACTS_DIR, REPO_ROOT } from '../src/paths.ts'
import { POSTER_ALT, buildPosterPng } from '../src/team-image-fixture.ts'
import { leaksIn, readTeamTranscript, renderTranscriptMarkdown } from '../src/team-transcript.ts'

const OUT = join(ARTIFACTS_DIR, 'gauge', 'team-day')
const DAY = 86_400_000
const T0 = Date.parse('2026-11-04T08:30:00.000Z') // quarta, 08h30 UTC (05h30 locais)
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true, canRecruit: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
] as const
/** The day is rehearsed with the team switches ON; `GAUGE_FLAGS_DEFAULT=1` leaves them to the host's own defaults (FLAGS-ON-1). */
const byHand = (): boolean => process.env.GAUGE_FLAGS_DEFAULT !== '1'
if (!byHand()) process.env.PERSONA_HOST_FLAGS = 'production' // read when each host is built
const REQUEST = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'

type Host = ReturnType<typeof openJourneyFile>
interface Row { readonly id: string; readonly actorId: string; readonly body: string }
type Loose = Record<string, unknown>
interface Line { readonly id: string; readonly scene: string; readonly at: string; readonly actor: string; readonly text: string }

const NAMES: Readonly<Record<string, string>> = { ana: 'Ana (você)', lia: 'Lia · Coordenação', bia: 'Bia · Redação', teo: 'Teo · Design', caio: 'Caio · Mídia' }

/** What the person SEES: internal card markers become a plain note (never prompts or ids in the transcript). */
function human(body: string): string {
  return body
    .replace(/\[\[handoff:[\s\S]*?\}\]\]/gu, '')
    .replace(/\[\[review:[\s\S]*?\}\]\]/gu, '')
    .replace(/\[\[gestor-plan:[^\]]*\]\]/gu, '(cartão do plano, com Aprovar / Ajustar / Agora não)')
    .replace(/\[\[task-proposal:[\s\S]*?\}\]\]/gu, '(cartão "Proposta de Teo": Aceitar / Agora não)')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** Who the thread SHOWS as the author: a name, or the team line; an internal id is reported as it is (the guard below catches it). */
function authorOf(row: Row): string {
  return row.body.includes('[[handoff:') ? 'Linha da equipe' : (NAMES[row.actorId] ?? row.actorId)
}

function record(lines: Line[], scene: string, at: string, events: readonly Row[], seen: Set<string>): void {
  for (const row of events) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    lines.push({ id: row.id, scene, at, actor: authorOf(row), text: human(row.body) })
  }
}

function queueText(h: Host, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
}

async function settleAll(h: Host): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

const thread = (h: Host): Row[] => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events as unknown as Row[]
const ticketsOf = (h: Host): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const postAsAna = (h: Host, id: string, body: string, at: string): void => {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id, occurredAt: at })
}
const FIRST_LINE = (body: string): string => body.split('\n')[0] ?? ''

function runningTicket(id: string, title: string, persona: string, trigger: string, at: string, question?: string): Ticket {
  return {
    id, title, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [],
    assignments: [{ id: `${id}-a1`, state: 'running', createdAt: at, startedAt: at, ...(question === undefined ? {} : { report: { state: 'waiting' as const, summary: question, at } }) }],
    inputs: [], undelivered: [],
    ...(question === undefined ? {} : { attention: { id: `att-${id}`, question } }),
    createdAt: at, updatedAt: at, origin: { triggerId: trigger, triggerIds: [trigger] },
    execution: { name: persona, directory: '.', assignment: title },
  }
}

// ───────────────────────────── os dados do DIA LIMPO e dos MUNDOS À PARTE ─────────────────────────────
interface Day {
  readonly lines: Line[]
  readonly ask: { executors: string[]; ticketCount: number; splitAnnounced: boolean; splitRefused: number; titles: string[] }
  readonly tool: { chipsWhileWaiting: boolean; passOk: boolean; passMessage: string; teoWorked: boolean; askerWaitingLine: string; notesOnColleagueTask: number; helpOk: boolean; helpMessage: string; caioHelped: boolean; deliveredLines: number; resumedLines: number; resumedInStore: number }
  readonly opinion: { state: string; threadKinds: string[]; marks: string[]; consolidated: boolean; versionAfter: string; imageTurnPersonas: string[]; imageOk: boolean; attachmentOnRequest: boolean; noVision: string[] }
  readonly review: { requested: number; returned: number; reviewed: number; sealedBy: string[]; verdictWordsInThread: boolean; failLines: number }
  readonly team: { handoffEvent: boolean; chainPath: boolean; boardHandoffChips: boolean; dailyBriefEvent: boolean; briefView: Record<string, unknown> | null; briefBody: string; briefTurns: number }
  readonly idle: { cardsAfter3Days: number; cardPersona: string; cardQuestion: string; waitingForPerson: number; waitingOutcome: string; waitingLine: string }
  readonly reading: { shown: number; hiddenLines: string[]; stateLinesLeft: string[]; stateLinesUntyped: string[]; technicalLeft: string[]; reviewSkipped: number }
  readonly official: { lines: number; leaks: string[]; authors: string[]; realCliTurns: number; scriptedRows: number; attachments: string[] }
  readonly noise: { stateLines: number; delivered: number; concluded: string[]; personasBefore: number; personasAfter: number; needsYouAtBrief: number; askedByPerson: number; briefTitlesCut: string[]; sceneHeadings: string[]; deliveryCards: string[][] }
}
interface Probes {
  readonly mentions: { ackFirst: string[]; executors: string[]; stages: string[]; said: Record<string, string[]> }
  readonly longRequest: { sent: string; purpose: string; prompt: string; toolNames: string[]; titleLength: number; assignment: string }
  readonly planHire: { hire: string[]; workflowId: string; sprintName: string; personasBeforeApprove: number; personasAfterApprove: number; initiativeRoutinesForHired: number }
  readonly plan: { hire: string[]; reuse: string[]; workflowId: string; sprintName: string; personasBeforeApprove: number; personasAfterApprove: number; ticketsCreated: number; initiativeRoutinesForHired: number }
  readonly personaMessage: { postAccepted: boolean; woke: boolean }
  readonly deliveryHandoff: { teoWorked: boolean; lines: string[] }
  readonly routine: { arrived: boolean; internalAuthorVisible: boolean; ownerReplied: boolean; routineText: string; questionStillOpen: boolean; absorbedLine: boolean; debug?: unknown }
  readonly personFanout: { attachmentBound: boolean; repliers: string[]; everyoneAnswered: boolean }
  readonly reviewNoVerdict: { failLines: number; requestLines: number; needsYou: number; reviewTasks: number; askedByPerson: number }
  readonly concluded: { lines: string[] }
}

let day: Day
let probes: Probes

describe('Um dia da equipe (host real, runner roteirizado, 0 IA)', () => {
  // ═════════════════════════════ O DIA LIMPO ═════════════════════════════
  vitestIt('[EQUIPE-REAL] o dia limpo roda de ponta a ponta e grava o transcrito (quem fez o que, em que ordem, quem acordou quem)', async () => {
    mkdirSync(OUT, { recursive: true })
    const clock = { ms: T0 }
    const nowIso = (): string => new Date(clock.ms).toISOString()
    const h = openJourneyFile(nowIso()) // file SQLite: the same transcript reader as the REAL round (Probe, TEAM-10) reads a copy of it
    h.orchestration.now = nowIso
    if (byHand()) h.teamworkEnabled = true // Config.teamwork (OFF by default until FLAGS-ON-1): the day is rehearsed with the switch ON
    h.timezoneOffsetMinutes = () => -180 // the person's local time (UTC-3): "Bom dia" goes out at the first app opening after 6:00 local, once a day
    seedJourney(h, TEAM)
    const lines: Line[] = []
    const seen = new Set<string>()
    const stage = (scene: string): void => record(lines, scene, nowIso(), thread(h), seen)
    const flush = async (): Promise<void> => { await h.orchestration.flush(SCOPE.projectId) }
    const personasBefore = h.listPersonas(SCOPE).length
    const retire = (id: string): void => {
      const ticket = ticketsOf(h).find(row => row.id === id)
      if (ticket !== undefined) h.orchestration.runtime('pp').repo.tickets.save({ ...ticket, ended: { at: nowIso(), by: 'human', outcome: 'completed' } })
    }

    // ── 1 · 08:30 · a pessoa pede a campanha (UM pedido, sem dizer quem faz). A revisão da Coordenação está ligada (padrão do projeto) e o
    //    veredito dela é roteirizado: o texto do runner roteirizado só vale como veredito se começa com APROVADO / AJUSTES (Tally/Forge).
    queueText(h, [
      'Texto da campanha pronto.', 'Arte da campanha pronta.', 'Posts da campanha prontos.', // the 3 authors, in the order their runs end
      'AJUSTES\n- faltou o nome do produto no texto', 'APROVADO\nTudo certo.', 'APROVADO\nTudo certo.', // the Coordenação's verdicts on Bia (returned), Teo, Caio
      'Ajustei o nome do produto no texto.', 'APROVADO\nAgora sim.', // Bia adjusts; the second pass approves
    ])
    postAsAna(h, 'c1', REQUEST, nowIso())
    for (let pass = 0; pass < 12; pass += 1) await flush()
    queueText(h, [])
    // From here the day is about the hand-overs, the help and the opinion: the review goes off so it does not add a verdict to each of them.
    h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
    stage('1 · o pedido')
    const parts = ticketsOf(h).filter(ticket => !ticket.title.startsWith('Revisar:'))
    const ask = {
      executors: parts.map(ticket => ticket.execution?.name ?? '?').sort(),
      ticketCount: parts.length,
      splitAnnounced: thread(h).some(row => row.actorId === 'lia' && /Dividi (o pedido por função|assim)/u.test(row.body)),
      splitRefused: thread(h).filter(row => /recusada pela ACL/u.test(row.body)).length,
      titles: parts.map(ticket => ticket.title),
    }
    const askedByPerson = ask.ticketCount

    // ── 2 · 09:30 · a Bia, no meio da tarefa dela, PASSA o trabalho ao Teo (a ferramenta "pedir a um colega": bilhete + a Tarefa dela espera)
    clock.ms += 60 * 60_000
    const writing = runningTicket('texto-final', 'Texto final dos 3 posts da campanha', 'Bia', 'c1', nowIso())
    h.orchestration.runtime('pp').repo.tickets.save(writing)
    const beforeTool = new Set(ticketsOf(h).map(ticket => ticket.id))
    const pass = h.handoffs.ask({
      projectId: 'pp', fromTicketId: writing.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte dos 3 posts da campanha', kind: 'next', callId: 'bia-teo-1',
      note: { done: ['Texto dos 3 posts aprovado'], needed: ['Uma arte por post, formato quadrado'], files: ['campanha/texto-posts.md'], decisions: ['Tom leve e direto', 'Sem preço no texto'] },
    })
    await flush()
    stage('2 · Bia passa o trabalho ao Teo')
    const teoTicket = ticketsOf(h).find(ticket => !beforeTool.has(ticket.id) && ticket.execution?.name === 'Teo')
    const notes = teoTicket === undefined ? 0 : h.handoffs.notesOf('pp', teoTicket.id).length

    // ── 3 · 09:45 · o Teo, sem a paleta, PEDE AJUDA ao Caio (o colega ajuda e devolve)
    clock.ms += 15 * 60_000
    // In progress and WAITING for the colleague (the state the ask tool leaves the asker in): only such a Task is woken by the delivery.
    const arteBase = runningTicket('arte-wip', 'Arte final dos posts da campanha', 'Teo', 'c1', nowIso())
    const arteWip: Ticket = { ...arteBase, assignments: arteBase.assignments.map(assignment => ({ ...assignment, report: { state: 'waiting' as const, summary: 'Esperando a paleta e os formatos do Caio', at: nowIso() } })) }
    h.orchestration.runtime('pp').repo.tickets.save(arteWip)
    const help = h.handoffs.ask({
      projectId: 'pp', fromTicketId: arteWip.id, fromPersonaId: 'teo', toPersonaId: 'caio', title: 'Paleta e formatos de cada rede', kind: 'help', callId: 'teo-caio-1',
      note: { done: ['Layout dos 3 posts desenhado'], needed: ['Paleta da marca', 'Tamanho de imagem de cada rede'], files: ['campanha/arte/rascunho.png'], decisions: [] },
    })
    const beforeHelp = thread(h).length
    // The asker WAITS only for a HELP request (a "next" passes the work on): the wait line and the board chips are measured here.
    const askerWaitingLine = h.handoffs.waitingLine('pp', arteWip.id) ?? ''
    const chipCards = h.getProjectBoard(SCOPE).cards as unknown as Loose[]
    const roleOf = (card: Loose): unknown => (typeof card.handoff === 'object' && card.handoff !== null ? (card.handoff as Loose).role : undefined)
    const chipsWhileWaiting = chipCards.some(card => roleOf(card) === 'waiting') && chipCards.some(card => roleOf(card) === 'asked')
    await flush()
    await flush() // the delivery wakes Teo: his second run queues behind the first and must end before the next scene reads the runner
    stage('3 · Teo pede ajuda ao Caio')
    retire('texto-final')
    retire('arte-wip')

    // ── 4 · 10:00 · o Teo mostra o cartaz e PEDE A OPINIÃO do time (a pessoa não precisa pedir; as personas veem a imagem)
    clock.ms += 15 * 60_000
    const poster = h.attachFile({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', name: 'cartaz-campanha.png', bytesBase64: buildPosterPng().toString('base64') })
    h.orchestration.runtime('pp').repo.tickets.save(runningTicket('arte-cartaz', 'Arte do cartaz da campanha', 'Teo', 'c1', nowIso()))
    queueText(h, ['[gostei] O círculo vermelho chama a atenção.', '[sugestão] Aumentar o texto da faixa amarela.', '[atenção] A faixa amarela some no tema escuro.', 'Vou aumentar o texto e testar no escuro.\nNOVA VERSÃO: Cartaz com faixa maior e contorno no escuro'])
    const result = await h.opinions.run({
      projectId: 'pp', ticketId: 'arte-cartaz', requestId: 'opiniao-cartaz-1', askerId: 'teo',
      question: 'O que acham deste cartaz da campanha? Dá para melhorar?',
      draft: { text: 'Cartaz: círculo vermelho, fundo azul, faixa amarela embaixo.', attachmentIds: [poster.id], alt: POSTER_ALT },
      readerIds: ['bia', 'caio', 'lia'], round: 1, maxRounds: 2, audience: 'team',
    })
    queueText(h, [])
    stage('4 · Teo pede a opinião do time sobre o cartaz')
    retire('arte-cartaz')
    const imageTurns = h.orchestration.imageTurns
    const opinionRows = thread(h) as unknown as { opinion?: { kind?: string; attachmentIds?: string[] } }[]
    const opinion = {
      state: result.state,
      threadKinds: opinionRows.flatMap(row => (row.opinion?.kind === undefined ? [] : [row.opinion.kind])),
      marks: result.replies.map(reply => `${reply.name}:${reply.mark}`).sort(),
      consolidated: result.consolidation !== undefined && result.consolidation !== '',
      versionAfter: result.version?.after.text ?? '',
      imageTurnPersonas: [...new Set(imageTurns.map(turn => turn.personaId))].sort(),
      imageOk: imageTurns.length > 0 && imageTurns.every(turn => turn.images.length === 1 && turn.images[0]?.mediaType === 'image/png' && turn.images[0].path !== ''),
      attachmentOnRequest: opinionRows.some(row => row.opinion?.kind === 'request' && (row.opinion.attachmentIds ?? []).includes(poster.id)),
      noVision: [...result.noVision],
    }

    // ── 5 · 10:45 · no fim do dia a PESSOA dá as três partes do pedido por concluídas. A Coordenação fecha o pedido UMA vez (as partes por
    //    função esperam as irmãs): uma só linha "Concluído: …" com cada título uma vez. É o que o "Bom dia" de amanhã chama de "Ontem".
    clock.ms = Date.parse('2026-11-04T10:45:00.000Z')
    for (const part of ticketsOf(h).filter(ticket => /^(Texto|Arte|Posts) da campanha de lançamento/u.test(ticket.title) && ticket.ended === undefined)) {
      h.runTicketCommand({ workspaceId: 'ws', projectId: 'pp', ticketId: part.id, command: 'complete', reason: 'Aprovado pela Ana' })
    }
    await flush()
    stage('5 · Ana conclui o texto')

    // ── 6 · dia seguinte, 06:05 locais · a pessoa abre o app: o "Bom dia" do host (TEAM-7), SEM IA
    clock.ms = Date.parse('2026-11-05T09:05:00.000Z')
    const ledgerCount = (): number => (h.store.db.prepare('SELECT COUNT(*) AS n FROM turn_ledger').get() as { n: number }).n
    const ledgerBeforeBrief = ledgerCount()
    h.morningBrief.check('pp', 'app-open')
    const briefTurns = ledgerCount() - ledgerBeforeBrief
    stage('6 · Bom dia (o app abre às 06:05 locais)')
    const briefRow = (thread(h) as unknown as { body: string; dailyBrief?: Loose }[]).find(row => row.dailyBrief !== undefined)
    const briefView = briefRow?.dailyBrief ?? null
    const briefBody = briefRow?.body ?? ''

    // ── 7 · três dias depois · uma persona travada numa pergunta propõe sozinha
    const waitingForPerson = h.listTasks(SCOPE).filter(task => task.stage === 'review').length
    h.orchestration.runtime('pp').repo.tickets.save(runningTicket('tarefa-paleta', 'Paleta da marca para a arte', 'Teo', 'c1', nowIso(), 'Qual a paleta da marca?'))
    const routines = new RoutineRepos(h.store, nowIso)
    const proactivity = new ProactivityHost(h.product, routines, new ProactivityRepos(h.store, nowIso), h.orchestration, nowIso)
    proactivity.ensureAllInitiativeRoutines('pp')
    const scheduler = createProactivityScheduler({
      product: h.product, events: h.events, routines, proactivity, screens: h.screens.screens, orchestration: h.orchestration,
      boards: h.boards, teamState: new TeamStateBook(h.screens.screens, routines, nowIso), governance: h.governance,
      draftFiles: h.draftFiles, workingControl: h.workingControl, taskProposals: h.taskProposals,
    }, { nowMs: () => clock.ms, cycleMs: 0 })
    clock.ms += 3 * DAY
    await scheduler.cycle()
    await scheduler.whenIdle() // no orchestration.flush here: it would answer the injected question on its own and hide the proposal
    const waitingOutcome = h.personWaiting.check('pp')
    stage('7 · três dias depois')
    const proposals = h.listTaskProposals(SCOPE)
    const idle = { cardsAfter3Days: proposals.length, cardPersona: proposals[0]?.personaName ?? '', cardQuestion: proposals[0]?.question ?? '', waitingForPerson, waitingOutcome, waitingLine: thread(h).find(row => /espera a sua revisão|esperam a sua revisão/u.test(row.body))?.body ?? '' }

    // ── o transcrito OFICIAL: uma CÓPIA do banco do dia lida pelo mesmo código da rodada real
    h.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const dbFile = (h.store.db.prepare('PRAGMA database_list').all() as { name: string; file: string }[]).find(row => row.name === 'main')?.file ?? ''
    const scratchHome = mkdtempSync(join(tmpdir(), 'team-day-home-'))
    let official: ReturnType<typeof readTeamTranscript>
    try {
      mkdirSync(join(scratchHome, 'db'))
      copyFileSync(dbFile, join(scratchHome, 'db', 'persona.db'))
      official = readTeamTranscript(scratchHome)
    } finally {
      rmSync(scratchHome, { recursive: true, force: true })
    }
    const asCard = (text: string): string => text
      .replace(/\[\[handoff:[\s\S]*?\}\]\]/gu, '')
      .replace(/\[\[review:[\s\S]*?\}\]\]/gu, '')
      .replace(/\[\[gestor-plan:[^\]]*\]\]/gu, '(cartão do plano: Aprovar / Ajustar / Agora não)')
      .replace(/\[\[task-proposal:[\s\S]*?\}\]\]/gu, '(cartão da proposta: Aceitar / Agora não)')
    const officialLines = (official?.lines ?? []).map((line) => { const text = asCard(line.text); return { ...line, text, leaks: leaksIn(text) } })
    const officialLeaks = officialLines.flatMap(line => line.leaks.map(leak => `${line.id}: ${leak}`))
    const REAL_CLIS = ['claude', 'codex', 'opencode', 'cursor-agent']
    const realRows = (official?.ledger?.rawRows ?? []).filter(row => REAL_CLIS.includes(String(row.engine)))
    if (official !== undefined) {
      const cleaned = { ...official, lines: officialLines, leaks: officialLeaks }
      const note = '> Os "turnos" da seção de chamadas pagas abaixo são do RUNNER ROTEIRIZADO deste ensaio (motor `dsh`, 1 token de entrada e 1 de saída): nenhuma chamada a CLI real, nenhum gasto.'
      writeFileSync(join(OUT, 'transcript-oficial.md'), renderTranscriptMarkdown(cleaned, 'Um dia da equipe — transcrito oficial (host real, runner roteirizado, 0 IA)').replace('## Chamadas pagas', `${note}\n\n## Chamadas pagas`))
    }

    // ── o que a pessoa ESPERA ver e mede o ruído (guardas)
    const lineTexts = lines.map(line => line.text)
    const delivered = lineTexts.filter(text => /entregou para|ajudou/u.test(text)).length
    const noise = {
      stateLines: lineTexts.filter(text => /^(Em andamento|Esperando|Pronto)\b/u.test(text)).length,
      delivered,
      concluded: lineTexts.filter(text => text.startsWith('Concluído')),
      personasBefore,
      personasAfter: h.listPersonas(SCOPE).length,
      needsYouAtBrief: Number((briefView?.needsYou as Loose | undefined)?.count ?? -1),
      askedByPerson,
      // The "Bom dia" names Tasks by title: a title is whole (as the Task has it) or it ends with an ellipsis; never cut inside a word.
      briefTitlesCut: [...((briefView?.yesterday as { title?: string }[] | undefined) ?? []), ...((briefView?.today as { title?: string }[] | undefined) ?? [])]
        .map(item => item.title ?? '')
        .filter(title => !ticketsOf(h).some(ticket => ticket.title === title) && !title.includes('…') && !/\([^)]+\)$/u.test(title)),
      sceneHeadings: [...new Set(lines.map(line => line.scene))],
      // the delivery of a request is ONE typed card with every part named once (typed `deliveryCard`, not text)
      deliveryCards: (thread(h) as unknown as { deliveryCard?: { parts?: { title?: string }[] } }[]).filter(row => row.deliveryCard !== undefined).map(row => (row.deliveryCard?.parts ?? []).map(part => part.title ?? '')),
    }
    const reviewRows = thread(h) as unknown as { body: string; handoff?: { purpose?: string; status?: string }; review?: { kind?: string; reviewerPersonaId?: string } }[]
    const reviewState = {
      requested: reviewRows.filter(row => row.handoff?.purpose === 'review' && row.handoff.status === 'asked').length,
      returned: reviewRows.filter(row => row.review?.kind === 'returned').length,
      reviewed: reviewRows.filter(row => row.review?.kind === 'reviewed').length,
      sealedBy: [...new Set(reviewRows.flatMap(row => (row.review?.kind === 'reviewed' && row.review.reviewerPersonaId !== undefined ? [row.review.reviewerPersonaId] : [])))],
      verdictWordsInThread: reviewRows.some(row => /Tudo certo\.|Agora sim\./u.test(row.body)),
      failLines: reviewRows.filter(row => /não conseguiu revisar/u.test(row.body)).length,
    }
    const events = thread(h) as unknown as Loose[]
    const field = (row: Loose, name: string): Loose | undefined => (typeof row[name] === 'object' && row[name] !== null ? row[name] as Loose : undefined)
    const taskViews = h.listTasks(SCOPE) as unknown as Loose[]
    const team = {
      handoffEvent: events.some(row => field(row, 'handoff')?.status === 'asked'),
      chainPath: taskViews.some(task => Array.isArray(task.path) && task.path.length >= 2),
      boardHandoffChips: chipsWhileWaiting,
      dailyBriefEvent: briefView !== null && Array.isArray(briefView.yesterday) && Array.isArray(briefView.today) && typeof briefView.needsYou === 'object',
      briefView,
      briefBody,
      briefTurns,
    }
    const helpLines = thread(h).slice(beforeHelp)
    const tool = {
      chipsWhileWaiting,
      passOk: pass.ok,
      passMessage: !pass.ok ? pass.message : '',
      teoWorked: lines.some(line => line.scene.startsWith('2') && /Teo entregou para Bia/u.test(line.text)),
      askerWaitingLine,
      notesOnColleagueTask: notes,
      helpOk: help?.ok === true,
      helpMessage: help !== undefined && !help.ok ? help.message : '',
      caioHelped: lines.some(line => line.scene.startsWith('3') && line.actor.startsWith('Caio')) || helpLines.some(row => row.actorId === 'caio'),
      deliveredLines: lines.filter(line => /entregou|ajudou/u.test(line.text)).length,
      resumedLines: lines.filter(line => /retomou/u.test(line.text)).length,
      resumedInStore: (thread(h) as unknown as { handoff?: { status?: string } }[]).filter(row => row.handoff?.status === 'resumed').length,
    }
    // ── a LEITURA: o mesmo fio, filtrado pela função pura da tela (Quill, TEAM-R1). O módulo do cliente é carregado em tempo de execução.
    const { analyzeTeamStreamNoise } = (await import(pathToFileURL(join(REPO_ROOT, 'packages', 'persona', 'client-ui-persona', 'src', 'client', 'teamwork', 'team-lines-model.ts')).href)) as {
      analyzeTeamStreamNoise: (rows: readonly Loose[]) => { hiddenIndices: ReadonlySet<number>; reviewSkippedCount: number }
    }
    const finalRows = thread(h) as unknown as Loose[]
    // The same mapping the screen does (GeneralChannelView.teamNoise): typed fields only, never the text.
    const asObject = (value: unknown): Loose | undefined => (typeof value === 'object' && value !== null ? value as Loose : undefined)
    const analysis = analyzeTeamStreamNoise(finalRows.map((row) => {
      const plan = asObject(row.teamPlan)
      const delivery = asObject(row.deliveryCard)
      return {
        authorId: row.actorId, type: row.type, harnessStatus: asObject(row.harness)?.outcome,
        handoff: row.handoff, review: row.review,
        ticketId: row.ticketId, stateLine: row.stateLine,
        hasTeamPlan: plan !== undefined, planRequestId: plan?.requestId,
        hasDeliveryCard: delivery !== undefined, deliveryRequestId: delivery?.requestId,
        deliveryTaskIds: Array.isArray(delivery?.parts) ? (delivery.parts as Loose[]).map(part => part.taskId) : undefined,
        hasTaskCard: typeof row.taskTitle === 'string' && row.taskTitle !== '',
      }
    }))
    const hiddenIds = new Set(finalRows.flatMap((row, index) => (analysis.hiddenIndices.has(index) ? [String(row.id)] : [])))
    const shownLines = lines.filter(line => !hiddenIds.has(line.id))
    const hiddenLines = lines.filter(line => hiddenIds.has(line.id))
    const reading = {
      shown: shownLines.length,
      hiddenLines: hiddenLines.map(line => `${line.actor}: ${line.text}`),
      stateLinesLeft: shownLines.filter(line => /^(Em andamento|Esperando|Pronto)\b/u.test(line.text)).map(line => `${line.actor}: ${line.text}`),
      technicalLeft: shownLines.filter(line => /^[a-z][a-z0-9_-]*:\S+/iu.test(line.actor)).map(line => `${line.actor}: ${line.text}`),
      reviewSkipped: analysis.reviewSkippedCount,
      // a state line ("Em andamento" / "Pronto") the host sends WITHOUT the typed `stateLine` cannot be absorbed by type (contracts/team-real.md §9)
      stateLinesUntyped: finalRows.filter(row => /^(Em andamento|Esperando|Pronto)\b/u.test(String(row.body)) && row.stateLine === undefined && row.deliveryCard === undefined).map(row => String(row.body).slice(0, 80)),
    }
    // Evidência para o dono do estado: como as linhas "Em andamento / Pronto" chegam do host (campos tipados que a tela poderia usar para absorvê-las).
    writeFileSync(join(OUT, 'estado-linhas-brutas.json'), JSON.stringify(finalRows.filter(row => /^(Em andamento|Esperando|Pronto)\b/u.test(String(row.body))).map(row => ({ ...row, body: String(row.body).slice(0, 80) })), null, 2))
    {
      const out: string[] = ['# Um dia da equipe — transcrito de LEITURA (o que a tela mostra)', '',
        'Mesmo fio do dia, com o filtro da própria tela (`analyzeTeamStreamNoise`, Quill): sem autor técnico, sem micro-estados absorvidos pelo cartão do plano, sem revisão interna de 1ª volta. Equipe: Lia (Coordenação), Bia (Redação), Teo (Design), Caio (Mídia). Pessoa: Ana (dona).']
      let heading = ''
      for (const line of shownLines) {
        if (line.scene !== heading) { heading = line.scene; out.push('', `## ${heading} · ${line.at.slice(0, 16).replace('T', ' ')} UTC`, '') }
        // The delivery of a request is a CARD on the screen (typed `deliveryCard`), not the plain text the host also keeps for the channel without the switch.
        const card = field(finalRows.find(row => row.id === line.id) ?? {}, 'deliveryCard')
        const cardParts = Array.isArray(card?.parts) ? card.parts as { personaId?: string; title?: string }[] : []
        const reviewer = field(card ?? {}, 'reviewedBy')
        const cardText = card === undefined ? undefined
          : `[cartão de entrega] ${String(card.title)} — ${cardParts.map(part => `${(NAMES[String(part.personaId)] ?? String(part.personaId)).split(' ')[0] ?? ''}: ${String(part.title)}`).join(' · ')}${reviewer === undefined ? '' : ` · Revisado pela ${String(reviewer.name)}`}`
        out.push(`- **${line.actor}**: ${cardText ?? line.text}`)
      }
      out.push('', `## Ocultas pela tela (${String(hiddenLines.length)} linhas; revisão com falha técnica: ${String(analysis.reviewSkippedCount)})`, '', ...(hiddenLines.length === 0 ? ['(nenhuma)'] : hiddenLines.map(line => `- ~~${line.actor}: ${line.text}~~`)))
      writeFileSync(join(OUT, 'transcript-leitura.md'), `${out.join('\n')}\n`)
    }
    day = {
      lines, ask, tool, opinion, review: reviewState, team, idle, noise, reading,
      official: { lines: officialLines.length, leaks: officialLeaks, authors: [...new Set(officialLines.map(line => line.who))], realCliTurns: realRows.length, scriptedRows: official?.ledger?.turns ?? -1, attachments: officialLines.flatMap(line => line.attachments) },
    }
    writeFileSync(join(OUT, 'transcript.json'), JSON.stringify(day, null, 2))
    const mark = (ok: boolean): string => (ok ? '✅ passa' : '❌ falta')
    const md: string[] = ['# Um dia da equipe — transcrito (host real, runner roteirizado, 0 IA)', '', 'Equipe: Lia (Coordenação), Bia (Redação), Teo (Design), Caio (Mídia). Pessoa: Ana (dona).']
    let scene = ''
    for (const line of lines) {
      if (line.scene !== scene) { scene = line.scene; md.push('', `## ${scene} · ${line.at.slice(0, 16).replace('T', ' ')} UTC`, '') }
      md.push(`- **${line.actor}**: ${line.text}`)
    }
    md.push('', '## Placar: o que já é de equipe real e o que falta (D-090)', '',
      '| # | Comportamento | Hoje |', '|---|---|---|',
      `| 1 | Passar contexto (bilhete) | ${mark(day.team.handoffEvent && day.tool.notesOnColleagueTask > 0)} |`,
      `| 2 | Passar trabalho em cadeia (a dependência acorda a próxima) | ${mark(day.tool.passOk && day.tool.teoWorked && day.tool.deliveredLines >= 1 && day.team.chainPath && day.team.boardHandoffChips)} |`,
      `| 3 | Pedir ajuda a um colega para terminar | ${mark(day.tool.helpOk && day.tool.caioHelped)} |`,
      `| 4 | Pedir opinião ao time todo (texto e imagem) | ${mark(day.opinion.state === 'done' && day.opinion.imageOk && day.opinion.attachmentOnRequest)} |`,
      `| 5 | Revisão entre colegas ("Revisado pela Lia") | ${mark(day.review.reviewed >= 3 && day.review.returned >= 1)} |`,
      `| 6 | Reunião do dia "Bom dia" sem IA | ${mark(day.team.dailyBriefEvent && day.team.briefTurns === 0)} |`)
    writeFileSync(join(OUT, 'transcript.md'), `${md.join('\n')}\n`)
    expect(lines.length).toBeGreaterThan(8)

    // ── o DIA para o app real: um PERSONA_HOME pronto (banco + blobs dos anexos) que a captura do app real abre (real-team-day-app.spec.ts).
    // Um host que sobe RETOMA as Tarefas com execução em andamento (é o produto: o app reaberto continua o trabalho) e isso escreveria linhas
    // novas no #geral do dia. Para a captura mostrar o dia COMO ELE TERMINOU, as Tarefas ainda abertas são encerradas em silêncio só na cópia
    // do fim do dia (depois de toda medição) e o onboarding fica concluído no host (senão o app abre o assistente por cima do dia).
    for (const ticket of ticketsOf(h)) if (ticket.ended === undefined) retire(ticket.id)
    h.screens.screens.put('pp', 'onboarding', 'complete', { completed: true })
    h.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const seedHome = join(OUT, 'home-seed')
    rmSync(seedHome, { recursive: true, force: true })
    mkdirSync(join(seedHome, 'db'), { recursive: true })
    copyFileSync(dbFile, join(seedHome, 'db', 'persona.db'))
    for (const row of h.store.db.prepare('SELECT project_id, hash FROM attachment').all() as { project_id: string; hash: string }[]) {
      mkdirSync(join(seedHome, 'attachments', row.project_id), { recursive: true })
      copyFileSync(join(h.media.root, 'attachments', row.project_id, row.hash), join(seedHome, 'attachments', row.project_id, row.hash))
    }
  }, 120_000)

  // ═════════════════════════════ OS MUNDOS À PARTE (nunca entram no transcrito) ═════════════════════════════
  vitestIt('[EQUIPE-REAL] provas isoladas: @menções, plano que contrata, mensagem de persona, entrega que passa o trabalho, rotina própria, opinião da pessoa, revisão sem veredito e conclusão em duas chamadas', async () => {
    const at = (iso: string): (() => string) => () => iso
    const open = (iso: string, team: typeof TEAM | readonly (typeof TEAM)[number][] = TEAM): Host => {
      const h = openJourneyFile(iso)
      h.orchestration.now = at(iso)
      if (byHand()) h.teamworkEnabled = true
      h.timezoneOffsetMinutes = () => -180
      seedJourney(h, team)
      return h
    }

    // ── M1 · @menções: cada pedido vai à persona citada
    const m = open('2026-11-04T09:00:00.000Z')
    m.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
    for (const [index, body] of ['@Bia escreva o texto da campanha de lançamento', '@Teo crie a arte da campanha de lançamento', '@Caio monte o calendário de posts da campanha de lançamento'].entries()) {
      postAsAna(m, `m${String(index + 1)}`, body, '2026-11-04T09:00:00.000Z')
      await m.orchestration.flush('pp')
    }
    const mentionLines = thread(m).map(row => ({ actor: NAMES[row.actorId] ?? row.actorId, text: human(row.body) }))
    const mentions = {
      ackFirst: mentionLines.slice(0, 3).map(line => line.actor),
      executors: ticketsOf(m).map(ticket => ticket.execution?.name ?? '?').sort(),
      stages: m.listTasks(SCOPE).map(task => task.stage),
      said: Object.fromEntries(['bia', 'teo', 'caio'].map(id => [id, mentionLines.filter(line => line.actor.toLowerCase().startsWith(id)).map(line => line.text.split(':')[0] ?? '')])),
    }

    // ── M2 · o Gestor propõe um plano SEM funções listadas (e a pessoa aprova): é isto que contrata Atendimento/Financeiro/Pessoas
    const p = open('2026-11-04T08:45:00.000Z')
    const pBefore = p.listPersonas(SCOPE).length
    const planView = p.proposeGestorAssemble({ ...SCOPE, gestorId: 'lia', id: 'plan-campanha', goal: 'Monte um time para a campanha de lançamento do produto' })
    const pBeforeApprove = p.listPersonas(SCOPE).length
    const ticketsBeforeApprove = ticketsOf(p).length
    p.approveGestorPlan({ workspaceId: 'ws', planId: 'plan-campanha' })
    await p.orchestration.flush('pp')
    const hiredIds = p.listPersonas(SCOPE).map(row => row.id).filter(id => id.startsWith('hire-plan-campanha'))
    const plan = {
      hire: (planView.preview.hire ?? []).map(row => row.function),
      reuse: (planView.preview.reuse ?? []).map(row => row.function),
      workflowId: planView.preview.workflowId,
      sprintName: planView.preview.sprintName,
      personasBeforeApprove: pBeforeApprove - pBefore,
      personasAfterApprove: p.listPersonas(SCOPE).length - pBefore,
      ticketsCreated: ticketsOf(p).length - ticketsBeforeApprove,
      initiativeRoutinesForHired: p.listRoutines(SCOPE).filter(row => hiredIds.some(id => row.id === `initiative:${id}`)).length,
    }

    // ── M2b · o MESMO pedido num time que só tem a Coordenação: aí o plano contrata de verdade (nada antes de aprovar; cada contratada ganha a rotina)
    const q = open('2026-11-04T08:50:00.000Z', [TEAM[0]])
    const qBefore = q.listPersonas(SCOPE).length
    const qView = q.proposeGestorAssemble({ ...SCOPE, gestorId: 'lia', id: 'plan-campanha', goal: 'Monte um time para a campanha de lançamento do produto' })
    const qBeforeApprove = q.listPersonas(SCOPE).length
    q.approveGestorPlan({ workspaceId: 'ws', planId: 'plan-campanha' })
    await q.orchestration.flush('pp')
    const qHired = q.listPersonas(SCOPE).map(row => row.id).filter(id => id.startsWith('hire-plan-campanha'))
    const planHire = {
      hire: (qView.preview.hire ?? []).map(row => row.function),
      workflowId: qView.preview.workflowId,
      sprintName: qView.preview.sprintName,
      personasBeforeApprove: qBeforeApprove - qBefore,
      personasAfterApprove: q.listPersonas(SCOPE).length - qBefore,
      initiativeRoutinesForHired: q.listRoutines(SCOPE).filter(row => qHired.some(id => row.id === `initiative:${id}`)).length,
    }

    // ── M3 · uma mensagem de persona no #geral não acorda ninguém; já a ENTREGA que abre uma linha "@Teo faça…" passa o trabalho (TEAM-14)
    const w = open('2026-11-04T09:30:00.000Z')
    w.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
    let postAccepted = true
    const wBefore = ticketsOf(w).length
    try {
      w.postMessage({ id: 'bia-diz', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Teo texto pronto, faça a arte dos 3 posts', actorId: 'bia', subjectId: 'bia-diz', occurredAt: '2026-11-04T09:30:00.000Z' })
    } catch { postAccepted = false }
    await w.orchestration.flush('pp')
    const personaMessage = { postAccepted, woke: ticketsOf(w).length > wBefore }
    const d = open('2026-11-04T09:40:00.000Z')
    d.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
    queueText(d, ['Texto dos 3 posts pronto.\n@Teo faça a arte dos 3 posts', 'Arte dos 3 posts pronta.'])
    postAsAna(d, 'd1', '@Bia escreva o texto dos 3 posts da campanha', '2026-11-04T09:40:00.000Z')
    await settleAll(d)
    const deliveryHandoff = {
      teoWorked: thread(d).some(row => row.actorId === 'teo'),
      lines: thread(d).map(row => `${NAMES[row.actorId] ?? row.actorId}: ${FIRST_LINE(human(row.body))}`),
    }

    // ── M4 · uma rotina PRÓPRIA da pessoa ("@Lia Resumo curto…") chega à Coordenação; e NÃO responde à pergunta pendente de outra persona
    const r = open('2026-11-04T09:00:00.000Z')
    const rClock = { ms: Date.parse('2026-11-04T09:00:00.000Z') }
    const rNow = (): string => new Date(rClock.ms).toISOString()
    r.orchestration.now = rNow
    r.createRoutine({ ...SCOPE, id: 'minha-rotina', name: 'Meu resumo', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once', silenceStart: '', silenceEnd: '', prompt: 'Resumo curto da equipe: Ontem / Hoje / Precisa de você.', ownerPersonaId: 'lia' })
    r.orchestration.runtime('pp').repo.tickets.save(runningTicket('pergunta-teo', 'Arte dos 3 posts', 'Teo', 'x1', rNow(), 'Qual a paleta da marca?'))
    rClock.ms = Date.parse('2026-11-05T09:05:00.000Z')
    const rRoutines = new RoutineRepos(r.store, rNow)
    const rProactivity = new ProactivityHost(r.product, rRoutines, new ProactivityRepos(r.store, rNow), r.orchestration, rNow)
    rProactivity.ensureAllInitiativeRoutines('pp')
    const rScheduler = createProactivityScheduler({
      product: r.product, events: r.events, routines: rRoutines, proactivity: rProactivity, screens: r.screens.screens, orchestration: r.orchestration,
      boards: r.boards, teamState: new TeamStateBook(r.screens.screens, rRoutines, rNow), governance: r.governance,
      draftFiles: r.draftFiles, workingControl: r.workingControl, taskProposals: r.taskProposals,
    }, { nowMs: () => rClock.ms, cycleMs: 0 })
    r.scheduleRoutine({ ...SCOPE, id: 'minha-rotina', runId: 'run-1', scheduledFor: '2026-11-05T09:00:00.000Z' })
    await rScheduler.cycle()
    await rScheduler.whenIdle()
    await r.orchestration.flush('pp')
    const rRows = thread(r)
    const routine = {
      arrived: rRows.some(row => row.actorId === 'lia'),
      internalAuthorVisible: rRows.some(row => row.actorId.includes(':')),
      ownerReplied: rRows.some(row => row.actorId === 'lia'),
      routineText: rRows.filter(row => row.actorId === 'lia').map(row => human(row.body)).join(' | '),
      questionStillOpen: ticketsOf(r).find(ticket => ticket.id === 'pergunta-teo')?.attention !== undefined,
      absorbedLine: rRows.some(row => /Resposta enviada para Teo/u.test(row.body)),
    }

    // ── M5 · a PESSOA anexa o cartaz e pede a opinião do time todo (CV-8, a flag fanout ligada só aqui)
    const f = open('2026-11-04T10:15:00.000Z')
    if (byHand()) f.orchestration.fanoutEnabled = true
    const draft = f.attachFile({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', name: 'cartaz-campanha.png', bytesBase64: buildPosterPng().toString('base64') })
    f.postMessage({ id: 'c5', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'Pessoal, o que acham deste rascunho da arte da campanha?', actorId: 'ana', subjectId: 'c5', occurredAt: '2026-11-04T10:15:00.000Z', attachmentIds: [draft.id], fanout: 'everyone' })
    await f.orchestration.flush('pp')
    const answered = thread(f).filter(row => row.id !== 'c5' && row.actorId !== 'ana').map(row => row.actorId)
    const personFanout = {
      attachmentBound: f.listAttachments({ ...SCOPE, messageId: 'c5', streamKind: 'channel', ownerId: 'geral' }).some(item => item.name === 'cartaz-campanha.png'),
      repliers: [...new Set(answered)].sort(),
      everyoneAnswered: ['bia', 'caio', 'lia', 'teo'].every(id => answered.includes(id)),
    }

    // ── M6 · a revisão ligada SEM veredito roteirizado (o texto padrão do runner roteirizado não é "APROVADO"): quantas linhas de falha saem?
    const v = open('2026-11-04T11:00:00.000Z')
    for (const [index, body] of ['@Bia escreva o texto da campanha', '@Teo crie a arte da campanha', '@Caio monte os posts da campanha'].entries()) {
      postAsAna(v, `v${String(index + 1)}`, body, '2026-11-04T11:00:00.000Z')
      await settleAll(v)
    }
    const vRows = thread(v)
    v.orchestration.now = () => '2026-11-05T09:05:00.000Z'
    v.morningBrief.check('pp', 'app-open')
    const vBrief = (thread(v) as unknown as { dailyBrief?: Loose }[]).find(row => row.dailyBrief !== undefined)?.dailyBrief
    const reviewNoVerdict = {
      failLines: vRows.filter(row => /não conseguiu revisar/u.test(row.body)).length,
      requestLines: vRows.filter(row => row.body.includes('[[handoff:') && /pediu a revisão/u.test(row.body)).length,
      needsYou: Number((vBrief?.needsYou as Loose | undefined)?.count ?? -1),
      reviewTasks: ticketsOf(v).filter(ticket => ticket.title.startsWith('Revisar:')).length,
      askedByPerson: ticketsOf(v).filter(ticket => !ticket.title.startsWith('Revisar:')).length,
    }

    // ── M7 · a pessoa conclui DUAS Tarefas, uma chamada para cada: a 2ª linha não pode repetir o título da 1ª
    const c = open('2026-11-04T12:00:00.000Z')
    c.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
    postAsAna(c, 'k1', '@Bia escreva o texto da campanha de lançamento', '2026-11-04T12:00:00.000Z')
    await c.orchestration.flush('pp')
    postAsAna(c, 'k2', '@Teo crie a arte da campanha de lançamento', '2026-11-04T12:00:00.000Z')
    await c.orchestration.flush('pp')
    for (const ticket of ticketsOf(c)) c.runTicketCommand({ workspaceId: 'ws', projectId: 'pp', ticketId: ticket.id, command: 'complete', reason: 'Aprovado' })
    await c.orchestration.flush('pp')
    const concluded = { lines: thread(c).filter(row => row.body.startsWith('Concluído')).map(row => human(row.body)) }

    const LONG_REQUEST = 'Faz um cartaz da promoção da Padaria Lua com esta foto, quero algo bonito para o Instagram, com o preço do pão de queijo em destaque e o endereço da loja embaixo'
    const toolsBefore = process.env.PERSONA_PRODUCT_TOOLS
    process.env.PERSONA_PRODUCT_TOOLS = '1' // the product tools are OFF under Vitest unless asked
    let longRequest: Probes['longRequest']
    try {
      const lg = open('2026-11-04T11:00:00.000Z')
      for (const row of TEAM) {
        const persona = lg.product.getPersona(row.id)
        if (persona !== undefined) lg.product.updatePersona({ ...persona, runner: { kind: 'cli', cli: 'claude', model: 'haiku' }, tools: {} }, 'pp')
      }
      lg.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
      postAsAna(lg, 'long1', `@Bia ${LONG_REQUEST}`, '2026-11-04T11:00:00.000Z')
      await lg.orchestration.flush('pp')
      const turn = lg.orchestration.turnInputs.find(row => row.personaId === 'bia')
      const biaTicket = ticketsOf(lg).find(ticket => ticket.execution?.name === 'Bia')
      longRequest = {
        sent: LONG_REQUEST, purpose: turn?.purpose ?? '(nenhum turno registrado)', prompt: turn?.prompt ?? '', toolNames: [...(turn?.toolNames ?? [])].sort(),
        titleLength: biaTicket?.title.length ?? -1, assignment: biaTicket?.execution?.assignment ?? '',
      }
    } finally {
      if (toolsBefore === undefined) delete process.env.PERSONA_PRODUCT_TOOLS; else process.env.PERSONA_PRODUCT_TOOLS = toolsBefore
    }

    probes = { mentions, plan, planHire, longRequest, personaMessage, deliveryHandoff, routine, personFanout, reviewNoVerdict, concluded }
    writeFileSync(join(OUT, 'provas-isoladas.json'), JSON.stringify(probes, null, 2))
    expect(Object.keys(probes)).toHaveLength(10)
  }, 240_000)

  // ═════════════════════════════ O QUE PASSA HOJE (dia limpo) ═════════════════════════════
  vitestIt('[TEAM-9.1 contexto] toda passagem de trabalho leva o BILHETE (pronto / falta / arquivos / decisões): a linha do fio sai ("Bia passou para Teo") e a Tarefa do colega guarda o bilhete', () => {
    expect(day.team.handoffEvent, 'MessageView.handoff status=asked no fio').toBe(true)
    expect(day.tool.notesOnColleagueTask, 'bilhete guardado na Tarefa do colega').toBeGreaterThan(0)
    expect(day.lines.some(line => /Bia passou para Teo/u.test(line.text)), 'a linha humana do fio').toBe(true)
  })

  vitestIt('[TEAM-9.2a cadeia] "Bia escreveu → passou ao Teo → Teo entregou": a ferramenta abre a Tarefa do Teo com a dependência, ele trabalha e a linha "Teo entregou para Bia" sai no fio', () => {
    expect(day.tool.passOk, day.tool.passMessage).toBe(true)
    expect(day.tool.teoWorked, 'o Teo acordou sozinho').toBe(true)
    expect(day.tool.deliveredLines, 'linhas "entregou"').toBeGreaterThanOrEqual(1)
  })

  vitestIt('[TEAM-9.2b cadeia no quadro e no detalhe] a Tarefa de quem pediu fica "esperando" (linha e chip), o quadro mostra "Esperando {B}" / "Pedido por {A}" (BoardCardView.handoff) e a Tarefa guarda o "Caminho do trabalho" (TaskView.path)', () => {
    expect(day.tool.askerWaitingLine, 'a Tarefa de quem pediu espera').not.toBe('')
    expect(day.team.chainPath, 'TaskView.path').toBe(true)
    expect(day.team.boardHandoffChips, 'BoardCardView.handoff: Pedido por / Esperando').toBe(true)
  })

  vitestIt('[TEAM-9.2c retomada] quando o colega entrega, a Tarefa de quem pediu RETOMA: o armazém guarda handoff.status === "resumed" (a tela esconde a linha de propósito; Keel 02:31)', () => {
    expect(day.tool.resumedInStore, 'eventos de passagem com status resumed').toBeGreaterThanOrEqual(1)
  })

  vitestIt('[TEAM-9.3 ajuda] o Teo, sem a paleta, pede ajuda a UM colega específico (o Caio): a ferramenta aceita, o Caio trabalha e entrega de volta ao Teo', () => {
    expect(day.tool.helpOk, day.tool.helpMessage).toBe(true)
    expect(day.tool.caioHelped, 'o Caio respondeu').toBe(true)
    expect(day.lines.some(line => /Caio (entregou para|ajudou) Teo/u.test(line.text)), 'a linha em que o Caio devolve a ajuda ao Teo').toBe(true)
  })

  vitestIt('[TEAM-9.4 opinião+imagem] o Teo pede a opinião do time sobre o cartaz: o pedido leva o anexo, cada colega responde com a sua marca, ele consolida com "Antes · Depois" e as personas RECEBEM a imagem como imagem do turno (png) — SÓ ao time do projeto (3 colegas), não à empresa toda', () => {
    expect(day.opinion.state).toBe('done')
    expect(day.opinion.threadKinds, 'pedido → 3 respostas → consolidação').toEqual(['request', 'reply', 'reply', 'reply', 'consolidated'])
    expect(day.opinion.attachmentOnRequest, 'attachmentIds do cartaz no pedido').toBe(true)
    expect(day.opinion.marks).toEqual(['Bia:liked', 'Caio:suggestion', 'Lia:attention'])
    expect(day.opinion.consolidated).toBe(true)
    expect(day.opinion.versionAfter, 'consolidação versiona o texto').toMatch(/Cartaz com faixa maior/u)
    expect(day.opinion.imageTurnPersonas, 'quem recebeu a imagem').toEqual(['bia', 'caio', 'lia'])
    expect(day.opinion.imageOk, 'imagem png entregue ao turno').toBe(true)
    expect(day.opinion.noVision).toEqual([])
  })

  vitestIt('[TEAM-9.5 revisão] antes de entregar à pessoa cada parte passa pela Coordenação: a Lia APROVA (selo "Revisado") e numa das entregas DEVOLVE com um ponto ("AJUSTES"), a autora ajusta e a 2ª passada aprova; o veredito dela não vira mensagem e não há linha de falha', () => {
    expect(day.review.returned, 'uma devolução com ponto em aberto').toBeGreaterThanOrEqual(1)
    expect(day.review.reviewed, 'selos "Revisado"').toBeGreaterThanOrEqual(3)
    expect(day.review.sealedBy).toEqual(['lia'])
    expect(day.review.verdictWordsInThread, 'as palavras do veredito não são mensagem').toBe(false)
    expect(day.review.failLines, 'nenhuma "não conseguiu revisar"').toBe(0)
  })

  vitestIt('[TEAM-9.6 reunião] o "Bom dia" sai no #geral na 1ª abertura do dia depois das 6h locais, SEM IA: um cartão da Coordenação com Ontem / Hoje / Precisa de você montado pelo host, e ZERO turnos de modelo no ledger', () => {
    expect(day.team.dailyBriefEvent, 'MessageView.dailyBrief no fio').toBe(true)
    const brief = day.team.briefView as { yesterday: unknown[]; today: unknown[]; needsYou: { count: number }; paused: boolean; routineId: string }
    expect(brief.yesterday.length, 'Ontem: o que a pessoa concluiu no dia 1').toBeGreaterThanOrEqual(1)
    expect(brief.paused).toBe(false)
    expect(brief.routineId, 'a rotina da equipe que a pessoa só pausa').toMatch(/^morning-brief:/u)
    expect(day.team.briefBody).toMatch(/^Bom dia/u)
    expect(day.team.briefBody, 'nenhum prompt interno nem bilhete no cartão').not.toMatch(/bilhete|assignment|prompt/iu)
    expect(day.team.briefTurns, 'turnos de modelo gastos pelo Bom dia (turn_ledger antes/depois)').toBe(0)
  })

  vitestIt('[EQ-1b/1c · TEAM-13] um pedido composto ("texto, arte e posts") sem @menção: a Coordenação anuncia a divisão POR FUNÇÃO e as 3 partes viram 3 Tarefas, uma por persona da função, nenhuma recusada pela ACL', () => {
    expect(day.ask.splitAnnounced, 'a linha em que a Coordenação divide o pedido ("Dividi assim: …")').toBe(true)
    expect(day.ask.splitRefused, 'partes recusadas pela ACL').toBe(0)
    expect(day.ask.executors).toEqual(['Bia', 'Caio', 'Teo'])
    expect(day.ask.ticketCount).toBe(3)
  })

  vitestIt('[EQ-5] uma persona travada numa pergunta propõe sozinha (UM cartão "Proposta de Teo" no #geral), sem criar Tarefa por conta própria', () => {
    expect(day.idle.cardsAfter3Days).toBeGreaterThanOrEqual(1)
    expect(day.idle.cardPersona).toBe('Teo')
    expect(day.idle.cardQuestion).toMatch(/Paleta da marca/u)
  })

  vitestIt('[EQ-17 · LEAK-1] o transcrito OFICIAL (o mesmo leitor da rodada real) não traz prompt interno nem marcador cru, não traz nenhuma chamada a CLI real (só o runner roteirizado, motor dsh) e guarda o cartaz anexado', () => {
    expect(day.official.lines, 'o leitor oficial leu o banco do dia').toBeGreaterThan(8)
    expect(day.official.leaks, 'vazamento de prompt interno / marcador cru no que a pessoa vê').toEqual([])
    expect(day.official.realCliTurns, 'nenhuma linha do ledger é de CLI real (claude/codex/opencode/cursor-agent): nada foi gasto').toBe(0)
  })

  vitestIt('[TEAM-4 anexo no banco] a linha do pedido de opinião da PERSONA fica ligada ao anexo no banco: o transcrito oficial mostra 📎 cartaz-campanha.png (antes o anexo só ia no campo opinion.attachmentIds e a tabela attachment ficava sem message_id)', () => {
    expect(day.official.attachments).toContain('cartaz-campanha.png')
  })

  // ═════════════════════════════ AS GUARDAS DO "LÊ COMO EQUIPE" (review do Atlas, 05/11 00:05, TEAM-R1..R9) ═════════════════════════════
  vitestIt('[TEAM-R10 conclusão] a conclusão do pedido é UM cartão de entrega com as 3 partes (cada uma uma vez) e NENHUMA linha "Concluído: …" repetindo o cartão: a Ana conclui as 3 partes e o fio não ganha uma frase a mais (Anvil 03:27, TeamCards.replaced)', () => {
    expect(day.noise.concluded, 'linhas "Concluído:" depois do cartão de entrega').toEqual([])
    expect(day.noise.deliveryCards, 'um só cartão de entrega').toHaveLength(1)
    const parts = day.noise.deliveryCards[0] ?? []
    expect(parts.length, `partes no cartão: ${parts.join(' | ')}`).toBe(3)
    expect(new Set(parts).size, 'cada parte uma vez').toBe(3)
    expect(parts.map(title => title.split(' ')[0]).sort()).toEqual(['Arte', 'Posts', 'Texto'])
  })

  vitestIt('[TEAM-R11 títulos no Bom dia] os títulos que o "Bom dia" cita saem INTEIROS ou terminam em reticências: nenhum corte no meio da palavra (ex. "…nosso produt")', () => {
    expect(day.noise.briefTitlesCut, 'títulos cortados').toEqual([])
    expect(day.team.briefBody, 'o cartão não termina no meio de uma palavra').toMatch(/[.!]$/u)
  })

  vitestIt('[TEAM-R12 Ontem] o "Bom dia" agrupa as partes de um pedido, mas o título do item é um NOME do trabalho ("Campanha de lançamento (Texto, Arte e Posts)"), não a frase da própria pessoa cortada ("Lia terminou Preciso de uma campanha de lançamento do nosso…")', () => {
    const yesterday = (day.team.briefView?.yesterday as { title?: string }[] | undefined) ?? []
    expect(yesterday.map(item => item.title ?? '').filter(title => /^(Preciso|Quero|Faça|Crie)\b/iu.test(title)), 'títulos que são a frase da pessoa').toEqual([])
  })

  vitestIt.skipIf(byHand())('[FLAGS-ON-1 host · TEAM-15 Anvil] um host recém-aberto, SEM Config.teamwork nem PERSONA_TEAMWORK, já nasce com a equipe ligada (e o fan-out): o app do Miguel vem com a v1.1 inteira ligada, opt-out explícito (modo GAUGE_FLAGS_DEFAULT=1)', () => {
    const fresh = openJourneyFile('2026-11-04T08:00:00.000Z')
    expect(fresh.teamworkEnabled, 'host.teamworkEnabled por padrão').toBe(true)
    expect(fresh.orchestration.fanoutEnabled, 'host.orchestration.fanoutEnabled por padrão').toBe(true)
  })

  vitestIt('[TEAM-R9] o dia NÃO contrata ninguém no meio da campanha sem ninguém pedir (a equipe é a mesma de manhã à noite)', () => {
    expect(day.noise.personasAfter).toBe(day.noise.personasBefore)
  })

  vitestIt('[TEAM-R8] "Pedir opinião ao time" vai ao time do projeto, não à empresa toda: 3 colegas receberam o cartaz, ninguém de fora', () => {
    expect(day.opinion.imageTurnPersonas).toEqual(['bia', 'caio', 'lia'])
  })

  vitestIt('[TEAM-R4 autores] nenhum autor visível com ":" (id interno) no fio e no transcrito oficial: o leitor pula os autores técnicos ("team:split", "routine:…") como a tela (Keel 01:34); o host já não devolve autor com ":" (P0-10 / LEAK-1)', () => {
    expect(day.official.authors.filter(author => author.includes(':')), 'autores com id interno').toEqual([])
  })

  vitestIt('[TEAM-R1a tipo] toda linha de estado do host ("Em andamento", "Esperando", "Pronto") chega com MessageView.stateLine {kind, ticketId} (Bolt 01:14, contracts/team-real.md §9): a tela absorve pelo TIPO, nunca pelo texto', () => {
    expect(day.reading.stateLinesUntyped, 'linhas de estado sem stateLine').toEqual([])
  })

  vitestIt('[TEAM-R1b leitura] no transcrito de LEITURA (o fio com o filtro da tela) nenhuma Tarefa tem as DUAS linhas "Em andamento: X" e "Pronto: X": o estado de cada Tarefa é um só (o cartão vivo do plano), não um par de linhas', () => {
    const titles = day.reading.stateLinesLeft.map(line => line.replace(/^[^:]+:\s*(Em andamento|Esperando|Pronto):\s*/u, ''))
    const repeated = [...new Set(titles.filter(title => titles.filter(other => other === title).length > 1))]
    expect(repeated, `Tarefas com mais de uma linha de estado na leitura: ${repeated.join(' | ')}`).toEqual([])
  })

  vitestIt('[TEAM-R3 títulos] cada parte tem um título CURTO e humano ("Texto da campanha de lançamento"): hoje o título é o pedido cru cortado a 80 caracteres no meio da palavra ("…texto, arte e pos")', () => {
    for (const title of day.ask.titles) {
      expect(title.length, title).toBeLessThanOrEqual(60)
      expect(title, 'o pedido cru não é título').not.toContain('preciso de uma campanha')
    }
  })

  vitestIt('[TEAM-R7a "Precisa de você" no dia limpo] a contagem do "Bom dia" é só o que espera a PESSOA: no máximo as Tarefas que ela pediu (3 partes)', () => {
    expect(day.noise.needsYouAtBrief, 'needsYou.count').toBeLessThanOrEqual(day.noise.askedByPerson)
  })

  vitestIt('[TEAM-R7b "Precisa de você" com a revisão ligada] as Tarefas internas "Revisar: …" da Coordenação NÃO contam como coisas que esperam a pessoa: no máximo os pedidos dela', () => {
    expect(probes.reviewNoVerdict.needsYou, `needsYou=${String(probes.reviewNoVerdict.needsYou)} com ${String(probes.reviewNoVerdict.askedByPerson)} pedidos e ${String(probes.reviewNoVerdict.reviewTasks)} Tarefas de revisão`).toBeLessThanOrEqual(probes.reviewNoVerdict.askedByPerson)
  })

  vitestIt('[TEAM-R6 concluído] concluir duas Tarefas não repete o título da primeira na linha seguinte', () => {
    const titles = probes.concluded.lines.flatMap(line => line.replace(/^Concluído:\s*/u, '').replace(/\.$/u, '').split(';').map(part => part.trim()))
    expect(new Set(titles).size, `linhas: ${probes.concluded.lines.join(' | ')}`).toBe(titles.length)
  })

  vitestIt('[TEAM-R2 revisão] com a revisão ligada e um revisor sem veredito, a falha sai como UMA linha agrupada e honesta (não uma por Tarefa): hoje "Lia não conseguiu revisar …" repete por Tarefa (no roteirizado o padrão deveria ser APROVADO — Forge)', () => {
    expect(probes.reviewNoVerdict.failLines, 'linhas "não conseguiu revisar"').toBeLessThanOrEqual(1)
  })

  // ═════════════════════════════ PROVAS ISOLADAS (os mundos à parte) ═════════════════════════════
  vitestIt('[EQ-1] com @menção a Coordenação recebe o pedido, diz quem assume e a pessoa é chamada na revisão (Ana → Lia → executor)', () => {
    expect(probes.mentions.ackFirst).toEqual(['Ana (você)', 'Lia · Coordenação', 'Bia · Redação'])
  })

  vitestIt('[EQ-2] com @menção cada pedido vai à persona citada: 3 Tarefas, 3 personas diferentes, cada uma com a sua linha "Em andamento"', () => {
    expect(probes.mentions.executors).toEqual(['Bia', 'Caio', 'Teo'])
    for (const id of ['bia', 'teo', 'caio']) expect(probes.mentions.said[id]?.[0], id).toBe('Em andamento')
  })

  vitestIt('[EQ-3] o Gestor propõe e NADA é contratado antes de aprovar; ao aprovar, cada contratada ganha a rotina diária de iniciativa; o fluxo é o de marketing', () => {
    expect(probes.planHire.hire.length, 'funções a contratar num time só com a Coordenação').toBeGreaterThan(0)
    expect(probes.planHire.personasBeforeApprove).toBe(0)
    expect(probes.planHire.personasAfterApprove).toBeGreaterThan(0)
    expect(probes.planHire.initiativeRoutinesForHired).toBe(probes.planHire.personasAfterApprove)
    expect(probes.planHire.workflowId).toBe('marketing')
    expect(probes.planHire.sprintName).toBe('Sprint 1')
  })

  vitestIt('[EQ-8] o plano do Gestor SEM funções listadas aproveita a equipe que já existe (Redação, Design, Mídia) e não contrata ninguém (Bolt 02:24)', () => {
    expect(probes.plan.hire, 'nada a contratar').toEqual([])
    expect(probes.plan.personasAfterApprove, 'ninguém contratado ao aprovar').toBe(0)
    expect(probes.plan.reuse.length, 'funções reaproveitadas').toBeGreaterThanOrEqual(3)
    expect(probes.plan.hire).not.toContain('Financeiro')
  })

  vitestIt('[EQ-9] o plano do Gestor SEM funções listadas, ao ser aprovado, divide o trabalho em Tarefas do plano (Bolt 02:24)', () => {
    expect(probes.plan.ticketsCreated).toBeGreaterThan(0)
  })

  vitestIt.fails('[GAP→Forge TEAM-14 EQ-10] uma MENSAGEM de persona no #geral ("@Teo texto pronto, faça a arte") acorda a destinatária: hoje a mensagem chega ao fio e ninguém acorda', () => {
    expect(probes.personaMessage.postAccepted).toBe(true)
    expect(probes.personaMessage.woke).toBe(true)
  })

  vitestIt('[EQ-10b · TEAM-14] a ENTREGA da Bia que traz uma linha "@Teo faça a arte…" passa o trabalho: o Teo acorda e trabalha', () => {
    expect(probes.deliveryHandoff.teoWorked, probes.deliveryHandoff.lines.join(' | ')).toBe(true)
  })

  vitestIt('[D-097a pedido inteiro] um pedido natural com mais de 120 caracteres, sem nenhuma palavra de equipe, chega ao worker INTEIRO (o prompt do turno traz o pedido literal, sem reticências nem corte); só o TÍTULO da Tarefa é curto, para a tela', () => {
    expect(probes.longRequest.sent.length, 'o pedido do teste é longo').toBeGreaterThan(120)
    expect(probes.longRequest.purpose, 'um turno de Tarefa foi iniciado').toBe('task')
    expect(probes.longRequest.prompt, 'o prompt do worker traz o pedido literal').toContain(probes.longRequest.sent)
    expect(probes.longRequest.prompt, 'sem reticências no prompt').not.toMatch(/…/u)
    expect(probes.longRequest.assignment, 'a atribuição da Tarefa também leva o pedido inteiro').toContain(probes.longRequest.sent)
    expect(probes.longRequest.titleLength, 'o título da tela é curto').toBeLessThanOrEqual(80)
  })

  vitestIt('[D-097b ferramentas de equipe] sem palavra-chave nenhuma o worker recebe as ferramentas de coordenação da equipe (perguntar à pessoa, pedir ajuda a um colega, pedir a opinião do time, passar o trabalho adiante) e NENHUMA que escreve (a persona do produto não tem permissão de arquivo/shell)', () => {
    expect(probes.longRequest.toolNames).toEqual(['ask_colleague', 'ask_team_opinion', 'pass_forward', 'persona_ask'])
  })

  vitestIt('[EQ-4] uma rotina PRÓPRIA da pessoa ("@Lia Resumo curto…") dispara na hora certa e chega à Coordenação, que responde no #geral (isto NÃO é o "Bom dia" do host)', () => {
    expect(probes.routine.arrived, 'a rotina chegou à Coordenação').toBe(true)
    expect(probes.routine.ownerReplied, 'a Lia respondeu').toBe(true)
  })

  vitestIt('[EQ-4b · Bolt 00:40] a resposta à rotina da pessoa NUNCA é o genérico "Olá, em que posso ajudar?": a Coordenação responde ao que a rotina pediu', () => {
    expect(probes.routine.routineText, 'o que a Lia disse').not.toBe('')
    expect(probes.routine.routineText, 'resposta genérica de quem não entendeu o pedido').not.toMatch(/em que posso ajudar/iu)
  })

  vitestIt('[TEAM-R4b autores de rotina] a mensagem de uma rotina não aparece no fio com o id interno ("routine:…") como autor', () => {
    expect(probes.routine.internalAuthorVisible, 'autor com ":" visível no #geral').toBe(false)
  })

  vitestIt('[EQ-16 · BUG-RT-1 D-079] a mensagem de uma ROTINA não responde à pergunta pendente de outra persona: a pergunta do Teo continua aberta esperando a pessoa e ninguém responde por ela', () => {
    expect(probes.routine.questionStillOpen).toBe(true)
    expect(probes.routine.absorbedLine, 'linha "Resposta enviada para Teo"').toBe(false)
  })

  vitestIt('[EQ-15] a PESSOA anexa o cartaz e pede a opinião do time todo (CV-8): o anexo fica ligado à mensagem e cada persona do projeto responde com a sua linha', () => {
    expect(probes.personFanout.attachmentBound, 'cartaz-campanha.png ligado à mensagem').toBe(true)
    expect(probes.personFanout.everyoneAnswered, `quem respondeu: ${probes.personFanout.repliers.join(', ')}`).toBe(true)
  })

  vitestIt('[EQ-14 cobrança · Anvil person-waiting] o que espera a PESSOA em revisão há 3 dias é lembrado UMA vez pela Coordenação, em uma linha, com os dias ditos (sem IA, no orçamento de atenção)', () => {
    expect(day.idle.waitingForPerson, 'Tarefas esperando a pessoa').toBeGreaterThan(0)
    expect(day.idle.waitingOutcome, 'o resultado da checagem').toBe('posted')
    expect(day.idle.waitingLine, 'a linha da cobrança').toMatch(/espera(m)? a sua revisão há (mais de )?\d+ dias/u)
  })
})

// ═══════════════════════ CAPÍTULO 2 — a campanha encadeada, revisada e com opinião sobre a imagem ═══════════════════════
// Cada parte roda num host próprio, no mesmo padrão dos testes dos donos (texto do runner roteirizado na ordem em que as execuções terminam).

interface Chapter2 {
  readonly chain: { planLine: boolean; byFunction: string[]; mandateActors: string[]; passes: string[]; bilheteInThread: boolean; allReady: boolean; lines: string[] }
  readonly review: { sealed: boolean; sealedBy: string; reviewKinds: string[]; requestLines: number; verdictWordsInThread: boolean; lines: string[] }
  readonly opinion: { state: string; marks: string[]; consolidated: boolean; versionAfter: string; imageTurnPersonas: string[]; imageOk: boolean; noVision: string[]; threadKinds: string[]; attachmentOnRequest: boolean; lines: string[] }
}

let day2: Chapter2



describe('Um dia da equipe — capítulo 2 (campanha encadeada, revisada e com opinião sobre a imagem)', () => {
  vitestIt('[EQUIPE-REAL-2] o plano abre a cadeia Bia→Teo→Caio, a revisão da Coordenação põe o selo e o Teo pede a opinião do time sobre o cartaz', async () => {
    const team = [
      { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true, canRecruit: true },
      { id: 'bia', name: 'Bia', title: 'Redação' },
      { id: 'teo', name: 'Teo', title: 'Design' },
      { id: 'caio', name: 'Caio', title: 'Mídia' },
    ] as const
    const view = (h: ReturnType<typeof openJourneyFile>) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
    const tickets = (h: ReturnType<typeof openJourneyFile>) => h.orchestration.runtime('pp').repo.tickets.list()
    const say = (h: ReturnType<typeof openJourneyFile>, id: string, body: string): void => {
      h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id, occurredAt: '2026-11-05T09:00:00.000Z' })
    }
    const human2 = (body: string): string => body.split('\n')[0] ?? ''

    // ── A · o Gestor aprova o plano da campanha com as funções listadas e a cadeia começa sozinha (TEAM-12)
    const a = openJourneyFile('2026-11-05T09:00:00.000Z')
    if (byHand()) a.teamworkEnabled = true
    seedJourney(a, team)
    a.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } }) // this part proves the chain; the review has its own part below
    queueText(a, ['Texto da campanha pronto.', 'Arte da campanha pronta.', 'Posts da campanha prontos.'])
    a.proposeGestorAssemble({ ...SCOPE, gestorId: 'lia', id: 'campanha-natal', goal: 'Monte um time para a campanha de Natal: texto, arte e posts' })
    const ticketsBeforeApprove = tickets(a).length
    a.approveGestorPlan({ workspaceId: 'ws', planId: 'campanha-natal' })
    await settleAll(a)
    const chainTickets = tickets(a).filter(ticket => !ticket.title.startsWith('Revisar:'))
    const threadA = view(a)
    const chain = {
      planLine: threadA.some(row => row.body.startsWith('Plano aprovado — Bia começa: texto')),
      byFunction: chainTickets.map(ticket => `${ticket.execution?.name ?? '?'}:${ticket.title.split(':')[0] ?? ''}`).sort(),
      mandateActors: [...new Set(chainTickets.map(ticket => ticket.mandate.actor.id))],
      passes: threadA.filter(row => (row as unknown as { handoff?: { status?: string } }).handoff?.status === 'asked').map(row => human2(row.body)),
      bilheteInThread: threadA.map(row => row.body).join('\n').includes('<bilhete>'),
      allReady: ticketsBeforeApprove === 0 && chainTickets.length === 3,
      lines: threadA.map(row => `${row.actorId}: ${human2(row.body)}`),
    }

    // ── B · a revisão entre colegas: a Lia revisa antes de a entrega chegar à pessoa, e o fio mostra o selo (TEAM-6)
    const b = openJourneyFile('2026-11-05T10:00:00.000Z')
    if (byHand()) b.teamworkEnabled = true
    seedJourney(b, team)
    queueText(b, ['Texto dos 3 posts pronto.', 'APROVADO\nTudo certo.'])
    say(b, 'r1', '@Bia escreva os 3 posts da campanha')
    await settleAll(b)
    const threadB = view(b) as unknown as { actorId: string; body: string; handoff?: { purpose?: string }; review?: { kind?: string; reviewerPersonaId?: string } }[]
    const biaTicket = tickets(b).find(ticket => ticket.execution?.name === 'Bia')
    const seal = biaTicket === undefined ? undefined : b.handoffs.reviewedBy('pp', biaTicket.id)
    const review = {
      sealed: seal !== undefined,
      sealedBy: seal?.personaId ?? '',
      reviewKinds: threadB.flatMap(row => (row.review?.kind === undefined ? [] : [row.review.kind])),
      requestLines: threadB.filter(row => row.handoff?.purpose === 'review').length,
      verdictWordsInThread: threadB.some(row => row.body.includes('Tudo certo.')),
      lines: threadB.map(row => `${row.actorId}: ${human2(row.body)}`),
    }

    // ── C · o Teo mostra o cartaz e pede a opinião do time todo; as personas VEEM a imagem (TEAM-4/5)
    const c = openJourneyFile('2026-11-05T11:00:00.000Z')
    if (byHand()) c.teamworkEnabled = true
    seedJourney(c, team)
    const poster = c.attachFile({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', name: 'cartaz-campanha.png', bytesBase64: buildPosterPng().toString('base64') })
    const drawing: Ticket = {
      id: 'arte-cartaz', title: 'Arte do cartaz da campanha', decisionId: 'd-cartaz',
      mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
      channels: [],
      assignments: [{ id: 'arte-cartaz-a1', state: 'running', createdAt: '2026-11-05T11:00:00.000Z', startedAt: '2026-11-05T11:00:00.000Z' }],
      inputs: [], undelivered: [],
      createdAt: '2026-11-05T11:00:00.000Z', updatedAt: '2026-11-05T11:00:00.000Z', origin: { triggerId: 'o1', triggerIds: ['o1'] },
      execution: { name: 'Teo', directory: '.', assignment: 'Arte do cartaz da campanha' },
    }
    c.orchestration.runtime('pp').repo.tickets.save(drawing)
    queueText(c, ['[gostei] O círculo vermelho chama a atenção.', '[sugestão] Aumentar o texto da faixa amarela.', '[atenção] A faixa amarela some no tema escuro.', 'Vou aumentar o texto e testar no escuro.\nNOVA VERSÃO: Cartaz com faixa maior e contorno no escuro'])
    const result = await c.opinions.run({
      projectId: 'pp', ticketId: drawing.id, requestId: 'opiniao-cartaz-1', askerId: 'teo',
      question: 'O que acham deste cartaz da campanha? Dá para melhorar?',
      draft: { text: 'Cartaz: círculo vermelho, fundo azul, faixa amarela embaixo.', attachmentIds: [poster.id], alt: POSTER_ALT },
      readerIds: ['bia', 'caio', 'lia'], round: 1, maxRounds: 2, audience: 'team',
    })
    const threadC = view(c) as unknown as { actorId: string; body: string; opinion?: { kind?: string; attachmentIds?: string[] } }[]
    const imageTurns = c.orchestration.imageTurns
    const opinion = {
      state: result.state,
      marks: result.replies.map(reply => `${reply.name}:${reply.mark}`),
      consolidated: result.consolidation !== undefined && result.consolidation !== '',
      versionAfter: result.version?.after.text ?? '',
      imageTurnPersonas: [...new Set(imageTurns.map(turn => turn.personaId))].sort(),
      imageOk: imageTurns.length > 0 && imageTurns.every(turn => turn.images.length === 1 && turn.images[0]?.mediaType === 'image/png' && turn.images[0].path !== ''),
      noVision: [...result.noVision],
      threadKinds: threadC.flatMap(row => (row.opinion?.kind === undefined ? [] : [row.opinion.kind])),
      attachmentOnRequest: threadC.some(row => row.opinion?.kind === 'request' && (row.opinion.attachmentIds ?? []).includes(poster.id)),
      lines: threadC.map(row => `${row.actorId}: ${human2(row.body)}`),
    }

    day2 = { chain, review, opinion }
    writeFileSync(join(OUT, 'capitulo2.json'), JSON.stringify(day2, null, 2))
    const md = ['# Um dia da equipe — capítulo 2 (host real, runner roteirizado, 0 IA)', '',
      '## A · o plano da campanha abre a cadeia Bia → Teo → Caio', '', ...chain.lines.map(line => `- ${line}`), '',
      '## B · a Lia revisa antes de a entrega chegar à pessoa', '', ...review.lines.map(line => `- ${line}`), '',
      '## C · o Teo pede a opinião do time sobre o cartaz (as personas veem a imagem)', '', ...opinion.lines.map(line => `- ${line}`), '',
      `Imagem entregue aos turnos de: ${opinion.imageTurnPersonas.join(', ')} (png).`]
    writeFileSync(join(OUT, 'transcript-capitulo2.md'), `${md.join('\n')}\n`)
    // the chapter-1 scoreboard marks behaviours 4 and 5 by chapter 2 (they are proven in their own worlds)
    const board = readFileSync(join(OUT, 'transcript.md'), 'utf8')
    const opinionOk = opinion.state === 'done' && opinion.imageOk && opinion.attachmentOnRequest
    const reviewOk = review.sealed && review.requestLines >= 1
    writeFileSync(join(OUT, 'transcript.md'), board
      .replace('| 4 | Pedir opinião ao time todo (texto e imagem) | ❌ falta |', `| 4 | Pedir opinião ao time todo (texto e imagem) | ${opinionOk ? '✅ passa (capítulo 2)' : '❌ falta'} |`)
      .replace('| 5 | Revisão entre colegas ("Revisado pela Lia") | ❌ falta |', `| 5 | Revisão entre colegas ("Revisado pela Lia") | ${reviewOk ? '✅ passa (capítulo 2)' : '❌ falta'} |`)
      .replace('| 5 | Revisão entre colegas ("Revisado pela Lia") | ✅ passa |', '| 5 | Revisão entre colegas ("Revisado pela Lia") | ✅ passa |'))
    expect(chain.lines.length).toBeGreaterThan(3)
  }, 120_000)

  vitestIt('[TEAM-12 · cadeia do plano] o plano aprovado de "campanha: texto, arte e posts" abre as 3 partes encadeadas, cada uma na persona da função, sob o mandato da PESSOA que aprovou, com a linha "Bia passou para Teo / Teo passou para Caio" e sem o bilhete no fio', () => {
    expect(day2.chain.byFunction.map(entry => entry.split(':')[0]).sort(), 'uma Tarefa por persona da função').toEqual(['Bia', 'Caio', 'Teo'])
    expect(day2.chain.byFunction.every(entry => entry.length <= 60), `títulos curtos: ${day2.chain.byFunction.join(' | ')}`).toBe(true)
    expect(day2.chain.mandateActors, 'todo o encadeamento sob o mandato de quem aprovou').toEqual(['ana'])
    expect(day2.chain.passes.map(line => line.split(':')[0])).toEqual(['Bia passou para Teo', 'Teo passou para Caio'])
    expect(day2.chain.bilheteInThread, 'o bilhete não vai ao fio').toBe(false)
  })

  vitestIt('[TEAM-9.5b selo] depois da revisão da Lia o fio mostra o selo "Revisado" (MessageView.review kind=reviewed) e o veredito da revisora NÃO vira mensagem', () => {
    expect(day2.review.reviewKinds).toEqual(['reviewed'])
    expect(day2.review.sealed, 'reviewedBy').toBe(true)
    expect(day2.review.sealedBy).toBe('lia')
    expect(day2.review.verdictWordsInThread, 'as palavras do veredito não são mensagem').toBe(false)
  })

  vitestIt('[TEAM-9.4 opinião+imagem] o Teo pede a opinião do time sobre o cartaz: o pedido leva o anexo, cada colega responde com a sua marca, ele consolida com "Antes · Depois" e as personas RECEBEM a imagem como imagem do turno (png)', () => {
    expect(day2.opinion.state).toBe('done')
    expect(day2.opinion.threadKinds, 'pedido → 3 respostas → consolidação').toEqual(['request', 'reply', 'reply', 'reply', 'consolidated'])
    expect(day2.opinion.attachmentOnRequest, 'attachmentIds do cartaz no pedido').toBe(true)
    expect(day2.opinion.marks.sort()).toEqual(['Bia:liked', 'Caio:suggestion', 'Lia:attention'].sort())
    expect(day2.opinion.consolidated).toBe(true)
    expect(day2.opinion.versionAfter, 'consolidação versiona o texto').toMatch(/Cartaz com faixa maior/u)
    expect(day2.opinion.imageTurnPersonas, 'quem recebeu a imagem').toEqual(['bia', 'caio', 'lia'])
    expect(day2.opinion.imageOk, 'imagem png entregue ao turno').toBe(true)
    expect(day2.opinion.noVision).toEqual([])
  })
})

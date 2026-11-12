/**
 * TEAM-8 (EQUIPE-REAL-SPEC, D-090): as LINHAS DO FIO da equipe real — "{A} passou para {B}", "{A} pediu ajuda a {B}", "{B} entregou para
 * {A}", "{A} retomou …", e as da revisão ("{R} aprovou", "{R} pediu ajustes", "{A} ajustou e {R} aprovou", "{R} deixou {n} ponto(s) em aberto").
 * O host manda DADOS (`MessageView.handoff` / `MessageView.review`); as palavras são daqui. Este módulo é puro: o mapa do host para a tela,
 * a escolha da frase e o agrupamento por minuto. Nunca um id na tela e nunca o prompt interno (LEAK-1): sem título legível a linha não
 * existe e o corpo simples que o host escreve junto aparece como antes.
 */

import { usableTaskTitle } from '../remote/task-title.ts'

export interface TeamPersonaUi {
  readonly id: string
  readonly name: string
  /** O retrato do elenco; sem ele o avatar cai nas iniciais. */
  readonly characterId?: string
  /** O tom (0 a 6) da ORDEM DE CONTRATAÇÃO: o anel de cor do rosto na linha de passagem (`personaTintIndex`); sem ele, sem anel. */
  readonly tint?: number
}

export type HandoffMode = 'handoff' | 'help'
export type HandoffStatus = 'asked' | 'delivered' | 'resumed' | 'held' | 'blocked'

/** A linha de uma passagem de trabalho entre duas personas. `title` é o título humano da tarefa. */
export interface HandoffLineUi {
  readonly mode: HandoffMode
  readonly status: HandoffStatus
  readonly from: TeamPersonaUi
  readonly to: TeamPersonaUi
  /** A tarefa do colega; pode vir vazio na 1ª linha (ela ainda não existe se o motor está esperando). */
  readonly taskId: string
  readonly title: string
  /** `blocked`: o conector que falta ao colega. */
  readonly connector?: string
  readonly reason?: string
  /** `review`: o pedido é a etapa de REVISÃO do fluxo, não um pedido de ajuda da persona. */
  readonly purpose?: 'review'
}

export interface ReviewLineUi {
  readonly kind: 'reviewed' | 'returned' | 'failed'
  readonly reviewer: TeamPersonaUi
  readonly author: TeamPersonaUi
  readonly taskId: string
  readonly title: string
  readonly round: number
  readonly maxRounds: number
  /** A 3ª volta: a entrega segue SEM o selo e com os pontos à vista. */
  readonly openPoints?: number
  /** `returned`: o 1º ponto, em uma linha. */
  readonly summary?: string
}

/** O que o host manda numa passagem (subconjunto estrutural de `HandoffCardView`). */
export interface HandoffCardInput {
  readonly fromPersonaId: string
  readonly toPersonaId: string
  readonly taskId: string
  readonly fromTaskId?: string | undefined
  readonly title: string
  readonly mode: HandoffMode
  readonly status: HandoffStatus
  readonly reason?: string | undefined
  readonly connector?: string | undefined
  readonly purpose?: 'review' | undefined
}

/** O que o host manda numa revisão (subconjunto estrutural de `ReviewCardView`). */
export interface ReviewCardInput {
  readonly kind: 'reviewed' | 'returned' | 'failed'
  readonly reviewerPersonaId: string
  readonly authorPersonaId: string
  readonly taskId: string
  readonly round: number
  readonly maxRounds: number
  readonly openPoints?: number | undefined
  readonly summary?: string | undefined
}

/** O que o host manda no selo "Revisado por {R}" (`ReviewedByView`, `team-real.md` §2/§7). */
export interface ReviewedByInput {
  readonly personaId: string
  readonly at?: string | undefined
  /** Na 3ª volta (`openPoints > 0`), a entrega segue SEM o selo. */
  readonly openPoints?: number | undefined
}

/** Quem é a persona para a tela: o elenco sabe o NOME (nunca um id). Sem nome, sem linha. */
export type PersonaLookup = (personaId: string) => TeamPersonaUi | undefined

/** O selo "Revisado por {R}": só existe quando `openPoints` não está presente (> 0 na 3ª volta = segue sem selo) e o elenco conhece o nome. */
export function mapReviewedBy(
  card: ReviewedByInput | { readonly reviewedBy?: ReviewedByInput | undefined } | undefined,
  lookup: PersonaLookup,
): TeamPersonaUi | undefined {
  if (card === undefined || typeof card !== 'object' || card === null) return undefined
  const raw: ReviewedByInput | undefined = 'reviewedBy' in card
    ? (card as { readonly reviewedBy?: ReviewedByInput | undefined }).reviewedBy
    : (card as ReviewedByInput)
  if (raw === undefined || typeof raw !== 'object' || raw === null) return undefined
  if (typeof raw.openPoints === 'number' && Number.isFinite(raw.openPoints) && raw.openPoints > 0) return undefined
  if (typeof raw.personaId !== 'string' || raw.personaId.trim() === '') return undefined
  return lookup(raw.personaId.trim())
}

/**
 * EQUIPE-REAL-SPEC §0 ("Os títulos das partes"): nunca cortado no meio da palavra; se passar de `maxChars` (48),
 * corta só no último espaço e acrescenta `…`.
 */
export function truncateAtWordBoundary(value: string, maxChars = 48): string {
  const cleaned = value.replace(/^@\S+\s*/u, '').trim()
  if (cleaned.length <= maxChars) return cleaned
  const slice = cleaned.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > 0) return `${slice.slice(0, lastSpace).trimEnd()}…`
  return `${slice.slice(0, maxChars - 1)}…`
}

export function mapHandoffLine(card: HandoffCardInput | undefined, lookup: PersonaLookup): HandoffLineUi | undefined {
  if (card === undefined) return undefined
  const from = lookup(card.fromPersonaId)
  const to = lookup(card.toPersonaId)
  if (from === undefined || to === undefined || from.id === to.id) return undefined
  const rawTitle = usableTaskTitle(card.title, [card.taskId, card.fromTaskId ?? ''])
  if (rawTitle === undefined) return undefined
  const title = truncateAtWordBoundary(rawTitle)
  if (title === '') return undefined
  return {
    mode: card.mode,
    status: card.status,
    from,
    to,
    taskId: card.taskId,
    title,
    ...(card.connector === undefined || card.connector.trim() === '' ? {} : { connector: card.connector.trim() }),
    ...(card.reason === undefined || card.reason.trim() === '' ? {} : { reason: card.reason.trim() }),
    ...(card.purpose === 'review' ? { purpose: 'review' as const } : {}),
  }
}

/** A revisão só vira linha com o título REAL da tarefa (o `ReviewCardView` não o traz: sai do mapa título-por-tarefa). */
export function mapReviewLine(card: ReviewCardInput | undefined, lookup: PersonaLookup, taskTitle: (taskId: string) => string | undefined): ReviewLineUi | undefined {
  if (card === undefined) return undefined
  const reviewer = lookup(card.reviewerPersonaId)
  const author = lookup(card.authorPersonaId)
  if (reviewer === undefined || author === undefined || reviewer.id === author.id) return undefined
  const rawTitle = usableTaskTitle(taskTitle(card.taskId) ?? '', [card.taskId])
  if (rawTitle === undefined && card.kind !== 'failed') return undefined
  const title = truncateAtWordBoundary(rawTitle ?? '')
  if (title === '' && card.kind !== 'failed') return undefined
  const openPoints = card.openPoints !== undefined && Number.isFinite(card.openPoints) && card.openPoints > 0 ? Math.floor(card.openPoints) : undefined
  const summary = card.summary?.trim() ?? ''
  return {
    kind: card.kind,
    reviewer,
    author,
    taskId: card.taskId,
    title,
    round: card.round,
    maxRounds: card.maxRounds,
    ...(openPoints === undefined ? {} : { openPoints }),
    ...(summary === '' ? {} : { summary }),
  }
}

/** As chaves de locale (chat) que as linhas usam: literais, para o `t` tipado do fio aceitar. */
export type LineKey =
  | 'handoff.passed' | 'handoff.helped' | 'handoff.asked' | 'handoff.delivered' | 'handoff.resumed' | 'handoff.blocked'
  | 'review.asked' | 'review.approved' | 'review.changes' | 'review.adjusted' | 'review.open' | 'review.open.one'
  | 'review.skipped' | 'review.skipped.one'
  | 'harness.held.paused' | 'harness.held.silence' | 'harness.held.deliveryPending' | 'harness.held.noOwner'

/** Uma frase: a chave do locale e os parâmetros. `undefined` = não há texto na spec para este caso (o corpo simples do host aparece). */
export interface LineText {
  readonly key: LineKey
  readonly params: Readonly<Record<string, string | number>>
}

/** Os motivos de "esperando" que valem os mesmos do HT-3 (PERSONA-POWERS, `harness.held.*`). */
const HELD_KEYS: Readonly<Record<string, LineKey>> = {
  paused: 'harness.held.paused',
  silence: 'harness.held.silence',
  delivery_pending: 'harness.held.deliveryPending',
  no_owner: 'harness.held.noOwner',
}

export function handoffLineText(line: HandoffLineUi): LineText | undefined {
  const { from, to, title } = line
  if (line.purpose === 'review') {
    // A etapa de revisão: só o pedido tem frase própria; o resultado vem como `review`.
    return line.status === 'asked' ? { key: 'review.asked', params: { from: from.name, reviewer: to.name, title } } : undefined
  }
  switch (line.status) {
    case 'asked':
      return line.mode === 'handoff'
        ? { key: 'handoff.passed', params: { from: from.name, to: to.name, next: title } }
        : { key: 'handoff.asked', params: { from: from.name, to: to.name, title } }
    case 'delivered':
      return line.mode === 'help'
        ? { key: 'handoff.helped', params: { from: from.name, to: to.name, title } }
        : { key: 'handoff.delivered', params: { from: from.name, to: to.name, title } }
    case 'resumed':
      return { key: 'handoff.resumed', params: { from: from.name, to: to.name, task: title } }
    case 'held': {
      const key = line.reason === undefined ? undefined : HELD_KEYS[line.reason]
      return key === undefined ? undefined : { key, params: { name: to.name, task: title } }
    }
    case 'blocked':
      return line.connector === undefined
        ? undefined
        : { key: 'handoff.blocked', params: { from: from.name, to: to.name, title, connector: line.connector } }
    default:
      return undefined
  }
}

export function reviewLineText(line: ReviewLineUi): LineText | undefined {
  if (line.kind === 'failed') return undefined
  const { reviewer, author, title } = line
  if (line.openPoints !== undefined) return { key: line.openPoints === 1 ? 'review.open.one' : 'review.open', params: { name: reviewer.name, count: line.openPoints } }
  if (line.kind === 'reviewed') {
    return line.round >= 1
      ? { key: 'review.adjusted', params: { from: author.name, reviewer: reviewer.name } }
      : { key: 'review.approved', params: { reviewer: reviewer.name, title } }
  }
  return line.summary === undefined ? undefined : { key: 'review.changes', params: { reviewer: reviewer.name, note: line.summary } }
}

/**
 * EQUIPE-REAL-SPEC §0 ("Falha técnica de revisão"): nunca uma linha por tarefa no fio; se a revisão falhou em ≥ 1 parte
 * do mesmo pedido, aparece UMA linha agrupada no cartão de entrega: "A revisão não rodou em {n} parte(s); seguiram sem o selo".
 */
export function reviewSkippedLineText(failedCount: number | undefined): LineText | undefined {
  if (failedCount === undefined || !Number.isFinite(failedCount)) return undefined
  const count = Math.floor(failedCount)
  if (count <= 0) return undefined
  return {
    key: count === 1 ? 'review.skipped.one' : 'review.skipped',
    params: { count },
  }
}

/** A mesma persona pediu ajuda a mais de um colega no MESMO minuto: entram num grupo ("A Bia pediu ajuda a 2 colegas"). */
export interface HandoffRunItem {
  readonly index: number
  readonly line: HandoffLineUi
  /** O instante ISO do host. */
  readonly occurredAt?: string | undefined
}

const MINUTE_MS = 60_000

function minuteOf(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined
  const time = Date.parse(iso)
  return Number.isNaN(time) ? undefined : Math.floor(time / MINUTE_MS)
}

/**
 * Agrupa pedidos de ajuda (`asked` em modo `help`, não revisão) CONSECUTIVOS da mesma persona dentro do mesmo minuto. Devolve só os grupos com 2 ou
 * mais (a 1ª linha do grupo é onde ele se desenha; as outras não desenham nada por conta própria). Entrega, retomada e revisão nunca agrupam.
 */
export function groupHelpRuns(items: readonly HandoffRunItem[]): readonly (readonly HandoffRunItem[])[] {
  const runs: HandoffRunItem[][] = []
  let current: HandoffRunItem[] = []
  const flush = (): void => { if (current.length >= 2) runs.push(current); current = [] }
  for (const item of items) {
    const groupable = item.line.status === 'asked' && item.line.mode === 'help' && item.line.purpose !== 'review'
    const last = current[current.length - 1]
    const sameRun = groupable && last !== undefined
      && last.index + 1 === item.index
      && last.line.from.id === item.line.from.id
      && minuteOf(last.occurredAt) !== undefined
      && minuteOf(last.occurredAt) === minuteOf(item.occurredAt)
    if (!groupable) { flush(); continue }
    if (!sameRun) flush()
    current.push(item)
  }
  flush()
  return runs
}

/**
 * R1 (team-real.md §9): a linha de ESTADO que o host tipa ao gravar a mensagem (`MessageView.stateLine`). Nunca lida do texto.
 * `status` = a frase do host ("Em andamento: …", "Pronto: …"); `result` = a fala da própria persona (a entrega), que os cartões absorvem.
 */
export interface StateLineUi {
  readonly kind: 'task_progress' | 'part_done' | 'task_done'
  readonly ticketId: string
  /** O pedido de que a Tarefa é parte: o MESMO `requestId` do cartão do plano e da entrega. Ausente em tarefa avulsa. */
  readonly groupId?: string
  readonly text: 'status' | 'result'
}

/** O subconjunto mínimo TIPADO de uma linha do fio (aceita tanto `ChannelMessageUi` mapeada quanto `MessageView` crua do host/banco, pura sem React/CSS). */
export interface StreamNoiseRowInput {
  readonly authorId?: string | undefined
  readonly actorId?: string | undefined
  readonly authorName?: string | undefined
  readonly messageType?: string | undefined
  readonly type?: string | undefined
  readonly harnessStatus?: string | undefined
  readonly teamHandoff?: HandoffLineUi | undefined
  readonly handoff?: { readonly purpose?: string | undefined; readonly status?: string | undefined } | undefined
  readonly teamReview?: ReviewLineUi | undefined
  readonly review?: { readonly kind: 'reviewed' | 'returned' | 'failed'; readonly round: number; readonly openPoints?: number | undefined } | undefined
  readonly hasTeamPlan?: boolean | undefined
  readonly teamPlan?: unknown
  readonly hasDeliveryCard?: boolean | undefined
  readonly deliveryCard?: unknown
  readonly hasTaskCard?: boolean | undefined
  /** A tarefa desta mensagem (`ticketId` do cartão de tarefa). */
  readonly ticketId?: string | undefined
  /** R1: a linha de estado tipada do host (`MessageView.stateLine`). */
  readonly stateLine?: StateLineUi | undefined
  /** O `requestId` do cartão do plano, quando a linha é o plano. */
  readonly planRequestId?: string | undefined
  /** O `requestId` do cartão de entrega, quando a linha é a entrega. */
  readonly deliveryRequestId?: string | undefined
  /** As tarefas (`taskId`) que o cartão de entrega desta linha traz. */
  readonly deliveryTaskIds?: readonly string[] | undefined
}

export interface StreamNoiseAnalysis {
  /** Índices que NÃO entram no fio (devolvem `null` no `renderRow`). */
  readonly hiddenIndices: ReadonlySet<number>
  /** Quantas partes tiveram falha técnica de revisão no fio (para agrupar numa linha só no cartão de entrega). */
  readonly reviewSkippedCount: number
}

const TECHNICAL_ACTOR_RE = /^[a-z][a-z0-9_-]*:\S+$/iu
const SYSTEM_MESSAGE_TYPES = new Set(['routine_trigger', 'system_split'])
const PLAN_MICRO_MESSAGE_TYPES = new Set(['task_started', 'task_progress', 'part_done'])
const PLAN_MICRO_HARNESS_STATUSES = new Set(['started', 'in_progress', 'waiting_review'])

/** Acrescenta `index` à lista de `key` (índices das linhas que são cada cartão). */
function addIndex(map: Map<string, number[]>, key: string, index: number): void {
  const list = map.get(key)
  if (list === undefined) map.set(key, [index])
  else list.push(index)
}

/**
 * EQUIPE-REAL-SPEC §0 (TEAM-R1, Muse 00:19 e 00:54) e team-real.md §9: função pura baseada EXCLUSIVAMENTE em dado tipado (nunca regex
 * em corpo de mensagem). Um cartão ausente da janela carregada não absorve nada: a linha fica visível.
 * (a) autor de sistema (`id:resto`) ou `messageType` de rotina/divisão nunca aparece no fio;
 * (b) falhas de revisão tipadas (`teamReview.kind === 'failed'`) nunca viram linha individual e somam em `reviewSkippedCount`
 *     para a linha agrupada do cartão de entrega; "pediu a revisão" e a aprovação simples de 1ª volta (`reviewed`, round 0) saem
 *     quando o pedido tem plano/entrega. "Pediu ajustes" (`returned`) NUNCA sai: é a revisão entre colegas que a pessoa quer ver;
 * (c) micro-estados tipados (`harnessStatus` / `messageType` de andamento) são absorvidos pelo cartão do plano;
 * (d) `stateLine`: "Em andamento" (status) sai sempre; "Pronto" sai quando o cartão do pedido (`groupId`) ou o da própria tarefa
 *     está na janela; a fala da persona (`result`) sai só com o cartão que a absorve;
 * (e) entrega individual de parte (cartão de tarefa) sai quando o cartão de entrega do PRÓPRIO pedido traz a tarefa.
 */
export function analyzeTeamStreamNoise(rows: readonly StreamNoiseRowInput[]): StreamNoiseAnalysis {
  const hidden = new Set<number>()
  let reviewSkippedCount = 0
  const hasPlan = (row: StreamNoiseRowInput): boolean => row.hasTeamPlan === true || row.teamPlan !== undefined
  const hasDelivery = (row: StreamNoiseRowInput): boolean => row.hasDeliveryCard === true || row.deliveryCard !== undefined
  const hasTask = (row: StreamNoiseRowInput): boolean => row.hasTaskCard === true || (row.messageType ?? row.type) === 'task_delivered'
  const streamHasTeamPlan = rows.some(hasPlan)
  const streamHasDeliveryCard = rows.some(hasDelivery)
  const streamHasPlanOrDelivery = streamHasTeamPlan || streamHasDeliveryCard || rows.some(hasTask)
  // Índices das linhas que SÃO cada cartão. Uma linha nunca é absorvida pelo próprio cartão (ver `absorbedBy`).
  const cardsByRequest = new Map<string, number[]>()
  const taskCardsByTicket = new Map<string, number[]>()
  const deliveriesByTask = new Map<string, number[]>()
  rows.forEach((row, index) => {
    for (const requestId of [row.planRequestId, row.deliveryRequestId]) {
      if (requestId !== undefined && requestId !== '') addIndex(cardsByRequest, requestId, index)
    }
    if (hasTask(row) && row.ticketId !== undefined && row.ticketId !== '') addIndex(taskCardsByTicket, row.ticketId, index)
    for (const taskId of row.deliveryTaskIds ?? []) addIndex(deliveriesByTask, taskId, index)
  })
  const absorbedBy = (index: number, cards: readonly number[] | undefined): boolean => cards?.some(other => other !== index) === true

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!
    const actor = row.authorId ?? row.actorId
    const msgType = row.messageType ?? row.type
    const handoffPurpose = row.teamHandoff?.purpose ?? row.handoff?.purpose
    const rev = row.teamReview ?? row.review

    // (a) Autor técnico (`routine:…`, `team:…`) ou tipo de evento de rotina/divisão.
    if (
      (actor !== undefined && TECHNICAL_ACTOR_RE.test(actor))
      || (row.authorName !== undefined && TECHNICAL_ACTOR_RE.test(row.authorName))
      || (msgType !== undefined && SYSTEM_MESSAGE_TYPES.has(msgType))
    ) {
      hidden.add(i)
      continue
    }

    // (b) Eventos tipados de revisão/passagem: falha técnica soma no cartão de entrega e nunca vira linha por tarefa.
    if (rev?.kind === 'failed') {
      hidden.add(i)
      reviewSkippedCount += 1
      continue
    }

    // "Pediu ajustes" (`returned`, qualquer volta) NUNCA sai: a revisão entre colegas é o que a pessoa quer ver.
    if (streamHasPlanOrDelivery) {
      if (handoffPurpose === 'review') {
        hidden.add(i)
        continue
      }
      if (rev?.kind === 'reviewed' && rev.round === 0 && (rev.openPoints === undefined || rev.openPoints <= 0)) {
        hidden.add(i)
        continue
      }
    }

    // (c) Micro-estados tipados absorvidos pelo cartão vivo do plano ou pelo cartão de entrega do pedido.
    if (streamHasTeamPlan) {
      if (
        (msgType !== undefined && PLAN_MICRO_MESSAGE_TYPES.has(msgType))
        || (row.harnessStatus !== undefined && PLAN_MICRO_HARNESS_STATUSES.has(row.harnessStatus))
      ) {
        hidden.add(i)
        continue
      }
    }
    // (d) R1 (team-real.md §9): a linha de ESTADO que o host tipa. Nunca pelo texto.
    const state = row.stateLine
    if (state !== undefined) {
      if (state.kind === 'task_progress' && state.text === 'status') {
        hidden.add(i)
        continue
      }
      if (state.kind === 'part_done' && state.groupId !== undefined && absorbedBy(i, cardsByRequest.get(state.groupId))) {
        hidden.add(i)
        continue
      }
      if (state.kind === 'task_done' && absorbedBy(i, taskCardsByTicket.get(state.ticketId))) {
        hidden.add(i)
        continue
      }
    }

    // (e) Entrega individual de parte: sai quando o cartão de entrega do PRÓPRIO pedido traz a tarefa. Sem id conhecido, vale a
    //     regra anterior (sai com qualquer cartão de entrega na janela).
    if (hasTask(row) && !hasDelivery(row)) {
      const absorbed = row.ticketId === undefined || row.ticketId === ''
        ? streamHasDeliveryCard
        : absorbedBy(i, deliveriesByTask.get(row.ticketId))
      if (absorbed) hidden.add(i)
    }
  }

  return { hiddenIndices: hidden, reviewSkippedCount }
}

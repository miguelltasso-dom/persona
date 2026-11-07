/**
 * D-090 / EQUIPE-REAL-SPEC §(c) (TEAM-8): o PEDIDO DE OPINIÃO no fio. Puro (sem React): lê `MessageView.opinion` do host (nomes finais do Anvil,
 * team-real.md §7) com cuidado (qualquer coisa estranha vira "sem opinião" e a mensagem segue como mensagem comum) e junta as linhas de UM pedido
 * (a pergunta, as respostas de cada persona, a consolidação) num bloco só. Todos os nomes do fio moram AQUI: se o host mudar, muda este arquivo.
 */
import type { ChannelMessageUi } from '../../remote/map-host-ui.ts'
import type { MessageView, OpinionWire } from '../../remote/persona-remote-types.ts'
import { mapDraftFiles, type DraftFileUi } from '../draft-files/draft-files-model.ts'
import { parseUsage, type UsageUi } from '../quota-text.ts'

export type OpinionKind = 'request' | 'reply' | 'consolidated'
export type OpinionMark = 'liked' | 'suggestion' | 'attention' | 'nothing'

/** Um lado do "Antes · Depois": texto e/ou imagens. */
export interface OpinionVersionSide {
  readonly text?: string
  readonly imageIds: readonly string[]
}

export interface OpinionUi {
  readonly kind: OpinionKind
  /** Liga as linhas de UM pedido (a pergunta, as respostas e a consolidação). */
  readonly requestId: string
  readonly taskId: string
  readonly round: number
  readonly maxRounds: number
  /** `request`: o rascunho compartilhado (texto e/ou imagens + a descrição que a persona escreveu). */
  readonly draftText?: string
  readonly imageIds: readonly string[]
  readonly alt?: string
  /** `request` (Forge 15:47): a ARTE do rascunho em opinião (SVG/PNG salvos no rascunho); o cartão mostra a miniatura para a opinião ser sobre a IMAGEM. Ausente = só o que a pessoa anexou. */
  readonly files?: readonly DraftFileUi[]
  readonly audience: 'team' | 'some'
  /** Só quando o Tally mede: "≈ n respostas · custo". */
  readonly estimate?: { readonly responses: number; readonly cost?: string }
  /** O rodapé PRONTO do Tally (`budget.rodape`): quando existe, é o que a tela mostra, sem recompor (menos dinheiro fora da chave de API). */
  readonly footer?: string
  /** D-092: o tipo de conta e o impacto na cota (assinatura) / o US$ (API) da rodada; ausente = nunca dinheiro. */
  readonly usage?: UsageUi
  /** O Tally disse que o teto de rodadas foi atingido (`budget.stop === 'rounds-cap'`). */
  readonly capReached?: true
  /** Personas puladas por motor sem visão (o fan-out nem as chamou). */
  readonly noVision: readonly string[]
  /** `request` (§12): quem foi incluído só pelo texto; sai do recolhido. */
  readonly textOnlyPersonaIds?: readonly string[]
  /** `reply`: a marca da resposta. */
  readonly mark?: OpinionMark
  /** `reply` (§12): a resposta de quem foi incluído só pelo texto (o chip "Opinou só pelo texto"). */
  readonly textOnly?: true
  /** `consolidated`: a versão nova, com o antes e o depois. */
  readonly version?: { readonly k: number; readonly before: OpinionVersionSide; readonly after: OpinionVersionSide }
}

const KINDS: readonly OpinionKind[] = ['request', 'reply', 'consolidated']
const MARKS: readonly OpinionMark[] = ['liked', 'suggestion', 'attention', 'nothing']

const strings = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((row): row is string => typeof row === 'string' && row !== '') : [])
const positive = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback)
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined)

function side(raw: unknown): OpinionVersionSide {
  const row = (typeof raw === 'object' && raw !== null ? raw : {}) as { text?: unknown; attachmentIds?: unknown }
  const body = text(row.text)
  return { ...(body === undefined ? {} : { text: body }), imageIds: strings(row.attachmentIds) }
}

/**
 * `MessageView.opinion` → a forma da tela. `undefined` quando a mensagem não é de opinião ou o host mandou algo que não dá para confiar.
 * @param event - A mensagem do host.
 */
export function mapOpinion(event: MessageView): OpinionUi | undefined {
  const wire: OpinionWire | undefined = event.opinion
  if (wire === undefined || typeof wire !== 'object' || wire === null) return undefined
  if (!KINDS.includes(wire.kind) || typeof wire.requestId !== 'string' || wire.requestId === '') return undefined
  const draftText = text(wire.draftText)
  const alt = text(wire.alt)
  const files = mapDraftFiles(wire.files)
  const version = wire.version
  const estimate = wire.estimate
  const budget = wire.budget
  const footer = text(budget?.rodape)
  const usage = parseUsage(estimate) ?? parseUsage(budget)
  const skippedNoVision = (Array.isArray(budget?.skipped) ? budget.skipped : []).flatMap(row => (row !== null && typeof row === 'object' && row.why === 'no-vision' && typeof row.id === 'string' && row.id !== '' ? [row.id] : []))
  const noVision = [...new Set([...strings(wire.noVision), ...skippedNoVision])]
  const textOnlyPersonaIds = strings(wire.textOnlyPersonaIds)
  // Com o orçamento do Tally, a rodada e o teto vêm dele (o host conta; a tela não adivinha).
  const round = positive(budget?.round, positive(wire.round, 1))
  const maxRounds = positive(budget?.roundsCap, positive(wire.maxRounds, 2))
  return {
    kind: wire.kind,
    requestId: wire.requestId,
    taskId: typeof wire.taskId === 'string' ? wire.taskId : '',
    round,
    maxRounds,
    ...(draftText === undefined ? {} : { draftText }),
    imageIds: strings(wire.attachmentIds),
    ...(alt === undefined ? {} : { alt }),
    ...(files.length === 0 ? {} : { files }),
    audience: wire.audience === 'some' ? 'some' : 'team',
    ...(estimate !== undefined && typeof estimate.responses === 'number' && estimate.responses >= 1
      ? { estimate: { responses: Math.floor(estimate.responses), ...(text(estimate.cost) === undefined ? {} : { cost: text(estimate.cost)! }) } }
      : {}),
    noVision,
    ...(textOnlyPersonaIds.length === 0 ? {} : { textOnlyPersonaIds }),
    ...(footer === undefined ? {} : { footer }),
    ...(usage === undefined ? {} : { usage }),
    ...(budget?.stop === 'rounds-cap' ? { capReached: true as const } : {}),
    ...(wire.mark !== undefined && MARKS.includes(wire.mark) ? { mark: wire.mark } : {}),
    ...(wire.kind === 'reply' && wire.textOnly === true ? { textOnly: true as const } : {}),
    ...(version !== undefined && typeof version === 'object' && version !== null
      ? { version: { k: positive(version.k, 2), before: side(version.before), after: side(version.after) } }
      : {}),
  }
}

export interface OpinionBlockModel {
  readonly requestId: string
  /** Onde o bloco é desenhado: a linha da PERGUNTA. As outras linhas do pedido não desenham nada. */
  readonly firstIndex: number
  readonly request: ChannelMessageUi
  /** Uma por quem opinou (a cópia mais recente vence), a da PESSOA primeiro, depois na ordem do fio. */
  readonly replies: readonly ChannelMessageUi[]
  readonly consolidated?: ChannelMessageUi
}

/**
 * Junta as linhas de cada pedido. Um pedido sem a linha da pergunta não vira bloco (as respostas aparecem como mensagens comuns).
 * @param messages - O fio, em ordem.
 * @returns Os blocos por `requestId`; vazio quando nenhuma mensagem tem `opinion` (o fio de sempre e o host sem `Config.teamwork`).
 */
export function buildOpinionBlocks(messages: readonly ChannelMessageUi[]): ReadonlyMap<string, OpinionBlockModel> {
  const parts = new Map<string, { request?: { message: ChannelMessageUi; index: number }; replies: Map<string, ChannelMessageUi>; consolidated?: ChannelMessageUi }>()
  messages.forEach((message, index) => {
    const opinion = message.opinion
    if (opinion === undefined) return
    const part = parts.get(opinion.requestId) ?? { replies: new Map<string, ChannelMessageUi>() }
    if (opinion.kind === 'request') part.request = { message, index }
    else if (opinion.kind === 'consolidated') part.consolidated = message
    else part.replies.set(message.authorId, message)
    parts.set(opinion.requestId, part)
  })
  const blocks = new Map<string, OpinionBlockModel>()
  for (const [requestId, part] of parts) {
    if (part.request === undefined) continue
    const replies = [...part.replies.values()]
    const mine = replies.filter(message => message.authorId === 'user')
    const others = replies.filter(message => message.authorId !== 'user')
    blocks.set(requestId, {
      requestId,
      firstIndex: part.request.index,
      request: part.request.message,
      replies: [...mine, ...others],
      ...(part.consolidated === undefined ? {} : { consolidated: part.consolidated }),
    })
  }
  return blocks
}

/** Respostas com algo a dizer × as que recolhem em "e mais {n} sem nada a acrescentar". */
export function splitReplies(replies: readonly ChannelMessageUi[]): { readonly said: readonly ChannelMessageUi[]; readonly nothing: readonly ChannelMessageUi[] } {
  // Quem opinou só pelo texto SEMPRE aparece com o chip (Muse §(c)): essa resposta não recolhe em "sem nada a acrescentar".
  const isNothing = (message: ChannelMessageUi): boolean => (message.opinion?.mark === 'nothing' && message.opinion.textOnly !== true) || message.fanout?.kind === 'nothing'
  return { said: replies.filter(message => !isNothing(message)), nothing: replies.filter(isNothing) }
}

/**
 * O teto de rodadas foi usado. O sinal é o do Tally (`budget.stop === 'rounds-cap'` em qualquer linha do pedido); sem ele, a consolidação da última
 * rodada permitida também diz que a persona segue com o que tem (sem pedir outra).
 */
export function roundsCapReached(block: OpinionBlockModel): boolean {
  if (block.request.opinion?.capReached === true || block.consolidated?.opinion?.capReached === true || block.replies.some(row => row.opinion?.capReached === true)) return true
  const done = block.consolidated?.opinion
  return done !== undefined && done.round >= done.maxRounds
}

/** Quanto texto cabe antes do "Ler tudo": 6 linhas no rascunho, 3 numa resposta (a medida é por linhas e por tamanho, sem depender de layout). */
export function needsReadAll(value: string, lines: number): boolean {
  return value.split('\n').length > lines || value.length > lines * 60
}

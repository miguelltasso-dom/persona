/**
 * IV-10 · de onde vem o alvo do "Responder": a Tarefa que tem pergunta aberta (`TaskView.question` + `TaskView.questionStreamId`, Forge 00:14).
 * O cartão de decisão da pergunta em palavras tem o id da Tarefa (o `ApprovalView` `attention` usa o id da Tarefa); aqui se junta o id ao fio
 * onde a pergunta foi feita. Puro: sem os dois campos não há alvo e o cartão segue como era (nada de botão morto).
 */
import type { KanbanCardModel } from '../kanban/types.ts'
import type { ReplyTarget } from './reply-target.ts'

/** "channel:geral" → canal `geral`; "dm:<id>" → a DM `<id>`. Qualquer outra forma não tem composer para responder. */
export function parseQuestionStream(streamId: string | undefined): { readonly streamKind: 'channel' | 'dm'; readonly ownerId: string } | undefined {
  if (streamId === undefined) return undefined
  const at = streamId.indexOf(':')
  if (at <= 0) return undefined
  const kind = streamId.slice(0, at)
  const ownerId = streamId.slice(at + 1)
  if (ownerId === '' || (kind !== 'channel' && kind !== 'dm')) return undefined
  return { streamKind: kind, ownerId }
}

/** O alvo de uma Tarefa com pergunta aberta; `personaName`/`personaId` são de quem a Tarefa está com (quem perguntou). */
export function replyTargetFromCard(card: KanbanCardModel): ReplyTarget | undefined {
  const question = card.question?.trim() ?? ''
  const stream = parseQuestionStream(card.questionStreamId)
  const asker = card.assignee
  if (question === '' || stream === undefined || asker === undefined || asker.name.trim() === '') return undefined
  return {
    ticketId: card.id,
    personaId: asker.id,
    personaName: asker.name.trim(),
    question,
    streamKind: stream.streamKind,
    ownerId: stream.ownerId,
  }
}

/** Os alvos por id da Tarefa (o mesmo id do cartão `attention` em Aprovações). */
export function replyTargetsByTicket(cards: readonly KanbanCardModel[]): ReadonlyMap<string, ReplyTarget> {
  const map = new Map<string, ReplyTarget>()
  for (const card of cards) {
    const target = replyTargetFromCard(card)
    if (target !== undefined) map.set(card.id, target)
  }
  return map
}

/**
 * FL-11 / IV-5: QUEM o botão Parar para. Puro (sem host): a resposta que está crescendo manda; sem ela, só quem está prestes a responder à última mensagem
 * DA PESSOA (o critério do "{persona} está escrevendo…": `typingPersona`). Persona trabalhando numa Tarefa do quadro NÃO é alvo: o Parar só existe
 * enquanto alguém de fato responde a esta conversa (Muse 03:26; antes, qualquer persona `working` deixava o ✕ no lugar do Enviar em todas as cenas).
 * O host cancela o turno aberto daquela persona (`stopTurn` só com `personaId` = "o que ela está rodando"; com `eventId` cancela também a resposta em andamento).
 */
import { typingPersona } from '../chat/typing-indicator.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import type { ChannelMessageUi } from './map-host-ui.ts'
import { resolveHostPersonaId } from './map-host-ui.ts'
import type { TeamView } from './persona-remote-types.ts'

export interface StopTarget {
  /** O id da persona NO HOST. */
  readonly personaId: string
  readonly personaName: string
  /** A mensagem da pessoa a que a resposta em andamento responde; ausente quando o alvo é uma Tarefa. */
  readonly eventId?: string
}

/** `coord-<idDaMensagemDaPessoa>-reply` → o id da mensagem da pessoa (quando o host não mandou `replyToId`). */
function eventIdOfReply(message: ChannelMessageUi): string | undefined {
  if (message.replyToId !== undefined) return message.replyToId
  const match = /^coord-(.+)-reply$/u.exec(message.id)
  return match?.[1]
}

export function pickStopTarget(input: {
  readonly messages: readonly ChannelMessageUi[]
  readonly members: readonly ChannelPersonaMember[]
  readonly team: TeamView | null
  readonly responderMemberId: string
}): StopTarget | null {
  const { messages, members, team, responderMemberId } = input
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.streaming !== true) continue
    const eventId = eventIdOfReply(message)
    return {
      personaId: message.authorPersonaId ?? resolveHostPersonaId(team, message.authorId),
      personaName: message.authorName,
      ...(eventId === undefined ? {} : { eventId }),
    }
  }
  const member = typingPersona(messages, members, responderMemberId)
  if (member === null) return null
  return { personaId: resolveHostPersonaId(team, member.id), personaName: member.name }
}

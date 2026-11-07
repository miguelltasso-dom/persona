/**
 * P1-4 (Muse 18:30 / BR-P3-SPEC): "{persona} está escrevendo…" no fio. Quem escreve é a persona que vai responder à última mensagem DA PESSOA:
 * a última mensagem do fio é da pessoa (um pedido sem resposta), nenhuma resposta já está crescendo (aí o balão que cresce é o sinal) e há
 * alguém trabalhando; entre os que trabalham, quem responde (`preferredId`, senão quem responde por padrão), senão o primeiro. Puro (sem host).
 * É também o critério do Parar (Muse 03:26): "está escrevendo…" e Parar existem juntos, e só então.
 */
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { defaultChannelResponderId } from './default-channel-responder.ts'

export function typingPersona(
  messages: readonly ChannelMessageUi[],
  members: readonly ChannelPersonaMember[],
  preferredId?: string,
): ChannelPersonaMember | null {
  const last = messages[messages.length - 1]
  if (last === undefined || last.authorId !== 'user' || last.sendFailed === true) return null
  if (messages.some(message => message.streaming === true)) return null
  const working = members.filter(member => member.state === 'working')
  if (working.length === 0) return null
  const responderId = preferredId !== undefined && preferredId !== '' ? preferredId : defaultChannelResponderId(members)
  return working.find(member => member.id === responderId) ?? working[0] ?? null
}

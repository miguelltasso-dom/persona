/**
 * COLHEITA-S1 P1-04 (Keel 12:38): quem aparece no indicador de BAIXO do fio. São as personas que estão trabalhando MENOS as que já têm
 * um partial aberto na própria linha (cada persona aparece uma vez, em um lugar só). Sem partial aberto, é o que já aparecia: o
 * responsável de `typingPersona`. O critério do Parar (`typingPersona`) NÃO muda; este arquivo só decide a exibição.
 * (O `typing-line.ts` é do Prism, microdetalhe 4 da Casa; não é este.)
 */
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'

/**
 * @param messages - O fio.
 * @param members - A equipe com o estado de cada persona.
 * @param typing - O responsável que `typingPersona` escolheu (null quando há um partial aberto).
 * @returns As personas a mostrar embaixo, cada uma no máximo uma vez.
 */
export function typingLineMembers(
  messages: readonly ChannelMessageUi[],
  members: readonly ChannelPersonaMember[],
  typing: ChannelPersonaMember | null,
): readonly ChannelPersonaMember[] {
  const partialIds = new Set(
    messages
      .filter(message => message.streaming === true && message.authorId !== 'user')
      .map(message => String(message.authorPersonaId ?? message.authorId)),
  )
  if (partialIds.size === 0) return typing === null ? [] : [typing]
  return members.filter(member => member.state === 'working' && !partialIds.has(String(member.id)))
}

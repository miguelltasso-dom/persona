/**
 * IV-10 · o gesto do "Responder", o mesmo em Aprovações e na Visão geral: escolhe o alvo (a loja), leva a pessoa à conversa onde a pergunta foi
 * feita (o canal, ou aquela DM) e, quando o composer já montou, devolve o foco a ele.
 */
import { requestComposerFocus } from '../chat/composer-focus.ts'
import { replyTargetStore, type ReplyTarget, type ReplyTargetStore } from './reply-target.ts'

/** O tempo para a conversa montar o composer antes de pedir o foco. */
export const COMPOSER_MOUNT_MS = 450

export function startReply(
  target: ReplyTarget,
  openConversation: ((streamKind: 'channel' | 'dm', ownerId: string) => void) | undefined,
  store: ReplyTargetStore = replyTargetStore,
  focus: () => void = requestComposerFocus,
): void {
  store.set(target)
  openConversation?.(target.streamKind, target.ownerId)
  setTimeout(focus, COMPOSER_MOUNT_MS)
}

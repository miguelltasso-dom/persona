/**
 * FL-11 / P0-18: o que a tela precisa da fila que o HOST guarda (a ponte entre `useWorkingQueue` e o `GeneralChannelView`/DM). A tela só
 * desenha e chama; quem fala com o host é o hook. Os itens com anexo continuam na fila local (o host guarda só texto).
 */
import type { QueuedMessageItem } from './QueuedMessageBubble.tsx'

export interface HostQueueControls {
  /** Os balões que o host guarda (em ordem de enfileiramento). */
  readonly items: readonly QueuedMessageItem[]
  /** A mensagem pronta do host quando algo falhou ("Essa mensagem já saiu da fila."); `null` = nada a dizer. */
  readonly error: string | null
  readonly clearError: () => void
  /** O último balão tirado: o Toast "Desfazer" o devolve com o MESMO id e na posição original. */
  readonly removed: QueuedMessageItem | null
  readonly dismissRemoved: () => void
  /** Enfileira (`reason: 'quota'` quando a cota acabou: o host só solta quando ela voltar). */
  /** `false` = o host não aceitou (a migração da fila local então mantém o balão local); `void` vale como aceito (fakes e telas que não esperam). */
  readonly enqueue: (text: string, responder: { readonly id: string; readonly name: string }, reason?: 'quota') => Promise<boolean> | void
  readonly sendNow: (id: string) => void
  /** "Editar": o texto novo substitui o do balão (não é uma mensagem nova). */
  readonly submitEdit: (id: string, text: string) => void
  readonly drop: (id: string) => void
  readonly undoDrop: () => void
}

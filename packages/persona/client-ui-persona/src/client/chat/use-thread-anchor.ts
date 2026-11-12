/**
 * Casa da Equipe, microdetalhe 11 (COLHEITA-MUSE §29b): o fio de cada canal volta exatamente onde a pessoa estava, sem animação. O fio guarda a
 * mensagem âncora (a 1ª que aparece no alto) enquanto a pessoa lê, e a esquece quando ela chega ao fim; ao abrir um canal, se há âncora o fio vai
 * até ela, senão abre no fim (o fim do fio é o padrão só para quem estava no fim). A conta mora em `thread-anchor.ts`.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { isNearBottom } from './new-below.ts'
import { firstVisibleMessageId, readThreadAnchor, rememberThreadAnchor, restoreThreadAnchor } from './thread-anchor.ts'

/**
 * @param scrollRef - O contêiner que rola o fio.
 * @param channelKey - A chave da conversa aberta (`channel:<id>`); trocar de canal restaura a posição do novo.
 * @param messageCount - Quantas mensagens o fio tem agora (a restauração espera as mensagens estarem no DOM).
 * @param ready - `false` enquanto o canal carrega (nada a restaurar nem a guardar).
 * @param enabled - Só com a flag da Casa ligada; desligada, o fio é o de sempre e este gancho não faz nada.
 */
export function useThreadAnchor(
  scrollRef: RefObject<HTMLElement | null>,
  channelKey: string,
  messageCount: number,
  ready: boolean,
  enabled: boolean,
): void {
  // O canal cuja posição já foi restaurada. Trocar de canal muda `channelKey`, e então `restoredFor` já não confere: o novo canal é restaurado
  // na sua vez (um efeito que zerasse isto rodaria DEPOIS do layout effect e apagaria a marca que ele acabou de pôr).
  const restoredFor = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!enabled || !ready || messageCount === 0 || restoredFor.current === channelKey) return
    const node = scrollRef.current
    if (node === null) return
    restoredFor.current = channelKey
    const anchor = readThreadAnchor(channelKey)
    // Sem âncora (ou com a mensagem fora do fio carregado): abre no fim.
    if (anchor === undefined || !restoreThreadAnchor(node, anchor)) node.scrollTop = node.scrollHeight
  }, [enabled, ready, messageCount, channelKey, scrollRef])

  useEffect(() => {
    if (!enabled) return undefined
    const node = scrollRef.current
    if (node === null) return undefined
    let frame = 0
    const save = (): void => {
      frame = 0
      // Antes de restaurar, o fio ainda está vazio ou no alto: guardar agora apagaria a posição que acabou de ser lida.
      if (restoredFor.current !== channelKey) return
      rememberThreadAnchor(channelKey, isNearBottom(node) ? undefined : firstVisibleMessageId(node))
    }
    const onScroll = (): void => { if (frame === 0) frame = requestAnimationFrame(save) }
    node.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      node.removeEventListener('scroll', onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [enabled, channelKey, scrollRef])
}

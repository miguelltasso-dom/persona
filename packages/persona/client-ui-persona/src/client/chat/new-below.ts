/**
 * Casa da Equipe, microdetalhe 5 (COLHEITA-MUSE §29b): a mensagem que chega NÃO faz o fio pular.
 *  - quem está no fim do fio: a mensagem entra e o fio rola junto (já era assim: `GeneralChannelView`, "perto do fim" = menos de 240 px);
 *  - quem subiu para ler: o fio não se mexe e aparece a pílula "↓ 2 mensagens novas"; ao clicar, o fio desce.
 * Aqui mora a conta (quantas chegaram abaixo do que a pessoa já viu) e o gancho que a faz; a pílula é desenhada em `NewMessagesPill`.
 */

import { useCallback, useEffect, useState, type RefObject } from 'react'

/** Mesma medida do "perto do fim" que rola o fio sozinho: o que está a menos disto do fim conta como "no fim". */
export const NEAR_BOTTOM_PX = 240

/** Medidas de rolagem de um contêiner (o que o gancho lê). */
export interface ScrollMetrics {
  readonly scrollHeight: number
  readonly scrollTop: number
  readonly clientHeight: number
}

export function isNearBottom(node: ScrollMetrics, threshold: number = NEAR_BOTTOM_PX): boolean {
  return node.scrollHeight - node.scrollTop - node.clientHeight < threshold
}

/**
 * Quantas mensagens chegaram depois da última que a pessoa viu.
 * @param ids - Os ids das mensagens do fio, em ordem.
 * @param lastSeenId - A última mensagem que a pessoa viu (estando no fim), ou `undefined` se ainda não se sabe.
 * @returns 0 quando não há o que contar (id desconhecido: o fio foi trocado, não é "novidade").
 */
export function countNewBelow(ids: readonly string[], lastSeenId: string | undefined): number {
  if (lastSeenId === undefined) return 0
  const at = ids.lastIndexOf(lastSeenId)
  return at < 0 ? 0 : ids.length - 1 - at
}

/**
 * @param scrollRef - O contêiner que rola o fio.
 * @param ids - Os ids das mensagens do fio, em ordem.
 * @returns `count`: quantas chegaram abaixo do que a pessoa viu (0 enquanto ela está no fim); `jumpToEnd`: desce até o fim.
 */
export function useNewMessagesBelow(scrollRef: RefObject<HTMLElement | null>, ids: readonly string[]): { readonly count: number; readonly jumpToEnd: () => void } {
  const last = ids.at(-1)
  const [seen, setSeen] = useState<string | undefined>(last)
  useEffect(() => {
    const node = scrollRef.current
    if (node === null) return undefined
    const update = (): void => { if (isNearBottom(node)) setSeen(previous => (previous === last ? previous : last)) }
    update()
    node.addEventListener('scroll', update, { passive: true })
    return () => { node.removeEventListener('scroll', update) }
  }, [scrollRef, last])
  const jumpToEnd = useCallback((): void => {
    const node = scrollRef.current
    if (node !== null) node.scrollTo({ top: node.scrollHeight })
    setSeen(last)
  }, [scrollRef, last])
  return { count: countNewBelow(ids, seen), jumpToEnd }
}

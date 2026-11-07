/**
 * "Ir até a mensagem e piscar 1×" (EQUIPE-REAL §(b) "O resumo a pedido": `posted` leva ao #geral e o cartão novo pisca; o "Ver" de `already` leva ao cartão).
 *
 * Quem pede ({@link requestMessageFocus}) só guarda o id e acorda a lista; quem desenha a lista ({@link useMessageFocus}) o procura entre as mensagens
 * que tem (a tela do canal pode ainda nem estar montada, ou o cartão ainda não ter chegado pelo fio: o pedido espera) e, ao achar o `[data-message-id]`,
 * rola até ele e marca `data-focus-pulse` por um ciclo. O estilo do pisco é de quem tem o cartão (CSS do cartão); sem movimento reduzido ele pisca 1×,
 * com `prefers-reduced-motion` só fica o destaque parado e a rolagem é instantânea.
 */

import { useEffect, useState } from 'react'

/** O atributo que o pisco deixa no elemento por um ciclo. */
export const FOCUS_PULSE_ATTRIBUTE = 'data-focus-pulse'

/** Quanto tempo o destaque fica, no máximo (a animação de 1× dura menos; isto é a rede de proteção se ela não rodar). */
const PULSE_MAX_MS = 2400

/** O pedido espera ser atendido por no máximo isto (o cartão chega pelo fio em instantes; depois disso a pessoa já foi para outro lugar). */
const REQUEST_TTL_MS = 15_000

let pendingId: string | undefined
let pendingAt = 0
const listeners = new Set<() => void>()

/** Pede para ir até a mensagem e destacá-la assim que ela estiver na lista. */
export function requestMessageFocus(messageId: string): void {
  pendingId = messageId
  pendingAt = Date.now()
  for (const listener of listeners) listener()
}

/** O pedido que ainda espera (para testes e diagnóstico). */
export function pendingMessageFocus(): string | undefined {
  return pendingId !== undefined && Date.now() - pendingAt <= REQUEST_TTL_MS ? pendingId : undefined
}

/** Descarta o pedido (testes). */
export function clearMessageFocus(): void {
  pendingId = undefined
}

function pulse(element: HTMLElement): void {
  const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  element.setAttribute(FOCUS_PULSE_ATTRIBUTE, '')
  const clear = (): void => { element.removeAttribute(FOCUS_PULSE_ATTRIBUTE) }
  element.addEventListener('animationend', clear, { once: true })
  setTimeout(clear, PULSE_MAX_MS)
}

/**
 * Na lista do fio: quando há um pedido de foco e a mensagem pedida está entre `messageIds`, rola até ela e a destaca.
 * @param messageIds - os ids das mensagens que a lista mostra agora.
 */
export function useMessageFocus(messageIds: readonly string[]): void {
  const [wake, setWake] = useState(0)
  useEffect(() => {
    const listener = (): void => { setWake(value => value + 1) }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
  useEffect(() => {
    const id = pendingMessageFocus()
    if (id === undefined || !messageIds.includes(id)) return
    const element = document.querySelector<HTMLElement>(`[data-message-id="${id.replaceAll('"', '\\"')}"]`)
    if (element === null) return
    pendingId = undefined
    pulse(element)
  }, [messageIds, wake])
}

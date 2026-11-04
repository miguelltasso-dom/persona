import { useEffect, type RefObject } from 'react'

/**
 * Foco do onboarding (Probe S7, WCAG 2.1.2 / 2.4.3): o diálogo é `aria-modal`, então o Tab NÃO pode sair dele e o foco
 * nunca fica no `<body>` depois de uma troca de passo. Sem `inert` no fundo (o shell não conhece o overlay), o laço é:
 *  - Tab/Shift+Tab dão a volta dentro do painel (inclusive quando o foco está em um título `tabindex=-1` ou no body);
 *  - qualquer foco que cair fora do painel volta para dentro;
 *  - ao fechar, o foco volta a quem o tinha.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Elementos que o Tab alcança dentro do painel, na ordem do documento. */
export function tabbablesIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    node => node.tabIndex >= 0 && node.closest('[hidden],[inert],[aria-hidden="true"]') === null,
  )
}

/**
 * Próximo/anterior alvo do Tab a partir do foco atual, dando a volta nas pontas.
 * `from` pode ser um elemento fora da lista (título `tabindex=-1`, body): vale a posição dele no documento.
 */
export function nextTabTarget(list: readonly HTMLElement[], from: Element | null, backwards: boolean): HTMLElement | undefined {
  if (list.length === 0) return undefined
  if (from === null || !(from instanceof HTMLElement)) return backwards ? list[list.length - 1] : list[0]
  const index = list.indexOf(from)
  if (index >= 0) {
    const next = backwards ? index - 1 : index + 1
    return list[(next + list.length) % list.length]
  }
  const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
  if (backwards) {
    const before = list.filter(node => (node.compareDocumentPosition(from) & FOLLOWING) !== 0)
    return before.length > 0 ? before[before.length - 1] : list[list.length - 1]
  }
  const after = list.find(node => (from.compareDocumentPosition(node) & FOLLOWING) !== 0)
  return after ?? list[0]
}

/** O próximo Tab natural sairia do painel? (última parada, ou um título `tabindex=-1` sem parada depois dele). */
export function tabWouldLeave(list: readonly HTMLElement[], current: HTMLElement, backwards: boolean): boolean {
  const index = list.indexOf(current)
  if (index >= 0) return backwards ? index === 0 : index === list.length - 1
  const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING
  return backwards
    ? !list.some(node => (node.compareDocumentPosition(current) & FOLLOWING) !== 0)
    : !list.some(node => (current.compareDocumentPosition(node) & FOLLOWING) !== 0)
}

/** Prende o foco em `panelRef` enquanto `active`. */
export function useFocusTrap(panelRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return undefined
    const panel = panelRef.current
    if (panel === null) return undefined
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null

    if (!panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>('[data-autofocus]') ?? tabbablesIn(panel)[0]
      first?.focus({ preventScroll: true })
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || event.defaultPrevented) return
      const list = tabbablesIn(panel)
      if (list.length === 0) {
        event.preventDefault()
        return
      }
      const current = document.activeElement
      const inside = current instanceof HTMLElement && panel.contains(current)
      // Só intervém quando o Tab sairia do painel (ou o foco já está fora): no meio da lista o navegador cuida.
      if (!inside || tabWouldLeave(list, current, event.shiftKey)) {
        event.preventDefault()
        nextTabTarget(list, inside ? current : null, event.shiftKey)?.focus()
      }
    }

    const onFocusIn = (event: FocusEvent): void => {
      if (event.target instanceof Node && !panel.contains(event.target)) {
        const first = tabbablesIn(panel)[0]
        first?.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn)
      if (previous !== null && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [panelRef, active])
}

/** Leva o foco para o início do passo: título (`h1`) ou o alvo marcado (`data-persona-step-focus`), sem rolar. */
export function focusStepStart(root: HTMLElement): void {
  const target = root.querySelector<HTMLElement>('[data-persona-step-focus]') ?? root.querySelector<HTMLElement>('h1')
  if (target === null) {
    tabbablesIn(root)[0]?.focus({ preventScroll: true })
    return
  }
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
}

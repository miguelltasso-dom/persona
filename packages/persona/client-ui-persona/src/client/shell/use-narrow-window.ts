import { useSyncExternalStore } from 'react'

/**
 * Janela estreita (largura ≤ 960 px, p. ex. zoom de 200% ou uma janela pequena): a barra única de conversas vira o trilho de 64 px
 * (CONVERSAS-SPEC §0) e abre inteira por cima. Medido pela media query, nunca por `innerWidth` solto.
 */
export const NARROW_WINDOW_QUERY = '(max-width: 960px)'

function subscribe(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(NARROW_WINDOW_QUERY)
  media.addEventListener('change', listener)
  return () => { media.removeEventListener('change', listener) }
}

function snapshot(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_WINDOW_QUERY).matches
}

export function useNarrowWindow(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

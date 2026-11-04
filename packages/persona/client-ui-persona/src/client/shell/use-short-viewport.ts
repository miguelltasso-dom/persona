import { useSyncExternalStore } from 'react'

/**
 * Janela baixa (altura < 600 px, p. ex. zoom de 200% num notebook): o rail tira a folhagem e junta o rodapé numa linha
 * (UX-BEYOND P0-22, NAV-SPEC regra 6). Medido pela media query, nunca por `innerHeight` solto.
 */
export const SHORT_VIEWPORT_QUERY = '(max-height: 599px)'

function subscribe(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(SHORT_VIEWPORT_QUERY)
  media.addEventListener('change', listener)
  return () => { media.removeEventListener('change', listener) }
}

function snapshot(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(SHORT_VIEWPORT_QUERY).matches
}

export function useShortViewport(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

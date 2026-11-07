/**
 * CV-9 (CONVERSAS-SPEC §CV-9): a folhinha que sai do canto superior direito do 1º balão de cada grupo da persona. É o ÚNICO enfeite do
 * balão: fica FORA do texto, é `aria-hidden`, e some a 200% e em `forced-colors` (o CSS de quem a usa decide). A cor vem do token
 * `success`; o traço, do contorno.
 */
import type { ReactNode } from 'react'

export function MessageSprig({ className }: { readonly className?: string | undefined }): ReactNode {
  return (
    <svg className={className} aria-hidden="true" focusable="false" width="22" height="16" viewBox="0 0 22 16" data-persona-sprig="">
      <path d="M2 14C6 6 12 3 20 2c-2 6-7 11-18 12Z" fill="currentColor" opacity=".55" />
      <path d="M3 13c5-4 9-7 15-9" fill="none" stroke="var(--persona-outline)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

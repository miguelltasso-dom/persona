import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the Persona mark (symbol from persona-assets/brand).
 * @param props - Host-supplied mark presentation.
 * @returns the Persona animal-head mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 80 104" aria-hidden="true">
      <path fill="#675290" fillRule="evenodd" d="M13 39C9 31 10 17 13 9c1-3 4-4 7-2l13 11c5-1 10-1 15 0L61 7c3-2 6-1 7 2 3 8 4 22 0 30 5 7 7 14 7 22 0 20-15 33-35 33-5 0-9-1-13-2L12 99c-2 1-4-1-3-3l4-15C7 75 5 68 5 60c0-8 3-15 8-21Zm16 5c-3 0-5 2-5 5v31l8-4c2-1 3-3 3-5v-2h11c10 0 16-5 16-13s-6-12-16-12H29Z" />
      <path fill="#E8AF54" d="M16 16c0-2 1-3 3-2l8 7-10 5c-1-3-1-7-1-10Zm48 0c0-2-1-3-3-2l-8 7 10 5c1-3 1-7 1-10Z" />
      <circle cx="38" cy="56" r="3.2" fill="#E8AF54" />
      <circle cx="49" cy="56" r="3.2" fill="#E8AF54" />
    </svg>
  )
}

/**
 * Render the Persona name artwork without its independently slotted mark.
 * @returns the Persona wordmark.
 */
export function OfficialBrandName() {
  return (
    <svg viewBox="26 0 156 24" height={24} role="img" aria-hidden="true">
      <text x="26" y="18" fill="currentColor" fontSize="16" fontFamily="system-ui, sans-serif">Persona</text>
    </svg>
  )
}

/** Sync Persona palette with OS color scheme (Playwright + desktop). */

/** Toggles `body[data-ds-dark-theme]` from `prefers-color-scheme`. */
export function installPersonaColorScheme(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    if (document.body === null) return
    document.body.toggleAttribute('data-ds-dark-theme', media.matches)
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true })
  } else {
    apply()
  }
  media.addEventListener('change', apply)
}

/** Sync Persona palette with OS color scheme (Playwright + desktop). */

/** Toggles `body[data-ds-dark-theme]` from `prefers-color-scheme`. */
export function installPersonaColorScheme(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    const body = document.body as HTMLElement | null
    if (body === null) return
    body.toggleAttribute('data-ds-dark-theme', media.matches)
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true })
  } else {
    apply()
  }
  media.addEventListener('change', apply)
  installAmbientPause()
}

/** UX-GUIDE §2.3: pause every ambient loop (breathing, blink, seals, shimmer) while the window is hidden. */
function installAmbientPause(): void {
  const sync = (): void => {
    const body = document.body as HTMLElement | null
    if (body === null) return
    body.toggleAttribute('data-persona-hidden', document.hidden)
  }
  document.addEventListener('visibilitychange', sync)
  sync()
}

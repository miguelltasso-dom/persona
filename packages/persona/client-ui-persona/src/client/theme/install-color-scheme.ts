/** Sync Persona palette with OS color scheme (Playwright + desktop). */

/** Atributo do tema escuro no `body` (o mesmo do `theme-presenter` do host). */
export const DARK_THEME_ATTRIBUTE = 'data-ds-dark-theme'

/**
 * Escuro = `body[data-ds-dark-theme="true"]`; claro = atributo ausente.
 *
 * Os dois lados do app leem o atributo de jeitos diferentes: a paleta e os módulos do Persona casam o VALOR
 * (`[data-ds-dark-theme='true']`), enquanto os componentes do host (`ui-layout`, `ui-deliverables`, `ui-plan`,
 * `ui-primitives`) casam a PRESENÇA (`body[data-ds-dark-theme]`). Só "true"/ausente serve aos dois:
 * `toggleAttribute` deixava o valor vazio (a paleta nunca ficava escura) e `setAttribute(…, 'false')` deixaria os
 * componentes do host escuros no tema claro.
 */
export function applyPersonaColorScheme(body: HTMLElement, dark: boolean): void {
  if (dark) body.setAttribute(DARK_THEME_ATTRIBUTE, 'true')
  else body.removeAttribute(DARK_THEME_ATTRIBUTE)
}

/** Keeps `body[data-ds-dark-theme="true"]` in step with `prefers-color-scheme`. */
export function installPersonaColorScheme(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    const body = document.body as HTMLElement | null
    if (body === null) return
    applyPersonaColorScheme(body, media.matches)
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

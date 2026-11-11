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
  // Idempotente: reescrever o mesmo valor também gera um registro do MutationObserver, e o observador do `body` reaplica.
  if (dark) {
    if (body.getAttribute(DARK_THEME_ATTRIBUTE) !== 'true') body.setAttribute(DARK_THEME_ATTRIBUTE, 'true')
  } else if (body.hasAttribute(DARK_THEME_ATTRIBUTE)) {
    body.removeAttribute(DARK_THEME_ATTRIBUTE)
  }
}

/**
 * Atributo do `<html>` que o apresentador de tema do host publica (`ThemePresenter`): `light`/`dark` quando a preferência é
 * fixa (escolhida em Configurações) e `system` quando segue o Windows.
 */
export const THEME_SOURCE_ATTRIBUTE = 'data-ds-theme-source'

/** As três escolhas de tema da pessoa (Configurações › Aparência); "system" segue o Windows. */
export type ThemeChoice = 'system' | 'light' | 'dark'

/**
 * O tema forçado pelo app instalado (`PERSONA_THEME` / `--persona-theme=`, para testes e capturas); vence a escolha da pessoa (TH-1).
 * O desktop publica o valor em `window.personaDesktop.forcedTheme`; sem ele (web, galeria, build sem o campo) não há tema forçado.
 */
export function readForcedTheme(win: Window | undefined = typeof window === 'undefined' ? undefined : window): ThemeChoice | undefined {
  const forced = (win as (Window & { personaDesktop?: { forcedTheme?: unknown } }) | undefined)?.personaDesktop?.forcedTheme
  return forced === 'system' || forced === 'light' || forced === 'dark' ? forced : undefined
}

/**
 * Escuro ou claro, nesta ordem: preferência fixa do host (`html[data-ds-theme-source]` = `dark`/`light`); senão o sistema
 * (`prefers-color-scheme`, que no exe segue o `nativeTheme`).
 */
export function resolvePersonaDark(root: HTMLElement, systemDark: boolean, forced?: ThemeChoice): boolean {
  // O tema forçado pelo app instalado (PERSONA_THEME) vence a escolha da pessoa (TH-1); "system" forçado ignora a preferência salva.
  if (forced === 'dark') return true
  if (forced === 'light') return false
  if (forced === 'system') return systemDark
  const source = root.getAttribute(THEME_SOURCE_ATTRIBUTE)
  if (source === 'dark') return true
  if (source === 'light') return false
  return systemDark
}

/**
 * Keeps `body[data-ds-dark-theme="true"]` in step with the host theme, live.
 *
 * Quem escreve o atributo: o script de boot e o `ThemePresenter` do host (a cada `theme/change`: troca manual em
 * Configurações, o Windows mudando com a preferência em "Sistema") escrevem a PRESENÇA (`data-ds-dark-theme=""`); a paleta e os
 * módulos do Persona casam o VALOR `"true"`. Por isso o instalador (1) resolve o tema pela preferência fixa do host ou, no
 * "Sistema", pelo `prefers-color-scheme`; (2) normaliza qualquer `""` do host para `"true"` na hora (MutationObserver) e (3) refaz a
 * resolução quando `html[data-ds-theme-source]` ou o sistema mudam. Claro = atributo AUSENTE.
 * @returns Desinstalador (testes e remontagem); o app nunca o chama.
 */
export function installPersonaColorScheme(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    const body = document.body as HTMLElement | null
    if (body === null) return
    applyPersonaColorScheme(body, resolvePersonaDark(document.documentElement, media.matches, readForcedTheme()))
  }
  // O host escreveu a presença (`""`): é escuro, mas com o valor que só os componentes do host entendem. Com tema forçado
  // (PERSONA_THEME), qualquer escrita do host no `body` é refeita: a preferência salva não pode desfazer o forçado.
  const normalizeHostWrite = (): void => {
    const body = document.body as HTMLElement | null
    if (body === null) return
    if (readForcedTheme() !== undefined) apply()
    else if (body.getAttribute(DARK_THEME_ATTRIBUTE) === '') applyPersonaColorScheme(body, true)
  }
  const observers: MutationObserver[] = []
  let started = false
  const start = (): void => {
    if (started) return
    started = true
    apply()
    if (typeof MutationObserver === 'undefined') return
    const bodyObserver = new MutationObserver(normalizeHostWrite)
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: [DARK_THEME_ATTRIBUTE] })
    const sourceObserver = new MutationObserver(apply)
    sourceObserver.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_SOURCE_ATTRIBUTE] })
    observers.push(bodyObserver, sourceObserver)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
  media.addEventListener('change', apply)
  const stopAmbientPause = installAmbientPause()
  return () => {
    document.removeEventListener('DOMContentLoaded', start)
    media.removeEventListener('change', apply)
    for (const observer of observers) observer.disconnect()
    stopAmbientPause()
  }
}

/** UX-GUIDE §2.3: pause every ambient loop (breathing, blink, seals, shimmer) while the window is hidden or unfocused. */
function installAmbientPause(): () => void {
  const sync = (): void => {
    const body = document.body as HTMLElement | null
    if (body === null) return
    body.toggleAttribute('data-persona-hidden', document.hidden)
    // D-101: a visible-but-unfocused window (second monitor, user in another app) kept every loop at full rate; the
    // compositor only stops when the document is hidden. Focus is the missing signal.
    body.toggleAttribute('data-persona-unfocused', !document.hidden && !document.hasFocus())
  }
  document.addEventListener('visibilitychange', sync)
  window.addEventListener('focus', sync)
  window.addEventListener('blur', sync)
  sync()
  return () => {
    document.removeEventListener('visibilitychange', sync)
    window.removeEventListener('focus', sync)
    window.removeEventListener('blur', sync)
  }
}

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

/**
 * DESIGN-01 §2.7 rule 3: one body attribute pauses every ambient loop when the window is hidden, unfocused, or idle for
 * 15 s with no working/reviewing turn. Input or a turn resumes on the same frame.
 */
function installAmbientPause(): () => void {
  let lastInput = Date.now()
  // The focus EVENT owns this flag: a synthetic `blur` (the preaccept gate) never changes document.hasFocus().
  let focused = document.hasFocus()
  const markInput = (): void => { lastInput = Date.now() }
  const sync = (): void => {
    const body = document.body as HTMLElement | null
    if (body === null) return
    const busy = document.querySelector(
      '[data-streaming], [data-persona-shell] [data-state="working"], [data-persona-shell] [data-state="reviewing"]',
    ) !== null
    const idle = Date.now() - lastInput >= 15_000
    // DESIGN-01 §2.7 rule 3: a full-screen scrim (onboarding, modal) covers the shell; the loops behind it are invisible
    // and their blend through the scrim is exactly what kept the compositor busy on the onboarding screen. The cover pauses
    // ONLY the shell subtree (its own entrance animations keep running).
    const covered = document.querySelector('[data-persona-cover]') !== null
    body.toggleAttribute('data-persona-covered', covered)
    const paused = document.hidden || !focused || (idle && !busy)
    body.toggleAttribute('data-persona-ambient-paused', paused)
    if (paused) pauseAnimations()
    else if (covered) pauseAnimations(document.querySelector('[data-persona-shell]'))
    else resumeAnimations()
  }
  // WAAPI animations (the pose/cursor loops) ignore `animation-play-state`; the gate counts them as running. Pause the ones
  // we found running and resume exactly those, so a finished transition never restarts.
  const pausedAnimations = new Set<Animation>()
  const pauseAnimations = (scope?: Element | null): void => {
    // jsdom (tests) and older engines have no getAnimations; the CSS rule still covers the CSS animations there.
    if (typeof document.getAnimations !== 'function') return
    for (const animation of document.getAnimations()) {
      if (animation.playState !== 'running' || pausedAnimations.has(animation)) continue
      if (scope !== undefined && scope !== null) {
        const target = (animation.effect as KeyframeEffect | null)?.target
        if (!(target instanceof Element) || !scope.contains(target)) continue
        // The overlay lives in a shell slot: the cover's own entrance animations keep running.
        if (target.closest('[data-persona-cover]') !== null) continue
      }
      animation.pause()
      pausedAnimations.add(animation)
    }
  }
  const resumeAnimations = (): void => {
    for (const animation of pausedAnimations) if (animation.playState === 'paused') animation.play()
    pausedAnimations.clear()
  }
  const onFocus = (): void => { focused = true; sync() }
  const onBlur = (): void => { focused = false; sync() }
  const inputs = ['pointermove', 'keydown', 'wheel', 'touchstart'] as const
  for (const event of inputs) window.addEventListener(event, markInput, { passive: true })
  const timer = setInterval(sync, 1_000)
  document.addEventListener('visibilitychange', sync)
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)
  // A scrim opening/closing announces itself: the cover pauses and resumes on the same frame instead of the next tick.
  window.addEventListener('persona:cover-change', sync)
  sync()
  return () => {
    for (const event of inputs) window.removeEventListener(event, markInput)
    clearInterval(timer)
    document.removeEventListener('visibilitychange', sync)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('persona:cover-change', sync)
  }
}

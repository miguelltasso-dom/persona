/** TypeScript mirror of Persona CSS design tokens (no color literals here). */

/** Semantic Persona palette token names (values live in persona-palette.css). */
export const PERSONA_COLOR_TOKENS = [
  '--persona-rail',
  '--persona-rail-ink',
  '--persona-surface',
  '--persona-surface-alt',
  '--persona-ink',
  '--persona-ink-muted',
  '--persona-accent',
  '--persona-accent-ink',
  '--persona-lilac-100',
  '--persona-lilac-200',
  '--persona-lilac-300',
  '--persona-lilac-400',
  '--persona-lilac-500',
  '--persona-lilac-600',
  '--persona-lilac-700',
  '--persona-lilac-800',
  '--persona-lilac-900',
  '--persona-success',
  '--persona-warning',
  '--persona-danger',
  '--persona-info',
  '--persona-active-rail',
  '--persona-active-rail-ink',
  '--persona-active-surface',
  '--persona-active-surface-alt',
  '--persona-active-ink',
  '--persona-active-ink-muted',
  '--persona-active-accent',
  '--persona-active-accent-ink',
] as const

export type PersonaColorToken = typeof PERSONA_COLOR_TOKENS[number]

/** Motion duration tokens (CSS custom properties). */
export const PERSONA_MOTION_DURATION_TOKENS = [
  '--motion-instant',
  '--motion-fast',
  '--motion-panel',
  '--motion-message',
  '--motion-base',
  '--motion-slow',
  '--motion-celebrate',
  '--motion-celebrate-burst',
  '--motion-character',
  '--motion-reduced-fade',
] as const

export type PersonaMotionDurationToken = typeof PERSONA_MOTION_DURATION_TOKENS[number]

/** Motion easing tokens (CSS custom properties). */
export const PERSONA_MOTION_EASING_TOKENS = [
  '--ease-press',
  '--ease-standard',
  '--ease-enter',
  '--ease-exit',
  '--ease-spring',
  '--ease-carry',
  '--ease-glow',
] as const

export type PersonaMotionEasingToken = typeof PERSONA_MOTION_EASING_TOKENS[number]

/** Régua de controles (COLHEITA §14): altura e raio de todo controle clicável. Os valores vivem em persona-palette.css. */
export const PERSONA_CONTROL_HEIGHT_TOKENS = ['--control-h-s', '--control-h-m', '--control-h-l'] as const
export type PersonaControlHeightToken = typeof PERSONA_CONTROL_HEIGHT_TOKENS[number]
export const PERSONA_CONTROL_RADIUS_TOKENS = ['--control-r-s', '--control-r-m', '--control-r-l'] as const
export type PersonaControlRadiusToken = typeof PERSONA_CONTROL_RADIUS_TOKENS[number]

/** Named motion presets for TS callers (resolved to CSS variables at runtime). */
export const PERSONA_MOTION_PRESETS = {
  instant: { duration: '--motion-instant', easing: '--ease-standard' },
  fast: { duration: '--motion-fast', easing: '--ease-standard' },
  base: { duration: '--motion-base', easing: '--ease-enter' },
  slow: { duration: '--motion-slow', easing: '--ease-exit' },
  character: { duration: '--motion-character', easing: '--ease-spring' },
  fadeReduced: { duration: '--motion-reduced-fade', easing: '--ease-standard' },
  // DESIGN-01-MUSE §2 (11/11): the named moments of the motion system.
  press: { duration: '--motion-instant', easing: '--ease-press' },
  panel: { duration: '--motion-panel', easing: '--ease-enter' },
  message: { duration: '--motion-message', easing: '--ease-enter' },
  pose: { duration: '--motion-base', easing: '--ease-spring' },
  carry: { duration: '--motion-slow', easing: '--ease-carry' },
  stamp: { duration: '--motion-celebrate', easing: '--ease-spring' },
  burst: { duration: '--motion-celebrate-burst', easing: '--ease-enter' },
} as const satisfies Record<string, { duration: PersonaMotionDurationToken; easing: PersonaMotionEasingToken }>

export type PersonaMotionPresetName = keyof typeof PERSONA_MOTION_PRESETS

/** Persona state vocabulary (DESIGN-01-MUSE §0.2): one CSS color token per state, used by rail, strip, cards, org chart and DM. */
export const PERSONA_STATE_TOKENS = {
  working: '--persona-state-working',
  reviewing: '--persona-state-reviewing',
  waiting: '--persona-state-waiting',
  draft: '--persona-state-draft',
  stuck: '--persona-state-stuck',
  available: '--persona-state-available',
  resting: '--persona-state-resting',
  paused: '--persona-state-paused',
  offline: '--persona-state-offline',
} as const

export type PersonaStateName = keyof typeof PERSONA_STATE_TOKENS

/** Active states draw a filled dot; idle states draw a ring (DESIGN-01-MUSE §0.2). */
export const PERSONA_STATE_FILLED: Readonly<Record<PersonaStateName, boolean>> = {
  working: true, reviewing: true, waiting: true, draft: true, stuck: true,
  available: false, resting: false, paused: false, offline: false,
}

/** Read a computed custom property from the document root. */
export function readCssVar(
  name: PersonaColorToken | PersonaMotionDurationToken | PersonaMotionEasingToken,
  target: Element = document.documentElement,
): string {
  return getComputedStyle(target).getPropertyValue(name).trim()
}

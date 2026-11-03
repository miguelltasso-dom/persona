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
  '--motion-base',
  '--motion-slow',
  '--motion-character',
  '--motion-reduced-fade',
] as const

export type PersonaMotionDurationToken = typeof PERSONA_MOTION_DURATION_TOKENS[number]

/** Motion easing tokens (CSS custom properties). */
export const PERSONA_MOTION_EASING_TOKENS = [
  '--ease-standard',
  '--ease-enter',
  '--ease-exit',
  '--ease-spring',
] as const

export type PersonaMotionEasingToken = typeof PERSONA_MOTION_EASING_TOKENS[number]

/** Named motion presets for TS callers (resolved to CSS variables at runtime). */
export const PERSONA_MOTION_PRESETS = {
  instant: { duration: '--motion-instant', easing: '--ease-standard' },
  fast: { duration: '--motion-fast', easing: '--ease-standard' },
  base: { duration: '--motion-base', easing: '--ease-enter' },
  slow: { duration: '--motion-slow', easing: '--ease-exit' },
  character: { duration: '--motion-character', easing: '--ease-spring' },
  fadeReduced: { duration: '--motion-reduced-fade', easing: '--ease-standard' },
} as const satisfies Record<string, { duration: PersonaMotionDurationToken; easing: PersonaMotionEasingToken }>

export type PersonaMotionPresetName = keyof typeof PERSONA_MOTION_PRESETS

/** Read a computed custom property from the document root. */
export function readCssVar(
  name: PersonaColorToken | PersonaMotionDurationToken | PersonaMotionEasingToken,
  target: Element = document.documentElement,
): string {
  return getComputedStyle(target).getPropertyValue(name).trim()
}

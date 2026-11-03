/** Persona theme tokens and motion utilities. */

import './persona-palette.css'

export {
  PERSONA_COLOR_TOKENS,
  PERSONA_MOTION_DURATION_TOKENS,
  PERSONA_MOTION_EASING_TOKENS,
  PERSONA_MOTION_PRESETS,
  readCssVar,
  type PersonaColorToken,
  type PersonaMotionDurationToken,
  type PersonaMotionEasingToken,
  type PersonaMotionPresetName,
} from './tokens.ts'

export { usePersonaMotion, type PersonaMotionOptions, type PersonaMotionResult } from './usePersonaMotion.ts'

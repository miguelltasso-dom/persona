/** Persona theme tokens and motion utilities. */

import './fonts/persona-fonts.generated.css'
import './persona-palette.css'
import './persona-base.css'
import '../assets/generated-imports.ts'

export {
  PERSONA_COLOR_TOKENS,
  PERSONA_MOTION_DURATION_TOKENS,
  PERSONA_MOTION_EASING_TOKENS,
  PERSONA_MOTION_PRESETS,
  PERSONA_STATE_FILLED,
  PERSONA_STATE_TOKENS,
  readCssVar,
  type PersonaStateName,
  type PersonaColorToken,
  type PersonaMotionDurationToken,
  type PersonaMotionEasingToken,
  type PersonaMotionPresetName,
} from './tokens.ts'

export { usePersonaMotion, type PersonaMotionOptions, type PersonaMotionResult } from './usePersonaMotion.ts'

/** Build-time asset imports resolve to URLs after bundle (see tsdown client preset). */

export type PersonaPoseState =
  | 'disponivel'
  | 'trabalhando'
  | 'revisando'
  | 'aguardando-resposta'
  | 'aguardando-aprovacao'
  | 'descansando'
  | 'offline'
  | 'erro'

export type PersonaCharacterId = 'atlas' | 'bento' | 'nina' | 'sol' | 'luna'

const POSE_IMPORTS: Record<string, string> = {}

/** Register pose URL at module init (generated webp under assets/poses/). */
export function registerPoseUrl(key: string, url: string): void {
  POSE_IMPORTS[key] = url
}

/**
 * Pose image URL for a character and state; falls back to disponivel.
 * @param character - roster id.
 * @param state - pose filename segment.
 */
export function poseUrl(character: PersonaCharacterId, state: PersonaPoseState): string | undefined {
  const key = `${character}-${state}`
  return POSE_IMPORTS[key] ?? POSE_IMPORTS[`${character}-disponivel`]
}

export type PersonaPoseLifeVariant = 'disponivel-blink' | 'disponivel-tail'

/** Blink/tail frames for UX-GUIDE §3 idle choreography. */
export function poseLifeUrl(character: PersonaCharacterId, variant: PersonaPoseLifeVariant): string | undefined {
  return POSE_IMPORTS[`${character}-${variant}`]
}

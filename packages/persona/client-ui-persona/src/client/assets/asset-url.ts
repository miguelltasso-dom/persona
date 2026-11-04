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
  | 'acenando'
  // Muse (BR-P3 P1, 04/11): for now only the 5 core characters have these; use `hasPose` before relying on them.
  | 'comemorando'
  | 'digitando'
  | 'lendo'
  | 'confuso'

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
/**
 * Whether this character has its own art for `state` (no fallback). `poseUrl` silently falls back to `disponivel`,
 * which is right for the team strip but wrong for meaning-bearing states ("está escrevendo…" must not show a
 * waving pose): check `hasPose` and use the avatar + text when it is false.
 */
export function hasPose(character: PersonaCharacterId, state: PersonaPoseState): boolean {
  return POSE_IMPORTS[`${character}-${state}`] !== undefined
}

export function poseUrl(character: PersonaCharacterId, state: PersonaPoseState): string | undefined {
  const key = `${character}-${state}`
  return POSE_IMPORTS[key] ?? POSE_IMPORTS[`${character}-disponivel`]
}

export type PersonaPoseLifeVariant = 'disponivel-blink' | 'disponivel-tail'

/** Blink/tail frames for UX-GUIDE §3 idle choreography. */
export function poseLifeUrl(character: PersonaCharacterId, variant: PersonaPoseLifeVariant): string | undefined {
  return POSE_IMPORTS[`${character}-${variant}`]
}

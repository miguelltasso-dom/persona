/** Gallery ids aligned with PersonaEditor GALLERY (17 Brush animals). */
export const PERSONA_GALLERY_ANIMALS: readonly string[] = [
  'atlas', 'bento', 'nina', 'sol', 'luna', 'capivara', 'cervo', 'coelho', 'coruja',
  'guaxinim', 'lobo-guara', 'lontra', 'ourico', 'panda', 'raposa', 'tamandua', 'tucano',
] as const

/**
 * First gallery animal not already used on the team roster.
 * @param usedAvatarRefs - Host persona `avatarRef` values (any casing).
 */
export function pickUnusedGalleryAnimal(usedAvatarRefs: readonly string[]): string {
  const used = new Set(usedAvatarRefs.map(ref => ref.trim().toLowerCase()).filter(ref => ref.length > 0))
  for (const id of PERSONA_GALLERY_ANIMALS) {
    if (!used.has(id)) return id
  }
  return PERSONA_GALLERY_ANIMALS[0] ?? 'capivara'
}

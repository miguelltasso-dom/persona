/**
 * A proposed hire never reuses the NAME or the ANIMAL of someone already on the team (Muse, A-4): the Aprovações card
 * would read “Contratar Bento?” with the face of the Bento who is already there. The host picks a free animal of the
 * gallery and a free name before the proposal is stored, so the card and the persona created later agree.
 */

/** The 17 Brush animals of the gallery (same ids as the persona editor). */
export const GALLERY_ANIMALS: readonly string[] = [
  'atlas', 'bento', 'nina', 'sol', 'luna', 'capivara', 'cervo', 'coelho', 'coruja',
  'guaxinim', 'lobo-guara', 'lontra', 'ourico', 'panda', 'raposa', 'tamandua', 'tucano',
]

/** Friendly pt-BR names offered when the requested one is taken. None is a template name (Atlas, Bento, Nina, Sol, Luna). */
const NAME_POOL: readonly string[] = [
  'Teca', 'Dora', 'Caio', 'Bia', 'Davi', 'Rita', 'Tomás', 'Vera', 'Ivo', 'Lara', 'Júlio', 'Maia', 'Otto', 'Pedro',
  'Lívia', 'Heitor', 'Cora', 'Murilo', 'Zélia', 'Enzo', 'Helena', 'Rui', 'Sara', 'Beto',
]

/** What a proposal needs to know about the team. */
export interface TakenIdentities {
  /** Names of personas (and pending hire proposals) already in use. */
  readonly names: readonly string[]
  /** Gallery refs (`avatarRef`) already in use. */
  readonly avatarRefs: readonly string[]
}

/** The identity the host chose. */
export interface HireIdentity {
  readonly name: string
  readonly avatarRef: string
  readonly renamed: boolean
  readonly reanimaled: boolean
}

/**
 * Lowercase, accent-free, trimmed: how two names are compared.
 * @param value - Name or ref.
 */
export function identityKey(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/gu, '').trim().toLowerCase()
}

/**
 * D-069 (Muse): a persona the host creates always has the default ANIMAL of the gallery. An animal the caller named stays (the person
 * may repeat one on purpose); anything else (empty, "neutral", the slug of the name) becomes the first animal not already on the team.
 * @param requestedRef - The gallery ref asked for.
 * @param usedRefs - The animals already on the team.
 * @returns A gallery animal.
 */
export function animalFor(requestedRef: string, usedRefs: readonly string[]): string {
  const wanted = identityKey(requestedRef)
  if (GALLERY_ANIMALS.includes(wanted)) return wanted
  const used = new Set(usedRefs.map(identityKey))
  return GALLERY_ANIMALS.find(candidate => !used.has(candidate)) ?? (GALLERY_ANIMALS.at(-1) ?? 'capivara')
}

/**
 * Keep the requested name and animal when they are free; otherwise pick a free one.
 * @param requestedName - Name the proposer asked for.
 * @param requestedRef - Gallery ref the proposer asked for (empty ⇒ derive from the name).
 * @param taken - Names and animals already on the team.
 */
export function resolveHireIdentity(requestedName: string, requestedRef: string, taken: TakenIdentities): HireIdentity {
  const usedNames = new Set(taken.names.map(identityKey))
  const usedRefs = new Set(taken.avatarRefs.map(identityKey))
  const wantedName = requestedName.trim()
  let name = wantedName
  if (name === '' || usedNames.has(identityKey(name))) {
    name = NAME_POOL.find(candidate => !usedNames.has(identityKey(candidate)))
      ?? `${wantedName === '' ? 'Nova' : wantedName} ${String(usedNames.size + 1)}`
  }
  const wantedRef = identityKey(requestedRef === '' ? requestedName : requestedRef)
  const galleryRef = GALLERY_ANIMALS.includes(wantedRef) ? wantedRef : ''
  let avatarRef = galleryRef
  if (avatarRef === '' || usedRefs.has(avatarRef)) {
    avatarRef = GALLERY_ANIMALS.find(candidate => !usedRefs.has(candidate)) ?? ''
  }
  return {
    name,
    avatarRef: avatarRef === '' ? (GALLERY_ANIMALS.at(-1) ?? 'capivara') : avatarRef,
    renamed: identityKey(name) !== identityKey(wantedName),
    reanimaled: avatarRef !== wantedRef,
  }
}

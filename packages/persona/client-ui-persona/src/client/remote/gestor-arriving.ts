const ARRIVING_MS = 4_000

/** Persona ids that should show the "chegou!" / rail pop animation until expiry. */
export function mergeArrivingFlags(
  personaIds: readonly string[],
  untilById: Readonly<Record<string, number>>,
  nowMs: number = Date.now(),
): { readonly untilById: Readonly<Record<string, number>>; readonly arrivingIds: ReadonlySet<string> } {
  const next: Record<string, number> = { ...untilById }
  for (const id of personaIds) {
    next[id] = Math.max(next[id] ?? 0, nowMs + ARRIVING_MS)
  }
  const arrivingIds = new Set<string>()
  for (const [id, until] of Object.entries(next)) {
    if (until > nowMs) arrivingIds.add(id)
    else delete next[id]
  }
  return { untilById: next, arrivingIds }
}

export function isPersonaArriving(personaId: string, untilById: Readonly<Record<string, number>>, nowMs: number = Date.now()): boolean {
  const until = untilById[personaId]
  return until !== undefined && until > nowMs
}

export { ARRIVING_MS }

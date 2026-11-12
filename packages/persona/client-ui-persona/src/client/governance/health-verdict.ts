import type { HealthFindingView, TwoDayRowView } from './governance-contract.ts'
import { twoDayRowPersonaId } from './two-day-persona.ts'

/** The host's "everything depends on one person" finding (its id is `<kind>:<subject>`). */
export function isSinglePointFinding(finding: HealthFindingView): boolean {
  return finding.id.startsWith('single_point_of_failure:')
}

export type HealthVerdict =
  /** "Se você ficar 2 dias fora, {count} colegas param esperando a sua aprovação." */
  | { readonly kind: 'waiting'; readonly count: number }
  /** "Tudo espera a sua aprovação. Se você ficar 2 dias fora, a equipe para no primeiro dia." */
  | { readonly kind: 'stops' }

/**
 * The sentence under the team grade, composed from what the host sent (DESIGN-01-MUSE #15). The host's own sentence for the single point
 * of failure mixes "você" and "essa pessoa"; its finding id is `<kind>:<subject>`, so the client recognizes the case and writes it in the
 * second person with the number of colleagues that wait. Any other case keeps the host's text: nothing is invented.
 *
 * @param findings The host findings.
 * @param twoDayRows The rows of the 2-day test, or null when it is not loaded.
 * @returns The verdict to write, or undefined to keep the host's text.
 */
export function composeHealthVerdict(
  findings: readonly HealthFindingView[],
  twoDayRows: readonly TwoDayRowView[] | null,
): HealthVerdict | undefined {
  if (!findings.some(isSinglePointFinding)) return undefined
  const waiting = new Set<string>()
  for (const row of twoDayRows ?? []) {
    const personaId = twoDayRowPersonaId(row.id)
    if (personaId !== undefined && row.slots.some(slot => slot !== 'runs')) waiting.add(personaId.replace(/^p-/u, ''))
  }
  return waiting.size === 0 ? { kind: 'stops' } : { kind: 'waiting', count: waiting.size }
}

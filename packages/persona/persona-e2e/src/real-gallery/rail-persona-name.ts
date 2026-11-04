/**
 * Rail DM aria-label is "Conversar com {name} · role · status" (AG-002).
 * First-run onboarding names the coordination persona from displayName — not Atlas.
 */

/** @param label - Full `aria-label` or visible name of a rail talk button. */
export function personaNameFromRailTalkLabel(label: string): string | undefined {
  const match = label.trim().match(/^Conversar com (.+?)(?:\s+·|$)/u)
  const name = match?.[1]?.trim()
  return name === undefined || name === '' ? undefined : name
}

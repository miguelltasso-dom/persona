/** Inline marker the host or runner appends to a channel message body. */
export const GESTOR_PLAN_MARKER = /\[\[gestor-plan:([a-zA-Z0-9_-]+)\]\]\s*$/

export function parseGestorPlanId(body: string): { readonly planId: string; readonly visibleBody: string } | null {
  const match = GESTOR_PLAN_MARKER.exec(body)
  if (match === null) return null
  const planId = match[1]
  if (planId === undefined || planId.length === 0) return null
  const visibleBody = body.slice(0, match.index).trimEnd()
  return { planId, visibleBody }
}

export function gestorPlanMarker(planId: string): string {
  return `\n\n[[gestor-plan:${planId}]]`
}

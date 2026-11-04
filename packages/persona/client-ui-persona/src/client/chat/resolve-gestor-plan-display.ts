import type { GestorPlanView } from '@deepseek-ai/dsh-persona-host/types'

/**
 * Plan row shown on a channel message (GES-3 / Ajustar UX).
 * Host keeps the original `proposed` when another Gestor comments (`commentOnId`).
 */
export function resolveGestorPlanForMessage(
  plan: GestorPlanView | undefined,
  gestorPlansById: Readonly<Record<string, GestorPlanView>>,
  gestorPlanAdjustingIds: Readonly<Record<string, true>>,
): GestorPlanView | undefined {
  if (plan === undefined) return undefined
  if (plan.status !== 'proposed') return plan
  const peerComment = Object.values(gestorPlansById).some(
    row => row.status === 'commented' && row.commentOnId === plan.id,
  )
  if (peerComment || gestorPlanAdjustingIds[plan.id] === true) {
    return { ...plan, status: 'commented' }
  }
  return plan
}

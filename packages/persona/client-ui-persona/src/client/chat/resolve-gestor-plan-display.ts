import type { GestorPlanView } from '@deepseek-ai/dsh-persona-host/types'

/**
 * Plan row shown on a channel message (GES-3 / Ajustar UX).
 *
 * GES-1b (Gauge 04/11): um plano `proposed` MANTÉM as ações (Aprovar · Ajustar · Agora não) enquanto o host o diz `proposed`. O comentário de
 * outro plano no mesmo escopo (`commentOnId`, regra `claimGestorScope`: o 1º continua `proposed`, o 2º vira `commented`) NÃO pode esconder nem
 * desarmar o original: sem as ações o plano não se aprova (e a auditoria do Gestor nunca nasce). Só o "Ajustar" que a PESSOA acabou de pedir
 * (`gestorPlanAdjustingIds`, enquanto o ajuste está em andamento) mostra o estado "comentado".
 */
export function resolveGestorPlanForMessage(
  plan: GestorPlanView | undefined,
  _gestorPlansById: Readonly<Record<string, GestorPlanView>>,
  gestorPlanAdjustingIds: Readonly<Record<string, true>>,
): GestorPlanView | undefined {
  if (plan === undefined) return undefined
  if (plan.status !== 'proposed') return plan
  if (gestorPlanAdjustingIds[plan.id] === true) return { ...plan, status: 'commented' }
  return plan
}

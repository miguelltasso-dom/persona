import type { GestorPlanView } from '@deepseek-ai/dsh-persona-host/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import { GestorPlanCard, type GestorPlanStep } from '../primitives/Gestor.tsx'
import type { TeamView } from '../remote/persona-remote-types.ts'
import { AVATAR_96 } from '../assets/generated-imports.ts'

function planState(status: string): 'pending' | 'approved' | 'declined' | 'adjusting' {
  if (status === 'applied') return 'approved'
  if (status === 'rejected') return 'declined'
  if (status === 'commented') return 'adjusting'
  return 'pending'
}

function stepsFromPlan(plan: GestorPlanView): readonly GestorPlanStep[] {
  if (plan.action === 'assemble') {
    return [{ id: `${plan.id}-assemble`, kind: 'board', title: plan.summary }]
  }
  return [{ id: `${plan.id}-hire`, kind: 'hire', title: plan.summary }]
}

export function GestorPlanMessageCard({
  t,
  plan,
  team,
  onApprove,
  onAdjust,
  onDecline,
}: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly plan: GestorPlanView
  readonly team: TeamView | null
  readonly onApprove?: (() => void) | undefined
  readonly onAdjust?: (() => void) | undefined
  readonly onDecline?: (() => void) | undefined
}): ReactNode {
  const gestorPersona = team?.personas.find(row => row.id === plan.gestorId)
  const gestorName = gestorPersona?.name ?? plan.gestorId
  const avatarSrc = gestorPersona !== undefined
    ? AVATAR_96[gestorPersona.avatarRef as keyof typeof AVATAR_96]
    : undefined
  const state = planState(plan.status)
  return (
    <GestorPlanCard
      gestor={{ name: gestorName, ...(avatarSrc === undefined ? {} : { avatarSrc }) }}
      summary={plan.summary}
      reason={plan.reason}
      steps={stepsFromPlan(plan)}
      state={state}
      {...(onApprove === undefined ? {} : { onApprove })}
      {...(onAdjust === undefined ? {} : { onAdjust })}
      {...(onDecline === undefined ? {} : { onDecline })}
      labels={{
        title: name => t('gestorPlan.title', { name: name.toUpperCase() }),
        kinds: {
          hire: t('gestorPlan.kind.hire'),
          board: t('gestorPlan.kind.board'),
          allocate: t('gestorPlan.kind.allocate'),
          sprint: t('gestorPlan.kind.sprint'),
          move: t('gestorPlan.kind.move'),
          pause: t('gestorPlan.kind.pause'),
        },
        approve: t('gestorPlan.approve'),
        adjust: t('gestorPlan.adjust'),
        decline: t('gestorPlan.decline'),
        approvedText: t('gestorPlan.approved'),
        declinedText: t('gestorPlan.declined'),
        adjustingText: t('gestorPlan.adjusting'),
        stamp: t('gestorPlan.stamp'),
      }}
    />
  )
}

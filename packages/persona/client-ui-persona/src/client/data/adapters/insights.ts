import type { ActivationFunnelView, PersonaImpactView } from '@deepseek-ai/dsh-persona-host/types'
import type { LocaleDict } from '../../preview/locale-bind.ts'
import { bindLocale } from '../../preview/locale-bind.ts'

export interface ActivationStepUi {
  readonly id: keyof ActivationFunnelView
  readonly label: string
  readonly done: boolean
}

export interface PersonaImpactUi {
  readonly personaId: string
  readonly displayName: string
  readonly tasksCompleted: number
  readonly proposalsAccepted: number
  readonly hoursSavedEstimate: number
  readonly hoursSavedLabel: string
  readonly timeToReadyLabel: string
}

const FUNNEL_STEPS: readonly (keyof ActivationFunnelView)[] = [
  'onboarded',
  'firstUsefulReply',
  'firstTaskDone',
  'returnedIn7Days',
]

/** Activation funnel steps with locale labels (booleans only; stage is summary). */
export function activationFunnelToUi(dict: LocaleDict, funnel: ActivationFunnelView): readonly ActivationStepUi[] {
  const t = (key: string) => bindLocale(dict, key)
  return FUNNEL_STEPS.map((id) => {
    const value = funnel[id]
    return {
      id,
      label: t(`insights.funnel.${id}`),
      done: typeof value === 'boolean' ? value : false,
    }
  })
}

export function activationStageLabel(dict: LocaleDict, stage: ActivationFunnelView['stage']): string {
  return bindLocale(dict, `insights.stage.${stage}`)
}

function formatDurationMs(dict: LocaleDict, ms: number): string {
  if (ms <= 0) return bindLocale(dict, 'insights.impact.noDuration')
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return bindLocale(dict, 'insights.impact.minutes', { count: minutes })
  const hours = Math.round(minutes / 60)
  return bindLocale(dict, 'insights.impact.hours', { count: hours })
}

/** Host impact rows with optional persona display names from the live rail. */
export function personaImpactToUi(
  dict: LocaleDict,
  rows: readonly PersonaImpactView[],
  nameById: Readonly<Record<string, string>>,
): readonly PersonaImpactUi[] {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return rows.map(row => ({
    personaId: row.personaId,
    displayName: nameById[row.personaId] ?? row.personaId,
    tasksCompleted: row.tasksCompleted,
    proposalsAccepted: row.proposalsAccepted,
    hoursSavedEstimate: row.hoursSavedEstimate,
    hoursSavedLabel: t('insights.impact.hoursSaved', { hours: row.hoursSavedEstimate, label: row.hoursSavedLabel }),
    timeToReadyLabel: formatDurationMs(dict, row.timeToReadyMs),
  }))
}

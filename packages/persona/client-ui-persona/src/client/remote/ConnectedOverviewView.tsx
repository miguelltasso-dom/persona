import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { deriveFirstDeliveryMilestone } from '../overview/derive-first-delivery.ts'
import { OverviewView } from '../overview/OverviewView.tsx'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'

export interface ConnectedOverviewInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  navigate(panel: 'channels' | 'kanban' | 'approvals'): void
  openAwayTask(taskId: string): void
}

export type ConnectedOverviewViewProps = PropsLocale<'persona.shell'> & InjectFace<ConnectedOverviewInjected>

export function ConnectedOverviewView({ t, useLive, navigate, openAwayTask }: ConnectedOverviewViewProps): ReactNode {
  const live = useLive(state => state)
  const firstDelivery = deriveFirstDeliveryMilestone(live.kanbanCards)
  const firstDeliveryPending = live.firstDelivery?.status === 'working'
  const awayEvents = live.awayEvents.map(event => ({
    id: event.id,
    body: event.body,
    taskLabel: event.taskLabel,
    taskId: event.taskId,
  }))
  return (
    <OverviewView
      t={t}
      attentionItems={live.attentionTitles}
      nowRows={live.nowRows}
      awayEvents={awayEvents}
      userName={live.team?.members.find(member => member.id === live.tenant?.memberId)?.displayName}
      suggestedTask={live.suggestedTask ?? undefined}
      {...(firstDelivery === undefined ? {} : { firstDelivery })}
      firstDeliveryPending={firstDeliveryPending}
      onNavigate={navigate}
      onOpenAwayTask={openAwayTask}
    />
  )
}

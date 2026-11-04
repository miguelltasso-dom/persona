import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { deriveFirstDeliveryMilestone, firstDeliveryFromHost, pickFirstDelivery } from '../overview/derive-first-delivery.ts'
import { OverviewView } from '../overview/OverviewView.tsx'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'

export interface ConnectedOverviewInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  navigate(panel: 'channels' | 'kanban' | 'approvals', query?: { focus?: string }): void
  openAwayTask(taskId: string): void
  decideDecision?(decisionId: string, accept: boolean): void
  undoDecision?(decisionId: string): void
}

export type ConnectedOverviewViewProps = PropsLocale<'persona.shell'> & InjectFace<ConnectedOverviewInjected>

export function ConnectedOverviewView({
  t,
  useLive,
  navigate,
  openAwayTask,
  decideDecision,
  undoDecision,
}: ConnectedOverviewViewProps): ReactNode {
  const live = useLive(state => state)
  const firstDelivery = pickFirstDelivery(
    deriveFirstDeliveryMilestone(live.kanbanCards),
    firstDeliveryFromHost(live.firstDelivery, live.stripMembers),
  )
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
      decisions={live.decisions}
      onDecide={decideDecision}
      onUndoDecision={undoDecision}
      nowRows={live.nowRows}
      loading={!live.ready}
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

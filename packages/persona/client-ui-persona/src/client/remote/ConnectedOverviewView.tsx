import { useMemo, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { deriveFirstDeliveryMilestone, firstDeliveryFromHost, pickFirstDelivery } from '../overview/derive-first-delivery.ts'
import { OverviewView } from '../overview/OverviewView.tsx'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'
import { replyTargetsByTicket } from '../answer/reply-actions.ts'
import type { ReplyTarget } from '../answer/reply-target.ts'
import { startReply } from '../answer/start-reply.ts'
import { isPersonaAskEnabled } from '../ask/ask-flag.ts'
import { isTeamworkEnabled } from '../chat/teamwork-flag.ts'
import type { DailyNowResult } from '../overview/daily-now.ts'

export interface ConnectedOverviewInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  navigate(panel: 'channels' | 'kanban' | 'approvals' | 'team', query?: { focus?: string }): void
  /** "Resumir o dia" (EQUIPE-REAL §(b)): pede o cartão do dia agora. Ausente (host sem `postDailyBriefNow`) = o botão não existe. */
  askDailyBrief?(): Promise<DailyNowResult>
  openAwayTask(taskId: string): void
  decideDecision?(decisionId: string, accept: boolean): void
  undoDecision?(decisionId: string): void
  /** P1-7: "Entendi" on "Enquanto você estava fora". */
  dismissAway?(): void
  /** IV-10 "Responder": opens the conversation where a question was asked (the channel, or that DM). Absent = no "Responder" button. */
  openConversation?(streamKind: 'channel' | 'dm', ownerId: string): void
}

export type ConnectedOverviewViewProps = PropsLocale<'persona.shell'> & InjectFace<ConnectedOverviewInjected>

export function ConnectedOverviewView({
  t,
  useLive,
  navigate,
  openAwayTask,
  decideDecision,
  undoDecision,
  dismissAway,
  openConversation,
  askDailyBrief,
}: ConnectedOverviewViewProps): ReactNode {
  const live = useLive(state => state)
  // IV-10 "Responder" (atrás de `persona.flag.personaAsk`): a question in words carries the thread it was asked in (TaskView.question + questionStreamId).
  const replyOn = openConversation !== undefined && isPersonaAskEnabled()
  const replyTargets = useMemo(() => (replyOn ? replyTargetsByTicket(live.kanbanCards) : undefined), [replyOn, live.kanbanCards])
  const firstDelivery = pickFirstDelivery(
    deriveFirstDeliveryMilestone(live.kanbanCards),
    firstDeliveryFromHost(live.firstDelivery, live.stripMembers),
  )
  const firstDeliveryPending = live.firstDelivery?.status === 'working'
  const awayEvents = live.awayEvents.map(event => ({
    id: event.id,
    body: event.body,
    ...(event.taskLabel === undefined ? {} : { taskLabel: event.taskLabel }),
    taskId: event.taskId,
  }))
  return (
    <OverviewView
      t={t}
      attentionItems={live.attentionTitles}
      decisions={live.decisions}
      onDecide={decideDecision}
      onUndoDecision={undoDecision}
      {...(replyTargets === undefined || replyTargets.size === 0 ? {} : { replyTargets, onReply: (target: ReplyTarget) => { startReply(target, openConversation) } })}
      nowRows={live.nowRows}
      loading={!live.ready}
      awayEvents={awayEvents}
      away={live.away}
      {...(dismissAway === undefined ? {} : { onDismissAway: dismissAway })}
      userName={live.team?.members.find(member => member.id === live.tenant?.memberId)?.displayName}
      suggestedTask={live.suggestedTask ?? undefined}
      {...(firstDelivery === undefined ? {} : { firstDelivery })}
      firstDeliveryPending={firstDeliveryPending}
      onNavigate={navigate}
      {...(askDailyBrief === undefined || !isTeamworkEnabled() ? {} : { onAskDailyBrief: askDailyBrief })}
      onOpenAwayTask={openAwayTask}
    />
  )
}

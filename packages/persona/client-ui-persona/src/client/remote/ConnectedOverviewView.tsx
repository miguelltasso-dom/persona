import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { ConnectedTeamAi } from '../team-connect/ConnectedTeamAi.tsx'
import { ConnectedSeusNumeros } from '../indicators/SeusNumeros.tsx'
import type { TeamConnectRemoteWire } from '../team-connect/team-connect-wire.ts'

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
  /** DESIGN-01 #09 "Pedir a {Coordenação} agora": sends the text to the thread and opens it. Absent = the suggested-task block has no button, so it is not drawn. */
  askCoordination?(text: string): void
  /** DESIGN-01 #09: the request derived from the company profile in the Cofre (null = no profile, nothing to suggest). Absent = no suggestion. */
  loadCompanySuggestion?(): Promise<{ readonly title: string } | null>
  /** Item 13: the host calls of "Ligar a IA para a equipe toda" (`getTeamAi`, `connectTeam`, `getTeamConnect`, `retryTeamPersona`). Absent = no banner. */
  teamConnectRemote?: TeamConnectRemoteWire
  /** Item 19a: the host Remote for "Seus números" (`listIndicators`…). A host without the five calls (or none) = no section. */
  indicatorsRemote?: object
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
  askCoordination,
  loadCompanySuggestion,
  teamConnectRemote,
  indicatorsRemote,
}: ConnectedOverviewViewProps): ReactNode {
  const live = useLive(state => state)
  // The profile is read once per workspace (a text-only call); the loader is kept in a ref so a new function identity never re-reads it.
  const loaderRef = useRef(loadCompanySuggestion)
  loaderRef.current = loadCompanySuggestion
  const [companySuggestion, setCompanySuggestion] = useState<{ readonly title: string } | undefined>(undefined)
  const scopeKey = live.tenant === null ? '' : `${live.tenant.workspaceId}:${live.tenant.projectId}`
  useEffect(() => {
    const load = loaderRef.current
    if (load === undefined || scopeKey === '') return undefined
    let cancelled = false
    void load().then((next) => { if (!cancelled) setCompanySuggestion(next ?? undefined) })
    return () => { cancelled = true }
  }, [scopeKey])
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
      companySuggestion={companySuggestion}
      onAskCoordination={askCoordination}
      {...(firstDelivery === undefined ? {} : { firstDelivery })}
      firstDeliveryPending={firstDeliveryPending}
      onNavigate={navigate}
      {...(askDailyBrief === undefined || !isTeamworkEnabled() ? {} : { onAskDailyBrief: askDailyBrief })}
      onOpenAwayTask={openAwayTask}
      teamAiSlot={<ConnectedTeamAi t={t} remote={teamConnectRemote} workspaceId={live.tenant?.workspaceId} projectId={live.tenant?.projectId} />}
      numbersSlot={<ConnectedSeusNumeros remote={indicatorsRemote} tenant={live.tenant} />}
    />
  )
}

/**
 * Aprovações on the single Decision[] (DECISIONS-SPEC): the same array, the same cycle and the same counters as
 * Visão geral. Nothing here loads its own list — deciding in either screen leaves both in one render.
 */

import type { ActionDecision } from '../chat/ActionPreviewCard.tsx'
import { genericDecisionRoute } from '../approvals/action-approval.ts'
import { CONNECTOR_DEV_SAMPLE, connectorDevSampleEnabled } from '../approvals/connector-dev-sample.ts'
import { useEffect, useMemo, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { ApprovalsInbox, type ApprovalRememberChoice, type ApprovalsInboxProps } from '../approvals/ApprovalsInbox.tsx'
import { ApprovalsInboxV2 } from '../approvals/ApprovalsInboxV2.tsx'
import { replyTargetsByTicket } from '../answer/reply-actions.ts'
import type { ReplyTarget } from '../answer/reply-target.ts'
import { startReply } from '../answer/start-reply.ts'
import { isPersonaAskEnabled } from '../ask/ask-flag.ts'
import { APPROVALS_DEV_SAMPLE, approvalsDevSampleEnabled } from '../approvals/approvals-dev-sample.ts'
import { approvalsInboxV2Enabled } from '../approvals/inbox-flag.ts'
import type { ApprovalItem } from '../approvals/mock-data.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as approvalsPt } from '../locale/approvals/locales.ts'
import { DecisionFeedback } from '../decisions/DecisionFeedback.tsx'
import { decisionsToInbox } from '../decisions/decisions-to-inbox.ts'
import type { DecisionState } from '../decisions/decision-types.ts'
import { brainValidityToRpc, grantBrainPermissionRemote } from '../data/brain-remote.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../data/persona-tenant.ts'
import { useRemoteProjectScope } from '../data/use-remote-project-scope.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'

export interface ConnectedApprovalsInjected {
  readonly persona: PersonaRemoteClient
  readonly hooks: {
    readonly tenant: HostObservable<PersonaTenantSnapshot>
    readonly shell: HostObservable<ShellState>
    readonly live: HostObservable<PersonaLiveSnapshot>
  }
  /** The one decision cycle (live store). Resolves with the final state. */
  decideDecision(decisionId: string, accept: boolean, choice?: 'once' | 'always' | 'not-now'): Promise<DecisionState | undefined>
  /** HT-9 / D-095: the decision on an external action's preview (the same call the thread uses). Absent = the card is read-only. */
  decideActionApproval?(decision: ActionDecision): Promise<void>
  /** Only wired when the host can undo; the toast never shows without it. */
  undoDecision?(decisionId: string): Promise<void>
  refreshLive(): void
  /** Forget the Revisar target once the screen is left, so the next Revisar highlights again. */
  clearApprovalFocus(): void
  /** Goes to Visão geral (the empty inbox's "Ver o que a equipe está fazendo"). Absent = no such button. */
  openOverview?(): void
  /** IV-10 "Responder": opens the conversation where a question was asked (the channel, or that DM). Absent = no "Responder" button. */
  openConversation?(streamKind: 'channel' | 'dm', ownerId: string): void
}

export type ConnectedApprovalsPanelProps = InjectFace<ConnectedApprovalsInjected>

export function ConnectedApprovalsPanel({
  persona,
  useTenant,
  useShell,
  useLive,
  decideDecision,
  decideActionApproval,
  undoDecision,
  refreshLive,
  clearApprovalFocus,
  openOverview,
  openConversation,
}: ConnectedApprovalsPanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const focusedApprovalId = useShell(state => state.focusedApprovalId ?? null)
  const decisions = useLive(live => live.decisions)
  const liveReady = useLive(live => live.ready)
  const liveError = useLive(live => live.error)
  const inbox = useMemo(() => decisionsToInbox(decisions ?? []), [decisions])
  // IV-10 "Responder" (atrás de `persona.flag.personaAsk`): a question in words carries the thread it was asked in (TaskView.question + questionStreamId).
  const cards = useLive(live => live.kanbanCards)
  const replyOn = openConversation !== undefined && isPersonaAskEnabled()
  const replyTargets = useMemo(() => (replyOn ? replyTargetsByTicket(cards ?? []) : new Map<string, ReplyTarget>()), [replyOn, cards])
  const answerable = useMemo(
    () => (replyTargets.size === 0
      ? inbox.items
      : inbox.items.map((item) => {
        const target = item.kind === 'attention' ? replyTargets.get(item.id) : undefined
        return target === undefined ? item : { ...item, replyTarget: target }
      })),
    [inbox.items, replyTargets],
  )
  const reply = (target: ReplyTarget): void => { startReply(target, openConversation) }
  const t = useMemo(
    () => (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(approvalsPt, key, params),
    [],
  )

  useEffect(() => () => { clearApprovalFocus() }, [clearApprovalFocus])

  const surface = gate === 'error' || (liveError !== null && !liveReady)
    ? 'error'
    : gate === 'loading' || !liveReady
      ? 'loading'
      : 'ready'

  const decideItem = (item: ApprovalItem, accept: boolean, remember?: ApprovalRememberChoice): void => {
    const route = genericDecisionRoute(item, accept)
    if (route === 'ignore') return // a capture-only sample never reaches the host
    // The generic Aceitar / Dispensar of a connector card (the V2 detail has only those two) means "só desta vez" / "Agora não".
    if (route === 'connector') {
      void decideDecision(item.id, accept, accept ? 'once' : 'not-now')
      return
    }
    // An external action is never approved by the generic Aceitar: that detail does not show the content that would leave the company
    // (HT-9 / D-095). Only the card with the preview can send; here "Dispensar" is the contract's "cancel".
    if (route === 'action-refused') return
    if (route === 'action-cancel') {
      if (decideActionApproval !== undefined) void decideActionApproval({ approvalId: item.id, choice: 'cancel' })
      return
    }
    void (async () => {
      const outcome = await decideDecision(item.id, accept)
      if (!accept || outcome !== 'accepted' || remember === undefined || item.brain === undefined || scope === null) return
      try {
        await grantBrainPermissionRemote(persona, {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          id: item.brain.grantId,
          personaId: item.brain.personaId,
          action: item.brain.action,
          target: item.brain.target,
          validity: brainValidityToRpc(remember.validity),
        })
      } catch (error) {
        // The decision itself is recorded; only the "remember" extra failed.
        console.error('[persona] lembrar permissão falhou', error)
      }
    })()
  }

  const inboxProps: ApprovalsInboxProps = {
    dict: approvalsPt,
    // Capture-only (two dev keys): two "Liberar para {B}" example cards, tagged "Exemplo".
    items: connectorDevSampleEnabled() ? [...answerable, ...CONNECTOR_DEV_SAMPLE] : answerable,
    ...(replyOn ? { onReply: reply } : {}),
    proactiveSummaries: inbox.proactiveSummaries,
    focusId: focusedApprovalId ?? undefined,
    initialState: surface,
    onRemoteRetry: () => { retryBootstrap(); refreshLive() },
    onDecideItem: decideItem,
    ...(decideActionApproval === undefined ? {} : {
      onDecideAction: async (decision: ActionDecision) => {
        // A capture-only sample (its id starts with dev-) never reaches the host.
        if (decision.approvalId.startsWith('dev-')) return
        await decideActionApproval(decision)
      },
    }),
    onDecideConnector: (item, choice) => {
      if (item.example === true) return // a capture-only sample never reaches the host
      void decideDecision(item.id, choice !== 'not-now', choice)
    },
    onDecideProactive: (proposal, accept) => { void decideDecision(proposal.id, accept) },
  }

  return (
    <>
      {approvalsInboxV2Enabled()
        ? (
          <ApprovalsInboxV2
            {...inboxProps}
            // Capture-only: a Cofre card with before → after, shown with "Exemplo" (dev seed + its own flag).
            items={[...inboxProps.items ?? [], ...(approvalsDevSampleEnabled() ? APPROVALS_DEV_SAMPLE : [])]}
            onUndoDecision={undoDecision === undefined ? undefined : (id) => { void undoDecision(id) }}
            onOpenOverview={openOverview}
          />
        )
        : <ApprovalsInbox {...inboxProps} />}
      <DecisionFeedback decisions={decisions} t={t} onUndo={undoDecision === undefined ? undefined : (id) => { void undoDecision(id) }} />
    </>
  )
}

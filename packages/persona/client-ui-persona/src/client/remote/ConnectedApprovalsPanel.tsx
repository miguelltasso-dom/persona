/**
 * Aprovações on the single Decision[] (DECISIONS-SPEC): the same array, the same cycle and the same counters as
 * Visão geral. Nothing here loads its own list — deciding in either screen leaves both in one render.
 */

import { useEffect, useMemo, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { ApprovalsInbox, type ApprovalRememberChoice, type ApprovalsInboxProps } from '../approvals/ApprovalsInbox.tsx'
import { ApprovalsInboxV2 } from '../approvals/ApprovalsInboxV2.tsx'
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
  decideDecision(decisionId: string, accept: boolean): Promise<DecisionState | undefined>
  /** Only wired when the host can undo; the toast never shows without it. */
  undoDecision?(decisionId: string): Promise<void>
  refreshLive(): void
  /** Forget the Revisar target once the screen is left, so the next Revisar highlights again. */
  clearApprovalFocus(): void
  /** Goes to Visão geral (the empty inbox's "Ver o que a equipe está fazendo"). Absent = no such button. */
  openOverview?(): void
}

export type ConnectedApprovalsPanelProps = InjectFace<ConnectedApprovalsInjected>

export function ConnectedApprovalsPanel({
  persona,
  useTenant,
  useShell,
  useLive,
  decideDecision,
  undoDecision,
  refreshLive,
  clearApprovalFocus,
  openOverview,
}: ConnectedApprovalsPanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const focusedApprovalId = useShell(state => state.focusedApprovalId ?? null)
  const decisions = useLive(live => live.decisions)
  const liveReady = useLive(live => live.ready)
  const liveError = useLive(live => live.error)
  const inbox = useMemo(() => decisionsToInbox(decisions ?? []), [decisions])
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
    items: inbox.items,
    proactiveSummaries: inbox.proactiveSummaries,
    focusId: focusedApprovalId ?? undefined,
    initialState: surface,
    onRemoteRetry: () => { retryBootstrap(); refreshLive() },
    onDecideItem: decideItem,
    onDecideProactive: (proposal, accept) => { void decideDecision(proposal.id, accept) },
  }

  return (
    <>
      {approvalsInboxV2Enabled()
        ? (
          <ApprovalsInboxV2
            {...inboxProps}
            // Capture-only: a Cofre card with before → after, shown with "Exemplo" (dev seed + its own flag).
            items={approvalsDevSampleEnabled() ? [...inbox.items, ...APPROVALS_DEV_SAMPLE] : inbox.items}
            onUndoDecision={undoDecision === undefined ? undefined : (id) => { void undoDecision(id) }}
            onOpenOverview={openOverview}
          />
        )
        : <ApprovalsInbox {...inboxProps} />}
      <DecisionFeedback decisions={decisions} t={t} onUndo={undoDecision === undefined ? undefined : (id) => { void undoDecision(id) }} />
    </>
  )
}

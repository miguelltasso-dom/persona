/**
 * Central human decisions, the current screen (one question per card). The two-pane inbox of
 * REVIEW-APPROVALS-REDESIGN §2 is `ApprovalsInboxV2`, behind a flag until the Muse accepts it (D-077).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Screen,
  ScreenHeader,
  usePawCelebration,
  type PermissionScope,
  type PermissionValidity,
} from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Approvals.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { ProactiveDailySummaries } from './ProactiveDailySummaries.tsx'
import { personaPortraitSrc } from './approvals-ui-helpers.ts'
import { ReactiveApprovalsList, type RememberChoice } from './ReactiveApprovalsList.tsx'
import type { ConnectorChoice } from './connector-ask.ts'
import type { ActionDecision } from '../chat/ActionPreviewCard.tsx'
import type { ApprovalItem } from './mock-data.ts'
import type { ReplyTarget } from '../answer/reply-target.ts'
import type { PersonaDailyProactiveSummary, ProactiveProposal } from './proactivity-mock-data.ts'
import { pt as defaultDict } from '../locale/approvals/locales.ts'
import { useDecisionListMotion } from '../decisions/use-decision-list-motion.ts'

export type ApprovalsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

/** When the human accepts and opted into "Lembrar esta permissão". */
export interface ApprovalRememberChoice {
  readonly validity: PermissionValidity
}

const ACCEPT_EXIT_MS = 750
const DEFAULT_REMEMBER: RememberChoice = { grant: false, validity: 'once' }

/** What "Lembrar esta permissão" would grant for a card; none when the card has nothing to remember. */
export function approvalPermissionScope(dict: LocaleDict, item: ApprovalItem): PermissionScope | undefined {
  if (item.brain === undefined) return undefined
  const avatar = personaPortraitSrc(item.proposerPersonaId, item.brain.personaName)
  return {
    persona: item.brain.personaName,
    ...(avatar === undefined ? {} : { personaAvatar: avatar }),
    action: bindLocale(dict, `remember.scopeAction.${item.kind}`, { title: item.title }),
    target: bindLocale(dict, `remember.scopeTarget.${item.kind}`, { title: item.title }),
  }
}

function formatSummaryDate(dict: LocaleDict, isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return bindLocale(dict, 'proactive.dateLabel', { day: d ?? '', month: m ?? '', year: y ?? '' })
}

export interface ApprovalsInboxProps {
  readonly dict?: LocaleDict
  readonly items?: readonly ApprovalItem[]
  readonly proactiveSummaries?: readonly PersonaDailyProactiveSummary[]
  readonly initialState?: ApprovalsSurfaceState
  readonly focusId?: string | undefined
  readonly onDecideItem?: (item: ApprovalItem, accept: boolean, remember?: ApprovalRememberChoice) => void
  readonly onDecideProactive?: (proposal: ProactiveProposal, accept: boolean) => void
  /** "Liberar para {B}": the three-way choice of a connector card ("só desta vez" · "sempre" · "agora não"). */
  readonly onDecideConnector?: (item: ApprovalItem, choice: ConnectorChoice) => void
  /** HT-9 / D-095: the person's answer to the preview of an external action (Enviar · Editar · Cancelar). */
  readonly onDecideAction?: ((decision: ActionDecision) => void | Promise<void>) | undefined
  /** IV-10 "Responder": a question in words (the card carries its `replyTarget`) takes the person to the thread where it was asked. No handler, no button. */
  readonly onReply?: ((target: ReplyTarget) => void) | undefined
  readonly onRemoteRetry?: () => void
}

export function ApprovalsInbox({
  dict = defaultDict,
  items = [],
  proactiveSummaries = [],
  initialState = 'ready',
  focusId,
  onDecideItem,
  onReply,
  onDecideProactive,
  onDecideConnector,
  onDecideAction,
  onRemoteRetry,
}: ApprovalsInboxProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const paw = usePawCelebration()
  const [exitStampId, setExitStampId] = useState<string | null>(null)
  // Each card keeps its own "Lembrar esta permissão": they are decided in any order (A-4b), none waits for another.
  const [remembered, setRemembered] = useState<Readonly<Record<string, RememberChoice>>>({})
  const rememberFor = (id: string): RememberChoice => remembered[id] ?? DEFAULT_REMEMBER
  const updateRemember = (id: string, patch: Partial<RememberChoice>): void => {
    setRemembered(current => ({ ...current, [id]: { ...(current[id] ?? DEFAULT_REMEMBER), ...patch } }))
  }
  const [rememberStampNote, setRememberStampNote] = useState<string | null>(null)
  const summaryIso = proactiveSummaries.find(summary => summary.proposals.length > 0)?.summaryDate ?? ''
  const summaryDateLabel = summaryIso === '' ? '' : formatSummaryDate(dict, summaryIso)
  const hasReactive = items.length > 0
  const hasProactive = proactiveSummaries.some(s => s.proposals.length > 0)

  const reactiveListRef = useRef<HTMLDivElement | null>(null)
  const reactiveTitleRef = useRef<HTMLHeadingElement | null>(null)
  const proactiveRef = useRef<HTMLDivElement | null>(null)
  useDecisionListMotion(reactiveListRef, items.map(item => item.id), reactiveTitleRef)
  useDecisionListMotion(
    proactiveRef,
    proactiveSummaries.flatMap(summary => summary.proposals.map(proposal => proposal.id)),
    reactiveTitleRef,
  )

  // One paw burst per decision that becomes accepted while this screen is open (the store drives the state).
  const acceptedIds = [
    ...items.filter(item => item.decisionState === 'accepted').map(item => item.id),
    ...proactiveSummaries.flatMap(summary => summary.proposals.filter(proposal => proposal.decisionState === 'accepted').map(proposal => proposal.id)),
  ]
  const celebrated = useRef(new Set<string>(acceptedIds))
  const acceptedKey = acceptedIds.join('|')
  useEffect(() => {
    let fresh = false
    for (const id of acceptedIds) {
      if (celebrated.current.has(id)) continue
      celebrated.current.add(id)
      fresh = true
    }
    if (fresh) paw.celebrate()
    // acceptedKey is the identity of acceptedIds
  }, [acceptedKey])

  const celebrateAccept = (id: string, proceed: () => void): void => {
    setExitStampId(id)
    paw.celebrate()
    window.setTimeout(() => {
      proceed()
      setExitStampId(null)
    }, ACCEPT_EXIT_MS)
  }

  const header = (
    <ScreenHeader
      icon="decisoes"
      eyebrow={t('header.eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  )

  if (initialState === 'loading') {
    return (
      <Screen className={styles.shell} data-persona-surface="approvals">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
      </Screen>
    )
  }
  if (initialState === 'error') {
    return (
      <Screen className={styles.shell} data-persona-surface="approvals">
        {header}
        <PersonaSurfaceError
          dict={dict}
          titleKey="error.title"
          retryKey="error.retry"
          onRetry={() => { onRemoteRetry?.() }}
        />
      </Screen>
    )
  }
  if (initialState === 'empty' || (!hasReactive && !hasProactive)) {
    return (
      <Screen className={styles.shell} data-persona-surface="approvals">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-inbox"
          nightPair={{ day: 'empty-aprovacoes', night: 'empty-aprovacoes-noite' }}
          titleKey="empty.title"
          hintKey="empty.hint"
        />
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="approvals">
      {header}
      <div className={styles.inboxCelebrate}>{paw.node}</div>
      {hasProactive && (
        <div ref={proactiveRef}>
          <ProactiveDailySummaries
            dict={dict}
            summaries={proactiveSummaries}
            summaryDateLabel={summaryDateLabel}
            stampExitId={exitStampId}
            stampLabel={t('stamp.approved')}
            {...(onDecideProactive !== undefined
              ? {
                onDecide: (proposal, accept) => {
                  if (!accept) {
                    onDecideProactive(proposal, false)
                    return
                  }
                  if (proposal.approvalKind === undefined) return
                  // Store-driven proposal: the Decision cycle already shows the stamp; no second local timer.
                  if (proposal.decisionState !== undefined) {
                    onDecideProactive(proposal, true)
                    return
                  }
                  celebrateAccept(proposal.id, () => { onDecideProactive(proposal, true) })
                },
              }
              : {})}
          />
        </div>
      )}
      {hasReactive && (
        <section aria-labelledby="persona-reactive-approvals" data-persona-approvals="reactive">
          <h2 id="persona-reactive-approvals" ref={reactiveTitleRef} tabIndex={-1} className={styles.sectionTitle}>{t('reactive.title')}</h2>
          <p className={styles.sectionHint}>{t('reactive.subtitle')}</p>
          <div className={styles.list} role="list" ref={reactiveListRef}>
            <ReactiveApprovalsList
              dict={dict}
              focusId={focusId}
              items={items}
              scopeFor={item => approvalPermissionScope(dict, item)}
              exitStampId={exitStampId}
              rememberFor={rememberFor}
              rememberStampNote={rememberStampNote}
              onRememberChange={updateRemember}
              {...(onDecideItem === undefined ? {} : {
                onDecideItem: (item, accept, remember) => {
                  if (accept && remember !== undefined) setRememberStampNote(t('stamp.remembered'))
                  onDecideItem(item, accept, remember)
                },
              })}
              {...(onDecideConnector === undefined ? {} : { onDecideConnector })}
              {...(onDecideAction === undefined ? {} : { onDecideAction })}
              {...(onReply === undefined ? {} : { onReply })}
              onCelebrateAccept={celebrateAccept}
            />
          </div>
        </section>
      )}
    </Screen>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { usePersonaMotion } from '../motion/index.ts'
import {
  Accent,
  ApprovedStamp,
  Avatar,
  Button,
  Card,
  EmptyState,
  MilestoneCard,
  Notice,
  UiIcon,
  usePawCelebration,
} from '../primitives/index.ts'
import type { AwaySummaryEvent, PersonaNowSnapshot } from '../team/persona-work-state.ts'
import { AwayWhileOutPanel } from './AwayWhileOutPanel.tsx'
import { OverviewNowStrip } from './OverviewNowStrip.tsx'
import type { Decision } from '../decisions/decision-types.ts'
import { DecisionFeedback } from '../decisions/DecisionFeedback.tsx'
import { DecisionStateNote } from '../decisions/DecisionStateNote.tsx'
import { blockingDecisions as selectBlocking, openBlockingCount } from '../decisions/decision-selectors.ts'
import { useDecisionListMotion } from '../decisions/use-decision-list-motion.ts'
import { personaPortraitSrc } from '../approvals/approvals-ui-helpers.ts'
import styles from './OverviewView.module.css'

export interface OverviewViewProps extends PropsLocale<'persona.shell'> {
  readonly attentionItems?: readonly string[] | undefined
  /** Single source human decisions (DECISIONS-SPEC / UX-PHASE item 4). */
  readonly decisions?: readonly Decision[] | undefined
  readonly onDecide?: ((decisionId: string, accept: boolean) => void) | undefined
  /** Undo a reversible decision (the toast only exists when the host marked it reversible). */
  readonly onUndoDecision?: ((decisionId: string) => void) | undefined
  readonly nowRows: readonly PersonaNowSnapshot[]
  /** Os dados do host ainda não chegaram (recarregar): o "Agora" mostra skeleton em vez de "Monte sua equipe". */
  readonly loading?: boolean | undefined
  readonly awayEvents: readonly AwaySummaryEvent[]
  /** User display name for the greeting (falls back to a plain "Olá!"). */
  readonly userName?: string | undefined
  /** Navigate to another main panel (shell). */
  readonly onNavigate?: ((panel: 'channels' | 'kanban' | 'approvals', query?: { focus?: string }) => void) | undefined
  readonly onOpenAwayTask?: ((taskId: string) => void) | undefined
  /** Live first task (C8); falls back to locale copy when absent. */
  readonly suggestedTask?: { readonly id: string; readonly title: string } | undefined
  /** The team's first finished task ever (Prism wires from the board); shown once as a milestone (peak-end). */
  readonly firstDelivery?: FirstDelivery | undefined
  /** Guided first delivery requested during onboarding is currently in progress (FIRST-DELIVERY-SPEC). */
  readonly firstDeliveryPending?: boolean | undefined
}

export interface FirstDelivery {
  readonly taskId: string
  readonly title: string
  readonly personaName: string
  readonly characterId?: string | undefined
}

const FIRST_DELIVERY_KEY = 'persona.milestone.firstDelivery.v1'

function firstDeliverySeen(taskId: string): boolean {
  try {
    return localStorage.getItem(FIRST_DELIVERY_KEY) === taskId
  } catch {
    return false
  }
}

const PLACEHOLDER_NAMES: ReadonlySet<string> = new Set(['você', 'voce', 'owner', 'you'])

/** Visão geral — "o que precisa de você" first, then what the team is doing now (RCD: never a blank dashboard). */
export function OverviewView({
  t,
  attentionItems = [],
  decisions,
  onDecide,
  onUndoDecision,
  nowRows,
  loading = false,
  awayEvents,
  userName,
  onNavigate,
  onOpenAwayTask,
  suggestedTask,
  firstDelivery,
  firstDeliveryPending,
}: OverviewViewProps): ReactNode {
  const [dismissedTaskId, setDismissedTaskId] = useState<string | null>(null)
  const paw = usePawCelebration()
  const showMilestone = firstDelivery !== undefined && dismissedTaskId !== firstDelivery.taskId && !firstDeliverySeen(firstDelivery.taskId)
  const dismissMilestone = (): void => {
    if (firstDelivery === undefined) return
    try {
      localStorage.setItem(FIRST_DELIVERY_KEY, firstDelivery.taskId)
    } catch {
      /* storage unavailable */
    }
    setDismissedTaskId(firstDelivery.taskId)
  }
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 8 })
  const teamHasActiveTask = nowRows.some(row => row.currentTask !== undefined && row.currentTask.length > 0)

  // One paw burst per decision that becomes accepted while this screen is open; spoken feedback and the undo toast
  // live in <DecisionFeedback> so Visão geral and Aprovações behave the same (DECISIONS-SPEC Regra 2).
  const pawRef = useRef(paw)
  pawRef.current = paw
  const celebrated = useRef(new Set<string>((decisions ?? []).filter(d => d.state === 'accepted').map(d => d.id)))
  useEffect(() => {
    let fresh = false
    for (const d of decisions ?? []) {
      if (d.state !== 'accepted' || celebrated.current.has(d.id)) continue
      celebrated.current.add(d.id)
      fresh = true
    }
    if (fresh) pawRef.current.celebrate()
  }, [decisions])
  const attentionListRef = useRef<HTMLUListElement | null>(null)
  const attentionTitleRef = useRef<HTMLSpanElement | null>(null)
  const blockingDecisions = decisions === undefined ? undefined : selectBlocking(decisions)
  const hasDecisions = blockingDecisions !== undefined
  const shownDecisions = (blockingDecisions ?? []).slice(0, 3)
  useDecisionListMotion(attentionListRef, shownDecisions.map(d => d.id), attentionTitleRef)
  // The one number every screen reads: pending + failed, never a count of its own.
  const pendingCount = hasDecisions ? openBlockingCount(decisions) : attentionItems.length
  const showFirstTask = (hasDecisions ? blockingDecisions.length === 0 : attentionItems.length === 0) && !teamHasActiveTask
  const firstTaskTitle = suggestedTask?.title ?? t('overview.suggestedTaskBody')

  // Placeholder member names ("Você", "Owner") are not names: greet without one.
  const firstName = userName?.trim().split(/\s+/u)[0] ?? ''
  const greeting = firstName.length > 0 && !PLACEHOLDER_NAMES.has(firstName.toLowerCase())
    ? t('overview.greeting', { name: firstName })
    : t('overview.greetingFallback')

  return (
    <div className={styles.view} data-persona-root="" ref={motion.ref} style={motion.style}>
      <header className={styles.header}>
        <div className={styles.headerTitles}>
          <p className={styles.eyebrow}>{t('overview.eyebrow')}</p>
          <h1 className={styles.title}>
            <span className={styles.titleInk}>
              {greeting}
              <Accent name="squiggle-2" width={220} height={16} className={styles.squiggle} />
            </span>
          </h1>
          <p className={styles.subtitle}>{t('overview.subtitle')}</p>
        </div>
        <Button variant="primary" size="l" icon={<UiIcon name="plus" size={20} strokeWidth={2.2} />} onClick={() => { onNavigate?.('channels') }}>
          {t('overview.newTask')}
        </Button>
      </header>

      <div className={styles.pawContainer}>{paw.node}</div>
      <DecisionFeedback decisions={decisions} t={t} onUndo={onUndoDecision} />

      {showMilestone && (
        <section className={styles.milestone} aria-label={t('overview.firstDelivery.eyebrow')}>
          <MilestoneCard
            celebrate
            illustration={ILLUSTRATIONS['primeira-entrega']}
            eyebrow={t('overview.firstDelivery.eyebrow')}
            title={t('overview.firstDelivery.title')}
            body={t('overview.firstDelivery.body', { name: firstDelivery.personaName, title: firstDelivery.title })}
            contributors={[{ name: firstDelivery.personaName, characterId: firstDelivery.characterId, count: 1 }]}
            contributorsLabel={t('overview.firstDelivery.who')}
            actions={(
              <>
                <Button
                  variant="primary"
                  onClick={() => {
                    dismissMilestone()
                    if (onOpenAwayTask !== undefined) onOpenAwayTask(firstDelivery.taskId)
                    else onNavigate?.('kanban')
                  }}
                >
                  {t('overview.firstDelivery.open')}
                </Button>
                <Button variant="ghost" onClick={dismissMilestone}>{t('overview.firstDelivery.dismiss')}</Button>
              </>
            )}
          />
        </section>
      )}

      {firstDeliveryPending && !showMilestone && (
        <section className={styles.milestone} aria-label={t('overview.firstDeliveryOnTheWay')}>
          <Notice tone="info" icon="clock">{t('overview.firstDeliveryOnTheWay')}</Notice>
        </section>
      )}

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <Card
            as="section"
            titleAs="h2"
            aria-labelledby="persona-attention-title"
            eyebrow={pendingCount > 0 ? t(pendingCount === 1 ? 'overview.attentionCount.one' : 'overview.attentionCount', { count: String(pendingCount) }) : undefined}
            title={<span id="persona-attention-title" ref={attentionTitleRef} tabIndex={-1}>{t('overview.attentionTitle')}</span>}
            className={styles.attentionCard}
          >
            {hasDecisions ? (
              blockingDecisions.length > 0 ? (
                <>
                  <ul className={styles.attentionList} role="list" ref={attentionListRef}>
                    {shownDecisions.map((decision) => {
                      // The store resolved the real persona's portrait; the name-based lookup is only a fallback.
                      const portrait = decision.requester.avatarSrc ?? personaPortraitSrc(undefined, decision.requester.name)
                      const titleId = `persona-decision-${decision.id}`
                      const leaving = decision.state === 'accepted' || decision.state === 'declined'
                      return (
                        <li
                          key={decision.id}
                          data-decision-id={decision.id}
                          data-decision-state={decision.state}
                          className={`${styles.attentionItem}${leaving ? ` ${decision.state === 'declined' ? styles.attentionLeavingDeclined : styles.attentionLeaving}` : ''}`}
                        >
                          <Avatar
                            name={decision.requester.name}
                            size={32}
                            shape="portrait"
                            decorative
                            {...(portrait === undefined ? {} : { src: portrait })}
                          />
                          <span className={styles.attentionText}>
                            <span className={styles.attentionKind}>{t(`decision.kind.${decision.kind}`)} · {decision.requester.name}</span>
                            <span id={titleId} className={styles.attentionTitle}>{decision.title}</span>
                          </span>
                          {decision.state === 'deciding' && (
                            <Button size="s" variant="secondary" loading aria-describedby={titleId}>
                              {t('decision.approve')}
                            </Button>
                          )}
                          {decision.state === 'accepted' && (
                            <ApprovedStamp label={t('decision.live.accepted', { title: decision.title })} animate />
                          )}
                          {(decision.state === 'declined' || decision.state === 'failed') && (
                            <DecisionStateNote
                              state={decision.state}
                              t={t}
                              {...(onDecide === undefined ? {} : { onRetry: () => { onDecide(decision.id, true) } })}
                            />
                          )}
                          {decision.state === 'pending' && (
                            decision.risk === 'low' ? (
                              <Button size="s" variant="primary" aria-describedby={titleId} onClick={() => { onDecide?.(decision.id, true) }}>
                                {t('decision.approve')}
                              </Button>
                            ) : (
                              <Button
                                size="s"
                                variant="secondary"
                                aria-describedby={titleId}
                                onClick={() => { onNavigate?.('approvals', { focus: decision.id }) }}
                              >
                                {t('decision.review')}
                              </Button>
                            )
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {blockingDecisions.length > 3 && (
                    <div className={styles.seeAllRow}>
                      <Button variant="ghost" size="s" onClick={() => { onNavigate?.('approvals') }}>
                        {t('overview.seeAllDecisions', { count: String(blockingDecisions.length) })}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  compact
                  illustration={ILLUSTRATIONS['empty-inbox']}
                  title={t('overview.attentionEmptyTitle')}
                  body={t('overview.attentionEmptyBody')}
                />
              )
            ) : attentionItems.length > 0 ? (
              <ul className={styles.attentionList}>
                {attentionItems.map(item => (
                  <li key={item} className={styles.attentionItem}>
                    <span className={styles.attentionIcon} aria-hidden="true">
                      <UiIcon name="clock" size={18} strokeWidth={2} />
                    </span>
                    <span className={styles.attentionText}>{item}</span>
                    <Button size="s" variant="secondary" onClick={() => { onNavigate?.('approvals') }}>
                      {t('overview.attentionAction')}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                illustration={ILLUSTRATIONS['empty-inbox']}
                title={t('overview.attentionEmptyTitle')}
                body={t('overview.attentionEmptyBody')}
              />
            )}
          </Card>

          <AwayWhileOutPanel t={t} events={awayEvents} onOpenTask={onOpenAwayTask} />

          {showFirstTask && (
            <Card
              as="section"
              titleAs="h2"
              eyebrow={t('overview.suggestedTaskTitle')}
              title={firstTaskTitle}
              tone="brand"
            >
              <p className={styles.introLine}>{t('overview.teamIntroLine')}</p>
              <div className={styles.cardActions}>
                <Button
                  variant="secondary"
                  icon={<UiIcon name="arrowRight" size={18} strokeWidth={2.2} />}
                  onClick={() => {
                    if (suggestedTask !== undefined && onOpenAwayTask !== undefined) onOpenAwayTask(suggestedTask.id)
                    else onNavigate?.('channels')
                  }}
                >
                  {suggestedTask !== undefined && onOpenAwayTask !== undefined
                    ? t('overview.suggestedTaskOpenBoard')
                    : t('overview.suggestedTaskAction')}
                </Button>
              </div>
            </Card>
          )}
        </div>

        <aside className={styles.sideCol}>
          <OverviewNowStrip t={t} rows={nowRows} loading={loading} />
        </aside>
      </div>
    </div>
  )
}

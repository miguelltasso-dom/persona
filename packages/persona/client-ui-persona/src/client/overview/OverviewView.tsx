import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { CardSprig, HeaderDoodles } from '../decor/HouseDecor.tsx'
import { usePersonaMotion } from '../motion/index.ts'
import {
  Accent,
  ApprovedStamp,
  Avatar,
  BrandIcon,
  Button,
  Card,
  MilestoneCard,
  Notice,
  Toast,
  ToastRegion,
  UiIcon,
  usePawCelebration,
} from '../primitives/index.ts'
import { requestMessageFocus } from '../chat/message-focus.ts'
import { DAILY_NOW_FAILED, planDailyNow, type DailyNowAction, type DailyNowNotice, type DailyNowResult } from './daily-now.ts'
import type { AwaySummaryEvent, PersonaNowSnapshot } from '../team/persona-work-state.ts'
import type { AwayLive } from '../remote/map-host-ui.ts'
import { AwayWhileOutPanel } from './AwayWhileOutPanel.tsx'
import { AttentionCalmBanner } from './AttentionCalmBanner.tsx'
import { coordinationOf } from './now-groups.ts'
import { OverviewNowStrip } from './OverviewNowStrip.tsx'
import type { Decision } from '../decisions/decision-types.ts'
import { DecisionFeedback } from '../decisions/DecisionFeedback.tsx'
import type { ReplyTarget } from '../answer/reply-target.ts'
import { DecisionStateNote } from '../decisions/DecisionStateNote.tsx'
import { blockingDecisions as selectBlocking, openBlockingCount } from '../decisions/decision-selectors.ts'
import { useDecisionListMotion } from '../decisions/use-decision-list-motion.ts'
import { resolvePersonaFace } from '../approvals/approvals-ui-helpers.ts'
import styles from './OverviewView.module.css'

export interface OverviewViewProps extends PropsLocale<'persona.shell'> {
  readonly attentionItems?: readonly string[] | undefined
  /** Single source human decisions (DECISIONS-SPEC / UX-PHASE item 4). */
  readonly decisions?: readonly Decision[] | undefined
  readonly onDecide?: ((decisionId: string, accept: boolean) => void) | undefined
  /** Undo a reversible decision (the toast only exists when the host marked it reversible). */
  readonly onUndoDecision?: ((decisionId: string) => void) | undefined
  /** IV-10 "Responder": the questions in words that carry the thread they were asked in, by decision id. Absent = every line keeps its usual button. */
  readonly replyTargets?: ReadonlyMap<string, ReplyTarget> | undefined
  readonly onReply?: ((target: ReplyTarget) => void) | undefined
  readonly nowRows: readonly PersonaNowSnapshot[]
  /** Os dados do host ainda não chegaram (recarregar): o "Agora" mostra skeleton em vez de "Monte sua equipe". */
  readonly loading?: boolean | undefined
  readonly awayEvents: readonly AwaySummaryEvent[]
  /** P1-7: the host's real "while you were away" (`null` = nothing/dismissed; absent = use `awayEvents`). */
  readonly away?: AwayLive | null | undefined
  /** "Entendi": the host starts the next window. */
  readonly onDismissAway?: (() => void) | undefined
  /** User display name for the greeting (falls back to a plain "Olá!"). */
  readonly userName?: string | undefined
  /** Navigate to another main panel (shell). */
  readonly onNavigate?: ((panel: 'channels' | 'kanban' | 'approvals' | 'team', query?: { focus?: string }) => void) | undefined
  /**
   * "Resumir o dia" (EQUIPE-REAL §(b) "O resumo a pedido"): pede ao host o cartão do dia AGORA. Sem o handler (host sem o pedido, `teamwork` desligada) o botão
   * não existe: nada de botão morto.
   */
  readonly onAskDailyBrief?: (() => Promise<DailyNowResult>) | undefined
  /** "Retomar" no aviso "O resumo do dia está pausado": só existe se o host aceita retomar a rotina (sem isto, o aviso não tem ação). */
  readonly onResumeDailyBrief?: (() => void | Promise<void>) | undefined
  readonly onOpenAwayTask?: ((taskId: string) => void) | undefined
  /** A task the board already has and nobody is working on (C8): the block opens it on the board. */
  readonly suggestedTask?: { readonly id: string; readonly title: string } | undefined
  /**
   * A request derived from what the person wrote about the business (host `suggestFirstRequests`). Without it, and without a live task,
   * the block does not exist: the screen never invents an example for a company it does not know.
   */
  readonly companySuggestion?: { readonly title: string } | undefined
  /**
   * "Pedir a {Coordenação} agora": sends the text to the thread and opens it. Absent = the block has no button, so it is not drawn.
   * Fire and forget: a send that fails shows up in the thread as "Não enviado · Tentar de novo".
   */
  readonly onAskCoordination?: ((text: string) => void) | undefined
  /** The team's first finished task ever (Prism wires from the board); shown once as a milestone (peak-end). */
  readonly firstDelivery?: FirstDelivery | undefined
  /** Guided first delivery requested during onboarding is currently in progress (FIRST-DELIVERY-SPEC). */
  readonly firstDeliveryPending?: boolean | undefined
  /** Item 13: a faixa "N pessoas da equipe estão sem IA" e o modal que liga a equipe toda (`ConnectedTeamAi`). Ausente = não existe. */
  readonly teamAiSlot?: ReactNode
  /** Item 19a: a seção "Seus números" (os números fixados, atualizados em silêncio). Ausente = não existe. */
  readonly numbersSlot?: ReactNode
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

/** Quanto o aviso do "Resumir o dia" fica na tela (a pessoa também pode fechá-lo). */
const DAILY_NOTICE_MS = 8000

/** Visão geral — "o que precisa de você" first, then what the team is doing now (RCD: never a blank dashboard). */
export function OverviewView({
  t,
  attentionItems = [],
  decisions,
  onDecide,
  onUndoDecision,
  replyTargets,
  onReply,
  nowRows,
  loading = false,
  awayEvents,
  away,
  onDismissAway,
  userName,
  onNavigate,
  onAskDailyBrief,
  onResumeDailyBrief,
  onOpenAwayTask,
  suggestedTask,
  companySuggestion,
  onAskCoordination,
  firstDelivery,
  firstDeliveryPending,
  teamAiSlot,
  numbersSlot,
}: OverviewViewProps): ReactNode {
  const [dismissedTaskId, setDismissedTaskId] = useState<string | null>(null)
  // "Resumir o dia": o botão vira "Resumindo…" (desabilitado) durante a chamada; o resultado vira o cartão (posted) ou um aviso neutro com a ação que resolve.
  const [asking, setAsking] = useState(false)
  const [dailyNotice, setDailyNotice] = useState<DailyNowNotice | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (noticeTimer.current !== null) clearTimeout(noticeTimer.current) }, [])
  const showDailyNotice = (plan: DailyNowNotice): void => {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
    setDailyNotice(plan)
    noticeTimer.current = setTimeout(() => { setDailyNotice(null) }, DAILY_NOTICE_MS)
  }
  const goToDailyCard = (messageId: string | undefined): void => {
    // O pedido de foco espera o cartão chegar pelo fio (a tela do canal pode nem estar montada ainda).
    if (messageId !== undefined) requestMessageFocus(messageId)
    onNavigate?.('channels')
  }
  const runDailyAction = (action: DailyNowAction): void => {
    setDailyNotice(null)
    if (action.kind === 'see') goToDailyCard(action.messageId)
    else if (action.kind === 'team') onNavigate?.('team')
    else if (action.kind === 'retry') void askDailyBrief()
    else void onResumeDailyBrief?.()
  }
  const askDailyBrief = async (): Promise<void> => {
    if (onAskDailyBrief === undefined || asking) return
    setAsking(true)
    setDailyNotice(null)
    try {
      const plan = planDailyNow(await onAskDailyBrief(), { canResume: onResumeDailyBrief !== undefined })
      if (plan.kind === 'go') goToDailyCard(plan.messageId)
      else showDailyNotice(plan)
    } catch {
      showDailyNotice(DAILY_NOW_FAILED)
    } finally {
      setAsking(false)
    }
  }
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
  const calm = hasDecisions ? blockingDecisions.length === 0 : attentionItems.length === 0
  const coordination = coordinationOf(nowRows)
  const quiet = calm && !teamHasActiveTask
  // One block, two honest sources: a real task on the board, or a request from the company profile addressed to who coordinates.
  const liveTask = quiet && suggestedTask !== undefined && onOpenAwayTask !== undefined ? suggestedTask : undefined
  const profileAsk = quiet && liveTask === undefined && companySuggestion !== undefined && onAskCoordination !== undefined && coordination !== undefined
    ? { title: companySuggestion.title, who: coordination.member.name, send: onAskCoordination }
    : undefined

  // Placeholder member names ("Você", "Owner") are not names: greet without one.
  const firstName = userName?.trim().split(/\s+/u)[0] ?? ''
  const greeting = firstName.length > 0 && !PLACEHOLDER_NAMES.has(firstName.toLowerCase())
    ? t('overview.greeting', { name: firstName })
    : t('overview.greetingFallback')

  const newTaskButton = (
    <Button variant="primary" size="l" icon={<UiIcon name="plus" size={20} strokeWidth={2.2} />} onClick={() => { onNavigate?.('channels') }}>
      {t('overview.newTask')}
    </Button>
  )

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
        <HeaderDoodles />
        {onAskDailyBrief === undefined ? newTaskButton : (
          // "Resumir o dia" (secundário, pequeno) perto do "Nova tarefa". Sem o handler o cabeçalho segue como sempre: o botão é filho direto.
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              size="s"
              icon={<BrandIcon name="bom-dia" size={16} />}
              disabled={asking}
              aria-busy={asking}
              data-daily-ask=""
              onClick={() => { void askDailyBrief() }}
            >
              {asking ? t('daily.asking') : t('daily.askNow')}
            </Button>
            {newTaskButton}
          </div>
        )}
      </header>

      {dailyNotice !== null && (
        <ToastRegion label={t('daily.noticesLabel')}>
          <Toast
            tone={dailyNotice.tone}
            title={t(dailyNotice.textKey)}
            action={dailyNotice.action === undefined ? undefined : (
              <Button size="s" variant="ghost" onClick={() => { runDailyAction(dailyNotice.action!) }}>{t(dailyNotice.action.labelKey)}</Button>
            )}
            dismissLabel={t('daily.dismiss')}
            onDismiss={() => { setDailyNotice(null) }}
          />
        </ToastRegion>
      )}

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
                {/* One amber button per screen: "Nova tarefa" (or "Pedir a …"). The celebration's button is a secondary one (Carbon). */}
                <Button
                  variant="secondary"
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

      {teamAiSlot}

      {numbersSlot}

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          {calm ? (
            <AttentionCalmBanner t={t} coordination={coordination === undefined ? undefined : { id: coordination.member.id, name: coordination.member.name }} />
          ) : (
            <Card
              as="section"
              titleAs="h2"
              aria-labelledby="persona-attention-title"
              eyebrow={pendingCount > 0 ? t(pendingCount === 1 ? 'overview.attentionCount.one' : 'overview.attentionCount', { count: String(pendingCount) }) : undefined}
              title={<span id="persona-attention-title" ref={attentionTitleRef} tabIndex={-1}>{t('overview.attentionTitle')}</span>}
              className={styles.attentionCard}
            >
              <CardSprig />
              {hasDecisions ? (
                blockingDecisions.length > 0 ? (
                  <>
                    <ul className={styles.attentionList} role="list" ref={attentionListRef}>
                      {shownDecisions.map((decision) => {
                        // D-069: a persona is never a letter. The store's real portrait wins, then the known character, then a gallery animal for an
                        // id with no portrait; the system author ("Equipe", no persona id) gets the team icon on a calm disc.
                        const portrait = resolvePersonaFace({
                          id: decision.requester.personaId,
                          name: decision.requester.name,
                          avatarSrc: decision.requester.avatarSrc,
                        })
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
                              {...(portrait === undefined
                                ? { icon: <BrandIcon name="equipe" size={18} /> }
                                : { src: portrait })}
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
                              <ApprovedStamp label={t('decision.live.accepted', { title: decision.title })} animate seed={decision.id} />
                            )}
                            {(decision.state === 'declined' || decision.state === 'failed') && (
                              <DecisionStateNote
                                state={decision.state}
                                t={t}
                                {...(onDecide === undefined ? {} : { onRetry: () => { onDecide(decision.id, true) } })}
                              />
                            )}
                            {decision.state === 'pending' && onReply !== undefined && replyTargets?.get(decision.id) !== undefined && (
                              <Button size="s" variant="primary" aria-describedby={titleId} onClick={() => { onReply(replyTargets.get(decision.id)!) }}>
                                {t('decision.reply')}
                              </Button>
                            )}
                            {decision.state === 'pending' && !(onReply !== undefined && replyTargets?.get(decision.id) !== undefined) && (
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
                ) : null
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
              ) : null}
            </Card>
          )}

          <AwayWhileOutPanel
            t={t}
            events={awayEvents}
            away={away}
            onOpenTask={onOpenAwayTask}
            onOpenApproval={onNavigate === undefined ? undefined : (approvalId) => { onNavigate('approvals', { focus: approvalId }) }}
            onDismiss={onDismissAway}
            onScreenAttention={shownDecisions.map(decision => ({ id: decision.id, title: decision.title }))}
            omitDelivery={showMilestone ? { taskId: firstDelivery.taskId, title: firstDelivery.title } : undefined}
          />

          {(liveTask !== undefined || profileAsk !== undefined) && (
            <Card
              as="section"
              titleAs="h2"
              eyebrow={t('overview.suggestedTaskTitle')}
              title={liveTask?.title ?? profileAsk?.title}
              tone="brand"
              data-persona-suggested-task=""
            >
              <div className={styles.cardActions}>
                {liveTask !== undefined ? (
                  <Button
                    variant="secondary"
                    icon={<UiIcon name="arrowRight" size={18} strokeWidth={2.2} />}
                    onClick={() => { onOpenAwayTask?.(liveTask.id) }}
                  >
                    {t('overview.suggestedTaskOpenBoard')}
                  </Button>
                ) : profileAsk !== undefined && (
                  <Button
                    variant="primary"
                    icon={<UiIcon name="arrowRight" size={18} strokeWidth={2.2} />}
                    onClick={() => { profileAsk.send(profileAsk.title) }}
                  >
                    {t('overview.askCoordination', { name: profileAsk.who })}
                  </Button>
                )}
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

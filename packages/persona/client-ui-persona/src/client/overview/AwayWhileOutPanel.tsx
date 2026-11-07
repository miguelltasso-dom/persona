import { useCallback, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { personaPortraitSrc } from '../approvals/approvals-ui-helpers.ts'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Avatar, Button, Card, Chip, PawBurst, Sparkle, UiIcon, formatWhen } from '../primitives/index.ts'
import type { AwayDoneLive, AwayLive, AwayPersonaRef, AwayWaitingLive } from '../remote/map-host-ui.ts'
import type { AwaySummaryEvent } from '../team/persona-work-state.ts'
import styles from './AwayWhileOutPanel.module.css'

const SESSION_KEY = 'persona.proactivity.awaySummary.dismissed'

type Translate = PropsLocale<'persona.shell'>['t']

export interface AwayWhileOutPanelProps extends PropsLocale<'persona.shell'> {
  /** Older shape (events only, written by the app): used when `away` is not wired. */
  readonly events: readonly AwaySummaryEvent[]
  /** The host's real window (P1-7). `null` = nothing to show or already dismissed; `undefined` = not wired (events are used). */
  readonly away?: AwayLive | null | undefined
  readonly onOpenTask?: ((taskId: string) => void) | undefined
  /** Open the Aprovações card (an approval, or a Task's question). */
  readonly onOpenApproval?: ((approvalId: string) => void) | undefined
  /** "Entendi": the host starts the next window. */
  readonly onDismiss?: (() => void) | undefined
  /** The items the "Precisa de você" card shows on this screen (its first three). A waiting row that is one of them is not listed twice. */
  readonly onScreenAttention?: readonly AttentionItemRef[] | undefined
  /** "Ver em Precisa de você": moves the focus to that card. Without it the count stays and no link is drawn. */
  readonly onOpenAttention?: (() => void) | undefined
}

/** Um item do cartão "Precisa de você": o id da decisão (= id da aprovação) e o título visível. */
export interface AttentionItemRef {
  readonly id: string
  readonly title: string
}

/** Uma linha de "Espera você" que o cartão "Precisa de você" já mostra: mesmo id de aprovação, mesmo id de tarefa ou mesmo título. */
function isOnAttention(row: AwayWaitingLive, attention: readonly AttentionItemRef[]): boolean {
  return attention.some(item => (row.approvalId !== undefined && item.id === row.approvalId)
    || (row.taskId !== undefined && item.id === row.taskId)
    || (row.title !== undefined && row.title.trim() !== '' && item.title.trim() === row.title.trim()))
}

/** "3 h", "45 min", "2 dias": how long the person was away, as the host measured it. */
function awayDuration(t: Translate, minutes: number): string {
  if (minutes < 60) return t('overview.awayMinutes', { n: Math.max(1, Math.round(minutes)) })
  const hours = Math.round(minutes / 60)
  if (hours < 48) return t('overview.awayHours', { n: hours })
  return t('overview.awayDays', { n: Math.round(hours / 24) })
}

/** "2 coisas esperam você · 3 entregas" (nothing is said about a count of zero). */
function summaryLine(t: Translate, needs: number, done: number): string {
  const parts: string[] = []
  if (needs > 0) parts.push(needs === 1 ? t('overview.awayNeedsOne') : t('overview.awayNeedsMany', { n: needs }))
  if (done > 0) parts.push(done === 1 ? t('overview.awayDoneOne') : t('overview.awayDoneMany', { n: done }))
  return parts.join(' · ')
}

function Who({ persona }: { readonly persona: AwayPersonaRef | undefined }): ReactNode {
  if (persona === undefined) return null
  const src = personaPortraitSrc(persona.characterId, persona.name)
  return <Avatar name={persona.name} {...(src === undefined ? {} : { src })} size={24} decorative />
}

function WaitingRow({ t, row, onOpenTask, onOpenApproval }: {
  readonly t: Translate
  readonly row: AwayWaitingLive
  readonly onOpenTask: ((taskId: string) => void) | undefined
  readonly onOpenApproval: ((approvalId: string) => void) | undefined
}): ReactNode {
  const kind = t(`overview.awayKind.${row.kind}`)
  const taskId = row.taskId
  const approvalId = row.approvalId
  const openTask = taskId !== undefined && onOpenTask !== undefined ? () => { onOpenTask(taskId) } : undefined
  const openApproval = approvalId !== undefined && onOpenApproval !== undefined ? () => { onOpenApproval(approvalId) } : undefined
  // Approvals and a Task's question live in Aprovações; a result waiting for Aplicar/Descartar lives on the Task.
  // No handler, no button: nothing here is a dead control.
  const open = row.kind === 'review' ? openTask : (openApproval ?? openTask)
  return (
    <li className={styles.row} data-away-kind={row.kind}>
      <Who persona={row.persona} />
      <Chip tone="brand" size="s">{kind}</Chip>
      <span className={styles.rowTitle}>{row.title ?? ''}</span>
      {open !== undefined && (
        <Button
          size="s"
          variant="secondary"
          iconEnd={<UiIcon name="arrowRight" size={16} strokeWidth={2.2} />}
          aria-label={t('overview.awayOpenItem', { item: row.title ?? kind })}
          onClick={open}
        >
          {t('overview.awayOpen')}
        </Button>
      )}
    </li>
  )
}

function DoneRow({ t, row, onOpenTask }: {
  readonly t: Translate
  readonly row: AwayDoneLive
  readonly onOpenTask: ((taskId: string) => void) | undefined
}): ReactNode {
  const taskId = row.taskId
  const open = taskId !== undefined && onOpenTask !== undefined ? () => { onOpenTask(taskId) } : undefined
  // The host's text for a delivery is just the Task's title: say who delivered what.
  const text = row.deliveredTitle === undefined
    ? row.body
    : (row.persona === undefined
      ? t('overview.awayDeliveredPlain', { task: row.deliveredTitle })
      : t('overview.awayDelivered', { name: row.persona.name, task: row.deliveredTitle }))
  return (
    <li className={styles.row} data-away-kind={row.kind}>
      <Who persona={row.persona} />
      <span className={styles.rowBody}>{text}</span>
      {open !== undefined && (
        <Button
          size="s"
          variant="secondary"
          iconEnd={<UiIcon name="arrowRight" size={16} strokeWidth={2.2} />}
          // Without the Task's real title the label is neutral: never the Task's id on screen.
          aria-label={row.taskLabel === undefined ? t('overview.awayOpenTaskPlain') : t('overview.awayOpenTask', { task: row.taskLabel })}
          onClick={open}
        >
          {/* When the sentence already says the title, the button does not repeat it. */}
          {row.deliveredTitle === undefined ? (row.taskLabel ?? t('overview.awayViewTask')) : t('overview.awayViewTask')}
        </Button>
      )}
    </li>
  )
}

function RealAway({ t, away, onOpenTask, onOpenApproval, onDismiss, onScreenAttention, onOpenAttention }: {
  readonly t: Translate
  readonly away: AwayLive
  readonly onOpenTask: ((taskId: string) => void) | undefined
  readonly onOpenApproval: ((approvalId: string) => void) | undefined
  readonly onDismiss: (() => void) | undefined
  readonly onScreenAttention: readonly AttentionItemRef[] | undefined
  readonly onOpenAttention: (() => void) | undefined
}): ReactNode {
  const [hidden, setHidden] = useState(false)
  const dismiss = useCallback((): void => {
    setHidden(true)
    onDismiss?.()
  }, [onDismiss])
  if (hidden || (away.done.length === 0 && away.waiting.length === 0)) return null

  // On the very first visit the host has no earlier "last here" and sends the epoch: that is "unknown", never "Desde 1 jan 1970".
  const sinceKnown = Date.parse(away.since) > Date.UTC(2000, 0, 1)
  // "Desde ontem 18:32 · 14 h fora": the length comes from the host (measured when the person came back).
  const since = !sinceKnown
    ? ''
    : away.awayMinutes === undefined
      ? t('overview.awaySince', { when: formatWhen(away.since) })
      : t('overview.awaySinceFor', { when: formatWhen(away.since), duration: awayDuration(t, away.awayMinutes) })
  // Quem já está em "Precisa de você" (o cartão ao lado) não se repete aqui: vira a contagem com o link.
  const attention = onScreenAttention ?? []
  const waitingOnScreen = away.waiting.filter(row => isOnAttention(row, attention))
  const waitingOthers = away.waiting.filter(row => !isOnAttention(row, attention))
  // Muse (04:18): with every waiting item already in "Precisa de você" the top summary only repeats the count; the done items stay in "Ficou pronto".
  const allWaitingOnScreen = away.waiting.length > 0 && waitingOthers.length === 0
  const summary = allWaitingOnScreen ? '' : summaryLine(t, away.waiting.length, away.done.length)

  return (
    <Card
      as="section"
      titleAs="h2"
      aria-labelledby="persona-away-title"
      tone="accent"
      data-persona-away=""
      title={(
        <span id="persona-away-title" className={styles.title}>
          {t('overview.awayTitle')}
          <Sparkle size={18} />
        </span>
      )}
      actions={<Button variant="ghost" size="s" onClick={dismiss}>{t('overview.awayDismiss')}</Button>}
    >
      <span className={styles.burstAnchor} aria-hidden="true"><PawBurst /></span>
      <div className={styles.layout}>
        <div className={styles.content}>
          {since !== '' && <p className={styles.lead}>{since}</p>}
          {summary !== '' && <p className={styles.summary}>{summary}</p>}
          {away.waiting.length > 0 && (
            <section className={styles.group} aria-labelledby="persona-away-waiting">
              <h3 id="persona-away-waiting" className={styles.groupTitle}>{t('overview.awayWaitingTitle')}</h3>
              {waitingOnScreen.length > 0 && (
                <p className={styles.lead}>
                  {waitingOnScreen.length === 1 ? t('overview.awayNeedsOne') : t('overview.awayNeedsMany', { n: waitingOnScreen.length })}
                  {onOpenAttention !== undefined && (
                    <>
                      {' · '}
                      <Button variant="ghost" size="s" onClick={onOpenAttention}>{t('overview.awaySeeAttention')}</Button>
                    </>
                  )}
                </p>
              )}
              {waitingOthers.length > 0 && (
                <ul className={styles.rows}>
                  {waitingOthers.map(row => (
                    <WaitingRow key={row.id} t={t} row={row} onOpenTask={onOpenTask} onOpenApproval={onOpenApproval} />
                  ))}
                </ul>
              )}
            </section>
          )}
          {away.done.length > 0 && (
            <section className={styles.group} aria-labelledby="persona-away-done">
              <h3 id="persona-away-done" className={styles.groupTitle}>{t('overview.awayDoneTitle')}</h3>
              <ul className={styles.rows}>
                {away.done.map(row => <DoneRow key={row.id} t={t} row={row} onOpenTask={onOpenTask} />)}
              </ul>
            </section>
          )}
        </div>
        {ILLUSTRATIONS['away-entregas'] !== undefined && (
          <img className={styles.art} src={ILLUSTRATIONS['away-entregas']} alt="" aria-hidden="true" />
        )}
      </div>
    </Card>
  )
}

/** Peak-end summary when the app opens (PROACTIVITY §7): what waits for the person and what got done while they were away. */
export function AwayWhileOutPanel({ t, events, away, onOpenTask, onOpenApproval, onDismiss, onScreenAttention, onOpenAttention }: AwayWhileOutPanelProps): ReactNode {
  const [visible, setVisible] = useState(() => {
    if (events.length === 0) return false
    try {
      return sessionStorage.getItem(SESSION_KEY) !== '1'
    } catch {
      return true
    }
  })

  const dismiss = useCallback((): void => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      /* sessionStorage unavailable */
    }
    setVisible(false)
  }, [])

  // The host's real window wins whenever it is wired (null = nothing to show or already dismissed).
  if (away !== undefined) {
    return away === null ? null : <RealAway t={t} away={away} onOpenTask={onOpenTask} onOpenApproval={onOpenApproval} onDismiss={onDismiss} onScreenAttention={onScreenAttention} onOpenAttention={onOpenAttention} />
  }

  if (!visible) return null

  return (
    <Card
      as="section"
      titleAs="h2"
      aria-labelledby="persona-away-title"
      tone="accent"
      title={(
        <span id="persona-away-title" className={styles.title}>
          {t('overview.awayTitle')}
          <Sparkle size={18} />
        </span>
      )}
      actions={<Button variant="ghost" size="s" onClick={dismiss}>{t('overview.awayDismiss')}</Button>}
    >
      <span className={styles.burstAnchor} aria-hidden="true"><PawBurst /></span>
      <div className={styles.layout}>
        <div className={styles.content}>
          <p className={styles.lead}>{t('overview.awayLead')}</p>
          <ol className={styles.timeline}>
            {events.map((event, index) => (
              <li key={event.id} className={styles.item} style={{ animationDelay: `${index * 80}ms` }}>
                <span className={styles.dot} aria-hidden="true" />
                <p className={styles.body}>{event.body ?? (event.bodyKey !== undefined ? t(event.bodyKey) : '')}</p>
                <Button
                  size="s"
                  variant="secondary"
                  iconEnd={<UiIcon name="arrowRight" size={16} strokeWidth={2.2} />}
                  {...(event.taskId === undefined || onOpenTask === undefined
                    ? {}
                    : {
                      onClick: () => { onOpenTask(event.taskId as string) },
                      // Sem título real da tarefa o texto é neutro: nunca o id da tarefa na tela.
                      'aria-label': event.taskLabel === undefined
                        ? t('overview.awayOpenTaskPlain')
                        : t('overview.awayOpenTask', { task: event.taskLabel }),
                    })}
                >
                  {event.taskLabel
                    ?? (event.taskLabelKey !== undefined
                      ? t(event.taskLabelKey)
                      : (event.taskId !== undefined && onOpenTask !== undefined ? t('overview.awayViewTask') : t('overview.awayDismiss')))}
                </Button>
              </li>
            ))}
          </ol>
        </div>
        {ILLUSTRATIONS['away-entregas'] !== undefined && (
          <img className={styles.art} src={ILLUSTRATIONS['away-entregas']} alt="" aria-hidden="true" />
        )}
      </div>
    </Card>
  )
}

/**
 * T3-UX-HARVEST §7 and §9 (Muse). Interaction patterns harvested from t3code (MIT), redrawn in our style.
 * PooledQuotaBar: one number per window for a provider with several accounts, one segment per account in a
 * stable order, soonest refill first; hatched part = what the next refill gives back. Missing window = gap, never 0%.
 * ActivityGroup: consecutive tool calls folded into one honest sentence; failures never count as done.
 */

import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Avatar } from './Avatar.tsx'
import { UiIcon } from './icons.tsx'
import styles from './Pooled.module.css'

export interface PooledAccount {
  readonly id: string
  /** "Trabalho" */
  readonly label: string
  /** 0–100 left in this window; undefined = the account does not report this window (gap). */
  readonly leftPct?: number | undefined
  /** 0–100 the next refill gives back (hatched). */
  readonly refillPct?: number | undefined
  /** "18:30" */
  readonly refillAt?: string | undefined
}

export interface PooledQuotaBarProps {
  /** "5 horas" | "Semana" */
  readonly window: string
  /** Accounts in the SAME order for every window (sorted by next refill by the caller). */
  readonly accounts: readonly PooledAccount[]
  /** Segment color (the engine seal tone). */
  readonly color?: string
  readonly compact?: boolean
  readonly labels: {
    /** "62% sobrando" */
    readonly left: (pct: number) => string
    /** "Volta 18% às 18:30 (Trabalho)" */
    readonly nextRefill: (pct: number, at: string, account: string) => string
    /** "não informa esta janela" */
    readonly noWindow: string
    /** "Trabalho: 40% sobrando, volta às 18:30" (segment accessible text) */
    readonly segment: (account: PooledAccount) => string
  }
}

export function PooledQuotaBar({ window, accounts, color = 'var(--persona-lilac-400)', compact = false, labels }: PooledQuotaBarProps): ReactNode {
  const reporting = accounts.filter(a => a.leftPct !== undefined)
  const pooled = reporting.length === 0 ? undefined : Math.round(reporting.reduce((sum, a) => sum + (a.leftPct ?? 0), 0) / reporting.length)
  const next = accounts.find(a => a.refillAt !== undefined && (a.refillPct ?? 0) > 0)
  const [active, setActive] = useState<string | null>(null)
  const id = useId()
  return (
    <div className={styles.pool} data-compact={compact ? '' : undefined} style={{ '--pool-color': color } as CSSProperties}>
      <div className={styles.poolHead}>
        <span className={styles.window}>{window}</span>
        <span className={styles.left}>{pooled === undefined ? labels.noWindow : labels.left(pooled)}</span>
      </div>
      <ol className={styles.bar} aria-label={window}>
        {accounts.map((a) => {
          const missing = a.leftPct === undefined
          return (
            <li
              key={a.id}
              className={styles.segment}
              data-missing={missing ? '' : undefined}
              data-active={active === a.id ? '' : undefined}
              style={{ '--left': `${a.leftPct ?? 0}%`, '--refill': `${a.refillPct ?? 0}%` } as CSSProperties}
            >
              <button
                type="button"
                className={styles.segmentButton}
                aria-describedby={active === a.id ? `${id}-detail` : undefined}
                aria-label={missing ? `${a.label}: ${labels.noWindow}` : labels.segment(a)}
                onClick={() => { setActive(active === a.id ? null : a.id) }}
                onPointerEnter={() => { setActive(a.id) }}
                onPointerLeave={() => { setActive(null) }}
              >
                <span className={styles.fill} />
                <span className={styles.refill} />
              </button>
            </li>
          )
        })}
      </ol>
      {!compact && (
        <p className={styles.poolFoot} id={`${id}-detail`} aria-live="polite">
          {active !== null
            ? (() => {
              const a = accounts.find(x => x.id === active)
              return a === undefined ? '' : a.leftPct === undefined ? `${a.label}: ${labels.noWindow}` : labels.segment(a)
            })()
            : next !== undefined && next.refillAt !== undefined
              ? labels.nextRefill(next.refillPct ?? 0, next.refillAt, next.label)
              : ''}
        </p>
      )}
    </div>
  )
}

/* ───────────── Activity group ───────────── */

export type ActivityKind = 'command' | 'file' | 'hire' | 'message' | 'read' | 'check'
export type ActivityStatus = 'done' | 'failed' | 'running' | 'waiting'

export interface ActivityItem {
  readonly id: string
  readonly kind: ActivityKind
  /** "npm test", "contratos/proposta.md", "mensagem para Sol" */
  readonly title: string
  readonly status: ActivityStatus
  /** Instante do evento (ISO) quando o host manda: o resumo do turno conta o tempo com ele. */
  readonly at?: string | undefined
  readonly onOpen?: (() => void) | undefined
}

export interface ActivityGroupProps {
  readonly persona: { readonly name: string; readonly avatarSrc?: string | undefined }
  readonly items: readonly ActivityItem[]
  readonly labels: {
    /** Plural-aware phrase per kind: (n) => "rodou 2 comandos" */
    readonly phrase: Readonly<Record<ActivityKind, (n: number) => string>>
    /** "e mais {n}" */
    readonly more: (n: number) => string
    /** "{n} falharam" */
    readonly failed: (n: number) => string
    readonly running: string
    readonly status: Readonly<Record<ActivityStatus, string>>
    readonly open: string
    readonly expand: string
    readonly collapse: string
  }
}

/** Changes first (commands, files, hires), then messages; reads/checks last (t3code activity-log rule). */
const PRIORITY: readonly ActivityKind[] = ['command', 'file', 'hire', 'message', 'read', 'check']

export function summarizeActivity(items: readonly ActivityItem[], labels: ActivityGroupProps['labels']): string {
  const done = items.filter(i => i.status === 'done')
  const counts = PRIORITY.map(kind => ({ kind, n: done.filter(i => i.kind === kind).length })).filter(c => c.n > 0)
  const shown = counts.slice(0, 2).map(c => labels.phrase[c.kind](c.n))
  const rest = counts.slice(2).reduce((sum, c) => sum + c.n, 0)
  const failed = items.filter(i => i.status === 'failed').length
  const parts = [shown.join(' e ')]
  if (rest > 0) parts.push(labels.more(rest))
  if (failed > 0) parts.push(labels.failed(failed))
  if (items.some(i => i.status === 'running' || i.status === 'waiting')) parts.push(labels.running)
  return parts.filter(p => p.length > 0).join(' · ')
}

const STATUS_ICON: Readonly<Record<ActivityStatus, ReactNode>> = {
  done: <UiIcon name="check" size={14} strokeWidth={2.6} />,
  failed: <UiIcon name="close" size={14} strokeWidth={2.6} />,
  running: <UiIcon name="clock" size={14} strokeWidth={2.4} />,
  waiting: <UiIcon name="clock" size={14} strokeWidth={2.4} />,
}

export function ActivityGroup({ persona, items, labels }: ActivityGroupProps): ReactNode {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const summary = summarizeActivity(items, labels)
  return (
    <div className={styles.activity} data-failed={items.some(i => i.status === 'failed') ? '' : undefined}>
      <button type="button" className={styles.activityHead} aria-expanded={open} aria-controls={listId} aria-label={`${persona.name} ${summary} — ${open ? labels.collapse : labels.expand}`} onClick={() => { setOpen(v => !v) }}>
        <Avatar name={persona.name} src={persona.avatarSrc} size={24} shape="portrait" decorative />
        <span className={styles.activityText}><b>{persona.name}</b> {summary}</span>
        <UiIcon name="chevronDown" size={16} strokeWidth={2.4} className={styles.activityChevron} />
      </button>
      {open && (
        <ol id={listId} className={styles.activityList}>
          {items.map(item => (
            <li key={item.id} className={styles.activityItem} data-status={item.status}>
              <span className={styles.statusIcon} aria-hidden="true">{STATUS_ICON[item.status]}</span>
              <span className={styles.itemTitle}>{item.title}</span>
              <span className="persona-sr-only">{labels.status[item.status]}</span>
              {item.onOpen !== undefined && <button type="button" className={styles.openLink} onClick={item.onOpen}>{labels.open}</button>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

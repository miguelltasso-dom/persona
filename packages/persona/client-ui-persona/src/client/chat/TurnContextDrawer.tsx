import { useState, type CSSProperties, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconButton, PooledQuotaBar, UiIcon } from '../primitives/index.ts'
import type { TurnContextUi } from '../remote/turn-context-ui.ts'
import styles from './TurnContextDrawer.module.css'

/** Readable origin of a context item ("vault:1" → Cofre · 1). */
function originOf(id: string): { kind: string; ref: string } {
  const [kind = '', ...rest] = id.split(':')
  return { kind, ref: rest.join(':') || id }
}

const KIND_ICON: Readonly<Record<string, 'sparkle' | 'attach' | 'at' | 'clock'>> = {
  vault: 'sparkle',
  document: 'attach',
  file: 'attach',
  message: 'at',
  memory: 'clock',
}

/**
 * "Contexto usado" side drawer (UX-GUIDE §3: opens as a lateral drawer, items stagger 30 ms).
 * Shows which Cofre records, files and messages a persona used for a task; dismissible per ticket.
 */
export function TurnContextDrawer({ t, context }: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly context: TurnContextUi | null | undefined
}): ReactNode {
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (context === null || context === undefined || dismissed === context.ticketId) return null
  return (
    <section className={styles.drawer} aria-labelledby={`turn-context-${context.ticketId}`}>
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true"><UiIcon name="sparkle" size={16} strokeWidth={2.2} /></span>
        <h2 id={`turn-context-${context.ticketId}`} className={styles.title}>{t('context.drawerTitle')}</h2>
        <IconButton size="s" label={t('context.close')} icon={<UiIcon name="close" size={16} />} onClick={() => { setDismissed(context.ticketId) }} />
      </header>
      <p className={styles.task}>
        <span className={styles.label}>{t('context.taskLabel')}</span>
        {context.title}
      </p>
      {context.records.length > 0 && (
        <>
          <p className={styles.label}>{t('context.recordsLabel')}</p>
          <ul className={styles.list}>
            {context.records.map((record, index) => {
              const icon = KIND_ICON[record.kind] ?? 'sparkle'
              const title = record.title ?? record.id
              const label = record.kind === 'document'
                ? (record.locator !== undefined && record.locator !== ''
                  ? t('context.documentCite', { title, locator: record.locator })
                  : title)
                : (record.title ?? record.body).slice(0, 160)
              return (
                <li key={record.id} className={styles.item} style={{ '--stagger': `${index * 30}ms` } as CSSProperties}>
                  <span className={styles.itemIcon} aria-hidden="true"><UiIcon name={icon} size={14} strokeWidth={2.2} /></span>
                  <span className={styles.itemText}>
                    {label}
                    {record.restricted && (
                      <span className={styles.restricted}> · {t('context.restricted')}</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <div className={styles.limits}>
        <p className={styles.label}>{t('context.limitsLabel')}</p>
        <PooledQuotaBar
          compact
          window={t('context.limitsWindow')}
          color="var(--persona-lilac-500)"
          labels={{
            left: pct => t('context.limitsLeft', { pct: String(pct) }),
            nextRefill: (pct, at, account) => t('context.limitsRefill', { pct: String(pct), time: at, account }),
            noWindow: t('context.limitsNoWindow'),
            segment: account => account.label,
          }}
          accounts={[
            { id: 'w', label: t('context.limitsWork'), leftPct: 42, refillPct: 12, refillAt: '18:30' },
          ]}
        />
        <p className={styles.compactHint}>{t('context.compactMark')}</p>
      </div>
      {context.triggerIds.length > 0 && (
        <>
          <p className={styles.label}>{t('context.triggersLabel')}</p>
          <ul className={styles.list}>
            {context.triggerIds.map((id, index) => {
              const origin = originOf(id)
              return (
                <li key={id} className={styles.item} style={{ '--stagger': `${(context.records.length + index) * 30}ms` } as CSSProperties}>
                  <span className={styles.itemIcon} aria-hidden="true"><UiIcon name={KIND_ICON[origin.kind] ?? 'more'} size={14} strokeWidth={2.2} /></span>
                  <span className={styles.itemText}>{id}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

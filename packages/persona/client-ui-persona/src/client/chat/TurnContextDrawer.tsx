import { useState, type CSSProperties, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ActivityGroup, FixedRowVirtualScroller, IconButton, UiIcon, type ActivityGroupProps } from '../primitives/index.ts'
import type { TurnContextUi } from '../remote/turn-context-ui.ts'
import { ENGINE_LIMITS_UNAVAILABLE, type EngineLimitsUi } from '../remote/engine-limits.ts'
import { EngineLimitsBars } from './EngineLimitsBars.tsx'
import styles from './TurnContextDrawer.module.css'

/** Readable origin of a context item ("vault:1" → Cofre · 1). */
function originOf(id: string): { kind: string; ref: string } {
  const [kind = '', ...rest] = id.split(':')
  return { kind, ref: rest.join(':') || id }
}

const CONTEXT_RECORD_ROW_PX = 44
const CONTEXT_RECORD_VIRTUAL_MIN = 32

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
export function TurnContextDrawer({ t, context, activityLabels, limits = ENGINE_LIMITS_UNAVAILABLE }: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly context: TurnContextUi | null | undefined
  readonly activityLabels?: ActivityGroupProps['labels'] | undefined
  /** Limites reais do motor (IV-4); sem fonte, "indisponível" (nunca número de exemplo). */
  readonly limits?: EngineLimitsUi | undefined
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
      {context.activityFolds !== undefined && context.activityFolds.length > 0 && activityLabels !== undefined && (
        <>
          <p className={styles.label}>{t('context.activityLabel')}</p>
          <div className={styles.activityStack}>
            {context.activityFolds.map(fold => (
              <ActivityGroup
                key={fold.persona.name}
                persona={fold.persona}
                items={fold.items}
                labels={activityLabels}
              />
            ))}
          </div>
        </>
      )}
      {context.records.length > 0 && (
        <>
          <p className={styles.label}>{t('context.recordsLabel')}</p>
          {context.records.length >= CONTEXT_RECORD_VIRTUAL_MIN ? (
            <FixedRowVirtualScroller
              {...(styles.recordsVirtual === undefined ? {} : { className: styles.recordsVirtual })}
              rowCount={context.records.length}
              rowHeight={CONTEXT_RECORD_ROW_PX}
              getRowKey={index => context.records[index]?.id ?? `record-${index}`}
              renderRow={(index) => {
                const record = context.records[index]
                if (record === undefined) return null
                const icon = KIND_ICON[record.kind] ?? 'sparkle'
                const title = record.title ?? record.id
                const label = record.kind === 'document'
                  ? (record.locator !== undefined && record.locator !== ''
                    ? t('context.documentCite', { title, locator: record.locator })
                    : title)
                  : (record.title ?? record.body).slice(0, 160)
                return (
                  <div className={styles.item} style={{ '--stagger': `${index * 30}ms` } as CSSProperties}>
                    <span className={styles.itemIcon} aria-hidden="true"><UiIcon name={icon} size={14} strokeWidth={2.2} /></span>
                    <span className={styles.itemText}>
                      {label}
                      {record.restricted && (
                        <span className={styles.restricted}> · {t('context.restricted')}</span>
                      )}
                    </span>
                  </div>
                )
              }}
            />
          ) : (
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
          )}
        </>
      )}
      <div className={styles.limits}>
        <p className={styles.label}>{t('context.limitsLabel')}</p>
        {/* IV-4 = P0-28: as cotas oficiais do motor (as mesmas do /limites e de Uso); sem dado, "—" e "Este motor não informa a cota.". */}
        <EngineLimitsBars t={t} limits={limits} />
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

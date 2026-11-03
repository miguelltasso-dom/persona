/** Central human decisions (one question per card — Neutrality is omission). */
import type { ReactNode } from 'react'
import { Avatar, Button, Card, Chip, Screen, ScreenHeader } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Approvals.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { ProactiveDailySummaries } from './ProactiveDailySummaries.tsx'
import type { ApprovalItem } from './mock-data.ts'
import type { PersonaDailyProactiveSummary, ProactiveProposal } from './proactivity-mock-data.ts'
import { pt as defaultDict } from '../locale/approvals/locales.ts'

export type ApprovalsSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

function cardTitle(dict: LocaleDict, item: ApprovalItem): string {
  if (item.kind === 'hire') return bindLocale(dict, 'hire.title', { name: item.title })
  const key = `${item.kind}.title` as 'vault.title' | 'skill.title' | 'attention.title'
  return bindLocale(dict, key)
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
  readonly onDecideItem?: (item: ApprovalItem, accept: boolean) => void
  readonly onDecideProactive?: (proposal: ProactiveProposal, accept: boolean) => void
  readonly onRemoteRetry?: () => void
}

export function ApprovalsInbox({
  dict = defaultDict,
  items = [],
  proactiveSummaries = [],
  initialState = 'ready',
  onDecideItem,
  onDecideProactive,
  onRemoteRetry,
}: ApprovalsInboxProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const summaryIso = proactiveSummaries.find(summary => summary.proposals.length > 0)?.summaryDate ?? ''
  const summaryDateLabel = summaryIso === '' ? '' : formatSummaryDate(dict, summaryIso)
  const hasReactive = items.length > 0
  const hasProactive = proactiveSummaries.some(s => s.proposals.length > 0)

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
          titleKey="empty.title"
          hintKey="empty.hint"
        />
      </Screen>
    )
  }

  return (
    <Screen className={styles.shell} data-persona-surface="approvals">
      {header}
      {hasProactive && (
        <ProactiveDailySummaries
          dict={dict}
          summaries={proactiveSummaries}
          summaryDateLabel={summaryDateLabel}
          {...(onDecideProactive !== undefined ? { onDecide: onDecideProactive } : {})}
        />
      )}
      {hasReactive && (
        <section aria-labelledby="persona-reactive-approvals" data-persona-approvals="reactive">
          <h2 id="persona-reactive-approvals" className={styles.sectionTitle}>{t('reactive.title')}</h2>
          <p className={styles.sectionHint}>{t('reactive.subtitle')}</p>
          <ul className={styles.list}>
            {items.map((item, index) => (
              <li key={item.id}>
                <Card padding="m" tone="accent" className={styles.approvalCard}>
                  <div className={styles.approvalHead}>
                    <Avatar name={item.title} size={40} shape="portrait" />
                    <div>
                      <Chip tone="accent" size="s">{t(`type.${item.kind}`)}</Chip>
                      <h3 className={styles.question}>{cardTitle(dict, item)}</h3>
                    </div>
                  </div>
                  <p className={styles.context}>{item.question}</p>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      size="s"
                      onClick={() => { onDecideItem?.(item, true) }}
                      disabled={index > 0 || onDecideItem === undefined}
                    >
                      {t(item.primaryKey)}
                    </Button>
                    <Button
                      variant="secondary"
                      size="s"
                      onClick={() => { onDecideItem?.(item, false) }}
                      disabled={onDecideItem === undefined}
                    >
                      {t('action.dismiss')}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  )
}

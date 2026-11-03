/** Central human decisions (one question per card — Neutrality is omission). */
import type { ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import { PersonaButton } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import page from '../profile/LumenPage.module.css'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import { ProactiveDailySummaries } from './ProactiveDailySummaries.tsx'
import type { ApprovalItem } from './mock-data.ts'
import type { PersonaDailyProactiveSummary } from './proactivity-mock-data.ts'
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
}

export function ApprovalsInbox({
  dict = defaultDict,
  items = [],
  proactiveSummaries = [],
  initialState = 'ready',
}: ApprovalsInboxProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const motion = usePersonaMotion({ preset: 'fast', fromOpacity: 0, fromTranslateY: 6 })
  const summaryIso = proactiveSummaries.find(summary => summary.proposals.length > 0)?.summaryDate ?? ''
  const summaryDateLabel = summaryIso === '' ? '' : formatSummaryDate(dict, summaryIso)
  const hasReactive = items.length > 0
  const hasProactive = proactiveSummaries.some(s => s.proposals.length > 0)

  if (initialState === 'loading') return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
  if (initialState === 'empty' || (!hasReactive && !hasProactive)) {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationLabelKey="empty.illustration"
        titleKey="empty.title"
        hintKey="empty.hint"
      />
    )
  }

  return (
    <div className={page.shell} ref={motion.ref} style={motion.style} data-persona-surface="approvals">
      <header>
        <h1 className={page.title}>{t('title')}</h1>
        <p className={page.subtitle}>{t('subtitle')}</p>
      </header>

      {hasProactive && (
        <ProactiveDailySummaries
          dict={dict}
          summaries={proactiveSummaries}
          summaryDateLabel={summaryDateLabel}
        />
      )}

      {hasReactive && (
        <section aria-labelledby="persona-reactive-approvals" data-persona-approvals="reactive">
          <h2 id="persona-reactive-approvals" className={page.title}>{t('reactive.title')}</h2>
          <p className={page.subtitle}>{t('reactive.subtitle')}</p>
          <ul className={page.list}>
            {items.map(item => (
              <li key={item.id} className={page.card}>
                <span className={page.chip}>{t(`type.${item.kind}`)}</span>
                <h3 className={page.title}>{cardTitle(dict, item)}</h3>
                <p className={page.meta}>{item.question}</p>
                <div className={page.actions}>
                  <PersonaButton>{t(item.primaryKey)}</PersonaButton>
                  <PersonaButton variant="secondary">{t('action.dismiss')}</PersonaButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

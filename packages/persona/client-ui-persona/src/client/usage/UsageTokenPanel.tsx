import type { ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Card, Chip } from '../primitives/index.ts'
import type { UsageTokenPanelUi } from '../data/adapters/usage-panel.ts'
import type { UsageOrigin } from './mock-data.ts'
import styles from './Usage.module.css'

function originChipTone(origin: UsageOrigin): 'success' | 'accent' | 'neutral' {
  if (origin === 'measured') return 'success'
  if (origin === 'estimated') return 'accent'
  return 'neutral'
}

function originLabel(dict: LocaleDict, origin: UsageOrigin): string {
  return bindLocale(dict, `origin.${origin}`)
}

function SliceTable({ dict, title, rows }: { dict: LocaleDict; title: string; rows: UsageTokenPanelUi['byPersona'] }): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  if (rows.length === 0) return null
  return (
    <div className={styles.tokenSliceBlock}>
      <h3 className={styles.tokenSliceTitle}>{title}</h3>
      <ul className={styles.tokenSliceList}>
        {rows.map(row => (
          <li key={row.key} className={styles.tokenSliceRow}>
            <span className={styles.tokenSliceKey}>{row.key}</span>
            <span className={styles.tokenSliceMeta}>
              {t('token.tokens', { count: row.tokens })}
              {row.cacheHitPct !== undefined && ` · ${t('token.cacheHit', { pct: row.cacheHitPct })}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** OPT-7 — tokens per successful task, by persona/kind, cache hit (labeled origin). */
export function UsageTokenPanel({ dict, panel }: { readonly dict: LocaleDict; readonly panel: UsageTokenPanelUi }): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return (
    <Card padding="m" as="section" aria-labelledby="usage-token-panel">
      <div className={styles.tokenHead}>
        <p id="usage-token-panel" className={styles.sectionEyebrow}>{t('section.tokens')}</p>
        <Chip tone={originChipTone(panel.origin)} size="s">{originLabel(dict, panel.origin)}</Chip>
      </div>
      <p className={styles.tokenLead}>
        {panel.tokensPerSuccessfulTask > 0
          ? t('token.perTask', { count: Math.round(panel.tokensPerSuccessfulTask) })
          : t('token.perTaskEmpty')}
        {panel.cacheHitPct !== undefined && ` · ${t('token.cacheHit', { pct: panel.cacheHitPct })}`}
      </p>
      <SliceTable dict={dict} title={t('token.byPersona')} rows={panel.byPersona} />
      <SliceTable dict={dict} title={t('token.byKind')} rows={panel.byKind} />
    </Card>
  )
}

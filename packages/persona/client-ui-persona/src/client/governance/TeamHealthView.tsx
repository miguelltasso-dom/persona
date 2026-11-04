import { useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, EmptyState, Screen, ScreenHeader } from '../primitives/index.ts'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { ActivityGroup, type ActivityItem } from '../primitives/Pooled.tsx'
import { HealthItem, HealthScore, TWO_DAY_ART, TwoDayTimeline } from '../primitives/Governance.tsx'
import { activityGroupLabelsFromDict } from './activity-group-labels.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { GovernanceFixKind, TeamHealthView as TeamHealthDto, TwoDayRowView, TwoDayTestView } from './governance-contract.ts'
import { healthFixActionLabel } from './governance-ui-helpers.ts'
import { twoDayToUi } from './map-governance-ui.ts'
import styles from './GovernanceScreens.module.css'

export type TeamHealthSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface TeamHealthViewProps {
  readonly dict: LocaleDict
  readonly health: TeamHealthDto | null
  readonly twoDay: TwoDayTestView | null
  readonly surfaceState: TeamHealthSurfaceState
  readonly onRetry?: () => void
  readonly onRunTwoDayTest?: () => void
  readonly onApplyFix?: (findingId: string, fixKind: GovernanceFixKind, targetId?: string) => void
  readonly onTwoDayFix?: (row: TwoDayRowView) => void
  readonly twoDayPending?: boolean
  /** GES-5 — gestor audit trail (mock until host ships). */
  readonly gestorAudit?: {
    readonly persona: { readonly name: string; readonly avatarSrc?: string | undefined }
    readonly items: readonly ActivityItem[]
  } | undefined
  readonly onBuildTeam?: (() => void) | undefined
}

/**
 * UX-15: the human placeholder name "Você" mid-sentence reads as a proper noun ("depende de Você").
 * Lowercase it when it is not the first word of a sentence (host copy stays untouched).
 */
export function youInSentence(text: string): string {
  return text.replace(/(^|[^.!?:]\s)Você(?!\p{L})/gu, (match, lead: string) => (lead === '' ? match : `${lead}você`))
}

export function TeamHealthView({
  dict,
  health,
  twoDay,
  surfaceState,
  onRetry,
  onRunTwoDayTest,
  onApplyFix,
  onTwoDayFix,
  twoDayPending = false,
  gestorAudit,
  onBuildTeam,
}: TeamHealthViewProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const [twoDayOpen, setTwoDayOpen] = useState(true)

  const header = (
    <ScreenHeader
      icon="equipe"
      eyebrow={t('header.eyebrowTeam')}
      title={t('health.title')}
      subtitle={t('health.subtitle')}
    />
  )

  if (surfaceState === 'empty') {
    return (
      <Screen width="full" className={styles.shell} data-persona-surface="team-health">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-kanban"
          titleKey="health.empty.title"
          hintKey="health.empty.hint"
          {...(onBuildTeam === undefined
            ? {}
            : { primaryKey: 'health.empty.action', onPrimary: onBuildTeam })}
        />
      </Screen>
    )
  }

  if (surfaceState === 'loading' || health === null) {
    return (
      <Screen width="full" className={styles.shell} data-persona-surface="team-health">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={2} />
      </Screen>
    )
  }

  if (surfaceState === 'error') {
    return (
      <Screen width="full" className={styles.shell} data-persona-surface="team-health">
        {header}
        <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => { onRetry?.() }} />
      </Screen>
    )
  }

  const timeline = twoDay !== null && onTwoDayFix !== undefined
    ? twoDayToUi(dict, twoDay, onTwoDayFix)
    : null
  return (
    <Screen width="full" className={styles.shell} data-persona-surface="team-health">
      {header}
      <HealthScore
        level={health.level}
        title={youInSentence(health.title)}
        {...(health.body === undefined ? {} : { body: youInSentence(health.body) })}
        {...(health.score === undefined ? {} : { score: health.score, scoreLabel: t('health.scoreLabel') })}
      />
      {twoDayOpen && (
        <Card padding="m" className={styles.twoDayCard} aria-labelledby="two-day-heading">
          {/* UX-10: the re-run lives on the test's own card (the header button repeated the section). */}
          <div className={styles.twoDayHead}>
            <h2 id="two-day-heading" className={styles.sectionTitle}>{t('twoDay.title')}</h2>
            {onRunTwoDayTest !== undefined && (
              <Button size="s" variant="secondary" onClick={() => { onRunTwoDayTest(); setTwoDayOpen(true) }} disabled={twoDayPending}>
                {t('twoDay.rerun')}
              </Button>
            )}
          </div>
          <p className={styles.twoDayLead}>{t('twoDay.lead')}</p>
          {twoDayPending && (
            <p className={styles.twoDayLead} role="status">{t('loading')}</p>
          )}
          {!twoDayPending && twoDay !== null && timeline !== null && timeline.rows.length === 0 && (
            <EmptyState
              compact
              illustration={ILLUSTRATIONS['empty-inbox']}
              title={t('twoDay.emptyTitle')}
              body={t('twoDay.emptyBody')}
            />
          )}
          {!twoDayPending && timeline !== null && timeline.rows.length > 0 && (
            <>
              <TwoDayTimeline
                rows={timeline.rows}
                slotLabels={timeline.slotLabels}
                legend={timeline.legend}
                label={t('a11y.twoDayRegion')}
                {...(TWO_DAY_ART === undefined
                  ? {}
                  : {
                    legendArt: (
                      <img className={styles.twoDayArt} src={TWO_DAY_ART} alt="" aria-hidden="true" />
                    ),
                  })}
              />
            </>
          )}
        </Card>
      )}
      {gestorAudit !== undefined && gestorAudit.items.length > 0 && (
        <Card padding="m" as="section" aria-labelledby="gestor-audit-heading">
          <h2 id="gestor-audit-heading" className={styles.sectionTitle}>{t('health.gestorAudit')}</h2>
          <p className={styles.twoDayLead}>{t('health.gestorAuditLead')}</p>
          <ActivityGroup
            persona={gestorAudit.persona}
            items={gestorAudit.items}
            labels={activityGroupLabelsFromDict(dict)}
          />
        </Card>
      )}
      <section aria-labelledby="health-findings-heading" aria-label={t('a11y.healthFindings')}>
        <h2 id="health-findings-heading" className={styles.sectionTitle}>{t('health.findings')}</h2>
        <ul className={styles.findings}>
          {health.findings.map(finding => (
            <HealthItem
              key={finding.id}
              level={finding.level}
              title={youInSentence(finding.title)}
              {...(finding.detail === undefined ? {} : { detail: youInSentence(finding.detail) })}
              {...(finding.fixKind !== undefined && onApplyFix !== undefined
                ? {
                  actionLabel: healthFixActionLabel(dict, finding.fixKind),
                  onAction: () => { onApplyFix(finding.id, finding.fixKind!, finding.fixTargetId) },
                }
                : {})}
            />
          ))}
        </ul>
      </section>
    </Screen>
  )
}

import { useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Avatar, BrandIcon, Button, Card, Chip, EmptyState, Notice, Screen, ScreenHeader } from '../primitives/index.ts'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { ActivityGroup, type ActivityItem } from '../primitives/Pooled.tsx'
import { HealthItem, HealthScore, TWO_DAY_ART, TwoDayTimeline, type TwoDayRow } from '../primitives/Governance.tsx'
import { activityGroupLabelsFromDict } from './activity-group-labels.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { GovernanceFixKind, TeamHealthView as TeamHealthDto, TwoDayRowView, TwoDayTestView } from './governance-contract.ts'
import { composeHealthVerdict, isSinglePointFinding } from './health-verdict.ts'
import { healthFixActionLabel } from './governance-ui-helpers.ts'
import { twoDayToUi } from './map-governance-ui.ts'
import { groupTwoDayFixes } from './two-day-groups.ts'
import { splitTwoDayLabel } from './two-day-persona.ts'
import styles from './GovernanceScreens.module.css'

export type TeamHealthSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

/** The face of the persona a row of the 2-day test belongs to. Without a portrait the row draws the team icon: a persona is never a letter. */
export interface TwoDayFace {
  readonly name: string
  readonly src?: string | undefined
}

export interface TeamHealthViewProps {
  readonly dict: LocaleDict
  readonly health: TeamHealthDto | null
  readonly twoDay: TwoDayTestView | null
  readonly surfaceState: TeamHealthSurfaceState
  readonly onRetry?: () => void
  readonly onRunTwoDayTest?: () => void
  readonly onApplyFix?: (findingId: string, fixKind: GovernanceFixKind, targetId?: string) => void
  readonly onTwoDayFix?: (row: TwoDayRowView) => void
  /** One button for the rows that share the same diagnosis and fix ("Subir os 4 para “Decide o rotineiro”"). Absent = the group has no button. */
  readonly onTwoDayFixAll?: ((rows: readonly TwoDayRowView[], fixKind: GovernanceFixKind) => void) | undefined
  /** The persona of a row, for its face. Absent = the rows draw no face; a row it returns undefined for draws the team icon. */
  readonly faceOf?: ((row: TwoDayRowView) => TwoDayFace | undefined) | undefined
  readonly twoDayPending?: boolean
  /** The test could not be read from the host (nor drawn from the live roster): say so, with "Tentar de novo". */
  readonly twoDayFailed?: boolean
  /** GES-5 — gestor audit trail (mock until host ships). */
  readonly gestorAudit?: {
    readonly persona: { readonly name: string; readonly avatarSrc?: string | undefined }
    readonly items: readonly ActivityItem[]
  } | undefined
  readonly onBuildTeam?: (() => void) | undefined
  /**
   * The team has not run or finished anything yet (its first day): no score, no red sentence, no grid of crosses — a calm
   * "still getting to know the team" note instead. The score comes with real data.
   */
  readonly firstDay?: boolean | undefined
}

/**
 * UX-15: the human placeholder name "Você" mid-sentence reads as a proper noun ("depende de Você").
 * Lowercase it when it is not the first word of a sentence (host copy stays untouched).
 */
export function youInSentence(text: string): string {
  return text.replace(/(^|[^.!?:]\s)Você(?!\p{L})/gu, (match, lead: string) => (lead === '' ? match : `${lead}você`))
}

/** The label of the one button for a group: "Subir os 4 para “Decide o rotineiro”". A kind without its own words falls back to "Corrigir os N". */
function fixAllLabel(dict: LocaleDict, fixKind: GovernanceFixKind, count: number): string {
  const own = bindLocale(dict, `twoDay.fixAll.${fixKind}`, { count })
  return own === `twoDay.fixAll.${fixKind}` ? bindLocale(dict, 'twoDay.fixAll', { count }) : own
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
  onTwoDayFixAll,
  faceOf,
  twoDayPending = false,
  twoDayFailed = false,
  gestorAudit,
  onBuildTeam,
  firstDay = false,
}: TeamHealthViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  /** New first-day copy: the same words in pt/en if this build's generated locale does not carry the keys yet. */
  const tFirst = (key: string, fallback: string): string => {
    const text = bindLocale(dict, key)
    return text === key ? fallback : text
  }
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

  // Error first: a failed load has no data, and "health === null" must not turn it into a spinner that never ends (IV-8b).
  if (surfaceState === 'error') {
    return (
      <Screen width="full" className={styles.shell} data-persona-surface="team-health">
        {header}
        <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => { onRetry?.() }} />
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

  const timeline = twoDay !== null && onTwoDayFix !== undefined
    ? twoDayToUi(dict, twoDay, onTwoDayFix)
    : null
  // The sentence under the grade is written here from what the host sent (the host's own mixes "você" with "essa pessoa").
  const verdict = composeHealthVerdict(health.findings, twoDay === null ? null : twoDay.rows)
  const verdictText = verdict === undefined
    ? undefined
    : verdict.kind === 'stops'
      ? t('health.verdict.stops')
      : t(verdict.count === 1 ? 'health.verdict.waiting.one' : 'health.verdict.waiting', { count: verdict.count })
  // Equal diagnoses are ONE problem: the sentence once, one button, and the rows below do not repeat either.
  const { groups, groupedRowIds } = groupTwoDayFixes(twoDay?.rows ?? [])
  const faceElement = (row: TwoDayRowView, size: 28 | 32): ReactNode => {
    if (faceOf === undefined) return undefined
    const face = faceOf(row)
    return face?.src === undefined
      ? <Avatar name={face?.name ?? row.label} size={size} shape="portrait" decorative icon={<BrandIcon name="equipe" size={Math.round(size * 0.55)} />} />
      : <Avatar name={face.name} size={size} shape="portrait" decorative src={face.src} />
  }
  const timelineRows: readonly TwoDayRow[] | null = timeline === null || twoDay === null
    ? null
    : timeline.rows.map((row) => {
      const source = twoDay.rows.find(candidate => candidate.id === row.id)
      const parts = splitTwoDayLabel(row.label)
      const base: TwoDayRow = {
        ...row,
        label: 'text' in parts ? parts.text : parts.name,
        role: 'text' in parts ? undefined : parts.role,
        face: source === undefined ? undefined : faceElement(source, 32),
      }
      return groupedRowIds.has(row.id) ? { ...base, reason: undefined, fixLabel: undefined, onFix: undefined } : base
    })
  return (
    <Screen width="full" className={styles.shell} data-persona-surface="team-health">
      {header}
      {firstDay
        ? (
          <Notice tone="info" title={tFirst('health.firstDay.title', 'Ainda conhecendo a equipe')}>
            {tFirst('health.firstDay.body', 'A nota aparece depois que a equipe trabalhar alguns dias. Até lá, nada aqui é problema.')}
          </Notice>
        )
        : (
          <HealthScore
            level={health.level}
            title={youInSentence(health.title)}
            {...(verdictText !== undefined
              ? { body: verdictText }
              : health.body === undefined ? {} : { body: youInSentence(health.body) })}
            {...(health.score === undefined ? {} : { score: health.score, scoreLabel: t('health.scoreLabel') })}
          />
        )}
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
          {!twoDayPending && twoDayFailed && (
            <PersonaSurfaceError
              dict={dict}
              titleKey="error.title"
              retryKey="error.retry"
              onRetry={() => { onRunTwoDayTest?.() }}
            />
          )}
          {!twoDayPending && firstDay && (
            <p className={styles.twoDayLead} role="status">{tFirst('health.firstDay.noData', 'Ainda sem dados')}</p>
          )}
          {!twoDayPending && !firstDay && twoDay !== null && timeline !== null && timeline.rows.length === 0 && (
            <EmptyState
              compact
              illustration={ILLUSTRATIONS['empty-inbox']}
              title={t('twoDay.emptyTitle')}
              body={t('twoDay.emptyBody')}
            />
          )}
          {!twoDayPending && !firstDay && timeline !== null && timeline.rows.length > 0 && (
            <>
              {groups.map(group => (
                <div key={`${group.fixKind}:${group.reason}`} className={styles.twoDayGroup} data-two-day-group="">
                  <span className={styles.groupFaces} aria-hidden="true">
                    {group.rows.map(row => <span key={row.id} className={styles.groupFace}>{faceElement(row, 28)}</span>)}
                  </span>
                  <div className={styles.groupText}>
                    <Chip size="s" tone="accent">{t(group.rows.length === 1 ? 'twoDay.group.count.one' : 'twoDay.group.count', { count: group.rows.length })}</Chip>
                    <p className={styles.groupReason}>{group.reason}</p>
                  </div>
                  {/* Rows the client DERIVED from the live team (`live-…` ids) are not the host's: it could not apply a batch fix to them. */}
                  {onTwoDayFixAll !== undefined && group.rows.every(row => !row.id.startsWith('live-')) && (
                    <Button size="s" variant="secondary" onClick={() => { onTwoDayFixAll(group.rows, group.fixKind) }}>
                      {fixAllLabel(dict, group.fixKind, group.rows.length)}
                    </Button>
                  )}
                </div>
              ))}
              <TwoDayTimeline
                rows={timelineRows ?? timeline.rows}
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
              // the host's sentence for this one mixes "você" with "essa pessoa": the screen says it in one voice (the verdict above has the consequence)
              title={isSinglePointFinding(finding) ? t('health.spofTitle') : youInSentence(finding.title)}
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

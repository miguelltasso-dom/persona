/** Daily grouped proactive proposals (no loose pings — PROACTIVITY.md §6). */

import { useState, type ReactNode } from 'react'
import { ApprovedStamp, Avatar, Button, Card, Chip } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './ApprovalsProactivity.module.css'
import {
  personaPortraitSrc,
  proactiveCostLine,
  proactiveCountLabel,
  proactiveImpactDetail,
} from './approvals-ui-helpers.ts'
import type { PersonaDailyProactiveSummary, ProactiveProposal } from './proactivity-mock-data.ts'

export interface ProactiveDailySummariesProps {
  readonly dict: LocaleDict
  readonly summaries: readonly PersonaDailyProactiveSummary[]
  readonly summaryDateLabel: string
  readonly onDecide?: (proposal: ProactiveProposal, accept: boolean) => void
  readonly stampExitId?: string | null
  readonly stampLabel?: string
}

export function ProactiveDailySummaries({
  dict,
  summaries,
  summaryDateLabel,
  onDecide,
  stampExitId = null,
  stampLabel = '',
}: ProactiveDailySummariesProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [editingId, setEditingId] = useState<string | null>(null)

  if (summaries.length === 0) return null

  return (
    <section aria-labelledby="persona-proactive-daily-title" data-persona-approvals="proactive-daily">
      <h2 id="persona-proactive-daily-title" className={styles.sectionTitle}>
        {t('proactive.dailyTitle', { date: summaryDateLabel })}
      </h2>
      <p className={styles.sectionSubtitle}>{t('proactive.dailyHint')}</p>
      <ul className={styles.summaryList}>
        {summaries.map(summary => (
          <li key={summary.personaId}>
            <Card padding="m" className={styles.personaGroup}>
              <div className={styles.groupHeader}>
                <Avatar
                  name={summary.personaName}
                  size={24}
                  shape="portrait"
                  {...(personaPortraitSrc(summary.personaCharacterId, summary.personaName) === undefined
                    ? {}
                    : { src: personaPortraitSrc(summary.personaCharacterId, summary.personaName) })}
                  decorative
                />
                <h3 className={styles.personaName}>{summary.personaName}</h3>
                <Chip tone="neutral" size="s">
                  {proactiveCountLabel(dict, summary.proposals.length)}
                </Chip>
              </div>
              <ul className={styles.proposalList}>
                {summary.proposals.map(proposal => (
                  <li
                    key={proposal.id}
                    className={`${styles.proposal}${stampExitId === proposal.id ? ` ${styles.proposalExiting}` : ''}`}
                  >
                    {stampExitId === proposal.id && stampLabel.length > 0 && (
                      <div className={styles.proposalStamp}>
                        <ApprovedStamp label={stampLabel} animate />
                      </div>
                    )}
                    <Chip tone="accent" size="s">{t(`proactive.kind.${proposal.kind}`)}</Chip>
                    <h4 className={styles.proposalTitle}>{proposal.title}</h4>
                    <p className={styles.meta}>{proposal.oneQuestion}</p>
                    <div className={styles.previewBox}>
                      <p>{t('proactive.affectsLine', { name: summary.personaName })}</p>
                      {(() => {
                        const detail = proactiveImpactDetail(proposal)
                        const redundant = detail.trim() === proposal.title.trim()
                          || detail.trim() === proposal.oneQuestion.trim()
                        if (redundant) return null
                        return (
                          <>
                            <p className={styles.previewLabel}>{t('proactive.detailLabel')}</p>
                            <p>{detail}</p>
                          </>
                        )
                      })()}
                      <p className={styles.previewLabel}>{t('proactive.costLabel')}</p>
                      {(() => {
                        const cost = proactiveCostLine(dict, proposal.cost)
                        return (
                          <p className={cost.muted ? styles.costUnknown : undefined}>{cost.text}</p>
                        )
                      })()}
                    </div>
                    {editingId === proposal.id && (
                      <p className={styles.editHint} role="status">{t('proactive.editHint')}</p>
                    )}
                    <div className={styles.actions}>
                      <Button
                        variant="primary"
                        size="s"
                        onClick={() => { onDecide?.(proposal, true) }}
                        disabled={onDecide === undefined || proposal.approvalKind === undefined}
                      >
                        {t('proactive.action.accept')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="s"
                        onClick={() => { onDecide?.(proposal, false) }}
                        disabled={onDecide === undefined || proposal.approvalKind === undefined}
                      >
                        {t('proactive.action.reject')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="s"
                        onClick={() => { setEditingId(editingId === proposal.id ? null : proposal.id) }}
                      >
                        {t('proactive.action.edit')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

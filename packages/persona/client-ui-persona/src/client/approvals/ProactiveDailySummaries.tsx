/** Daily grouped proactive proposals (no loose pings — PROACTIVITY.md §6). */

import { useState, type ReactNode } from 'react'
import { Button, Card, Chip } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './ApprovalsProactivity.module.css'
import type { PersonaDailyProactiveSummary, ProactiveProposal } from './proactivity-mock-data.ts'

export interface ProactiveDailySummariesProps {
  readonly dict: LocaleDict
  readonly summaries: readonly PersonaDailyProactiveSummary[]
  readonly summaryDateLabel: string
  readonly onDecide?: (proposal: ProactiveProposal, accept: boolean) => void
}

function formatCost(dict: LocaleDict, proposal: ProactiveProposal): string {
  return bindLocale(dict, 'proactive.costLine', {
    tokens: proposal.cost.tokens.toLocaleString('pt-BR'),
    runs: proposal.cost.runs,
  })
}

export function ProactiveDailySummaries({
  dict,
  summaries,
  summaryDateLabel,
  onDecide,
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
                <h3 className={styles.personaName}>{summary.personaName}</h3>
                <Chip tone="neutral" size="s">
                  {t('proactive.countChip', { count: summary.proposals.length })}
                </Chip>
              </div>
              <ul className={styles.proposalList}>
                {summary.proposals.map(proposal => (
                  <li key={proposal.id} className={styles.proposal}>
                    <Chip tone="accent" size="s">{t(`proactive.kind.${proposal.kind}`)}</Chip>
                    <h4 className={styles.proposalTitle}>{proposal.title}</h4>
                    <p className={styles.meta}>{proposal.oneQuestion}</p>
                    <div className={styles.previewBox}>
                      <p className={styles.previewLabel}>{t('proactive.impactLabel')}</p>
                      <p>{proposal.impactPreview}</p>
                      <p className={styles.previewLabel}>{t('proactive.costLabel')}</p>
                      <p>{formatCost(dict, proposal)}</p>
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

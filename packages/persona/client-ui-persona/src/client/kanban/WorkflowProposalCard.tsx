/** «Usar este fluxo?» card from Coordination (BOARDS-SPEC / PB-3). */

import type { WorkflowProposalView } from '@deepseek-ai/dsh-persona-host/types'
import type { ReactNode } from 'react'
import { flowModelLabel } from '../boards/flow-models.ts'
import { templateToFlowModel } from '../data/adapters/board.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Chip, UiIcon } from '../primitives/index.ts'
import styles from './Kanban.module.css'

export interface WorkflowProposalCardProps {
  readonly dict: LocaleDict
  readonly proposal: WorkflowProposalView
  readonly acceptPending?: boolean
  readonly onAccept: () => void
  readonly onDismiss: () => void
}

export function WorkflowProposalCard({
  dict,
  proposal,
  acceptPending = false,
  onAccept,
  onDismiss,
}: WorkflowProposalCardProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const flowModel = templateToFlowModel(proposal.workflow.template)
  const columnPreview = proposal.workflow.columns.slice(0, 6)

  return (
    <Card
      as="section"
      padding="m"
      className={styles.proposalCard}
      data-persona-surface="workflow-proposal"
      aria-labelledby="persona-workflow-proposal-title"
    >
      <div className={styles.proposalHeader}>
        <UiIcon name="sparkle" size={20} />
        <h2 id="persona-workflow-proposal-title" className={styles.proposalTitle}>
          {proposal.card.question}
        </h2>
      </div>
      <p className={styles.stateHint}>{proposal.reason}</p>
      {proposal.degraded === true && (
        <p className={styles.editorValidation} role="status">
          <UiIcon name="alert" size={16} />
          {t('proposal.degraded')}
        </p>
      )}
      <Chip size="s" tone="brand">{flowModelLabel(dict, flowModel)}</Chip>
      <ul className={styles.proposalColumns} aria-label={t('proposal.columnsPreview')}>
        {columnPreview.map(column => (
          <li key={column.id}>
            <Chip size="s" tone="neutral">{column.name}</Chip>
          </li>
        ))}
        {proposal.workflow.columns.length > columnPreview.length && (
          <li><Chip size="s" tone="neutral">{t('proposal.moreColumns', { count: proposal.workflow.columns.length - columnPreview.length })}</Chip></li>
        )}
      </ul>
      <p className={styles.proposalImpact}>{proposal.card.impact}</p>
      <div className={styles.proposalActions}>
        <Button variant="ghost" onClick={onDismiss} disabled={acceptPending}>{t('proposal.dismiss')}</Button>
        <Button variant="primary" onClick={onAccept} disabled={acceptPending}>
          {proposal.card.primary}
        </Button>
      </div>
    </Card>
  )
}

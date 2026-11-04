/**
 * "Ver detalhes" of a proposed hire (A-4): read-only. The persona does not exist yet, so this is not a profile: it shows
 * only what the host sent (name, role, what they do, who proposed). No motor or tools until the host sends them.
 */

import type { ReactNode } from 'react'
import { Avatar, Button, Chip, Modal } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Approvals.module.css'
import { approvalHireVisual, hireMonthlyTasksLine } from './approvals-ui-helpers.ts'
import type { ApprovalItem } from './mock-data.ts'

export interface HireDetailsModalProps {
  readonly dict: LocaleDict
  readonly item: ApprovalItem
  readonly open: boolean
  readonly onClose: () => void
}

export function HireDetailsModal({ dict, item, open, onClose }: HireDetailsModalProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const visual = approvalHireVisual(item)
  const role = item.hireRoleTitle?.trim() ?? ''
  const proposer = item.proposerName?.trim() ?? ''
  const cost = hireMonthlyTasksLine(dict, item)
  return (
    <Modal
      open={open}
      size="m"
      eyebrow={t('hire.details.eyebrow')}
      title={item.title}
      closeLabel={t('hire.details.close')}
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>{t('hire.details.close')}</Button>}
    >
      <div className={styles.hireDetails}>
        <div className={styles.hireDetailsHead}>
          <Avatar
            name={item.title}
            size={96}
            shape="portrait"
            decorative
            {...(visual?.kind === 'portrait' ? { src: visual.src } : {})}
          />
          {role.length > 0 && <Chip tone="brand">{role}</Chip>}
        </div>
        {item.hireDescription !== undefined && <p className={styles.hireIntro}>{item.hireDescription}</p>}
        {proposer.length > 0 && <p className={styles.context}>{t('hire.details.proposedBy', { proposer })}</p>}
        {cost !== undefined && <p className={styles.hireCost}>{cost}</p>}
      </div>
    </Modal>
  )
}

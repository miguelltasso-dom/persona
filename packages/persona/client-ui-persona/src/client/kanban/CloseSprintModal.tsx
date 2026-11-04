/** Encerrar sprint (BOARDS-SPEC §4) — `ILLUSTRATIONS['sprint-concluida']`. */

import { useRef, useState, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Modal } from '../primitives/index.ts'
import styles from './Kanban.module.css'

export interface CloseSprintModalProps {
  readonly dict: LocaleDict
  readonly sprintName: string
  readonly delivered: number
  readonly late: number
  readonly rolled: number
  readonly onClose: () => void
  readonly onConfirm: (leftover: 'next' | 'backlog') => void
}

export function CloseSprintModal({
  dict,
  sprintName,
  delivered,
  late,
  rolled,
  onClose,
  onConfirm,
}: CloseSprintModalProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [leftover, setLeftover] = useState<'next' | 'backlog'>('next')
  const leftoverRef = useRef(leftover)
  leftoverRef.current = leftover
  const art = ILLUSTRATIONS['sprint-concluida']

  return (
    <Modal
      open
      size="l"
      title={t('closeSprint.title', { name: sprintName })}
      closeLabel={t('closeSprint.cancel')}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('closeSprint.cancel')}</Button>
          <Button variant="primary" onClick={() => { onConfirm(leftoverRef.current) }}>{t('closeSprint.confirm')}</Button>
        </>
      )}
    >
      {art !== undefined && (
        <img className={styles.closeSprintArt} src={art} alt="" aria-hidden="true" />
      )}
      <div className={styles.closeSprintStats}>
        <div className={styles.closeSprintStat}>
          <span className={styles.closeSprintNumber}>{delivered}</span>
          <span>{t('closeSprint.delivered')}</span>
        </div>
        <div className={styles.closeSprintStat}>
          <span className={styles.closeSprintNumber}>{late}</span>
          <span>{t('closeSprint.late')}</span>
        </div>
        <div className={styles.closeSprintStat}>
          <span className={styles.closeSprintNumber}>{rolled}</span>
          <span>{t('closeSprint.rolled')}</span>
        </div>
      </div>
      {rolled > 0 && (
        <div className={styles.closeSprintLeftover}>
          <button
            type="button"
            className={styles.leftoverChip}
            aria-pressed={leftover === 'next'}
            onClick={() => { setLeftover('next') }}
          >
            {t('closeSprint.leftoverNext')}
          </button>
          <button
            type="button"
            className={styles.leftoverChip}
            aria-pressed={leftover === 'backlog'}
            onClick={() => { setLeftover('backlog') }}
          >
            {t('closeSprint.leftoverBacklog')}
          </button>
        </div>
      )}
    </Modal>
  )
}

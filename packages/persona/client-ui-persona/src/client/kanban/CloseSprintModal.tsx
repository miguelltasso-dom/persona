/** Encerrar sprint (BOARDS-SPEC §4) — `ILLUSTRATIONS['sprint-concluida']`. */

import { useRef, useState, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Button, Modal } from '../primitives/index.ts'
import styles from './Kanban.module.css'

export interface CloseSprintModalProps {
  readonly dict: LocaleDict
  readonly sprintName: string
  readonly delivered: number
  /** Entregues depois do prazo. Sem esse dado o número NÃO aparece (nada de "0" inventado). */
  readonly late?: number | undefined
  readonly rolled: number
  /** "Quem fez o quê": quantas tarefas cada persona entregou na sprint. */
  readonly contributors?: readonly { readonly id: string; readonly name: string; readonly count: number }[] | undefined
  /** As tarefas que não ficaram prontas (lista recolhível). */
  readonly leftoverTasks?: readonly { readonly id: string; readonly title: string }[] | undefined
  readonly onClose: () => void
  readonly onConfirm: (leftover: 'next' | 'backlog') => void
}

export function CloseSprintModal({
  dict,
  sprintName,
  delivered,
  late,
  rolled,
  contributors = [],
  leftoverTasks = [],
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
        {late !== undefined && (
          <div className={styles.closeSprintStat}>
            <span className={styles.closeSprintNumber}>{late}</span>
            <span>{t('closeSprint.late')}</span>
          </div>
        )}
        <div className={styles.closeSprintStat}>
          <span className={styles.closeSprintNumber}>{rolled}</span>
          <span>{t('closeSprint.rolled')}</span>
        </div>
      </div>
      {contributors.length > 0 && (
        <section className={styles.closeSprintWho} aria-label={t('closeSprint.who')}>
          <p className={styles.closeSprintWhoTitle}>{t('closeSprint.who')}</p>
          <ul className={styles.closeSprintWhoList}>
            {contributors.map(person => (
              <li key={person.id} className={styles.closeSprintWhoItem}>
                <Avatar name={person.name} src={(AVATAR_96 as Readonly<Record<string, string>>)[person.id]} size={32} shape="portrait" decorative />
                <span>{person.name}</span>
                <span className={styles.closeSprintWhoCount}>{person.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
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
      {leftoverTasks.length > 0 && (
        <details className={styles.closeSprintTasks}>
          <summary>{t(rolled === 1 ? 'closeSprint.tasks.one' : 'closeSprint.tasks', { count: leftoverTasks.length })}</summary>
          <ul>
            {leftoverTasks.map(task => <li key={task.id}>{task.title}</li>)}
          </ul>
        </details>
      )}
    </Modal>
  )
}

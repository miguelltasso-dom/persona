import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, Card, Chip, type AvatarPresence, type ChipTone } from '../primitives/index.ts'
import { WORK_STATUS_KEY, type PersonaNowSnapshot, type PersonaWorkUiState } from '../team/persona-work-state.ts'
import styles from './OverviewNowStrip.module.css'

export interface OverviewNowStripProps extends PropsLocale<'persona.shell'> {
  readonly rows: readonly PersonaNowSnapshot[]
}

const STATE_TONE: Readonly<Record<PersonaWorkUiState, ChipTone>> = {
  working: 'success',
  waiting: 'accent',
  stuck: 'danger',
  resting: 'neutral',
}

const STATE_PRESENCE: Readonly<Record<PersonaWorkUiState, AvatarPresence>> = {
  working: 'online',
  waiting: 'busy',
  stuck: 'busy',
  resting: 'away',
}

/** "Agora" — one row per persona: portrait, honest state chip, current task, queue. */
export function OverviewNowStrip({ t, rows }: OverviewNowStripProps): ReactNode {
  return (
    <Card
      as="section"
      titleAs="h2"
      aria-labelledby="persona-now-title"
      title={<span id="persona-now-title">{t('overview.nowTitle')}</span>}
      eyebrow={t('overview.nowSubtitle')}
      padding="m"
    >
      <ul className={styles.list}>
        {rows.map(row => (
          <li key={row.member.id} className={styles.row} data-state={row.member.state}>
            <Avatar
              name={row.member.name}
              src={AVATAR_96[row.member.id]}
              size={48}
              presence={STATE_PRESENCE[row.member.state]}
              decorative
            />
            <div className={styles.text}>
              <div className={styles.identity}>
                <span className={styles.name}>{row.member.name}</span>
                <span className={styles.role}>{row.member.role}</span>
              </div>
              <p className={row.currentTask !== undefined ? styles.task : `${styles.task} ${styles.taskIdle}`}>
                {row.currentTask ?? t('overview.nowNoTask')}
              </p>
              <div className={styles.chips}>
                <Chip size="s" tone={STATE_TONE[row.member.state]}>{t(WORK_STATUS_KEY[row.member.state])}</Chip>
                <span className={styles.queue}>
                  {row.queueCount > 0 ? t('overview.nowQueue', { count: String(row.queueCount) }) : t('overview.queueEmpty')}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

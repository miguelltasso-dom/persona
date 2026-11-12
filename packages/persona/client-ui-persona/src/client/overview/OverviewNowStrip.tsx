import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Avatar, Card, Chip, EmptyState, Skeleton } from '../primitives/index.ts'
import { PERSONA_STATE_CHIP_TONE, PERSONA_STATE_LABEL } from '../team/persona-state.ts'
import type { PersonaNowSnapshot } from '../team/persona-work-state.ts'
import { groupNowRows, nowRowState } from './now-groups.ts'
import styles from './OverviewNowStrip.module.css'

export interface OverviewNowStripProps extends PropsLocale<'persona.shell'> {
  readonly rows: readonly PersonaNowSnapshot[]
  /** Dados do host ainda a caminho: skeleton, não o vazio "Monte sua equipe". */
  readonly loading?: boolean | undefined
}

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

/** DESIGN-01-MUSE §5.2 #09: one face line, not one card per idle persona. */
const READY_FACE = 28

/**
 * "Agora": a card for whoever is working, in a draft, waiting on the person or stuck, and ONE line of faces for everyone who is
 * simply available ("5 prontos para começar"). The state words and tones are the single vocabulary of `team/persona-state`.
 */
export function OverviewNowStrip({ t, rows, loading = false }: OverviewNowStripProps): ReactNode {
  const showLoading = loading && rows.length === 0
  const { cards, available, resting } = groupNowRows(rows)
  return (
    <Card
      as="section"
      titleAs="h2"
      aria-labelledby="persona-now-title"
      title={<span id="persona-now-title">{t('overview.nowTitle')}</span>}
      eyebrow={t('overview.nowSubtitle')}
      padding="m"
    >
      {showLoading && (
        <ul className={styles.list} aria-busy="true" data-loading="">
          {[0, 1, 2].map(index => (
            <li key={index} className={styles.row} aria-hidden="true">
              <Skeleton width={48} height={48} shape="circle" />
              <Skeleton width="60%" height={16} />
            </li>
          ))}
        </ul>
      )}
      {!showLoading && rows.length === 0 && (
        <EmptyState compact illustration={ILLUSTRATIONS['empty-routines']} title={t('team.emptyTitle')} body={t('team.emptyBody')} />
      )}
      {cards.length > 0 && (
        <ul className={styles.list}>
          {cards.map((row) => {
            const state = nowRowState(row)
            return (
              <li key={row.member.id} className={styles.row} data-now-card="" data-state={state}>
                <Avatar name={row.member.name} src={PORTRAITS[row.member.id]} size={48} state={state} decorative />
                <div className={styles.text}>
                  <div className={styles.identity}>
                    <span className={styles.name}>{row.member.name}</span>
                    <span className={styles.role}>{row.member.role}</span>
                  </div>
                  <p className={row.currentTask !== undefined ? styles.task : `${styles.task} ${styles.taskIdle}`}>
                    {row.currentTask ?? t('overview.nowNoTask')}
                  </p>
                  <div className={styles.chips}>
                    <Chip size="s" tone={PERSONA_STATE_CHIP_TONE[state]}>{t(PERSONA_STATE_LABEL[state])}</Chip>
                    <span className={styles.queue}>
                      {row.queueCount > 0 ? t('overview.nowQueue', { count: String(row.queueCount) }) : t('overview.queueEmpty')}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {available.length > 0 && (
        <FaceLine
          rows={available}
          text={t(available.length === 1 ? 'overview.nowReady.one' : 'overview.nowReady', { count: String(available.length) })}
          marker="data-now-ready"
          divided={cards.length > 0}
        />
      )}
      {resting.length > 0 && (
        <FaceLine
          rows={resting}
          text={t(resting.length === 1 ? 'overview.nowResting.one' : 'overview.nowResting', { count: String(resting.length) })}
          marker="data-now-resting"
          divided={cards.length > 0 || available.length > 0}
        />
      )}
    </Card>
  )
}

interface FaceLineProps {
  readonly rows: readonly PersonaNowSnapshot[]
  readonly text: string
  /** Which data attribute names the line (`data-now-ready` / `data-now-resting`). */
  readonly marker: 'data-now-ready' | 'data-now-resting'
  /** A rule above the line when something already sits over it. */
  readonly divided: boolean
}

/** One line: the faces overlapped (28 px) and the words that count them. The names stay readable to a screen reader. */
function FaceLine({ rows, text, marker, divided }: FaceLineProps): ReactNode {
  return (
    <div className={divided ? `${styles.ready} ${styles.readyAfterCards}` : styles.ready} {...{ [marker]: '' }}>
      <span className={styles.faces} aria-hidden="true">
        {rows.map((row, index) => (
          <span
            key={row.member.id}
            className={styles.face}
            data-ready-face=""
            style={{ width: READY_FACE, height: READY_FACE, zIndex: rows.length - index }}
          >
            <Avatar name={row.member.name} src={PORTRAITS[row.member.id]} size={READY_FACE} decorative />
          </span>
        ))}
      </span>
      <span className={styles.readyText}>{text}</span>
      <span className={styles.srOnly}>{rows.map(row => row.member.name).join(', ')}</span>
    </div>
  )
}

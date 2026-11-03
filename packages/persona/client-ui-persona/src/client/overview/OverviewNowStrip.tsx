import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { WORK_STATUS_KEY, type PersonaNowSnapshot } from '../team/persona-work-state.ts'
import styles from './OverviewNowStrip.module.css'

export interface OverviewNowStripProps extends PropsLocale<'persona.shell'> {
  readonly rows: readonly PersonaNowSnapshot[]
}

/** Visão geral — faixa Agora (estado, tarefa atual, fila). */
export function OverviewNowStrip({ t, rows }: OverviewNowStripProps): ReactNode {
  return (
    <section className={styles.strip} aria-labelledby="persona-now-title">
      <h2 id="persona-now-title" className={styles.title}>
        {t('overview.nowTitle')}
      </h2>
      <ul className={styles.list}>
        {rows.map(row => (
          <li key={row.member.id} className={styles.row}>
            <div className={styles.identity}>
              <span className={styles.name}>{row.member.name}</span>
              <span className={styles.role}>{row.member.role}</span>
            </div>
            <span className={styles.status}>
              <span className={styles.statusIcon} data-state={row.member.state} aria-hidden="true" />
              {t(WORK_STATUS_KEY[row.member.state])}
            </span>
            <span className={styles.task}>
              {row.currentTask ?? t('overview.nowNoTask')}
            </span>
            <span className={styles.queue}>
              {t('overview.nowQueue', { count: String(row.queueCount) })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

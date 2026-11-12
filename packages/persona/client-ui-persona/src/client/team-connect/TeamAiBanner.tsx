import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '../primitives/index.ts'
import styles from './TeamConnect.module.css'

export interface TeamAiBannerProps extends PropsLocale<'persona.shell'> {
  /** Quantas pessoas da equipe estão CONFIRMADAS sem IA (nunca uma dúvida: o host só conta o que o motor respondeu "sem login"/"não instalado"). */
  readonly count: number
  readonly onOpen: () => void
}

/**
 * COLHEITA-MUSE §13.1: a faixa da Visão geral quando 1 ou mais personas estão `Sem motor`. Borda de cartão normal, SEM cor de alerta; botão primário de 40 px.
 * Com 1 pessoa o botão não diz "todas" (não haveria "todas").
 */
export function TeamAiBanner({ t, count, onOpen }: TeamAiBannerProps): ReactNode {
  if (count < 1) return null
  return (
    <section className={styles.banner} aria-label={t('teamAi.banner.label')} data-persona-team-ai-banner="">
      <p className={styles.bannerText}>{count === 1 ? t('teamAi.banner.one') : t('teamAi.banner.other', { count })}</p>
      <Button variant="primary" size="m" onClick={onOpen}>
        {count === 1 ? t('teamAi.banner.action.one') : t('teamAi.banner.action.other')}
      </Button>
    </section>
  )
}

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, UiIcon } from '../primitives/index.ts'
import styles from './AttentionCalmBanner.module.css'

export interface AttentionCalmBannerProps extends PropsLocale<'persona.shell'> {
  /** Who holds the Coordenação function. Absent = the banner keeps only the seal: no invented face. */
  readonly coordination?: { readonly id: string; readonly name: string } | undefined
}

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

/**
 * "Precisa de você" with nothing in it (DESIGN-01-MUSE §5.2 #09): a 76 px calm line instead of the 330 px card. The face is the one of
 * the persona that coordinates the team, never a fixed one; the words are the single form "Nada esperando por você" (rule 0.4).
 */
export function AttentionCalmBanner({ t, coordination }: AttentionCalmBannerProps): ReactNode {
  return (
    <section
      className={styles.banner}
      aria-label={t('overview.attentionTitle')}
      data-persona-calm-banner=""
      {...(coordination === undefined ? {} : { 'data-face': coordination.id })}
    >
      {coordination !== undefined && (
        <Avatar name={coordination.name} src={PORTRAITS[coordination.id]} size={44} decorative />
      )}
      <p className={styles.text}>{t('overview.attentionEmptyTitle')}</p>
      <span className={styles.seal} aria-hidden="true">
        <UiIcon name="check" size={18} strokeWidth={2.6} />
      </span>
    </section>
  )
}

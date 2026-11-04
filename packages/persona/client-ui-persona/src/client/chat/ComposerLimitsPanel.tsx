import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconButton, UiIcon } from '../primitives/index.ts'
import type { EngineLimitsUi } from '../remote/engine-limits.ts'
import { EngineLimitsBars } from './EngineLimitsBars.tsx'
import styles from './ChannelComposer.module.css'

/**
 * Temporary limits readout above the composer after `/limites` (T3-UX-HARVEST §8).
 * IV-4 = P0-28: só as cotas oficiais que o host publicou; sem dado, "—" e "Cota oficial indisponível". Nunca um número de exemplo.
 */
export function ComposerLimitsPanel({
  t,
  onClose,
  limits,
}: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly onClose: () => void
  readonly limits: EngineLimitsUi
}): ReactNode {
  return (
    <section className={styles.limitsPanel} aria-label={t('composer.limitsPanelTitle')}>
      <header className={styles.limitsHeader}>
        <UiIcon name="sparkle" size={18} strokeWidth={2.2} />
        <h3 className={styles.limitsTitle}>{t('composer.limitsPanelTitle')}</h3>
        <IconButton size="s" label={t('composer.limitsClose')} icon={<UiIcon name="close" size={16} />} onClick={onClose} />
      </header>
      <EngineLimitsBars t={t} limits={limits} />
      <p className={styles.limitsHint}>{t('composer.limitsDismissHint')}</p>
    </section>
  )
}

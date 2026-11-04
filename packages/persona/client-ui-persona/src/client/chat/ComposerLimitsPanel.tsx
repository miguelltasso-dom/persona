import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconButton, PooledQuotaBar, UiIcon } from '../primitives/index.ts'
import styles from './ChannelComposer.module.css'

/** Temporary limits readout above the composer after `/limites` (T3-UX-HARVEST §8). */
export function ComposerLimitsPanel({
  t,
  onClose,
}: {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly onClose: () => void
}): ReactNode {
  return (
    <section className={styles.limitsPanel} aria-label={t('composer.limitsPanelTitle')}>
      <header className={styles.limitsHeader}>
        <UiIcon name="sparkle" size={18} strokeWidth={2.2} />
        <h3 className={styles.limitsTitle}>{t('composer.limitsPanelTitle')}</h3>
        <IconButton size="s" label={t('composer.limitsClose')} icon={<UiIcon name="close" size={16} />} onClick={onClose} />
      </header>
      <PooledQuotaBar
        compact
        window={t('composer.limitsWindow')}
        color="var(--persona-lilac-500)"
        labels={{
          left: pct => t('composer.limitsRemaining', { pct: String(pct) }),
          nextRefill: (pct, at, account) => t('composer.limitsRecharge', { pct: String(pct), time: at, account }),
          noWindow: t('composer.limitsNoWindow'),
          segment: account => account.label,
        }}
        accounts={[
          { id: 'work', label: t('composer.limitsAccountWork'), leftPct: 38, refillPct: 18, refillAt: '18:30' },
          { id: 'personal', label: t('composer.limitsAccountPersonal'), leftPct: 66 },
        ]}
      />
      <p className={styles.limitsHint}>{t('composer.limitsDismissHint')}</p>
    </section>
  )
}

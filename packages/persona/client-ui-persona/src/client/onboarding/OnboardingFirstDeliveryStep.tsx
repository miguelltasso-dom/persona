import type { ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { Button, Chip, MilestoneCard, Notice, UiIcon } from '../primitives/index.ts'
import type { FirstDelivery } from '../overview/OverviewView.tsx'
import { TeamIntroQueue } from './TeamIntroQueue.tsx'
import { MOCK_INTRO_LINES } from './mock-data.ts'
import styles from './OnboardingWizard.module.css'

export type FirstDeliveryPhase = 'intro' | 'working' | 'celebrate'

export interface OnboardingFirstDeliveryStepProps {
  readonly dict: LocaleDict
  readonly shellT: (key: string, params?: Readonly<Record<string, string | number>>) => string
  readonly greetingName: string
  readonly vaultReady: boolean
  readonly phase: FirstDeliveryPhase
  readonly milestone?: FirstDelivery | undefined
  readonly workingPersonaName?: string | undefined
  readonly onRequest: () => void
  readonly onEnterApp: () => void
  readonly onCelebrateContinue: () => void
}

/** V1-P0-4 / UX-PHASE §1: guided first real delivery before leaving onboarding. */
export function OnboardingFirstDeliveryStep({
  dict,
  shellT,
  greetingName,
  vaultReady,
  phase,
  milestone,
  workingPersonaName,
  onRequest,
  onEnterApp,
  onCelebrateContinue,
}: OnboardingFirstDeliveryStepProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)

  if (phase === 'celebrate' && milestone !== undefined) {
    return (
      <section className={styles.step} aria-live="polite">
        <MilestoneCard
          celebrate
          illustration={ILLUSTRATIONS['primeira-entrega']}
          eyebrow={shellT('overview.firstDelivery.eyebrow')}
          title={shellT('overview.firstDelivery.title')}
          body={shellT('overview.firstDelivery.body', { name: milestone.personaName, title: milestone.title })}
          contributors={[{ name: milestone.personaName, characterId: milestone.characterId, count: 1 }]}
          contributorsLabel={shellT('overview.firstDelivery.who')}
          actions={(
            <Button variant="primary" size="l" onClick={onCelebrateContinue}>
              {t('step5.celebrateContinue')}
            </Button>
          )}
        />
      </section>
    )
  }

  if (phase === 'working') {
    const workingLabel = workingPersonaName ?? t('step5.workingFallbackName')
    return (
      <section className={styles.step} aria-live="polite">
        <h1 className={styles.title}>{t('step5.workingTitle')}</h1>
        <p className={styles.hint}>{t('step5.workingBody', { name: workingLabel })}</p>
        <Notice tone="info">{t('step5.workingNotice')}</Notice>
        <div className={styles.workingRow}>
          <Chip tone="success" size="s">{t('step5.workingChip')}</Chip>
          <span className={styles.workingName}>{workingLabel}</span>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.step}>
      <h1 className={styles.title}>{t('step5.title')}</h1>
      <p className={styles.hint}>{t('step5.hint')}</p>
      <TeamIntroQueue lines={MOCK_INTRO_LINES} greetingName={greetingName} />
      <div className={styles.taskPreview}>
        <p className={styles.taskPreviewLabel}>{t('step5.taskPreviewLabel')}</p>
        <p className={styles.taskPreviewBody}>{vaultReady ? t('step5.taskPreview') : t('step5.taskPreviewEmpty')}</p>
      </div>
      <div className={styles.firstDeliveryActions}>
        <Button
          variant="primary"
          size="l"
          icon={<UiIcon name="sparkle" size={18} strokeWidth={2} />}
          onClick={onRequest}
        >
          {t('step5.requestNow')}
        </Button>
        <Button variant="ghost" onClick={onEnterApp}>{t('step5.enterApp')}</Button>
      </div>
    </section>
  )
}

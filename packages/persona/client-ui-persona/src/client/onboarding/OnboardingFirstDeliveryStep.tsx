import type { ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import {
  ActivityGroup,
  Button,
  Chip,
  MilestoneCard,
  Notice,
  RunErrorCard,
  UiIcon,
  describeRunError,
  runErrorText,
  type ActivityItem,
  type RunErrorPayload,
} from '../primitives/index.ts'
import type { FirstDelivery } from '../overview/OverviewView.tsx'
import { TeamIntroQueue } from './TeamIntroQueue.tsx'
import { MOCK_INTRO_LINES } from './mock-data.ts'
import styles from './OnboardingWizard.module.css'

export type FirstDeliveryPhase = 'intro' | 'needsEngine' | 'working' | 'slow' | 'failed' | 'celebrate'

export interface OnboardingFirstDeliveryStepProps {
  readonly dict: LocaleDict
  readonly shellT: (key: string, params?: Readonly<Record<string, string | number>>) => string
  readonly chatT?: ((key: string, params?: Readonly<Record<string, string | number>>) => string) | undefined
  readonly greetingName: string
  readonly vaultReady: boolean
  readonly phase: FirstDeliveryPhase
  readonly milestone?: FirstDelivery | undefined
  readonly workingPersonaName?: string | undefined
  readonly runError?: RunErrorPayload | undefined
  readonly activities?: readonly ActivityItem[] | undefined
  readonly prompt?: string | undefined
  readonly onPromptChange?: ((text: string) => void) | undefined
  readonly onRequest: () => void
  readonly onEnterApp: () => void
  readonly onCelebrateContinue: () => void
  readonly onConnectEngine?: (() => void) | undefined
  readonly onRetry?: (() => void) | undefined
  readonly onKeepWaiting?: (() => void) | undefined
  readonly onAskChange?: (() => void) | undefined
}

/** V1-P0-4 / UX-PHASE §1 / FIRST-DELIVERY-SPEC: guided first real delivery before leaving onboarding. */
export function OnboardingFirstDeliveryStep({
  dict,
  shellT,
  chatT,
  greetingName,
  vaultReady,
  phase,
  milestone,
  workingPersonaName,
  runError,
  activities,
  prompt,
  onPromptChange,
  onRequest,
  onEnterApp,
  onCelebrateContinue,
  onConnectEngine,
  onRetry,
  onKeepWaiting,
  onAskChange,
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
            <>
              <Button variant="primary" size="l" onClick={onCelebrateContinue}>
                {t('step5.acceptAndEnter')}
              </Button>
              {onAskChange !== undefined && (
                <Button variant="ghost" onClick={onAskChange}>
                  {t('step5.askChange')}
                </Button>
              )}
            </>
          )}
        />
      </section>
    )
  }

  if (phase === 'failed') {
    const errorPayload: RunErrorPayload = runError ?? {
      code: 'not_logged_in',
      provider: 'Claude',
      persona: workingPersonaName ?? t('step5.workingFallbackName'),
      command: 'claude login',
    }
    const personaName = workingPersonaName ?? errorPayload.persona ?? t('step5.workingFallbackName')
    const desc = describeRunError({ ...errorPayload, persona: personaName })
    const localT = chatT ?? ((k: string, p?: Readonly<Record<string, string | number>>) => t(k, p))
    const text = runErrorText(desc, (k, p) => localT(k, p))
    return (
      <section className={styles.step} aria-live="polite">
        <RunErrorCard
          tone={desc.tone}
          persona={{ name: personaName }}
          title={text.title}
          body={text.body}
          {...(desc.command === undefined ? {} : { command: desc.command })}
          primary={{
            label: text.primary || t('runError.action.retry') || 'Tentar de novo',
            onClick: onRetry ?? onRequest,
          }}
          secondary={{
            label: t('step5.enterApp'),
            onClick: onEnterApp,
          }}
          labels={{
            copy: localT('runError.copy') || 'Copiar comando',
            copied: localT('runError.copied') || 'Copiado',
            commandLabel: localT('runError.commandLabel') || 'Comando para o terminal',
          }}
        />
      </section>
    )
  }

  if (phase === 'needsEngine') {
    return (
      <section className={styles.step} aria-live="polite">
        <h1 className={styles.title}>{t('step5.needsEngineTitle')}</h1>
        <p className={styles.hint}>{t('step5.needsEngineBody')}</p>
        <div className={styles.firstDeliveryActions}>
          <Button
            variant="primary"
            size="l"
            icon={<UiIcon name="sparkle" size={18} strokeWidth={2} />}
            onClick={onConnectEngine}
          >
            {t('step5.connectEngine')}
          </Button>
          <Button variant="ghost" onClick={onEnterApp}>{t('step5.enterApp')}</Button>
        </div>
      </section>
    )
  }

  if (phase === 'working' || phase === 'slow') {
    const workingLabel = workingPersonaName ?? t('step5.workingFallbackName')
    const isSlow = phase === 'slow'
    return (
      <section className={styles.step} aria-live="polite">
        <h1 className={styles.title}>{t('step5.workingTitle')}</h1>
        <p className={styles.hint}>{t('step5.workingBody', { name: workingLabel })}</p>
        {isSlow ? (
          <Notice tone="info">{t('step5.slowBody')}</Notice>
        ) : (
          <Notice tone="info">{t('step5.workingNotice')}</Notice>
        )}
        <div className={styles.workingRow}>
          <Chip tone="success" size="s">{t('step5.workingChip')}</Chip>
          <span className={styles.workingName}>{workingLabel}</span>
        </div>
        {activities !== undefined && activities.length > 0 && (
          <ActivityGroup
            persona={{ name: workingLabel }}
            items={activities}
            labels={{
              phrase: {
                command: n => `${n} comando(s)`,
                file: n => `${n} arquivo(s)`,
                hire: n => `${n} contratação(ões)`,
                message: n => `${n} mensagem(ns)`,
                read: n => `${n} leitura(s)`,
                check: n => `${n} verificação(ões)`,
              },
              more: n => `e mais ${n}`,
              failed: n => `${n} falharam`,
              running: 'em andamento',
              status: {
                done: 'concluído',
                failed: 'falhou',
                running: 'em andamento',
                waiting: 'aguardando',
              },
              open: 'Abrir',
              expand: 'Expandir',
              collapse: 'Recolher',
            }}
          />
        )}
        <div className={styles.firstDeliveryActions}>
          {isSlow ? (
            <>
              <Button variant="primary" size="l" onClick={onEnterApp}>
                {t('step5.enterAndFollow')}
              </Button>
              {onKeepWaiting !== undefined && (
                <Button variant="ghost" onClick={onKeepWaiting}>
                  {t('step5.keepWaiting')}
                </Button>
              )}
            </>
          ) : (
            <Button variant="ghost" onClick={onEnterApp}>
              {t('step5.enterAndFollow')}
            </Button>
          )}
        </div>
      </section>
    )
  }

  const defaultTaskText = vaultReady ? t('step5.taskPreview') : t('step5.taskPreviewEmpty')
  return (
    <section className={styles.step}>
      <h1 className={styles.title}>{t('step5.title')}</h1>
      <p className={styles.hint}>{t('step5.hint')}</p>
      <TeamIntroQueue lines={MOCK_INTRO_LINES} greetingName={greetingName} />
      <div className={styles.taskPreview}>
        <p className={styles.taskPreviewLabel}>{t('step5.taskPreviewLabel')}</p>
        {onPromptChange !== undefined ? (
          <input
            type="text"
            className={styles.taskPreviewInput}
            value={prompt ?? defaultTaskText}
            onChange={e => onPromptChange(e.target.value)}
            aria-label={t('step5.taskPreviewLabel')}
          />
        ) : (
          <p className={styles.taskPreviewBody}>{prompt ?? defaultTaskText}</p>
        )}
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

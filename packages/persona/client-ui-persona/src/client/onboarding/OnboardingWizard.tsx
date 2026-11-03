/** Five-step onboarding preview (mock data). */

import { useSyncExternalStore, type ReactNode } from 'react'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import previewStyles from '../preview/PreviewFrame.module.css'
import { MOCK_HARNESSES, MOCK_INTRO_LINES, type TeamTemplateId } from './mock-data.ts'
import type { OnboardingActions } from './create-onboarding-store.ts'
import type { OnboardingState } from './create-onboarding-store.ts'
import type { createOnboardingStore } from './create-onboarding-store.ts'
import styles from './OnboardingWizard.module.css'

export interface OnboardingWizardProps {
  readonly dict: LocaleDict
  readonly store: ReturnType<typeof createOnboardingStore>['store']
  readonly actions: OnboardingActions
}

const TEMPLATE_KEYS: Readonly<Record<TeamTemplateId, string>> = {
  equipeAnimais: 'step4.templates.equipeAnimais',
  startup: 'step4.templates.startup',
  agencia: 'step4.templates.agencia',
  emBranco: 'step4.templates.emBranco',
}

function useStoreSnapshot(store: OnboardingWizardProps['store']): OnboardingState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

/** Onboarding flow for isolated preview and future shell overlay. */
export function OnboardingWizard({ dict, store, actions }: OnboardingWizardProps): ReactNode {
  const state = useStoreSnapshot(store)
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 8 })

  const continueDisabled = state.step === 1 && state.displayName.trim().length === 0

  return (
    <div className={styles.wizard} ref={motion.ref} style={motion.style}>
      <p className={styles.stepIndicator}>{t('stepIndicator', { current: state.step, total: 5 })}</p>
      {state.step === 1 && (
        <>
          <h1 className={styles.title}>{t('step1.title')}</h1>
          <p className={previewStyles.muted}>{t('step1.hint')}</p>
          <label className={styles.field}>
            <span className={styles.label}>{t('step1.label')}</span>
            <input
              className={styles.input}
              value={state.displayName}
              onChange={(event) => { actions.setDisplayName(event.target.value) }}
              placeholder={t('step1.placeholder')}
            />
          </label>
        </>
      )}
      {state.step === 2 && (
        <>
          <h1 className={styles.title}>{t('step2.title')}</h1>
          <p className={previewStyles.muted}>{t('step2.hint')}</p>
          <span className={styles.badge}>{t('step2.vaultBadge')}</span>
          <label className={styles.field}>
            <span className={styles.label}>{t('step2.label')}</span>
            <textarea
              className={styles.textarea}
              value={state.vaultText}
              onChange={(event) => { actions.setVaultText(event.target.value) }}
              placeholder={t('step2.placeholder')}
            />
          </label>
        </>
      )}
      {state.step === 3 && (
        <>
          <h1 className={styles.title}>{t('step3.title')}</h1>
          <p className={previewStyles.muted}>{t('step3.hint')}</p>
          <ul className={styles.harnessList}>
            {MOCK_HARNESSES.map(row => (
              <li key={row.id} className={styles.harnessRow}>
                <span>{row.label}</span>
                <span className={row.ready ? styles.statusReady : styles.statusMissing}>
                  {t(row.ready ? 'step3.ready' : 'step3.missing')}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {state.step === 4 && (
        <>
          <h1 className={styles.title}>{t('step4.title')}</h1>
          <p className={previewStyles.muted}>{t('step4.hint')}</p>
          <div className={styles.templateGrid} role="group" aria-label={t('step4.title')}>
            {(Object.keys(TEMPLATE_KEYS) as TeamTemplateId[]).map(id => (
              <button
                key={id}
                type="button"
                className={styles.templateButton}
                aria-pressed={state.templateId === id}
                onClick={() => { actions.setTemplate(id) }}
              >
                {t(TEMPLATE_KEYS[id])}
              </button>
            ))}
          </div>
          <ul className={styles.roster}>
            {state.roster.map(person => (
              <li key={person.name} className={styles.rosterItem}>{person.name} · {person.role}</li>
            ))}
          </ul>
          <label className={styles.field}>
            <span className={styles.label}>{t('step4.builderLabel')}</span>
            <textarea
              className={styles.textarea}
              value={state.builderPrompt}
              onChange={(event) => { actions.setBuilderPrompt(event.target.value) }}
              placeholder={t('step4.builderPlaceholder')}
            />
          </label>
          <button type="button" className={previewStyles.secondary} onClick={() => { actions.applyBuilderDraft() }}>
            {t('action.continue')}
          </button>
        </>
      )}
      {state.step === 5 && (
        <>
          <h1 className={styles.title}>{t('step5.title')}</h1>
          <p className={previewStyles.muted}>{t('step5.hint')}</p>
          <ul className={styles.introList}>
            {MOCK_INTRO_LINES.map(line => (
              <li key={line.speaker} className={styles.introItem}>
                <div className={styles.introSpeaker}>{line.speaker}</div>
                <div>{line.text}</div>
              </li>
            ))}
          </ul>
          <button type="button" className={previewStyles.primary}>{t('step5.suggestedTask')}</button>
        </>
      )}
      <div className={styles.actions}>
        {state.step > 1 && (
          <button type="button" className={previewStyles.secondary} onClick={() => { actions.back() }}>
            {t('action.back')}
          </button>
        )}
        {state.step < 5 && (
          <button
            type="button"
            className={previewStyles.primary}
            disabled={continueDisabled}
            onClick={() => { actions.next() }}
          >
            {t('action.continue')}
          </button>
        )}
        {state.step === 3 && (
          <button type="button" className={previewStyles.secondary} onClick={() => { actions.next() }}>
            {t('action.skipHarness')}
          </button>
        )}
        {state.step === 5 && (
          <button type="button" className={previewStyles.primary} onClick={() => { actions.next() }}>
            {t('action.finish')}
          </button>
        )}
      </div>
    </div>
  )
}

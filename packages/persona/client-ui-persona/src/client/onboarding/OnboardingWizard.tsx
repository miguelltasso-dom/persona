/** Five-step onboarding preview (mock data). */

import { useSyncExternalStore, type ReactNode } from 'react'
import { PersonaButton, PersonaMuted } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { MOCK_HARNESSES, MOCK_INTRO_LINES, type TeamTemplateId } from './mock-data.ts'
import type { OnboardingActions } from './create-onboarding-store.ts'
import type { OnboardingState } from './create-onboarding-store.ts'
import type { createOnboardingStore } from './create-onboarding-store.ts'
import { BuilderThread } from './BuilderThread.tsx'
import { OnboardingStepMotion } from './OnboardingStepMotion.tsx'
import { TeamIntroQueue } from './TeamIntroQueue.tsx'
import { VaultCofrePanel } from './VaultCofrePanel.tsx'
import styles from './OnboardingWizard.module.css'

export interface OnboardingWizardProps {
  readonly dict: LocaleDict
  readonly store: ReturnType<typeof createOnboardingStore>['store']
  readonly actions: OnboardingActions
  /** Called when the user finishes step 5 (shell overlay dismiss). */
  readonly onComplete?: () => void
}

const TEMPLATE_KEYS: Readonly<Record<TeamTemplateId, string>> = {
  equipeAnimais: 'step4.templates.equipeAnimais',
  startup: 'step4.templates.startup',
  agencia: 'step4.templates.agencia',
  emBranco: 'step4.templates.emBranco',
}

function useStoreSnapshot(store: OnboardingWizardProps['store']): OnboardingState {
  return useSyncExternalStore(
    listener => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  )
}

function coordinatorReply(dict: LocaleDict, prompt: string): string {
  const role = prompt.trim().slice(0, 80)
  return bindLocale(dict, 'step4.coordinatorReply', { name: 'Colega novo', role })
}

/** Onboarding flow for isolated preview and future shell overlay. */
export function OnboardingWizard({ dict, store, actions, onComplete }: OnboardingWizardProps): ReactNode {
  const state = useStoreSnapshot(store)
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)

  const continueDisabled = state.step === 1 && state.displayName.trim().length === 0
  const vaultReady = state.vaultText.trim().length > 0

  return (
    <div className={styles.wizard}>
      <p className={styles.stepIndicator}>{t('stepIndicator', { current: state.step, total: 5 })}</p>
      <OnboardingStepMotion step={state.step}>
        {state.step === 1 && (
          <>
            <h1 className={styles.title}>{t('step1.title')}</h1>
            <PersonaMuted>{t('step1.hint')}</PersonaMuted>
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
            <PersonaMuted>{t('step2.hint')}</PersonaMuted>
            <VaultCofrePanel
              badgeLabel={t('step2.vaultBadge')}
              activeLabel={t('step2.vaultActive')}
              hasContent={vaultReady}
            />
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
            <PersonaMuted>{t('step3.hint')}</PersonaMuted>
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
            <PersonaMuted>{t('step4.hint')}</PersonaMuted>
            <BuilderThread
              messages={state.builderThread}
              userLabel={t('step4.builderYou')}
              coordinatorLabel={t('step4.coordinatorName')}
            />
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
            <PersonaButton
              variant="secondary"
              onClick={() => { actions.applyBuilderDraft(coordinatorReply(dict, state.builderPrompt)) }}
            >
              {t('step4.builderApply')}
            </PersonaButton>
          </>
        )}
        {state.step === 5 && (
          <>
            <h1 className={styles.title}>{t('step5.title')}</h1>
            <PersonaMuted>{t('step5.hint')}</PersonaMuted>
            <TeamIntroQueue lines={MOCK_INTRO_LINES} greetingName={state.displayName || t('brand.name')} />
            <PersonaButton>{t('step5.suggestedTask')}</PersonaButton>
          </>
        )}
      </OnboardingStepMotion>
      <div className={styles.actions}>
        {state.step > 1 && (
          <PersonaButton variant="secondary" onClick={() => { actions.back() }}>
            {t('action.back')}
          </PersonaButton>
        )}
        {state.step < 5 && (
          <PersonaButton disabled={continueDisabled} onClick={() => { actions.next() }}>
            {t('action.continue')}
          </PersonaButton>
        )}
        {state.step === 3 && (
          <PersonaButton variant="secondary" onClick={() => { actions.next() }}>
            {t('action.skipHarness')}
          </PersonaButton>
        )}
        {state.step === 5 && (
          <PersonaButton onClick={() => { onComplete?.() }}>
            {t('action.finish')}
          </PersonaButton>
        )}
      </div>
    </div>
  )
}

/** Five-step onboarding (DESIGN-SYSTEM §7): illustrated stage with the team arriving + one focused form per step. */

import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import { Button, Chip, Input, Textarea, UiIcon } from '../primitives/index.ts'
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

const STEP_KEYS = ['steps.you', 'steps.company', 'steps.tools', 'steps.team', 'steps.start'] as const
const CAST: readonly PersonaCharacterId[] = ['atlas', 'bento', 'nina', 'sol', 'luna']

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

/** Stage: Brush banner scene, the team walking in (stagger 80 ms), Atlas speech bubble per step. */
function OnboardingStage({ t, step }: { readonly t: (key: string) => string; readonly step: number }): ReactNode {
  const banner = ILLUSTRATIONS['team-banner-light']
  const bannerDark = ILLUSTRATIONS['team-banner-dark']
  const visible = step >= 5 ? CAST : CAST.slice(0, Math.min(CAST.length, step + 1))
  return (
    <div className={styles.stage} aria-hidden="true">
      {banner !== undefined && <img className={styles.stageLight} src={banner} alt="" />}
      {bannerDark !== undefined && <img className={styles.stageDark} src={bannerDark} alt="" />}
      <div className={styles.bubble}>
        <span className={styles.bubbleName}>Atlas</span>
        {t(`step${step}.atlasSays`)}
      </div>
      <ul className={styles.cast}>
        {CAST.map((id, index) => {
          const src = poseUrl(id, 'disponivel')
          const here = visible.includes(id)
          return (
            <li
              key={id}
              className={styles.castMember}
              data-here={here ? '' : undefined}
              style={{ '--cast-delay': `${index * 80}ms` } as CSSProperties}
            >
              {src !== undefined && <img src={src} alt="" draggable={false} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Onboarding flow for the shell overlay and isolated previews. */
export function OnboardingWizard({ dict, store, actions, onComplete }: OnboardingWizardProps): ReactNode {
  const state = useStoreSnapshot(store)
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)

  const continueDisabled = state.step === 1 && state.displayName.trim().length === 0
  const vaultReady = state.vaultText.trim().length > 0

  return (
    <div className={styles.wizard} data-persona-root="">
      <OnboardingStage t={t} step={state.step} />

      <div className={styles.content}>
        <ol className={styles.stepper} aria-label={t('progressLabel')}>
          {STEP_KEYS.map((key, index) => {
            const number = index + 1
            const status = number < state.step ? 'done' : number === state.step ? 'current' : 'todo'
            return (
              <li key={key} className={styles.stepItem} data-status={status} aria-current={status === 'current' ? 'step' : undefined}>
                <span className={styles.stepDot} aria-hidden="true">
                  {status === 'done' ? <UiIcon name="check" size={14} strokeWidth={2.8} /> : number}
                </span>
                <span className={styles.stepName}>{t(key)}</span>
              </li>
            )
          })}
        </ol>
        <p className={styles.stepIndicator}>{t('stepIndicator', { current: state.step, total: 5 })}</p>

        <OnboardingStepMotion step={state.step}>
          {state.step === 1 && (
            <section className={styles.step}>
              <h1 className={styles.title}>{t('step1.title')}</h1>
              <p className={styles.hint}>{t('step1.hint')}</p>
              <Input
                label={t('step1.label')}
                value={state.displayName}
                onChange={(event) => { actions.setDisplayName(event.target.value) }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !continueDisabled) actions.next()
                }}
                placeholder={t('step1.placeholder')}
                autoComplete="given-name"
              />
            </section>
          )}
          {state.step === 2 && (
            <section className={styles.step}>
              <h1 className={styles.title}>{t('step2.title')}</h1>
              <p className={styles.hint}>{t('step2.hint')}</p>
              <VaultCofrePanel
                badgeLabel={t('step2.vaultBadge')}
                activeLabel={t('step2.vaultActive')}
                hasContent={vaultReady}
              />
              <Textarea
                label={t('step2.label')}
                value={state.vaultText}
                rows={5}
                onChange={(event) => { actions.setVaultText(event.target.value) }}
                placeholder={t('step2.placeholder')}
              />
            </section>
          )}
          {state.step === 3 && (
            <section className={styles.step}>
              <h1 className={styles.title}>{t('step3.title')}</h1>
              <p className={styles.hint}>{t('step3.hint')}</p>
              <ul className={styles.harnessList}>
                {MOCK_HARNESSES.map(row => (
                  <li key={row.id} className={styles.harnessRow} data-ready={row.ready ? '' : undefined}>
                    <span className={styles.harnessIcon} aria-hidden="true">
                      <UiIcon name={row.ready ? 'check' : 'more'} size={18} strokeWidth={2.4} />
                    </span>
                    <span className={styles.harnessName}>{row.label}</span>
                    <Chip size="s" tone={row.ready ? 'success' : 'neutral'} aria-label={`${t('step3.statusLabel', { name: row.label })}: ${t(row.ready ? 'step3.ready' : 'step3.missing')}`}>
                      {t(row.ready ? 'step3.ready' : 'step3.missing')}
                    </Chip>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {state.step === 4 && (
            <section className={styles.step}>
              <h1 className={styles.title}>{t('step4.title')}</h1>
              <p className={styles.hint}>{t('step4.hint')}</p>
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
              {state.roster.length > 0 && (
                <ul className={styles.roster}>
                  {state.roster.map(person => (
                    <li key={person.name}>
                      <Chip tone="plain">
                        <strong>{person.name}</strong>
                        {` · ${person.role}`}
                      </Chip>
                    </li>
                  ))}
                </ul>
              )}
              <BuilderThread
                messages={state.builderThread}
                userLabel={t('step4.builderYou')}
                coordinatorLabel={t('step4.coordinatorName')}
              />
              <div className={styles.builderRow}>
                <Textarea
                  label={t('step4.builderLabel')}
                  value={state.builderPrompt}
                  rows={2}
                  onChange={(event) => { actions.setBuilderPrompt(event.target.value) }}
                  placeholder={t('step4.builderPlaceholder')}
                />
                <Button
                  variant="secondary"
                  icon={<UiIcon name="sparkle" size={18} strokeWidth={2} />}
                  disabled={state.builderPrompt.trim().length === 0}
                  onClick={() => { actions.applyBuilderDraft(coordinatorReply(dict, state.builderPrompt)) }}
                >
                  {t('step4.builderApply')}
                </Button>
              </div>
            </section>
          )}
          {state.step === 5 && (
            <section className={styles.step}>
              <h1 className={styles.title}>{t('step5.title')}</h1>
              <p className={styles.hint}>{t('step5.hint')}</p>
              <TeamIntroQueue lines={MOCK_INTRO_LINES} greetingName={state.displayName || t('brand.name')} />
            </section>
          )}
        </OnboardingStepMotion>

        <div className={styles.actions}>
          {state.step > 1 ? (
            <Button variant="ghost" icon={<UiIcon name="chevronDown" size={18} strokeWidth={2.2} className={styles.backIcon} />} onClick={() => { actions.back() }}>
              {t('action.back')}
            </Button>
          ) : <span />}
          <div className={styles.actionsRight}>
            {state.step === 3 && (
              <Button variant="secondary" onClick={() => { actions.next() }}>
                {t('action.skipHarness')}
              </Button>
            )}
            {state.step < 5 && (
              <Button
                variant="primary"
                size="l"
                disabled={continueDisabled}
                iconEnd={<UiIcon name="arrowRight" size={20} strokeWidth={2.2} />}
                onClick={() => { actions.next() }}
              >
                {t('action.continue')}
              </Button>
            )}
            {state.step === 5 && (
              <Button
                variant="primary"
                size="l"
                iconEnd={<UiIcon name="arrowRight" size={20} strokeWidth={2.2} />}
                onClick={() => { onComplete?.() }}
              >
                {t('action.finish')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

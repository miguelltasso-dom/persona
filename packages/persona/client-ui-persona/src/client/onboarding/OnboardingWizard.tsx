/** Five-step onboarding (DESIGN-SYSTEM §7): illustrated stage with the team arriving + one focused form per step. */

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { writeOnboardingBycDraft } from '../bring-context/onboarding-byc-draft.ts'
import { StructureAssistant } from '../governance/StructureAssistant.tsx'
import { structurePlanToRoster } from '../governance/structure-plan-to-roster.ts'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import { Avatar, Button, Chip, Input, Notice, PawBurst, Textarea, UiIcon } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { MOCK_HARNESSES, type HarnessRow, type TeamTemplateId } from './mock-data.ts'
import { OnboardingFirstDeliveryStep, type OnboardingFirstDeliveryStepProps } from './OnboardingFirstDeliveryStep.tsx'
import type { OnboardingActions } from './create-onboarding-store.ts'
import type { OnboardingState } from './create-onboarding-store.ts'
import type { createOnboardingStore } from './create-onboarding-store.ts'
import { BuilderThread } from './BuilderThread.tsx'
import { OnboardingStepMotion } from './OnboardingStepMotion.tsx'
import { BringYourContextBlock } from '../bring-context/BringYourContextBlock.tsx'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { VaultCofrePanel } from './VaultCofrePanel.tsx'
import styles from './OnboardingWizard.module.css'

export interface OnboardingWizardProps {
  readonly dict: LocaleDict
  readonly structureDict: LocaleDict
  readonly store: ReturnType<typeof createOnboardingStore>['store']
  readonly actions: OnboardingActions
  /** Called when the user finishes step 5 (shell overlay dismiss). */
  readonly onComplete?: () => void
  readonly onScanVaultFolder?: ((rootPath: string) => Promise<import('@deepseek-ai/dsh-persona-core').BringContextPreview>) | undefined
  readonly onOrganizePreview?: import('../bring-context/BringYourContextBlock.tsx').BringYourContextBlockProps['onOrganizePreview']
  readonly onApplyReview?: import('../bring-context/BringYourContextBlock.tsx').BringYourContextBlockProps['onApplyReview']
  readonly structureRemote?: {
    readonly client: PersonaRemoteClient
    readonly workspaceId: string
  } | undefined
  readonly harnesses?: readonly HarnessRow[] | undefined
  /** Live first-delivery flow (shell overlay). Preview/tests omit this and keep the legacy finish button. */
  readonly firstDelivery?: Omit<OnboardingFirstDeliveryStepProps, 'dict' | 'greetingName' | 'vaultReady'> | undefined
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

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

/** Face for a roster draft: explicit gallery ref, else the animal named like the persona, else a suggested animal. */
function rosterFace(person: { readonly name: string; readonly galleryRef?: string }, index: number): { src: string | undefined; suggested: boolean } {
  const ref = person.galleryRef ?? person.name.trim().toLowerCase()
  const direct = PORTRAITS[ref]
  if (direct !== undefined) return { src: direct, suggested: false }
  return { src: PORTRAITS[CAST[index % CAST.length] ?? 'atlas'], suggested: true }
}

function coordinatorReply(dict: LocaleDict, prompt: string): string {
  const role = prompt.trim().slice(0, 80)
  return bindLocale(dict, 'step4.coordinatorReply', { name: 'Colega novo', role })
}

/** Stage: Brush banner scene, the team walking in (stagger 80 ms), neutral Persona guide bubble per step. */
function OnboardingStage({ t, step }: { readonly t: (key: string) => string; readonly step: number }): ReactNode {
  const banner = ILLUSTRATIONS['team-banner-light']
  const bannerDark = ILLUSTRATIONS['team-banner-dark']
  const visible = step >= 5 ? CAST : CAST.slice(0, Math.min(CAST.length, step + 1))
  return (
    <div className={styles.stage} aria-hidden="true">
      {banner !== undefined && <img className={styles.stageLight} src={banner} alt="" />}
      {bannerDark !== undefined && <img className={styles.stageDark} src={bannerDark} alt="" />}
      <div className={styles.bubble}>
        <span className={styles.bubbleName}>{t('guide.name')}</span>
        {t(`step${step}.guideSays`)}
      </div>
      {step >= 5 && <PawBurst key="team-ready" />}
      <ul className={styles.cast}>
        {CAST.map((id, index) => {
          const src = poseUrl(id, 'acenando')
          const here = visible.includes(id)
          return (
            <li
              key={id}
              className={styles.castMember}
              data-character={id}
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
export function OnboardingWizard({
  dict,
  structureDict,
  store,
  actions,
  onComplete,
  onScanVaultFolder,
  onOrganizePreview,
  onApplyReview,
  structureRemote,
  harnesses = MOCK_HARNESSES,
  firstDelivery,
}: OnboardingWizardProps): ReactNode {
  const [structureOpen, setStructureOpen] = useState(false)
  const state = useStoreSnapshot(store)
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)

  useEffect(() => {
    writeOnboardingBycDraft({
      bringPaste: state.bringPaste,
      bringProvider: state.bringProvider,
      vaultFolderPath: state.vaultFolderPath,
      pasted: state.bringPasted,
    })
  }, [state.bringPaste, state.bringProvider, state.vaultFolderPath, state.bringPasted])

  const continueDisabled = state.step === 1 && state.displayName.trim().length === 0
  const vaultReady = state.vaultText.trim().length > 0
  const anyHarnessReady = harnesses.some(row => row.ready)
  const hideFooterContinue = state.step === 4 && structureOpen
  const firstDeliveryActive = firstDelivery !== undefined && state.step === 5

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
              <BringYourContextBlock
                dict={dict}
                paste={state.bringPaste}
                provider={state.bringProvider}
                pasted={state.bringPasted}
                vaultFolderPath={state.vaultFolderPath}
                cofreSavedCount={state.bringCofreSavedCount}
                onPasteChange={actions.setBringPaste}
                onProviderChange={actions.setBringProvider}
                onPastedChange={actions.setBringPasted}
                onVaultFolderPathChange={actions.setVaultFolderPath}
                onCofreSavedCountChange={actions.setBringCofreSavedCount}
                onVaultSeedAppend={actions.appendVaultText}
                {...(onScanVaultFolder === undefined ? {} : { onScanVaultFolder })}
                {...(onOrganizePreview === undefined ? {} : { onOrganizePreview })}
                {...(onApplyReview === undefined ? {} : { onApplyReview })}
              />
            </section>
          )}
          {state.step === 3 && (
            <section className={styles.step}>
              <h1 className={styles.title}>{t('step3.title')}</h1>
              <p className={styles.hint}>{t('step3.hint')}</p>
              <ul className={styles.harnessList}>
                {!anyHarnessReady && (
                  <Notice tone="warning">{t('step3.connectRequired')}</Notice>
                )}
                {harnesses.map(row => (
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
          {state.step === 4 && structureOpen && (
            <section className={styles.step}>
              <Button variant="ghost" onClick={() => { setStructureOpen(false) }}>{t('step4.structureBack')}</Button>
              <StructureAssistant
                dict={structureDict}
                humanLabel={state.displayName}
                compact
                {...(structureRemote === undefined ? {} : { structureRemote })}
                onApplyRoster={(plan) => {
                  actions.setRoster(structurePlanToRoster(plan))
                  setStructureOpen(false)
                }}
                onSkip={() => { setStructureOpen(false) }}
              />
            </section>
          )}
          {state.step === 4 && !structureOpen && (
            <section className={styles.step}>
              <h1 className={styles.title}>{t('step4.title')}</h1>
              <p className={styles.hint}>{t('step4.hint')}</p>
              <Button
                variant="secondary"
                icon={<UiIcon name="sparkle" size={18} strokeWidth={2} />}
                onClick={() => { setStructureOpen(true) }}
              >
                {t('step4.structureOpen')}
              </Button>
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
                  {state.roster.map((person, index) => {
                    const face = rosterFace(person, index)
                    return (
                      <li key={person.name} className={styles.rosterCard} data-suggested={face.suggested ? '' : undefined}>
                        <Avatar name={person.name} src={face.src} shape="portrait" size={40} decorative />
                        <span className={styles.rosterText}>
                          <span className={styles.rosterName}>{person.name}</span>
                          <span className={styles.rosterRole}>{person.role}</span>
                        </span>
                      </li>
                    )
                  })}
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
          {state.step === 5 && firstDelivery !== undefined && (
            <OnboardingFirstDeliveryStep
              dict={dict}
              shellT={firstDelivery.shellT}
              {...(firstDelivery.chatT !== undefined ? { chatT: firstDelivery.chatT } : {})}
              greetingName={state.displayName || t('brand.name')}
              vaultReady={vaultReady}
              phase={firstDelivery.phase}
              milestone={firstDelivery.milestone}
              workingPersonaName={firstDelivery.workingPersonaName}
              runError={firstDelivery.runError}
              activities={firstDelivery.activities}
              prompt={firstDelivery.prompt}
              onPromptChange={firstDelivery.onPromptChange}
              onRequest={firstDelivery.onRequest}
              onEnterApp={firstDelivery.onEnterApp}
              onCelebrateContinue={firstDelivery.onCelebrateContinue}
              onConnectEngine={firstDelivery.onConnectEngine ?? (() => { actions.setStep(3) })}
              onRetry={firstDelivery.onRetry}
              onKeepWaiting={firstDelivery.onKeepWaiting}
              onAskChange={firstDelivery.onAskChange}
            />
          )}
          {state.step === 5 && firstDelivery === undefined && (
            <section className={styles.step}>
              <h1 className={styles.title}>{t('step5.title')}</h1>
              <p className={styles.hint}>{t('step5.hint')}</p>
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
            {state.step === 3 && anyHarnessReady && (
              <Button variant="secondary" onClick={() => { actions.next() }}>
                {t('action.skipHarness')}
              </Button>
            )}
            {state.step < 5 && !hideFooterContinue && (
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
            {state.step === 5 && !firstDeliveryActive && (
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

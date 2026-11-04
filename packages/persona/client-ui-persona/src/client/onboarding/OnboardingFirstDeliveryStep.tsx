import { useEffect, useState, type ReactNode } from 'react'
import { AVATAR_96, ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { poseUrl, type PersonaCharacterId } from '../assets/asset-url.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import {
  ActivityGroup,
  Button,
  Chip,
  EmptyState,
  MilestoneCard,
  Notice,
  RunErrorCard,
  UiIcon,
  describeRunError,
  runErrorText,
  type ActivityGroupProps,
  type ActivityItem,
  type RunErrorPayload,
} from '../primitives/index.ts'
import type { FirstDelivery } from '../overview/OverviewView.tsx'
import { TeamIntroQueue, type IntroLine } from './TeamIntroQueue.tsx'
import styles from './OnboardingWizard.module.css'

/** Falhas do tipo "não há IA utilizável": levam a arte do tamanduá do "Falta uma IA" (Muse). */
const NO_AI_CODES: readonly RunErrorPayload['code'][] = ['not_logged_in', 'cli_not_found', 'engine_unavailable']

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
  /** Id do personagem (retrato) de quem pegou o pedido; sem ele, mostra a inicial. */
  readonly workingCharacterId?: string | undefined
  readonly runError?: RunErrorPayload | undefined
  readonly activities?: readonly ActivityItem[] | undefined
  /** Apresentação da equipe CONTRATADA (nome + função de cada persona). Sem equipe, sem lista: nada de texto de exemplo. */
  readonly introLines?: readonly IntroLine[] | undefined
  /** Rótulos do ActivityGroup vindos do dicionário (`activityGroupLabelsFromDict`); sem eles a atividade não aparece. */
  readonly activityLabels?: ActivityGroupProps['labels'] | undefined
  readonly prompt?: string | undefined
  readonly onPromptChange?: ((text: string) => void) | undefined
  /** Do campo "O pedido" recebe o texto que estava na tela (o pedido de verdade: o host usa o MESMO texto); nos atalhos de erro, sem texto. */
  readonly onRequest: (text?: string) => void
  /** "Contexto da empresa" do passo 2: a fonte das ideias de pedido. Sem texto, sem ideias. */
  readonly businessText?: string | undefined
  /** 0–3 pedidos derivados do negócio (host). Vazio/erro = sem chips; nunca inventa a empresa. */
  readonly suggestFirstRequests?: ((cofreSeed: string) => Promise<readonly string[]>) | undefined
  /** Enquanto a 1ª leitura da IA não voltou, "Pedir agora" espera (evita pedir no instante antes de saber se há IA). */
  readonly requestDisabled?: boolean | undefined
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
  vaultReady,
  phase,
  milestone,
  workingPersonaName,
  workingCharacterId,
  runError,
  activities,
  introLines,
  activityLabels,
  prompt,
  onPromptChange,
  businessText,
  suggestFirstRequests,
  onRequest,
  requestDisabled = false,
  onEnterApp,
  onCelebrateContinue,
  onConnectEngine,
  onRetry,
  onKeepWaiting,
  onAskChange,
}: OnboardingFirstDeliveryStepProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)

  // A-6: ideias de pedido do negócio do passo 2 (só no intro; os hooks ficam antes de qualquer retorno por fase).
  const [suggestions, setSuggestions] = useState<readonly string[]>([])
  useEffect(() => {
    const seed = (businessText ?? '').trim()
    if (phase !== 'intro' || suggestFirstRequests === undefined || seed === '') {
      setSuggestions([])
      return undefined
    }
    let cancelled = false
    suggestFirstRequests(seed)
      .then((list) => { if (!cancelled) setSuggestions(list.map(item => item.trim()).filter(item => item !== '').slice(0, 3)) })
      .catch(() => { if (!cancelled) setSuggestions([]) })
    return () => { cancelled = true }
  }, [phase, suggestFirstRequests, businessText])

  if (phase === 'celebrate' && milestone !== undefined) {
    return (
      <section className={styles.step} aria-live="polite" tabIndex={-1} data-persona-step-focus="" data-first-delivery-phase="celebrate">
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
    const failedAvatar = workingCharacterId === undefined ? undefined : (AVATAR_96 as Readonly<Record<string, string>>)[workingCharacterId.toLowerCase()]
    const desc = describeRunError({ ...errorPayload, persona: personaName })
    const localT = chatT ?? ((k: string, p?: Readonly<Record<string, string | number>>) => t(k, p))
    const text = runErrorText(desc, (k, p) => localT(k, p))
    // A ação do cartão leva para onde resolve: tentar de novo, conectar/trocar a IA (passo 3) ou seguir para o app.
    const onPrimary = (): void => {
      switch (desc.primary) {
        case 'retry':
        case 'retryNow':
        case 'reconnect':
          ;(onRetry ?? onRequest)()
          return
        case 'pickEngine':
        case 'otherEngine':
        case 'howToConnect':
        case 'howToInstall':
        case 'swapAccount':
          ;(onConnectEngine ?? onRetry ?? onRequest)()
          return
        default:
          onEnterApp()
      }
    }
    return (
      <section className={styles.step} aria-live="polite" tabIndex={-1} data-persona-step-focus="" data-first-delivery-phase="failed">
        {NO_AI_CODES.includes(errorPayload.code) && (
          <div className={styles.noAiArt} aria-hidden="true">
            <img src={ILLUSTRATIONS['empty-sem-ia']} alt="" />
          </div>
        )}
        <RunErrorCard
          tone={desc.tone}
          persona={{ name: personaName, ...(failedAvatar === undefined ? {} : { avatarSrc: failedAvatar }) }}
          title={text.title}
          body={text.body}
          {...(desc.command === undefined ? {} : { command: desc.command })}
          primary={{
            label: text.primary || t('runError.action.retry') || 'Tentar de novo',
            onClick: onPrimary,
          }}
          secondary={{
            label: t('step5.enterAppPlain'),
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
      <section className={styles.step} data-first-delivery-phase="needsEngine">
        <EmptyState
          compact
          illustration={ILLUSTRATIONS['empty-sem-ia']}
          artSize={240}
          titleAs="h1"
          titleId="persona-onboarding-title"
          title={t('step5.needsEngineTitle')}
          body={t('step5.needsEngineBody')}
          action={(
            <Button
              variant="primary"
              size="l"
              icon={<UiIcon name="sparkle" size={18} strokeWidth={2} />}
              onClick={onConnectEngine}
            >
              {t('step5.connectEngine')}
            </Button>
          )}
          secondaryAction={<Button variant="ghost" onClick={onEnterApp}>{t('step5.enterApp')}</Button>}
        />
      </section>
    )
  }

  if (phase === 'working' || phase === 'slow') {
    const workingLabel = workingPersonaName ?? t('step5.workingFallbackName')
    const isSlow = phase === 'slow'
    // Pose "trabalhando" de quem pegou o pedido (FIRST-DELIVERY-SPEC); sem id, o avatar da Coordenação.
    const known = workingCharacterId !== undefined && workingCharacterId.toLowerCase() in AVATAR_96
    const poseSrc = known
      ? (poseUrl(workingCharacterId.toLowerCase() as PersonaCharacterId, 'trabalhando') ?? (AVATAR_96 as Readonly<Record<string, string>>)[workingCharacterId.toLowerCase()])
      : (AVATAR_96 as Readonly<Record<string, string>>).atlas
    // Sem aria-live na section inteira (o leitor reanunciaria tudo a cada passo): só a linha de estado curta e o aviso de demora.
    return (
      <section className={styles.step} data-first-delivery-phase={phase}>
        <div className={styles.workingLayout}>
          {poseSrc !== undefined && (
            <img className={styles.workingPose} src={poseSrc} alt="" width={160} height={160} />
          )}
          <div className={styles.workingText}>
            <h1 id="persona-onboarding-title" className={styles.title}>{t('step5.workingTitle')}</h1>
            <p className={styles.hint}>{t('step5.workingBody', { name: workingLabel })}</p>
            {isSlow ? (
              <div role="status">
                <Notice tone="info">{t('step5.slowBody')}</Notice>
              </div>
            ) : (
              <Notice tone="info">{t('step5.workingNotice')}</Notice>
            )}
            <div className={styles.workingRow} role="status">
              <Chip tone="success" size="s">{t('step5.workingChip')}</Chip>
              <span className={styles.workingName}>{workingLabel}</span>
            </div>
            {activities !== undefined && activities.length > 0 && activityLabels !== undefined && (
              <ActivityGroup
                persona={{ name: workingLabel }}
                items={activities}
                labels={activityLabels}
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
          </div>
        </div>
      </section>
    )
  }

  const defaultTaskText = vaultReady ? t('step5.taskPreview') : t('step5.taskPreviewEmpty')
  const requestText = (prompt ?? defaultTaskText).trim()
  return (
    <section className={styles.step} data-first-delivery-phase="intro">
      <h1 id="persona-onboarding-title" className={styles.title}>{t('step5.title')}</h1>
      <p className={styles.hint}>{t('step5.hint')}</p>
      {introLines !== undefined && introLines.length > 0 && <TeamIntroQueue lines={introLines} label={t('step5.introLabel')} />}
      <div className={styles.taskPreview}>
        <p className={styles.taskPreviewLabel}>{t('step5.taskPreviewLabel')}</p>
        {onPromptChange !== undefined ? (
          <input
            type="text"
            className={styles.taskPreviewInput}
            value={prompt ?? defaultTaskText}
            maxLength={500}
            onChange={e => onPromptChange(e.target.value)}
            aria-label={t('step5.taskPreviewLabel')}
            aria-describedby="persona-step5-request-hint"
          />
        ) : (
          <p className={styles.taskPreviewBody}>{prompt ?? defaultTaskText}</p>
        )}
        {onPromptChange !== undefined && (
          <p id="persona-step5-request-hint" className={styles.taskPreviewHint}>
            {requestText === '' ? t('step5.requestEmpty') : t('step5.taskEditHint')}
          </p>
        )}
        {suggestions.length > 0 && onPromptChange !== undefined && (
          <div className={styles.requestChips} role="group" aria-label={t('step5.suggestionsLabel')}>
            {suggestions.map(text => (
              <button key={text} type="button" className={styles.requestChip} onClick={() => { onPromptChange(text) }}>
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={styles.firstDeliveryActions}>
        <Button
          variant="primary"
          size="l"
          icon={<UiIcon name="sparkle" size={18} strokeWidth={2} />}
          disabled={requestDisabled || requestText === ''}
          onClick={() => { onRequest(requestText) }}
        >
          {t('step5.requestNow')}
        </Button>
        <Button variant="ghost" onClick={onEnterApp}>{t('step5.enterApp')}</Button>
      </div>
    </section>
  )
}

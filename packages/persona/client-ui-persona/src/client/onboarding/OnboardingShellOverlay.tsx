import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import type { createOnboardingStore } from './create-onboarding-store.ts'
import type { OnboardingActions } from './create-onboarding-store.ts'
import { OnboardingWizard } from './OnboardingWizard.tsx'
import { useFocusTrap } from './use-focus-trap.ts'
import type { FirstDeliveryPhase } from './OnboardingFirstDeliveryStep.tsx'
import { MOCK_HARNESSES, type HarnessRow } from './mock-data.ts'
import { checkingHarnessRows, harnessRowsFromConnections } from './harness-from-connections.ts'
import { nextFirstDeliveryPhase, runErrorForFailed } from './first-delivery-phase.ts'
import { deriveFirstDeliveryMilestone, firstDeliveryFromHost, pickFirstDelivery } from '../overview/derive-first-delivery.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import type { FirstDeliveryView } from '../remote/persona-remote-types.ts'
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'
import { retryEngineStatus, type EngineRemoteWire } from '../remote/engine-status.ts'
import { useEngineStatus } from '../remote/use-engine-status.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import styles from './OnboardingShellOverlay.module.css'

/** Passou disso esperando, o passo 5 admite que está lento e oferece entrar (FIRST-DELIVERY-SPEC). */
export const FIRST_DELIVERY_SLOW_MS = 45_000
/** Enquanto o host ainda sonda as IAs do computador (passo 3), relê a lista nesse intervalo. */
const HARNESS_RECHECK_MS = 1_500
/** Leitura do marco no host enquanto a pessoa espera (barata: linha persistida). */
const DELIVERY_POLL_MS = 2_000
/** Depois de "Tentar de novo" o `failed` antigo ainda aparece no host por um instante. */
const RETRY_GRACE_MS = 8_000

export interface OnboardingShellOverlayInjected {
  hooks: {
    shell: HostObservable<ShellState>
    live: HostObservable<PersonaLiveSnapshot>
  }
  readonly dict: LocaleDict
  readonly structureDict: LocaleDict
  readonly shellDict: LocaleDict
  /** Textos do cartão de erro do passo 5 (`runError.*` mora no namespace do chat, não no do onboarding). */
  readonly chatDict?: LocaleDict | undefined
  readonly store: ReturnType<typeof createOnboardingStore>['store']
  readonly actions: OnboardingActions
  dismissOnboarding(): void
  lockOnboardingForFirstDelivery(): void
  finishOnboardingWizard(options?: { readonly firstRequest?: string }): Promise<void>
  /** Relê o snapshot live (quadro, #geral, marco) quando o host muda de estado. */
  refreshLive?: (() => Promise<void>) | undefined
  postChannelMessage?: ((body: string) => Promise<void>) | undefined
  selectPanel(panel: ShellState['activePanel']): void
  readonly persona: PersonaRemoteClient
  readonly onScanVaultFolder?: ((rootPath: string) => Promise<import('@deepseek-ai/dsh-persona-core').BringContextPreview>) | undefined
  readonly onOrganizePreview?: import('../bring-context/BringYourContextBlock.tsx').BringYourContextBlockProps['onOrganizePreview']
  readonly onApplyReview?: import('../bring-context/BringYourContextBlock.tsx').BringYourContextBlockProps['onApplyReview']
  readonly structureRemote?: {
    readonly client: PersonaRemoteClient
    readonly workspaceId: string
  } | undefined
}

export type OnboardingShellOverlayProps = InjectFace<OnboardingShellOverlayInjected>

/** Superfície do Remote usada só pelo passo 5 (tolerante: hosts/fakes antigos podem não ter tudo). */
interface FirstDeliveryRemoteWire extends EngineRemoteWire {
  /** A-6: 0–3 pedidos derivados do "Contexto da empresa" do passo 2 (o workspace ainda não existe: vai o texto). */
  suggestFirstRequests?(request: { cofreSeed: string }): unknown
  getFirstDelivery?(request: { workspaceId: string; projectId: string }): unknown
  runTicketCommand?(request: {
    workspaceId: string
    projectId: string
    ticketId: string
    command: 'retry'
    reason: string
  }): unknown
}

async function settle(value: unknown): Promise<unknown> {
  const resolved = await Promise.resolve(value)
  return isRemoteResult(resolved) ? unwrapRemote(resolved) : resolved
}

function isDeliveryView(value: unknown): value is FirstDeliveryView {
  if (typeof value !== 'object' || value === null) return false
  const status = (value as { status?: unknown }).status
  return status === 'idle' || status === 'working' || status === 'ready' || status === 'failed'
}

function sameDelivery(a: FirstDeliveryView | null, b: FirstDeliveryView): boolean {
  return a !== null && a.status === b.status && a.ticketId === b.ticketId && a.title === b.title
    && a.personaId === b.personaId && a.personaName === b.personaName
}

/** Full-screen onboarding overlay on `shell.overlay` (first-run). */
export function OnboardingShellOverlay({
  dict,
  structureDict,
  shellDict,
  chatDict,
  store,
  actions,
  useShell,
  useLive,
  dismissOnboarding,
  lockOnboardingForFirstDelivery,
  finishOnboardingWizard,
  refreshLive,
  postChannelMessage: _postChannelMessage,
  selectPanel,
  persona,
  onScanVaultFolder,
  onOrganizePreview,
  onApplyReview,
  structureRemote,
}: OnboardingShellOverlayProps): ReactNode {
  const open = useShell(state => state.onboardingOpen)
  const step = useSyncExternalStore(
    listener => store.subscribe(listener),
    () => store.getSnapshot().step,
    () => store.getSnapshot().step,
  )
  const live = useLive(state => state)
  // Antes da 1ª resposta do host ninguém é "pronto": todos estão sendo verificados (o mock só vale sem host, ex.: preview).
  // The ambient pause reads this full-screen scrim as "the shell is covered"; announce it on mount/unmount so the pause
  // and the resume do not wait for the 1 s sync tick.
  useEffect(() => {
    window.dispatchEvent(new Event('persona:cover-change'))
    return () => { window.dispatchEvent(new Event('persona:cover-change')) }
  }, [])
  const [harnesses, setHarnesses] = useState<readonly HarnessRow[]>(checkingHarnessRows)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, open)

  // --- estado do passo 5 (tudo derivado do host; só o que a PESSOA fez fica aqui) -------------------------------
  const [requested, setRequested] = useState(false)
  // A-6: o pedido da 1ª entrega é editável; `undefined` = a pessoa ainda não mexeu (vale o texto sugerido na tela).
  const [prompt, setPrompt] = useState<string | undefined>(undefined)
  const [startFailed, setStartFailed] = useState(false)
  const [slowElapsed, setSlowElapsed] = useState(false)
  const [slowEpoch, setSlowEpoch] = useState(0)
  const [retryGrace, setRetryGrace] = useState(false)
  const [runErrorBaseline, setRunErrorBaseline] = useState<string | null>(null)
  const [hostDelivery, setHostDelivery] = useState<FirstDeliveryView | null>(null)
  const [celebrated, setCelebrated] = useState(false)
  const lastDeliveryStatus = useRef<string>('idle')

  const shellT = useCallback(
    (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellDict, key, params),
    [shellDict],
  )
  const chatT = useCallback(
    (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatDict ?? dict, key, params),
    [chatDict, dict],
  )

  const tenant = live.tenant
  const workspaceId = tenant?.workspaceId
  const projectId = tenant?.projectId
  const scope = useMemo(
    () => (workspaceId === undefined || projectId === undefined ? null : { workspaceId, projectId }),
    [workspaceId, projectId],
  )
  const wire = persona as unknown as FirstDeliveryRemoteWire
  const suggestFirstRequests = useCallback(async (cofreSeed: string): Promise<readonly string[]> => {
    if (wire.suggestFirstRequests === undefined) return []
    const view = await settle(wire.suggestFirstRequests({ cofreSeed }))
    const list = (view as { suggestions?: unknown } | null)?.suggestions
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []
  }, [wire])

  // Passo 3: lista de IAs (cartões reais do host). Enquanto o host ainda sonda, os cartões dizem "Verificando…" e a lista
  // é relida a cada 1,5 s até acabar (nunca "Não detectada" como resposta final antes da sondagem terminar).
  useEffect(() => {
    if (!open || step !== 3) return undefined
    if (tenant === null || persona.listConnections === undefined) {
      setHarnesses(MOCK_HARNESSES)
      return undefined
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = async (): Promise<void> => {
      let rows: readonly HarnessRow[] | null = null
      try {
        const connections: readonly ConnectionView[] = await unwrapRemote(
          await persona.listConnections({
            workspaceId: tenant.workspaceId,
            projectId: tenant.projectId,
          }) as Parameters<typeof unwrapRemote>[0],
        ) as readonly ConnectionView[]
        rows = harnessRowsFromConnections(connections)
      } catch {
        rows = null
      }
      if (cancelled) return
      if (rows === null) {
        // Falha de leitura não vira "sem IA": segue verificando e tenta de novo.
        setHarnesses(current => (current.every(row => row.checking === true) ? current : checkingHarnessRows()))
        timer = setTimeout(() => { void read() }, HARNESS_RECHECK_MS)
        return
      }
      setHarnesses(rows)
      if (rows.some(row => row.checking === true)) timer = setTimeout(() => { void read() }, HARNESS_RECHECK_MS)
    }
    void read()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [open, step, tenant, persona])

  // Passo 5: "tem IA?" vem do host (getEngineStatus), com polling e releitura forçada ao voltar o foco.
  const { status: engine, settled: engineSettled } = useEngineStatus(wire, scope, { enabled: open && step === 5, pollMs: 3_000, readyPollMs: 6_000 })

  // Marco da primeira entrega no host enquanto há pedido em curso.
  useEffect(() => {
    if (!open || !requested || celebrated || scope === null || wire.getFirstDelivery === undefined) return undefined
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async (): Promise<void> => {
      try {
        const view = await settle(wire.getFirstDelivery?.(scope))
        if (cancelled) return
        if (isDeliveryView(view)) {
          setHostDelivery(prev => (sameDelivery(prev, view) ? prev : view))
          if (view.status !== lastDeliveryStatus.current) {
            lastDeliveryStatus.current = view.status
            if (view.status === 'ready' || view.status === 'failed') void refreshLive?.()
          }
        }
      } catch {
        /* host ocupado: tenta de novo no próximo ciclo */
      }
      if (!cancelled) timer = setTimeout(() => { void tick() }, DELIVERY_POLL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [open, requested, celebrated, scope, wire, refreshLive])

  const delivery = hostDelivery ?? live.firstDelivery ?? null

  // O `failed` antigo some da janela de retry assim que o host volta a "trabalhando"/"pronto".
  useEffect(() => {
    if (retryGrace && delivery !== null && delivery.status !== 'failed') setRetryGrace(false)
  }, [retryGrace, delivery])
  useEffect(() => {
    if (!retryGrace) return undefined
    const timer = setTimeout(() => { setRetryGrace(false) }, RETRY_GRACE_MS)
    return () => { clearTimeout(timer) }
  }, [retryGrace])

  const latestErrorMessage = useMemo(
    () => [...live.messages].reverse().find(message => message.runError !== undefined),
    [live.messages],
  )
  const freshRunError = latestErrorMessage !== undefined && latestErrorMessage.id !== runErrorBaseline
  const kanbanMilestone = deriveFirstDeliveryMilestone(live.kanbanCards)

  const derivedPhase: FirstDeliveryPhase = nextFirstDeliveryPhase({
    phase: celebrated ? 'celebrate' : 'intro',
    requested,
    engine,
    delivery,
    milestoneDone: kanbanMilestone !== undefined,
    freshRunError,
    slowElapsed,
    retryGrace,
    startFailed,
  })
  const deliveryPhase: FirstDeliveryPhase = step === 5 || requested ? derivedPhase : 'intro'

  useEffect(() => {
    if (deliveryPhase === 'celebrate') setCelebrated(true)
  }, [deliveryPhase])

  // 45 s esperando de verdade (só conta enquanto a equipe está trabalhando; "Continuar esperando" reinicia).
  useEffect(() => {
    if (deliveryPhase !== 'working') return undefined
    const timer = setTimeout(() => { setSlowElapsed(true) }, FIRST_DELIVERY_SLOW_MS)
    return () => { clearTimeout(timer) }
  }, [deliveryPhase, slowEpoch])

  const enterApp = (): void => {
    void finishOnboardingWizard().catch(() => undefined).finally(() => { dismissOnboarding() })
  }

  const requestFirstDelivery = (isRetry: boolean, requestText?: string): void => {
    lockOnboardingForFirstDelivery()
    setRequested(true)
    setStartFailed(false)
    setSlowElapsed(false)
    setSlowEpoch(epoch => epoch + 1)
    setRunErrorBaseline(latestErrorMessage?.id ?? null)
    if (isRetry) setRetryGrace(true)
    void (async () => {
      try {
        if (isRetry && scope !== null) {
          // A pessoa pode ter acabado de conectar a IA: confere de verdade antes de reenfileirar.
          await retryEngineStatus(wire, scope)
        }
        // O texto que a pessoa viu/editou é o pedido de verdade; no retry a tarefa já existe e leva o texto original.
        await finishOnboardingWizard(isRetry || requestText === undefined ? undefined : { firstRequest: requestText })
        const ticketId = delivery?.ticketId ?? ''
        if (isRetry && scope !== null && ticketId !== '' && wire.runTicketCommand !== undefined) {
          await settle(wire.runTicketCommand({ ...scope, ticketId, command: 'retry', reason: 'first-delivery-retry' }))
        }
      } catch {
        setRetryGrace(false)
        setStartFailed(true)
      }
    })()
  }

  const celebrateContinue = (): void => {
    dismissOnboarding()
    selectPanel('overview')
  }

  /** "Pedir ajuste": a conversa onde a entrega chegou é o #geral; a pessoa responde ali. */
  const askChange = (): void => {
    dismissOnboarding()
    selectPanel('channels')
  }

  const workingMember = live.stripMembers.find(member => member.state === 'working')
  const personaName = workingMember?.name ?? (delivery !== null && delivery.personaName !== '' ? delivery.personaName : undefined)
  const portraitMember = workingMember ?? live.stripMembers.find(member => delivery !== null && member.name === delivery.personaName)

  if (!open) return null

  const milestone = deliveryPhase === 'celebrate'
    ? pickFirstDelivery(kanbanMilestone, firstDeliveryFromHost(delivery, live.stripMembers))
    : undefined

  return (
    <div className={styles.scrim} role="presentation" data-persona-cover="">
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-onboarding-title"
        aria-label={bindLocale(dict, 'brand.name')}
      >
        <OnboardingWizard
          dict={dict}
          structureDict={structureDict}
          store={store}
          actions={actions}
          harnesses={harnesses}
          firstDelivery={{
            shellT,
            chatT,
            phase: deliveryPhase,
            milestone,
            workingPersonaName: personaName,
            workingCharacterId: portraitMember?.id,
            runError: deliveryPhase === 'failed'
              ? runErrorForFailed(latestErrorMessage?.runError, engine, {
                startFailed,
                providerLabel: bindLocale(dict, 'step5.genericProvider'),
              })
              : undefined,
            prompt,
            onPromptChange: setPrompt,
            suggestFirstRequests,
            onRequest: (text) => { requestFirstDelivery(false, text) },
            requestDisabled: scope !== null && !engineSettled,
            onEnterApp: enterApp,
            onCelebrateContinue: celebrateContinue,
            onAskChange: askChange,
            onConnectEngine: () => { actions.setStep(3) },
            onRetry: () => { requestFirstDelivery(true) },
            onKeepWaiting: () => {
              setSlowElapsed(false)
              setSlowEpoch(epoch => epoch + 1)
            },
          }}
          {...(onScanVaultFolder === undefined ? {} : { onScanVaultFolder })}
          {...(onOrganizePreview === undefined ? {} : { onOrganizePreview })}
          {...(onApplyReview === undefined ? {} : { onApplyReview })}
          {...(structureRemote === undefined ? {} : { structureRemote })}
        />
      </div>
    </div>
  )
}

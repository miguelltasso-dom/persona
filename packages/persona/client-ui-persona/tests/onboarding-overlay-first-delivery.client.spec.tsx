// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingShellOverlay, FIRST_DELIVERY_SLOW_MS } from '../src/client/onboarding/OnboardingShellOverlay.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import type { FirstDeliveryView } from '../src/client/remote/persona-remote-types.ts'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

installPreviewTheme()

const ok = <T,>(value: T) => ({ ok: true as const, value })
const READY = { state: 'ready', reason: null, pending: 0 } as const
const NO_AI = { state: 'unavailable', reason: 'none_connected', pending: 0 } as const
const view = (status: FirstDeliveryView['status']): FirstDeliveryView => ({
  status,
  eventId: 'first-delivery',
  ticketId: status === 'idle' ? '' : 'ticket-1',
  title: 'Resumo da empresa',
  personaId: 'p-nina',
  personaName: 'Nina',
  feedEventId: '',
})

const LIVE: PersonaLiveSnapshot = {
  ready: true,
  tenant: { workspaceId: 'ws', projectId: 'pp', memberId: 'm1', channelId: 'geral' },
  team: null,
  nowRows: [],
  stripMembers: [],
  awayEvents: [],
  attentionTitles: [],
  messages: [],
  passThroughFollowers: [],
  dms: [],
  selectedDmId: null,
  dmMessages: [],
  projects: [],
  kanbanCards: [],
  dmUnreadByPersonaId: {},
  suggestedTask: null,
  turnContext: null,
  error: null,
  gestorPlansById: {},
  gestorPlanAdjustingIds: {},
  channelComposerHints: { responderAutonomy: 'propose', quotaBlocked: false },
  arrivingHostPersonaIds: [],
  channelSubjects: [],
  firstDelivery: null,
}

function setup(initial: { engine?: unknown; delivery?: FirstDeliveryView } = {}) {
  const host = {
    engine: initial.engine ?? READY,
    delivery: initial.delivery ?? view('idle'),
  }
  const persona = {
    getEngineStatus: vi.fn((): Promise<unknown> => Promise.resolve(ok(host.engine))),
    retryEngine: vi.fn(() => Promise.resolve(ok(host.engine))),
    getFirstDelivery: vi.fn(() => Promise.resolve(ok(host.delivery))),
    runTicketCommand: vi.fn(() => Promise.resolve(ok(true))),
    listConnections: vi.fn(() => Promise.resolve(ok([]))),
  }
  const shell = createShellStore()
  shell.actions.setOnboardingOpen(true)
  const liveStore = createSnapshotStore<PersonaLiveSnapshot>(LIVE)
  const onboarding = createOnboardingStore()
  onboarding.store.set({ ...onboarding.store.getSnapshot(), step: 5, displayName: 'Miguel', vaultText: 'Acme' })
  const calls = {
    finish: vi.fn(() => { host.delivery = view('working'); return Promise.resolve() }),
    dismiss: vi.fn(),
    lock: vi.fn(),
    refreshLive: vi.fn(() => Promise.resolve()),
    selectPanel: vi.fn(),
  }
  render(
    <OnboardingShellOverlay
      dict={pt}
      structureDict={pt}
      shellDict={shellPt}
      chatDict={chatPt}
      store={onboarding.store}
      actions={onboarding.actions}
      useShell={bindObservableForTest(shell.store)}
      useLive={bindObservableForTest(liveStore)}
      dismissOnboarding={calls.dismiss}
      lockOnboardingForFirstDelivery={calls.lock}
      finishOnboardingWizard={calls.finish}
      refreshLive={calls.refreshLive}
      selectPanel={calls.selectPanel}
      persona={persona as never}
    />,
  )
  return { host, persona, liveStore, onboarding, calls }
}

/** Deixa os polls e as promises do host correrem (relógio falso + microtarefas). */
async function pass(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

describe('onboarding passo 5 ligado ao estado real do host (FR-2)', () => {
  it('sem IA no host: o passo 5 diz o que fazer; quando a IA conecta, volta ao pedido sozinho', async () => {
    const { host, onboarding } = setup({ engine: NO_AI })
    await pass()
    expect(screen.getByText(pt['step5.needsEngineTitle'])).toBeTruthy()
    expect(screen.getByText(pt['step5.needsEngineBody'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: pt['step5.requestNow'] })).toBeNull()

    host.engine = READY
    await pass(3_100)
    expect(screen.getByRole('button', { name: pt['step5.requestNow'] })).toBeTruthy()
    expect(screen.queryByText(pt['step5.needsEngineTitle'])).toBeNull()
    expect(onboarding.store.getSnapshot().step).toBe(5)
  })

  it('"Conectar uma IA" volta ao passo 3', async () => {
    const { onboarding } = setup({ engine: NO_AI })
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.connectEngine'] }))
    expect(onboarding.store.getSnapshot().step).toBe(3)
  })

  it('host que ainda está sondando (checking) NÃO bloqueia o pedido', async () => {
    setup({ engine: { state: 'checking', reason: null, pending: 0 } })
    await pass()
    expect(screen.getByRole('button', { name: pt['step5.requestNow'] })).toBeTruthy()
  })

  it('"Pedir agora" espera a 1ª leitura da IA (não dá para pedir no instante antes de saber se há IA)', async () => {
    let release: (value: unknown) => void = () => undefined
    const { persona } = setup()
    cleanup()
    persona.getEngineStatus.mockImplementationOnce(() => new Promise<unknown>((resolve) => { release = resolve }))
    const shell = createShellStore()
    shell.actions.setOnboardingOpen(true)
    const liveStore = createSnapshotStore<PersonaLiveSnapshot>(LIVE)
    const onboarding = createOnboardingStore()
    onboarding.store.set({ ...onboarding.store.getSnapshot(), step: 5, displayName: 'Miguel' })
    render(
      <OnboardingShellOverlay
        dict={pt}
        structureDict={pt}
        shellDict={shellPt}
        chatDict={chatPt}
        store={onboarding.store}
        actions={onboarding.actions}
        useShell={bindObservableForTest(shell.store)}
        useLive={bindObservableForTest(liveStore)}
        dismissOnboarding={() => undefined}
        lockOnboardingForFirstDelivery={() => undefined}
        finishOnboardingWizard={() => Promise.resolve()}
        selectPanel={() => undefined}
        persona={persona as never}
      />,
    )
    await pass()
    expect((screen.getByRole('button', { name: pt['step5.requestNow'] }) as HTMLButtonElement).disabled).toBe(true)
    release(ok(READY))
    await pass()
    expect((screen.getByRole('button', { name: pt['step5.requestNow'] }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('Pedir agora → trabalhando → marco ready no host → celebra e "Aceitar e entrar" vai à Visão geral', async () => {
    const { host, calls } = setup()
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    expect(calls.lock).toHaveBeenCalledTimes(1)
    expect(calls.finish).toHaveBeenCalledTimes(1)
    expect(screen.getByText(pt['step5.workingTitle'])).toBeTruthy()
    expect(screen.getByText(/Nina está no pedido/u)).toBeTruthy()

    host.delivery = view('ready')
    await pass(2_100)
    expect(calls.refreshLive).toHaveBeenCalledTimes(1)
    expect(screen.getByText(shellPt['overview.firstDelivery.title'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.acceptAndEnter'] }))
    expect(calls.dismiss).toHaveBeenCalledTimes(1)
    expect(calls.selectPanel).toHaveBeenCalledWith('overview')
  })

  it('celebrate: "Pedir ajuste" leva ao #geral, onde a entrega chegou', async () => {
    const { host, calls } = setup()
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    host.delivery = view('ready')
    await pass(2_100)
    fireEvent.click(screen.getByRole('button', { name: pt['step5.askChange'] }))
    expect(calls.dismiss).toHaveBeenCalledTimes(1)
    expect(calls.selectPanel).toHaveBeenCalledWith('channels')
  })

  it('aos 45 s esperando vira "slow" (entrar e acompanhar vira primário); "Continuar esperando" reinicia a contagem', async () => {
    const { calls } = setup()
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    expect(screen.queryByText(pt['step5.slowBody'])).toBeNull()

    await pass(FIRST_DELIVERY_SLOW_MS + 100)
    expect(screen.getByText(pt['step5.slowBody'])).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: pt['step5.keepWaiting'] }))
    await pass()
    expect(screen.queryByText(pt['step5.slowBody'])).toBeNull()
    await pass(FIRST_DELIVERY_SLOW_MS + 100)
    expect(screen.getByText(pt['step5.slowBody'])).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: pt['step5.enterAndFollow'] }))
    await pass()
    expect(calls.dismiss).toHaveBeenCalledTimes(1)
  })

  it('host sela failed sem erro no fio: card honesto (motor indisponível) com ação que leva a conectar a IA', async () => {
    const { host, onboarding, calls } = setup()
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    host.delivery = view('failed')
    await pass(2_100)
    expect(calls.refreshLive).toHaveBeenCalledTimes(1)
    // Não inventa "O Claude não está conectado": sem tipo de erro, fala do motor.
    expect(screen.queryByText(/O Claude não está conectado/u)).toBeNull()
    expect(screen.getByText(/O motor de Nina não está disponível/u)).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['step5.enterAppPlain'] })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Escolher outro motor' }))
    expect(onboarding.store.getSnapshot().step).toBe(3)
  })

  it('erro tipado do #geral (não logado) → failed; "Tentar de novo" reenfileira a tarefa e volta a trabalhar mesmo com o failed antigo no host', async () => {
    const { host, persona, liveStore, calls } = setup()
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    act(() => {
      liveStore.set({
        ...liveStore.getSnapshot(),
        messages: [{
          id: 'err-1',
          authorId: 'p-nina',
          authorName: 'Nina',
          body: '',
          timeLabel: '10:00',
          reactions: [],
          runError: { code: 'not_logged_in', provider: 'Claude', command: 'claude login' },
        } as never],
      })
    })
    host.delivery = view('failed')
    await pass(2_100)
    expect(screen.getByText(/O Claude não está conectado neste computador/u)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await pass()
    expect(persona.retryEngine).toHaveBeenCalled()
    expect(persona.runTicketCommand).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws', projectId: 'pp', ticketId: 'ticket-1', command: 'retry',
    }))
    expect(calls.finish).toHaveBeenCalledTimes(2)
    // O host ainda diz failed (selo antigo) e o erro antigo do fio não conta: volta a trabalhar.
    expect(screen.getByText(pt['step5.workingTitle'])).toBeTruthy()
    expect(screen.queryByText(/O Claude não está conectado/u)).toBeNull()
  })

  it('pedido retido por falta de IA (FR-3): needsEngine em vez de "trabalhando" para sempre; IA volta → trabalhando', async () => {
    const { host } = setup()
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    host.engine = { state: 'unavailable', reason: 'login_required', pending: 1 }
    await pass(6_100)
    expect(screen.getByText(pt['step5.needsEngineTitle'])).toBeTruthy()

    host.engine = READY
    await pass(3_100)
    expect(screen.queryByText(pt['step5.needsEngineTitle'])).toBeNull()
    expect(screen.getByText(pt['step5.workingTitle'])).toBeTruthy()
  })

  it('o pedido que nem chegou ao host (completeOnboarding falha) não deixa a pessoa no vazio', async () => {
    const { calls } = setup()
    calls.finish.mockImplementationOnce(() => Promise.reject(new Error('host down')))
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    expect(screen.getByText('A equipe está fora do ar.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar reconectar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['step5.enterAppPlain'] })).toBeTruthy()
  })

  it('sem os métodos do FR-3 no host (fake antigo): segue o fluxo sem bloquear', async () => {
    const { persona } = setup()
    expect(persona.getEngineStatus).toHaveBeenCalled()
    cleanup()
    // host antigo: nada de getEngineStatus/getFirstDelivery
    const shell = createShellStore()
    shell.actions.setOnboardingOpen(true)
    const liveStore = createSnapshotStore<PersonaLiveSnapshot>(LIVE)
    const onboarding = createOnboardingStore()
    onboarding.store.set({ ...onboarding.store.getSnapshot(), step: 5, displayName: 'Miguel' })
    render(
      <OnboardingShellOverlay
        dict={pt}
        structureDict={pt}
        shellDict={shellPt}
        store={onboarding.store}
        actions={onboarding.actions}
        useShell={bindObservableForTest(shell.store)}
        useLive={bindObservableForTest(liveStore)}
        dismissOnboarding={() => undefined}
        lockOnboardingForFirstDelivery={() => undefined}
        finishOnboardingWizard={() => Promise.resolve()}
        selectPanel={() => undefined}
        persona={{} as never}
      />,
    )
    await pass()
    expect(screen.getByRole('button', { name: pt['step5.requestNow'] })).toBeTruthy()
  })
})

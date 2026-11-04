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
import { ILLUSTRATIONS } from '../src/client/assets/generated-imports.ts'
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

describe('foco do onboarding (Probe S7: WCAG 2.1.2 / 2.4.3)', () => {
  const dialog = (): HTMLElement => screen.getByRole('dialog')
  const tab = (shiftKey = false): void => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey }) }

  it('o diálogo tem nome acessível (o aria-labelledby apontava para um id que não existia)', async () => {
    setup()
    await pass()
    expect(dialog().getAttribute('aria-label')).toBe(pt['brand.name'])
    const labelled = dialog().getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(labelled)?.textContent).toBe(pt['step5.title'])
  })

  it('ao trocar de fase o foco vai para o título novo, nunca para o body', async () => {
    const { host } = setup()
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    const title = screen.getByRole('heading', { name: pt['step5.workingTitle'] })
    expect(document.activeElement).toBe(title)
    expect(dialog().contains(document.activeElement)).toBe(true)

    host.delivery = view('ready')
    await pass(2_100)
    expect(document.activeElement).not.toBe(document.body)
    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it('sem IA (needsEngine): o foco cai no título, e o Tab não vaza para fora do diálogo', async () => {
    setup({ engine: NO_AI })
    await pass()
    expect(dialog().contains(document.activeElement)).toBe(true)
    // foco no último botão do diálogo + Tab → volta ao primeiro; Shift+Tab no primeiro → último
    const buttons = Array.from(dialog().querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'))
    const first = buttons[0]!
    const last = buttons[buttons.length - 1]!
    last.focus()
    tab()
    expect(document.activeElement).toBe(first)
    first.focus()
    tab(true)
    expect(document.activeElement).toBe(last)
  })

  it('com o foco perdido no body, Tab volta para dentro do diálogo (não percorre o app por trás)', async () => {
    setup()
    await pass()
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).toBe(document.body)
    tab()
    expect(dialog().contains(document.activeElement)).toBe(true)
    ;(document.activeElement as HTMLElement | null)?.blur()
    tab(true)
    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it('foco que cai fora do diálogo (ex.: o composer do #geral por trás) volta para dentro', async () => {
    setup()
    await pass()
    const behind = document.createElement('button')
    behind.textContent = 'composer do #geral'
    document.body.appendChild(behind)
    try {
      behind.focus()
      expect(dialog().contains(document.activeElement)).toBe(true)
    } finally {
      behind.remove()
    }
  })

  it('Tab a partir do título (tabindex -1) segue para a 1ª ação, e Shift+Tab do título dá a volta dentro do painel', async () => {
    setup()
    await pass()
    const title = screen.getByRole('heading', { name: pt['step5.title'] })
    title.focus()
    tab(true)
    // antes do título só há o stepper/voltar: se nada vem antes dele no painel, vai para a última parada do painel
    expect(dialog().contains(document.activeElement)).toBe(true)
  })
})

describe('arte "Falta uma IA" no passo 5 (Muse, FIRST-DELIVERY-SPEC)', () => {
  it('needsEngine usa EmptyState compacto com a arte empty-sem-ia a 240 px e o título como h1', async () => {
    setup({ engine: NO_AI })
    await pass()
    const heading = screen.getByRole('heading', { level: 1, name: pt['step5.needsEngineTitle'] })
    expect(heading.id).toBe('persona-onboarding-title')
    const art = heading.closest('section')!.querySelector('img') as HTMLImageElement
    expect(art.getAttribute('src')).toBe(ILLUSTRATIONS['empty-sem-ia'])
    expect(art.style.maxHeight).toBe('240px')
    expect(art.getAttribute('alt')).toBe('')
  })

  it('falha do tipo "não há IA" (não logado) mostra a mesma arte; falha de cota não', async () => {
    const { host, liveStore } = setup()
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    act(() => {
      liveStore.set({
        ...liveStore.getSnapshot(),
        messages: [{ id: 'e1', authorId: 'p-nina', authorName: 'Nina', body: '', timeLabel: '10:00', reactions: [], runError: { code: 'not_logged_in', provider: 'Claude' } } as never],
      })
    })
    host.delivery = view('failed')
    await pass(2_100)
    expect(screen.getByRole('dialog').querySelector('[data-persona-step-focus] img')?.getAttribute('src')).toBe(ILLUSTRATIONS['empty-sem-ia'])
  })

  it('falha de cota não leva a arte "Falta uma IA" (a pessoa tem IA, só acabou o limite)', async () => {
    const { host, liveStore } = setup()
    await pass()
    fireEvent.click(screen.getByRole('button', { name: pt['step5.requestNow'] }))
    await pass()
    act(() => {
      liveStore.set({
        ...liveStore.getSnapshot(),
        messages: [{ id: 'e2', authorId: 'p-nina', authorName: 'Nina', body: '', timeLabel: '10:00', reactions: [], runError: { code: 'quota_exhausted', provider: 'Claude' } } as never],
      })
    })
    host.delivery = view('failed')
    await pass(2_100)
    expect(screen.getByRole('dialog').querySelector('[data-persona-step-focus]')).not.toBeNull()
    expect(screen.getByRole('dialog').querySelector('[data-persona-step-focus] img')).toBeNull()
  })
})

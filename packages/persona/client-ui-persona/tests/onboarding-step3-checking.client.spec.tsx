// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import { checkingHarnessRows, harnessRowsFromConnections } from '../src/client/onboarding/harness-from-connections.ts'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingShellOverlay } from '../src/client/onboarding/OnboardingShellOverlay.tsx'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

installPreviewTheme()

const card = (kind: ConnectionView['kind'], patch: Partial<ConnectionView> = {}): ConnectionView => ({
  id: kind, kind, available: true, loggedIn: true, loginHint: '', phase: 'ready', ...patch,
})

describe('harnessRowsFromConnections: "Verificando…" nunca vira "Não detectada" antes da sondagem terminar', () => {
  it('sem cartões ainda, todos estão sendo verificados', () => {
    expect(harnessRowsFromConnections([]).every(row => row.checking === true && !row.ready)).toBe(true)
    expect(checkingHarnessRows().map(row => row.id)).toEqual(['claude', 'codex', 'cursor', 'opencode'])
  })

  it('cartão em phase=checking é "verificando"; pronto é pronto; sondagem acabada sem login é "não detectada" de verdade', () => {
    const rows = harnessRowsFromConnections([
      card('claude'),
      card('codex', { phase: 'checking', available: false, loggedIn: false }),
      card('cursor', { available: false, loggedIn: false }),
      card('opencode', { loggedIn: false }),
    ])
    expect(rows.find(row => row.id === 'claude')).toMatchObject({ ready: true })
    expect(rows.find(row => row.id === 'claude')?.checking).toBeUndefined()
    expect(rows.find(row => row.id === 'codex')).toMatchObject({ ready: false, checking: true })
    expect(rows.find(row => row.id === 'cursor')).toMatchObject({ ready: false })
    expect(rows.find(row => row.id === 'cursor')?.checking).toBeUndefined()
    expect(rows.find(row => row.id === 'opencode')?.checking).toBeUndefined()
  })
})

describe('passo 3 (Wizard)', () => {
  afterEach(() => { cleanup() })

  function step3(harnesses: Parameters<typeof OnboardingWizard>[0]['harnesses']) {
    const { store, actions } = createOnboardingStore()
    store.set({ ...store.getSnapshot(), step: 3 })
    return render(<OnboardingWizard dict={pt} structureDict={pt} store={store} actions={actions} harnesses={harnesses} />)
  }

  it('enquanto verifica: chip "Verificando…" e aviso informativo, sem "Não detectada" nem "Conecte pelo menos uma IA"', () => {
    step3(checkingHarnessRows())
    expect(screen.getAllByText(pt['step3.checking'])).toHaveLength(4)
    expect(screen.getByText(pt['step3.checkingNotice'])).toBeTruthy()
    expect(screen.queryByText(pt['step3.missing'])).toBeNull()
    expect(screen.queryByText(pt['step3.connectRequired'])).toBeNull()
  })

  it('terminada a sondagem sem nenhuma IA: aí sim "Não detectada" e o pedido para conectar', () => {
    step3([{ id: 'claude', label: 'Claude Code', ready: false }, { id: 'codex', label: 'Codex', ready: false }])
    expect(screen.getAllByText(pt['step3.missing'])).toHaveLength(2)
    expect(screen.getByText(pt['step3.connectRequired'])).toBeTruthy()
    expect(screen.queryByText(pt['step3.checking'])).toBeNull()
  })

  it('mistura: quem terminou mostra o resultado e quem não, "Verificando…"', () => {
    step3([
      { id: 'claude', label: 'Claude Code', ready: true },
      { id: 'codex', label: 'Codex', ready: false, checking: true },
    ])
    expect(screen.getByText(pt['step3.ready'])).toBeTruthy()
    expect(screen.getByText(pt['step3.checking'])).toBeTruthy()
    expect(screen.queryByText(pt['step3.missing'])).toBeNull()
  })
})

describe('passo 3 (overlay com host): lê, mostra "Verificando…" e relê até a sondagem acabar', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const LIVE: PersonaLiveSnapshot = {
    ready: true,
    tenant: { workspaceId: 'ws', projectId: 'pp', memberId: 'm1', channelId: 'geral' },
    team: null, nowRows: [], stripMembers: [], awayEvents: [], attentionTitles: [], messages: [],
    passThroughFollowers: [], dms: [], selectedDmId: null, dmMessages: [], projects: [], kanbanCards: [],
    dmUnreadByPersonaId: {}, suggestedTask: null, turnContext: null, error: null, gestorPlansById: {},
    gestorPlanAdjustingIds: {}, channelComposerHints: { responderAutonomy: 'propose', quotaBlocked: false },
    arrivingHostPersonaIds: [], channelSubjects: [], firstDelivery: null,
  }

  async function pass(ms = 0): Promise<void> {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  }

  it('antes da 1ª resposta nenhuma IA aparece como pronta; durante a sondagem diz "Verificando…"; no fim, o resultado real', async () => {
    let release: (value: unknown) => void = () => undefined
    const listConnections = vi.fn((): Promise<unknown> => new Promise((resolve) => { release = resolve }))
    const shell = createShellStore()
    shell.actions.setOnboardingOpen(true)
    const onboarding = createOnboardingStore()
    onboarding.store.set({ ...onboarding.store.getSnapshot(), step: 3 })
    render(
      <OnboardingShellOverlay
        dict={pt}
        structureDict={pt}
        shellDict={shellPt}
        chatDict={chatPt}
        store={onboarding.store}
        actions={onboarding.actions}
        useShell={bindObservableForTest(shell.store)}
        useLive={bindObservableForTest(createSnapshotStore<PersonaLiveSnapshot>(LIVE))}
        dismissOnboarding={() => undefined}
        lockOnboardingForFirstDelivery={() => undefined}
        finishOnboardingWizard={() => Promise.resolve()}
        selectPanel={() => undefined}
        persona={{ listConnections } as never}
      />,
    )
    await pass()
    // host ainda não respondeu: nada de "Pronta" falsa (o mock marcava Claude e Codex como prontos)
    expect(screen.queryByText(pt['step3.ready'])).toBeNull()
    expect(screen.getAllByText(pt['step3.checking'])).toHaveLength(4)

    // host responde, mas o Codex ainda está sondando
    const probing = {
      ok: true as const,
      value: [card('claude'), card('codex', { phase: 'checking', available: false, loggedIn: false }), card('cursor', { available: false, loggedIn: false }), card('opencode', { available: false, loggedIn: false })],
    }
    release(probing)
    await pass()
    expect(screen.getByText(pt['step3.ready'])).toBeTruthy()
    expect(screen.getAllByText(pt['step3.checking'])).toHaveLength(1)

    // a sondagem termina: o Codex é "Não detectada" DE VERDADE e a releitura para
    listConnections.mockImplementation(() => Promise.resolve({
      ok: true as const,
      value: [card('claude'), card('codex', { available: false, loggedIn: false }), card('cursor', { available: false, loggedIn: false }), card('opencode', { available: false, loggedIn: false })],
    }))
    await pass(1_600)
    expect(screen.queryByText(pt['step3.checking'])).toBeNull()
    expect(screen.getAllByText(pt['step3.missing'])).toHaveLength(3)
    const calls = listConnections.mock.calls.length
    await pass(5_000)
    expect(listConnections.mock.calls.length).toBe(calls)
  })

  it('falha ao ler o host não vira "Não detectada": segue verificando e tenta de novo', async () => {
    const listConnections = vi.fn(() => Promise.reject(new Error('host ocupado')))
    const shell = createShellStore()
    shell.actions.setOnboardingOpen(true)
    const onboarding = createOnboardingStore()
    onboarding.store.set({ ...onboarding.store.getSnapshot(), step: 3 })
    render(
      <OnboardingShellOverlay
        dict={pt}
        structureDict={pt}
        shellDict={shellPt}
        chatDict={chatPt}
        store={onboarding.store}
        actions={onboarding.actions}
        useShell={bindObservableForTest(shell.store)}
        useLive={bindObservableForTest(createSnapshotStore<PersonaLiveSnapshot>(LIVE))}
        dismissOnboarding={() => undefined}
        lockOnboardingForFirstDelivery={() => undefined}
        finishOnboardingWizard={() => Promise.resolve()}
        selectPanel={() => undefined}
        persona={{ listConnections } as never}
      />,
    )
    await pass(3_200)
    expect(listConnections.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(pt['step3.missing'])).toBeNull()
    expect(screen.getAllByText(pt['step3.checking'])).toHaveLength(4)
  })
})

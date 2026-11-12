// @vitest-environment jsdom
// "Precisa de você / Liberar para {B}" (contracts/team-real.md §9, Anvil): ONE approval kind for a persona that needs a connector it
// cannot use yet ("a Bia pediu ao Téo e ele não pode usar o Gmail", "a Nina quer usar o Drive"). The card writes the words from the
// fields, offers exactly the choices the host accepts, calls decideApproval({ kind: 'connector', choice }), and "Sempre permitir" has
// a real Desfazer (the grant the host returns is what gets revoked).
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import { approvalTitle, reactiveApprovalContext } from '../src/client/approvals/approvals-ui-helpers.ts'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import { readConnectorAsk } from '../src/client/approvals/connector-ask.ts'
import { connectorDevSampleEnabled } from '../src/client/approvals/connector-dev-sample.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { approvalViewToItem } from '../src/client/data/adapters/approvals.ts'
import { DecisionFeedback } from '../src/client/decisions/DecisionFeedback.tsx'
import type { Decision } from '../src/client/decisions/decision-types.ts'
import { ConnectedApprovalsPanel } from '../src/client/remote/ConnectedApprovalsPanel.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createPersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'

installPreviewTheme()
// The two-pane inbox is the default (Muse, 05/11); this spec drives the OLD screen, so it asks for it explicitly.
beforeEach(() => { localStorage.clear(); localStorage.setItem('persona.approvalsInbox.v2', '0') })
afterEach(() => { cleanup(); localStorage.clear() })

const COLLEAGUE = {
  reason: 'colleague',
  connectorName: 'Gmail',
  cli: 'claude',
  connectorId: 'gmail',
  access: 'read',
  requestedByPersonaId: 'p-bia',
  requestedByPersonaName: 'Bia',
  taskId: 't-arte',
  taskTitle: 'Arte da home',
  options: ['once', 'always', 'not-now'],
}

const card = (extra: Record<string, unknown> = {}): ApprovalView => ({
  id: 'conn-1', kind: 'connector', title: 'Liberar o Gmail para Téo', question: 'Bia pediu a Téo Arte da home, mas Téo não pode usar o Gmail.',
  status: 'pending', personaId: 'p-teo', personaName: 'Téo', connector: COLLEAGUE, ...extra,
} as unknown as ApprovalView)

describe('reading the ask', () => {
  it('a valid ask keeps who asked, the task and exactly the options the host accepts (plus the way out)', () => {
    const ask = readConnectorAsk(COLLEAGUE)
    expect(ask).toMatchObject({ reason: 'colleague', connectorName: 'Gmail', access: 'read', requestedByName: 'Bia', taskTitle: 'Arte da home' })
    expect(ask?.options).toEqual(['once', 'always', 'not-now'])
    // the host did not offer "always": the UI never invents it; "Agora não" always exists
    expect(readConnectorAsk({ ...COLLEAGUE, options: ['once'] })?.options).toEqual(['once', 'not-now'])
    expect(readConnectorAsk({ ...COLLEAGUE, options: [] })?.options).toEqual(['not-now'])
  })

  it('a card that does not say which connector, or with a strange reason, is not a connector ask', () => {
    expect(readConnectorAsk({ ...COLLEAGUE, connectorName: '' })).toBeUndefined()
    expect(readConnectorAsk({ ...COLLEAGUE, reason: 'boss' })).toBeUndefined()
    expect(readConnectorAsk(null)).toBeUndefined()
    expect(readConnectorAsk('gmail')).toBeUndefined()
  })

  it('the adapter turns it into a connector item; a malformed connector card degrades to a plain attention card (still a decision)', () => {
    const item = approvalViewToItem(card())
    expect(item.kind).toBe('connector')
    expect(item.primaryKey).toBe('action.primary.connector')
    expect(item.connector?.connectorName).toBe('Gmail')
    expect(item.proposerName).toBe('Téo')
    const broken = approvalViewToItem(card({ connector: { reason: 'colleague' } }))
    expect(broken.kind).toBe('attention')
    expect(broken.connector).toBeUndefined()
  })
})

describe('the words are written from the fields', () => {
  it('colleague and initiative', () => {
    const colleague = approvalViewToItem(card())
    expect(approvalTitle(approvalsPt, colleague)).toBe('Liberar o Gmail para Téo')
    expect(reactiveApprovalContext(approvalsPt, colleague)).toBe('Bia pediu a Téo “Arte da home”, mas Téo não pode usar o Gmail.')
    const initiative = approvalViewToItem(card({ personaId: 'p-nina', personaName: 'Nina', connector: { ...COLLEAGUE, reason: 'initiative', connectorName: 'Drive', requestedByPersonaName: undefined, taskTitle: undefined, purpose: 'organizar as notas da semana' } }))
    expect(reactiveApprovalContext(approvalsPt, initiative)).toBe('Nina quer usar o Drive: organizar as notas da semana')
  })
})

function mount(items: ReturnType<typeof approvalViewToItem>[], onDecideConnector?: (...args: unknown[]) => void) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <ApprovalsInbox dict={approvalsPt} items={items} {...(onDecideConnector === undefined ? {} : { onDecideConnector: onDecideConnector as never })} onDecideItem={vi.fn()} />
    </PreviewFrame>,
  )
}

describe('the card in Aprovações', () => {
  it('says what is missing and who asked, with the three choices; each calls the host with its own choice', () => {
    const onDecideConnector = vi.fn()
    // the live store drives the card (decisionState present): every choice goes straight to the host
    mount([{ ...approvalViewToItem(card()), decisionState: 'pending' }], onDecideConnector)
    expect(screen.getByRole('heading', { name: 'Liberar o Gmail para Téo' })).toBeTruthy()
    expect(screen.getByText('Bia pediu a Téo “Arte da home”, mas Téo não pode usar o Gmail.')).toBeTruthy()
    expect(screen.getByText('Permissão')).toBeTruthy()
    const group = screen.getByRole('group', { name: 'Como liberar o Gmail para Téo' })
    fireEvent.click(within(group).getByRole('button', { name: 'Liberar só desta vez' }))
    fireEvent.click(within(group).getByRole('button', { name: 'Sempre permitir para Téo' }))
    fireEvent.click(within(group).getByRole('button', { name: 'Agora não' }))
    expect(onDecideConnector.mock.calls.map(call => call[1])).toEqual(['once', 'always', 'not-now'])
    // the consequence of the lasting one is written under the buttons
    expect(screen.getByText('Téo passa a poder ler no Gmail sem perguntar. Escrever e apagar continuam perguntando.')).toBeTruthy()
    // no generic Aceitar / Dispensar next to them
    expect(screen.queryByRole('button', { name: approvalsPt['action.dismiss'] as string })).toBeNull()
  })

  it('offers only what the host accepts', () => {
    mount([approvalViewToItem(card({ connector: { ...COLLEAGUE, options: ['once', 'not-now'] } }))], vi.fn())
    expect(screen.queryByRole('button', { name: /Sempre permitir/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Liberar só desta vez' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeTruthy()
  })

  it('with nothing wired the choices are off (no dead buttons that look alive)', () => {
    mount([approvalViewToItem(card())])
    for (const name of ['Liberar só desta vez', 'Sempre permitir para Téo', 'Agora não']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
  })
})

type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })

describe('the decision in the live store', () => {
  function host(grant: boolean) {
    const decideApproval = vi.fn((request: { id: string; choice?: string }) => ok({
      ...card(), status: request.choice === 'not-now' ? 'rejected' : 'approved',
      ...(grant && request.choice === 'always' ? { connectorDecision: { choice: 'always', grant: { personaId: 'p-teo', cli: 'claude', connectorId: 'gmail' } } } : { connectorDecision: { choice: request.choice } }),
    }))
    const revokeConnector = vi.fn(() => ok(true))
    const undoApproval = vi.fn(() => ok(true))
    const remote: Record<string, unknown> = {
      listProjects: () => ok([{ id: 'proj-pessoal' }]),
      listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
      getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
      ping: () => ok({ protocol: 1 }),
      getOverviewNow: () => ok({ personas: [] }),
      getWhileAway: () => ok({ events: [] }),
      getOverview: () => ok({ needsYou: [], inProgress: [] }),
      listTeam: () => ok({ personas: [{ id: 'p-teo', name: 'Téo', title: 'Arte', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'teo', systemRoles: [], canRecruit: false }], members: [] }),
      listTasks: () => ok([]),
      listMessages: () => ok({ events: [] }),
      listDms: () => ok([]),
      markVisit: () => ok(true),
      followMessages: () => ({ async* [Symbol.asyncIterator]() { /* idle */ } }),
      listApprovals: () => ok([card()]),
      listDailySummaries: () => ok([]),
      decideApproval,
      revokeConnector,
      undoApproval,
    }
    return { remote, decideApproval, revokeConnector, undoApproval }
  }
  async function booted(grant = true) {
    const built = host(grant)
    const live = createPersonaLiveStore(built.remote as never)
    await live.bootstrap(() => {})
    return { live, ...built }
  }

  it('"Sempre permitir": the host gets kind connector + choice always; the toast\'s Desfazer revokes exactly the grant it returned', async () => {
    const { live, decideApproval, revokeConnector, undoApproval } = await booted()
    expect((live.observable.getSnapshot().decisions ?? []).map(d => d.id)).toContain('conn-1')
    const outcome = await live.decide!('conn-1', false, 'always')
    expect(outcome).toBe('accepted')
    expect(decideApproval).toHaveBeenCalledWith(expect.objectContaining({ id: 'conn-1', kind: 'connector', choice: 'always', accept: true }))
    expect(live.observable.getSnapshot().decisions?.find(d => d.id === 'conn-1')?.reversible).toBe(true)
    await live.undoDecision!('conn-1')
    expect(revokeConnector).toHaveBeenCalledWith(expect.objectContaining({ personaId: 'p-teo', cli: 'claude', connectorId: 'gmail' }))
    expect(undoApproval).not.toHaveBeenCalled()
    live.dispose()
  })

  it('"Só desta vez" has nothing to take back; "Agora não" is a decline that keeps nothing', async () => {
    const once = await booted()
    expect(await once.live.decide!('conn-1', true, 'once')).toBe('accepted')
    expect(once.decideApproval).toHaveBeenCalledWith(expect.objectContaining({ kind: 'connector', choice: 'once', accept: true }))
    expect(once.live.observable.getSnapshot().decisions?.find(d => d.id === 'conn-1')?.reversible).not.toBe(true)
    await once.live.undoDecision!('conn-1')
    expect(once.revokeConnector).not.toHaveBeenCalled()
    once.live.dispose()

    const later = await booted()
    expect(await later.live.decide!('conn-1', true, 'not-now')).toBe('declined')
    expect(later.decideApproval).toHaveBeenCalledWith(expect.objectContaining({ kind: 'connector', choice: 'not-now', accept: false }))
    later.live.dispose()
  })
})

describe('the toast of "Sempre permitir" says READ (it must not promise more than the grant gives)', () => {
  const t = (key: string, params?: Readonly<Record<string, string | number>>): string => bindLocale(approvalsPt, key, params)
  const decision = (state: Decision['state'], extra: Partial<Decision> = {}): Decision => ({
    id: 'conn-1', kind: 'blocker', title: 'Liberar o Gmail para Téo', requester: { personaId: 'p-teo', name: 'Téo' }, blocking: true, risk: 'normal', createdAt: '', state, ...extra,
  })

  it('"Agora Téo pode ler o Gmail sem perguntar · Desfazer"', () => {
    const onUndo = vi.fn()
    const { rerender } = render(<DecisionFeedback decisions={[decision('pending')]} t={t as never} onUndo={onUndo} />)
    rerender(<DecisionFeedback decisions={[decision('accepted', { reversible: true, connectorGrant: { personaName: 'Téo', connectorName: 'Gmail' } })]} t={t as never} onUndo={onUndo} />)
    expect(screen.getByText('Agora Téo pode ler o Gmail sem perguntar')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: approvalsPt['decision.undo'] as string }))
    expect(onUndo).toHaveBeenCalledWith('conn-1')
  })

  it('a decision without a connector grant keeps the usual "Aprovado: {title}"', () => {
    const { rerender } = render(<DecisionFeedback decisions={[decision('pending')]} t={t as never} onUndo={vi.fn()} />)
    rerender(<DecisionFeedback decisions={[decision('accepted', { reversible: true })]} t={t as never} onUndo={vi.fn()} />)
    // the live region and the toast both say it; what matters is that no "pode ler" line appears
    expect(screen.getAllByText('Aprovado: Liberar o Gmail para Téo').length).toBeGreaterThan(0)
    expect(screen.queryByText(/pode ler o/)).toBeNull()
  })
})

describe('the capture-only example cards (two dev keys; never in the real app, never reaching the host)', () => {
  function mountPanel() {
    const live = createSnapshotStore<unknown>({ ready: true, error: null, decisions: [] })
    const useLive = bindObservableForTest({ getSnapshot: () => live.getSnapshot() as never, subscribe: listener => live.subscribe(listener) })
    const tenant = createSnapshotStore<PersonaTenantSnapshot>({ status: 'ready', scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' } })
    const useTenant = bindObservableForTest({ getSnapshot: () => tenant.getSnapshot(), subscribe: listener => tenant.subscribe(listener) })
    const { store: shellStore } = createShellStore()
    const useShell = bindObservableForTest(shellStore)
    const decideDecision = vi.fn(async () => undefined)
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedApprovalsPanel persona={{} as never} useTenant={useTenant} useShell={useShell} useLive={useLive as never} decideDecision={decideDecision} refreshLive={() => {}} clearApprovalFocus={() => {}} />
      </PreviewFrame>,
    )
    return { decideDecision }
  }

  it('one key, or none, shows nothing', () => {
    expect(connectorDevSampleEnabled()).toBe(false)
    localStorage.setItem('persona.devSeed.connector', '1')
    expect(connectorDevSampleEnabled()).toBe(false)
    localStorage.clear()
    localStorage.setItem('persona.devSeed.v1', '1')
    expect(connectorDevSampleEnabled()).toBe(false)
  })

  it('with both keys: two cards tagged "Exemplo"; their buttons never reach the host', async () => {
    localStorage.setItem('persona.devSeed.v1', '1')
    localStorage.setItem('persona.devSeed.connector', '1')
    const { decideDecision } = mountPanel()
    await waitFor(() => { expect(screen.getByRole('heading', { name: 'Liberar o Gmail para Bento' })).toBeTruthy() })
    expect(screen.getByRole('heading', { name: 'Liberar o Drive para Luna' })).toBeTruthy()
    // four external-action cards (HT-9 + COLHEITA 5: e-mail, payment, delete and an expired one) + the two connector cards, every one tagged as an example
    expect(screen.getAllByText('Exemplo')).toHaveLength(6)
    expect(screen.getByText('Nina pediu a Bento “Responder o orçamento da gráfica”, mas Bento não pode usar o Gmail.')).toBeTruthy()
    // the initiative card: the host offered no "sempre", so the card has none
    expect(screen.getAllByRole('button', { name: /Sempre permitir/ })).toHaveLength(1)
    for (const button of screen.getAllByRole('button', { name: /Liberar só desta vez|Sempre permitir|Agora não/ })) fireEvent.click(button)
    expect(decideDecision).not.toHaveBeenCalled()
  })
})

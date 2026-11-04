// @vitest-environment jsdom
// DECISIONS-SPEC acceptance: one Decision[] in the live store, the same cycle in Visão geral and Aprovações,
// counters that fall together, failed → retry, undo only when reversible, focus and live region.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApprovalsBadgeObservable } from '../src/client/decisions/approvals-badge.ts'
import { openBlockingCount } from '../src/client/decisions/decision-selectors.ts'
import { DecisionFeedback } from '../src/client/decisions/DecisionFeedback.tsx'
import { deriveDecisions } from '../src/client/decisions/derive-decisions.ts'
import { decisionsToInbox } from '../src/client/decisions/decisions-to-inbox.ts'
import { bindTrayNeedsYou } from '../src/client/decisions/tray-needs-you-bridge.ts'
import type { Decision } from '../src/client/decisions/decision-types.ts'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { ConnectedApprovalsPanel } from '../src/client/remote/ConnectedApprovalsPanel.tsx'
import { ConnectedOverviewView } from '../src/client/remote/ConnectedOverviewView.tsx'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

installPreviewTheme()

type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })

interface Card {
  id: string
  kind: 'hire' | 'vault' | 'skill' | 'attention'
  title: string
  question: string
  status: 'pending' | 'approved' | 'rejected'
  personaId: string
  personaName: string
  reversible?: boolean
}

function hostWith(cards: Card[], extra: { decideFails?: () => boolean } = {}) {
  const decideApproval = vi.fn((request: { id: string; accept: boolean }) => {
    if (extra.decideFails?.() === true) return Promise.resolve({ ok: false, error: { code: 'x', message: 'host down' } } as Result)
    const card = cards.find(row => row.id === request.id)
    if (card !== undefined) card.status = request.accept ? 'approved' : 'rejected'
    return ok(card)
  })
  const undoApproval = vi.fn((request: { id: string }) => {
    const card = cards.find(row => row.id === request.id)
    if (card !== undefined) card.status = 'pending'
    return ok(card)
  })
  const host: Record<string, unknown> = {
    listProjects: () => ok([{ id: 'proj-pessoal' }]),
    listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
    getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
    ping: () => ok({ protocol: 1 }),
    getOverviewNow: () => ok({ personas: [] }),
    getWhileAway: () => ok({ events: [] }),
    // The same ticket id is also an attention card: it must collapse into one decision.
    getOverview: () => ok({ needsYou: [{ id: 'ticket-9', title: 'Revisar contrato do cliente' }], inProgress: [] }),
    listTeam: () => ok({
      personas: [{ id: 'p-atlas', name: 'Atlas', title: 'Coordenação', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'atlas', systemRoles: [], canRecruit: false }],
      members: [],
    }),
    listTasks: () => ok([]),
    listMessages: () => ok({ events: [] }),
    listDms: () => ok([]),
    markVisit: () => ok(true),
    followMessages: () => ({ async* [Symbol.asyncIterator]() { /* idle */ } }),
    listApprovals: () => ok(cards.map(card => ({ ...card }))),
    // The daily summary repeats the hire card (UX-01 duplicate) and adds one proposal only it knows.
    listDailySummaries: () => ok([{
      personaId: 'p-atlas',
      personaName: 'Atlas',
      date: '2026-11-04',
      proposals: [
        ...cards.filter(card => card.kind === 'hire').map(card => ({ ...card })),
        { id: 'skill-weekly', kind: 'skill', title: 'Resumo semanal', question: 'Ativar o resumo semanal?', status: 'pending', personaId: 'p-atlas', personaName: 'Atlas' },
      ],
    }]),
    decideApproval,
    undoApproval,
  }
  return { host, decideApproval, undoApproval }
}

const baseCards = (): Card[] => [
  { id: 'hire-lia', kind: 'hire', title: 'Lia', question: 'Toda semana chegam contratos para revisar.', status: 'pending', personaId: 'p-atlas', personaName: 'Atlas' },
  { id: 'vault-stripe', kind: 'vault', title: 'Chave do Stripe', question: 'Guardar a chave no Cofre?', status: 'pending', personaId: 'p-atlas', personaName: 'Atlas' },
  { id: 'ticket-9', kind: 'attention', title: 'Revisar contrato do cliente', question: 'Revisar contrato do cliente', status: 'pending', personaId: '', personaName: 'Atlas' },
]

async function booted(cards: Card[], extra?: Parameters<typeof hostWith>[1]): Promise<{ live: PersonaLiveStore } & ReturnType<typeof hostWith>> {
  const built = hostWith(cards, extra)
  const live = createPersonaLiveStore(built.host as never)
  await live.bootstrap(() => {})
  return { live, ...built }
}

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.useRealTimers()
})

const open = (live: PersonaLiveStore): readonly Decision[] => live.observable.getSnapshot().decisions ?? []
const shellT = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

describe('single Decision[] in the live store', () => {
  it('one request seen as proposal AND attention is one decision; ticket id collapses with its attention card', async () => {
    const { live } = await booted(baseCards())
    const ids = open(live).map(decision => decision.id)
    expect(ids.filter(id => id === 'hire-lia')).toHaveLength(1)
    expect(ids.filter(id => id === 'ticket-9')).toHaveLength(1)
    // hire-lia, vault-stripe, ticket-9 are blocking; skill-weekly only lives in the daily summary
    expect(open(live).filter(decision => decision.blocking).map(decision => decision.id).sort()).toEqual(['hire-lia', 'ticket-9', 'vault-stripe'])
    expect(open(live).find(decision => decision.id === 'skill-weekly')?.blocking).toBe(false)
    // low risk for vault/skill, normal for hire/attention
    expect(open(live).find(decision => decision.id === 'vault-stripe')?.risk).toBe('low')
    expect(open(live).find(decision => decision.id === 'hire-lia')?.risk).toBe('normal')
    live.dispose()
  })

  it('decide: counters (chip number, rail badge, attentionTitles) fall in the same snapshot, then the card leaves every list', async () => {
    const { live, decideApproval } = await booted(baseCards())
    const badge = createApprovalsBadgeObservable(live)
    expect(badge.getSnapshot().pending).toBe(3)
    expect(openBlockingCount(open(live))).toBe(3)

    const seen: Array<{ state: string | undefined; chip: number; badge: number; titles: number }> = []
    live.observable.subscribe(() => {
      const snap = live.observable.getSnapshot()
      seen.push({
        state: snap.decisions?.find(decision => decision.id === 'vault-stripe')?.state,
        chip: openBlockingCount(snap.decisions),
        badge: badge.getSnapshot().pending,
        titles: snap.attentionTitles.length,
      })
    })

    const outcome = await live.decide!('vault-stripe', true)
    expect(outcome).toBe('accepted')
    expect(decideApproval).toHaveBeenCalledTimes(1)
    expect(decideApproval).toHaveBeenCalledWith(expect.objectContaining({ id: 'vault-stripe', kind: 'vault', accept: true }))

    // Every snapshot where the card is not pending shows the three numbers already lowered together.
    const decided = seen.filter(row => row.state === 'deciding' || row.state === 'accepted')
    expect(decided.length).toBeGreaterThan(0)
    for (const row of decided) expect({ chip: row.chip, badge: row.badge, titles: row.titles }).toEqual({ chip: 2, badge: 2, titles: 2 })

    // The stamp holds ~750 ms, then the card is gone from the array every screen reads.
    expect(open(live).find(decision => decision.id === 'vault-stripe')?.state).toBe('accepted')
    await waitFor(() => { expect(open(live).some(decision => decision.id === 'vault-stripe')).toBe(false) }, { timeout: 2_000 })
    // The host already says "approved": a refresh must not bring it back.
    await live.refresh()
    expect(open(live).some(decision => decision.id === 'vault-stripe')).toBe(false)
    expect(badge.getSnapshot().pending).toBe(2)
    live.dispose()
  })

  it('a slow refresh that started BEFORE the decision cannot bring the decided card back as pending', async () => {
    const cards = baseCards()
    const built = hostWith(cards)
    let armed = false
    let release: () => void = () => {}
    const gate = new Promise<void>((resolveGate) => { release = resolveGate })
    const realList = built.host.listApprovals as () => Promise<Result>
    built.host.listApprovals = async () => {
      const mine = armed
      armed = false
      const snapshot = await realList() // the host's answer AT THIS MOMENT (the card is still pending)
      if (mine) await gate // ...delivered late
      return snapshot
    }
    const live = createPersonaLiveStore(built.host as never)
    await live.bootstrap(() => {})
    armed = true
    const stale = live.refresh()
    await live.decide!('vault-stripe', true) // the host confirms while that refresh is still waiting
    await waitFor(() => { expect(open(live).some(decision => decision.id === 'vault-stripe')).toBe(false) }, { timeout: 2_000 })
    release() // the old list finally arrives: vault-stripe is still 'pending' in it
    await stale
    expect(open(live).some(decision => decision.id === 'vault-stripe')).toBe(false)
    expect(openBlockingCount(open(live))).toBe(2)
    // and the next refresh (which started after the confirmation) agrees with the host
    await live.refresh()
    expect(open(live).some(decision => decision.id === 'vault-stripe')).toBe(false)
    live.dispose()
  })

  it('failed: the host rejects → the card comes back open with the same count; retry then succeeds; no second decide while deciding', async () => {
    let failing = true
    const { live, decideApproval } = await booted(baseCards(), { decideFails: () => failing })
    expect(await live.decide!('hire-lia', true)).toBe('failed')
    expect(open(live).find(decision => decision.id === 'hire-lia')?.state).toBe('failed')
    expect(openBlockingCount(open(live))).toBe(3) // nothing disappears without confirmation
    await live.refresh()
    expect(open(live).find(decision => decision.id === 'hire-lia')?.state).toBe('failed')

    failing = false
    const pending = live.decide!('hire-lia', true)
    // a double click while the host answers is ignored
    expect(await live.decide!('hire-lia', true)).toBe('deciding')
    expect(await pending).toBe('accepted')
    expect(decideApproval).toHaveBeenCalledTimes(2)
    live.dispose()
  })

  it('declined leaves faster (400 ms) and never shows the stamp state', async () => {
    const { live } = await booted(baseCards())
    expect(await live.decide!('hire-lia', false)).toBe('declined')
    expect(open(live).find(decision => decision.id === 'hire-lia')?.state).toBe('declined')
    await waitFor(() => { expect(open(live).some(decision => decision.id === 'hire-lia')).toBe(false) }, { timeout: 2_000 })
    live.dispose()
  })

  it('undoDecision calls the host only when it offers undoApproval, and the card returns', async () => {
    const cards = baseCards()
    const { live, undoApproval } = await booted(cards)
    await live.decide!('vault-stripe', true)
    await waitFor(() => { expect(open(live).some(decision => decision.id === 'vault-stripe')).toBe(false) }, { timeout: 2_000 })
    await live.undoDecision!('vault-stripe')
    expect(undoApproval).toHaveBeenCalledWith(expect.objectContaining({ id: 'vault-stripe' }))
    expect(open(live).find(decision => decision.id === 'vault-stripe')?.state).toBe('pending')
    live.dispose()
  })
})

describe('the portrait of whoever asks (Muse capture review #3)', () => {
  it('the store resolves requester.avatarSrc from the real team — by persona id, and by name when the card only knows the name', async () => {
    const { live } = await booted(baseCards())
    const byId = open(live).find(decision => decision.id === 'vault-stripe')
    expect(typeof byId?.requester.avatarSrc).toBe('string')
    // ticket-9 is an attention card: personaId is empty, only the name "Atlas" is known
    const byName = open(live).find(decision => decision.id === 'ticket-9')
    expect(typeof byName?.requester.avatarSrc).toBe('string')
    live.dispose()
  })

  it('Visão geral draws that portrait, not the initial', async () => {
    const { live } = await booted(baseCards())
    mountBoth(live)
    const overview = within(screen.getByTestId('overview'))
    await waitFor(() => { expect(overview.getByText('Chave do Stripe')).toBeTruthy() })
    const row = overview.getByText('Chave do Stripe').closest('li') as HTMLElement
    expect(row.querySelector('img')?.getAttribute('src')).toBeTruthy()
    live.dispose()
  })

  it('an unknown requester keeps the initial (no wrong face)', () => {
    const decisions = deriveDecisions({ approvals: [{ id: 'x', kind: 'vault', title: 'Chave', question: 'Guardar?', status: 'pending', personaId: 'ghost', personaName: 'Fantasma' }] })
    expect(decisions[0]?.requester.avatarSrc).toBeUndefined()
  })
})

describe('UX-02: a hire says why, in the host own words', () => {
  const hire = (extra: Record<string, unknown>) => ({
    id: 'hire-x', kind: 'hire' as const, title: 'Lia', question: 'Contratar Lia?', status: 'pending' as const,
    personaId: 'p-atlas', personaName: 'Atlas', ...extra,
  })

  it('shows "Por quê" only when the host sent an explicit reason; the question is never passed off as a reason', () => {
    const withWhy = decisionsToInbox(deriveDecisions({ approvals: [hire({ reason: 'Toda semana chegam contratos para revisar.' })] }))
    expect(withWhy.items[0]?.hireWhy).toBe('Toda semana chegam contratos para revisar.')
    const onlyQuestion = decisionsToInbox(deriveDecisions({ approvals: [hire({})] }))
    expect(onlyQuestion.items).toHaveLength(1) // still shown: the question is the older host's only reason
    expect(onlyQuestion.items[0]?.hireWhy).toBeUndefined()
  })

  it('a hire with no reason at all is STILL listed, only without the line (Muse: hiding it would strand whoever waits)', () => {
    const decisions = deriveDecisions({ approvals: [hire({ question: '' })] })
    expect(decisions).toHaveLength(1)
    expect(decisionsToInbox(decisions).items[0]?.hireWhy).toBeUndefined()
  })

  it('the card renders the line', async () => {
    const cards = baseCards()
    ;(cards[0] as unknown as Record<string, unknown>).reason = 'Toda semana chegam contratos para revisar.'
    const { live } = await booted(cards)
    mountBoth(live)
    await waitFor(() => { expect(reactiveCards().length).toBe(3) })
    expect(screen.getByText('Por quê: Toda semana chegam contratos para revisar.')).toBeTruthy()
    live.dispose()
  })
})

describe('one number for the tray, the rail badge and the chip', () => {
  it('the tray SETS the count (never increments) and lowers it when a decision is made', async () => {
    const { live } = await booted(baseCards())
    const sent: number[] = []
    const unbind = bindTrayNeedsYou(live, { personaAlwaysOn: { needsYouCount: (n: number) => { sent.push(n) } } })
    expect(sent).toEqual([3])
    await live.decide!('vault-stripe', true)
    expect(sent.at(-1)).toBe(2)
    expect(sent.every((n, i) => i === 0 || n !== sent[i - 1])).toBe(true) // only changes are sent
    unbind()
    live.dispose()
  })

  it('is a no-op on the web (no desktop bridge) and survives a throwing bridge', async () => {
    const { live } = await booted(baseCards())
    expect(() => { bindTrayNeedsYou(live, {})() }).not.toThrow()
    expect(() => { bindTrayNeedsYou(live, { personaAlwaysOn: { needsYouCount: () => { throw new Error('ipc closed') } } })() }).not.toThrow()
    live.dispose()
  })
})

function tenantReady() {
  const store = createSnapshotStore<PersonaTenantSnapshot>({
    status: 'ready',
    scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' },
  })
  return bindObservableForTest({ getSnapshot: () => store.getSnapshot(), subscribe: listener => store.subscribe(listener) })
}

/** Reactive cards in Aprovações ("Precisa de você agora"), not the persona headings of the daily summary. */
const reactiveCards = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-testid="approvals"] [data-persona-approvals="reactive"] [data-decision-id]')]

function mountBoth(live: PersonaLiveStore) {
  const useLive = bindObservableForTest(live.observable)
  const { store: shellStore } = createShellStore()
  const useShell = bindObservableForTest(shellStore)
  const navigate = vi.fn()
  const clearApprovalFocus = vi.fn()
  render(
    <PreviewFrame brandLabel="Persona">
      <div data-testid="overview">
        <ConnectedOverviewView
          t={shellT}
          useLive={useLive}
          navigate={navigate}
          openAwayTask={() => {}}
          decideDecision={(id, accept) => { void live.decide!(id, accept) }}
        />
      </div>
      <div data-testid="approvals">
        <ConnectedApprovalsPanel
          persona={{} as never}
          useTenant={tenantReady()}
          useShell={useShell}
          useLive={useLive}
          decideDecision={(id, accept) => live.decide!(id, accept)}
          refreshLive={() => { void live.refresh() }}
          clearApprovalFocus={clearApprovalFocus}
        />
      </div>
    </PreviewFrame>,
  )
  return { navigate, clearApprovalFocus }
}

describe('same cycle in Visão geral and Aprovações', () => {
  it('approving in Visão geral takes the card out of Aprovações, the chip and the live region follow', async () => {
    const { live } = await booted(baseCards())
    const { navigate } = mountBoth(live)
    const overview = within(screen.getByTestId('overview'))

    await waitFor(() => { expect(overview.getByText('Chave do Stripe')).toBeTruthy() })
    expect(overview.getByText('3 pendentes')).toBeTruthy()
    // the reactive list in Aprovações carries the same three cards
    expect(reactiveCards().length).toBe(3)

    // low risk → Aprovar right on the line; normal risk → Revisar opens Aprovações on that card
    const lowRow = overview.getByText('Chave do Stripe').closest('li') as HTMLElement
    const highRow = overview.getByText('Lia').closest('li') as HTMLElement
    fireEvent.click(within(highRow).getByRole('button', { name: shellPt['decision.review'] as string }))
    expect(navigate).toHaveBeenCalledWith('approvals', { focus: 'hire-lia' })

    fireEvent.click(within(lowRow).getByRole('button', { name: shellPt['decision.approve'] as string }))
    // Immediately: out of "pending" everywhere (chip 2) while the stamp is still on screen
    await waitFor(() => { expect(overview.getByText('2 pendentes')).toBeTruthy() })
    await waitFor(() => { expect(overview.queryByText('Chave do Stripe')).toBeNull() }, { timeout: 2_500 })
    await waitFor(() => { expect(reactiveCards().length).toBe(2) }, { timeout: 2_500 })
    // announced once, politely
    const live1 = document.querySelectorAll('[data-persona-decision-live]')
    expect(Array.from(live1).some(node => node.textContent === 'Aprovado: Chave do Stripe')).toBe(true)
    live.dispose()
  })

  it('approving in Aprovações takes the line out of Visão geral (and shows the stamp while it leaves)', async () => {
    const { live } = await booted(baseCards())
    mountBoth(live)
    const overview = within(screen.getByTestId('overview'))
    const approvals = within(screen.getByTestId('approvals'))
    await waitFor(() => { expect(reactiveCards().length).toBe(3) })

    // head card is "Contratar Lia?" → its primary action
    const primary = approvals.getAllByRole('button', { name: /Revisar e contratar/u })[0]!
    fireEvent.click(primary)
    await waitFor(() => { expect(overview.getByText('2 pendentes')).toBeTruthy() })
    expect(document.querySelector('[data-testid="approvals"] [data-decision-state="accepted"]')).not.toBeNull()
    await waitFor(() => { expect(overview.queryByText('Lia')).toBeNull() }, { timeout: 2_500 })
    live.dispose()
  })

  it('failed in Aprovações: the card stays with the honest line and "Tentar de novo"; nothing leaves', async () => {
    let failing = true
    const { live } = await booted(baseCards(), { decideFails: () => failing })
    mountBoth(live)
    const approvals = within(screen.getByTestId('approvals'))
    await waitFor(() => { expect(reactiveCards().length).toBe(3) })
    fireEvent.click(approvals.getAllByRole('button', { name: /Revisar e contratar/u })[0]!)
    await waitFor(() => { expect(approvals.getByText(approvalsPt['decision.failed'] as string)).toBeTruthy() })
    expect(reactiveCards().length).toBe(3)
    failing = false
    fireEvent.click(approvals.getByRole('button', { name: approvalsPt['decision.retry'] as string }))
    await waitFor(() => { expect(reactiveCards().length).toBe(2) }, { timeout: 2_500 })
    live.dispose()
  })

  it('focus moves to the next card when the focused one leaves, and to the section title when the list empties', async () => {
    const cards = baseCards().filter(card => card.kind === 'vault' || card.kind === 'attention')
    const { live } = await booted(cards)
    mountBoth(live)
    await waitFor(() => { expect(reactiveCards().length).toBe(2) })
    const first = reactiveCards()[0]!.querySelector('button') as HTMLElement
    expect(reactiveCards()[0]!.getAttribute('data-decision-id')).toBe('vault-stripe')
    first.focus()
    expect(document.activeElement).toBe(first)
    fireEvent.click(first)
    await waitFor(() => { expect(reactiveCards().length).toBe(1) }, { timeout: 2_500 })
    const activeCard = document.activeElement?.closest('[data-decision-id]')
    expect(document.activeElement).not.toBe(document.body)
    expect(activeCard?.getAttribute('data-decision-id')).toBe('ticket-9')
    live.dispose()
  })
})

describe('DecisionFeedback', () => {
  const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never
  const decision = (state: Decision['state'], reversible?: boolean): Decision => ({
    id: 'd1',
    kind: 'vault',
    title: 'Chave do Stripe',
    requester: { personaId: 'p', name: 'Ana' },
    blocking: true,
    risk: 'low',
    createdAt: '',
    state,
    ...(reversible === undefined ? {} : { reversible }),
  })

  it('shows "Desfazer" only when the host marked it reversible and an undo handler exists', () => {
    const onUndo = vi.fn()
    const { rerender } = render(<DecisionFeedback decisions={[decision('pending', true)]} t={t} onUndo={onUndo} />)
    rerender(<DecisionFeedback decisions={[decision('accepted', true)]} t={t} onUndo={onUndo} />)
    expect(screen.getByText('Aprovado: Chave do Stripe', { selector: 'p' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: shellPt['decision.undo'] as string }))
    expect(onUndo).toHaveBeenCalledWith('d1')
    cleanup()

    const none = vi.fn()
    const view = render(<DecisionFeedback decisions={[decision('pending')]} t={t} onUndo={none} />)
    view.rerender(<DecisionFeedback decisions={[decision('accepted')]} t={t} onUndo={none} />)
    expect(screen.queryByRole('button', { name: shellPt['decision.undo'] as string })).toBeNull() // never a false Undo
    cleanup()
    const noHandler = render(<DecisionFeedback decisions={[decision('pending', true)]} t={t} />)
    noHandler.rerender(<DecisionFeedback decisions={[decision('accepted', true)]} t={t} />)
    expect(screen.queryByRole('button', { name: shellPt['decision.undo'] as string })).toBeNull()
  })

  it('the Desfazer toast goes away by itself after 6 s', () => {
    vi.useFakeTimers()
    const onUndo = vi.fn()
    const { rerender } = render(<DecisionFeedback decisions={[decision('pending', true)]} t={t} onUndo={onUndo} />)
    rerender(<DecisionFeedback decisions={[decision('accepted', true)]} t={t} onUndo={onUndo} />)
    expect(screen.getByRole('button', { name: shellPt['decision.undo'] as string })).toBeTruthy()
    act(() => { vi.advanceTimersByTime(6_100) })
    expect(screen.queryByRole('button', { name: shellPt['decision.undo'] as string })).toBeNull()
  })
})

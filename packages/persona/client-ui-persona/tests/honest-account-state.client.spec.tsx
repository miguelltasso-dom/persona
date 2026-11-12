// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectionsView } from '../src/client/connections/ConnectionsView.tsx'
import { connectionAccountsBundleToUi, connectionAccountsFallbackFromConnections } from '../src/client/data/adapters/connection-accounts.ts'
import { connectionsToEntries } from '../src/client/data/adapters/connections.ts'
import { pt as connectionsPt } from '../src/client/locale/connections/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { createRailAiObservable, railAiNeedsWarning, readRailAiStatus, type RailAiStatus } from '../src/client/shell/rail-ai-status.ts'
import { deriveRailPill } from '../src/client/shell/rail-pill.ts'

/**
 * Item 13 (Tally, 11/11), COLHEITA-MUSE §13.4: the honest state of an account. Three separate words, never mixed: "conferindo…" (checking), "não consegui conferir" (the check ran out of time
 * twice: muted ink, a way to try again) and "sem login" (only a CONFIRMED logout). A check that has not answered is NEVER drawn as "Não conectada", with a login command or with an "Entrar".
 */
installPreviewTheme()
afterEach(() => { cleanup() })

const shellT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never
const scope = { workspaceId: 'ws', projectId: 'pp' }
const card = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'claude', kind: 'claude', available: true, loggedIn: false, loginHint: 'Entre com claude login', phase: 'ready', ...over })

describe('the rail pill: conferindo → não consegui conferir → sem login', () => {
  it('a card that ran out of time twice makes the pill "Claude · não consegui conferir" (muted, never a warning, never "sem login")', async () => {
    const remote = { getEngineStatus: () => ({ state: 'checking', reason: null, pending: 0 }), listConnections: () => [card({ phase: 'checking', unconfirmed: true })] }
    const { status } = await readRailAiStatus(remote as never, scope)
    expect(status).toEqual({ kind: 'unconfirmed', engine: 'Claude' })
    expect(railAiNeedsWarning(status)).toBe(false)
    expect(deriveRailPill({ t: shellT, hostStatus: 'online', awayText: null, ai: status })).toEqual({ text: 'Claude · não consegui conferir', tone: 'pending' })
  })

  it('still checking (not yet twice) stays "Claude · conferindo…"; and only a CONFIRMED logout is "Claude · sem login"', async () => {
    const checking = await readRailAiStatus({ getEngineStatus: () => ({ state: 'checking', reason: null, pending: 0 }), listConnections: () => [card({ phase: 'checking' })] } as never, scope)
    expect(checking.status).toEqual({ kind: 'checking' })
    expect(deriveRailPill({ t: shellT, hostStatus: 'online', awayText: null, ai: checking.status })).toEqual({ text: 'Claude · conferindo…', tone: 'pending' })
    const out = await readRailAiStatus({ getEngineStatus: () => ({ state: 'unavailable', reason: 'login_required', pending: 0 }), listConnections: () => [card({ phase: 'ready', error: { code: 'not_logged_in', message: 'x' } })] } as never, scope)
    expect(out.status).toEqual({ kind: 'unavailable', engine: 'Claude' })
    expect(deriveRailPill({ t: shellT, hostStatus: 'online', awayText: null, ai: out.status }).text).toBe('Claude · sem login')
  })

  it('a host that cannot list its connections never gets "não consegui conferir" out of thin air', async () => {
    const { status } = await readRailAiStatus({ getEngineStatus: () => ({ state: 'checking', reason: null, pending: 0 }) } as never, scope)
    expect(status).toEqual({ kind: 'checking' })
  })

  it('"Tentar de novo": the observable asks the host to check again (retryEngine) and rereads', async () => {
    const calls: string[] = []
    const remote = {
      getEngineStatus: () => { calls.push('status'); return { state: 'checking', reason: null, pending: 0 } },
      retryEngine: () => { calls.push('retry'); return { state: 'checking', reason: null, pending: 0 } },
      listConnections: () => [card({ phase: 'checking', unconfirmed: true })],
    }
    const observable = createRailAiObservable({ remote: remote as never, scope: () => scope, subscribeScope: () => () => undefined }, { pollMs: 0, readyPollMs: 0 })
    const seen: RailAiStatus[] = []
    const stop = observable.subscribe(() => { seen.push(observable.getSnapshot()) })
    await observable.retry()
    // the reread may fold into the pass already in flight: the pill settles on the new answer a moment later
    await vi.waitFor(() => { expect(observable.getSnapshot()).toEqual({ kind: 'unconfirmed', engine: 'Claude' }) })
    stop()
    expect(calls).toContain('retry')
  })
})

describe('Conexões never draws a doubt as "Não conectada"', () => {
  const bundle = (rows: Array<Record<string, unknown>>) => connectionAccountsBundleToUi({
    swapPolicy: 'ask_before_swap', swapPolicyScope: 'workspace',
    accounts: rows.map(row => ({ id: 'claude', provider: 'claude', label: 'Claude', available: true, loggedIn: false, loginHint: 'claude login', phase: 'ready', ...row })),
  } as never)
  const first = (ui: ReturnType<typeof bundle>) => ui.groups[0]?.accounts[0]

  it('checking and unconfirmed rows have their own status and offer NO login command; a confirmed logout still does', () => {
    const checking = first(bundle([{ phase: 'checking' }]))
    expect(checking).toMatchObject({ status: 'checking' })
    expect(checking?.copyCommand).toBeUndefined()
    const unsure = first(bundle([{ phase: 'checking', unconfirmed: true, loginCommand: 'claude login' }]))
    expect(unsure).toMatchObject({ status: 'unconfirmed' })
    expect(unsure?.copyCommand).toBeUndefined()
    expect(unsure?.loginCommand).toBeUndefined()
    const out = first(bundle([{ phase: 'ready', error: { code: 'not_logged_in', message: 'Entre: `claude login`' } }]))
    expect(out).toMatchObject({ status: 'expired', errorCode: 'not_logged_in' })
    expect(out?.copyCommand).toBe('claude login')
  })

  it('the single-card path (legacy and entries) says the same', () => {
    const entries = connectionsToEntries([card({ phase: 'checking' }), card({ id: 'codex', kind: 'codex', phase: 'checking', unconfirmed: true })] as never)
    expect(entries.map(entry => [entry.kind, entry.status, entry.copyCommand])).toEqual([['claude', 'checking', undefined], ['codex', 'unconfirmed', undefined]])
    const legacy = connectionAccountsFallbackFromConnections([card({ phase: 'checking', unconfirmed: true })] as never)
    expect(legacy.groups[0]?.accounts[0]).toMatchObject({ status: 'unconfirmed' })
  })

  it('the row says "Não consegui conferir" with ONE action, "Tentar de novo" (the host checks again); never "Entrar" or the login command', () => {
    const onRecheck = vi.fn()
    const ui = bundle([{ phase: 'checking', unconfirmed: true, loginCommand: 'claude login' }])
    render(<ConnectionsView accountsUi={ui} onRecheck={onRecheck} />)
    expect(screen.getByText(connectionsPt['status.unconfirmed'])).toBeTruthy()
    expect(screen.queryByText(connectionsPt['status.expired'])).toBeNull()
    expect(screen.queryByRole('button', { name: connectionsPt['action.copyCommand'] })).toBeNull()
    expect(screen.queryByRole('button', { name: connectionsPt['action.connect'] })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: connectionsPt['action.retryCheck'] }))
    expect(onRecheck).toHaveBeenCalledTimes(1)
  })

  it('a row still being checked says "Conferindo…" and offers no action at all', () => {
    render(<ConnectionsView accountsUi={bundle([{ phase: 'checking' }])} onRecheck={() => undefined} />)
    expect(screen.getByText(connectionsPt['status.checking'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: connectionsPt['action.retryCheck'] })).toBeNull()
    expect(screen.queryByRole('button', { name: connectionsPt['action.copyCommand'] })).toBeNull()
  })
})

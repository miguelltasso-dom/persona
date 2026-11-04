/**
 * D-078 contract tests: what the host does when a quota window stops a Task and the person has another account.
 *  - default ("perguntar") = only proposes: a Notice in the thread, nothing switches alone;
 *  - a policy the person CHOSE ("usar a próxima") = switches, with a visible thread line + Desfazer, and the limit break recorded;
 *  - fixed account = nothing;
 *  - every account at its limit = no proposal: the band says "No limite até {hora}".
 * Plus: `accounts.status = 'limit'` is written with the reset clock and cleared when it passes; `account_ask` is gone.
 */
import { RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const RESET = '2026-11-04T20:00:00.000Z'

function seed(h: PersonaHost, options: { otherOut?: boolean } = {}): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'bia', name: 'Bia', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calma.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.accounts.create({ id: 'claude:pessoal', workspaceId: 'ws', provider: 'claude', label: 'Pessoal' })
  h.accounts.create({ id: 'claude:trabalho', workspaceId: 'ws', provider: 'claude', label: 'Trabalho' })
  vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }] as never)
  const window = (usedPercent: number) => [{ id: '5h', origin: 'official' as const, usedPercent, ...(usedPercent >= 100 ? { resetsAt: RESET } : {}) }]
  h.usage.putQuota('pp', { provider: 'claude', origin: 'official', windows: window(100), accountId: 'claude:pessoal', accountLabel: 'Pessoal' })
  h.usage.putQuota('pp', {
    provider: 'claude', origin: 'official', windows: window(options.otherOut === true ? 100 : 25),
    accountId: 'claude:trabalho', accountLabel: 'Trabalho',
  })
}

interface Seen { deliveries: number; homes: string[]; outHome: string | undefined }

/** The first account used is out of quota; any other works. */
function engine(h: PersonaHost): Seen {
  const seen: Seen = { deliveries: 0, homes: [], outHome: undefined }
  h.orchestration.runnerFactory = async (request) => {
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    if (request?.purpose !== 'task') return createFakeRunner()
    const home = request.home ?? ''
    seen.homes.push(home)
    seen.outHome ??= home
    if (home === seen.outHome) throw new RunnerResolveError('quota_exhausted', 'claude', { resetAt: RESET })
    const inner = createFakeRunner()
    return new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'deliver') {
          return async (sessionId: string, requestId: string, text: string, mode: 'queue' | 'steer' | 'inject') => {
            seen.deliveries += 1
            await target.deliver(sessionId, requestId, text, mode)
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
  }
  return seen
}

function work(h: PersonaHost, id: string, body = 'Monte o cardápio da semana com preços'): void {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: `s-${id}`, occurredAt: CLOCK })
}

function thread(h: PersonaHost) {
  return h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events
}

async function settle(h: PersonaHost): Promise<void> {
  await h.orchestration.flush('pp')
  await new Promise<void>((resolve) => { setTimeout(resolve, 20) })
  await h.orchestration.flush('pp')
}

it('D-078 (default): only PROPOSES: the limit is recorded, the Notice is in the thread, nothing switches alone', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  work(h, 'm1')
  await settle(h)
  // the account the Task ran on is at its limit, with the vendor's clock
  expect(h.accounts.get('claude:pessoal')?.status).toBe('limit')
  expect(h.screens.screens.get('pp', 'account_limit', 'claude:pessoal')).toMatchObject({ accountId: 'claude:pessoal', resetAt: RESET })
  expect(h.screens.screens.list('pp', 'account_limit_log')).toHaveLength(1)
  // the Notice, in the thread, typed
  const ask = thread(h).find(item => item.accountAsk !== undefined)
  expect(ask?.accountAsk).toMatchObject({
    personaName: 'Bia', from: { label: 'Pessoal' }, to: { label: 'Trabalho' }, quota: 'livre', until: RESET,
  })
  expect(ask?.accountAsk?.resolved).toBeUndefined()
  // nothing moved
  expect(thread(h).some(item => item.accountSwap !== undefined)).toBe(false)
  expect(h.screens.screens.get('pp', 'active_account', 'bia')).toEqual({ accountId: 'claude:pessoal' })
  expect(seen.deliveries).toBe(0)
  expect(h.getAccountSwapProposals(SCOPE)).toHaveLength(1)
  // the dead record is gone: nothing is written that nobody reads
  expect(h.screens.screens.list('pp', 'account_ask')).toEqual([])
})

it('D-078 (default): "Continuar na Trabalho" switches and runs the Task there; "Esperar" only closes the Notice', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  work(h, 'm1')
  await settle(h)
  const ticketId = h.getAccountSwapProposals(SCOPE)[0]!.ticketId
  expect(h.declineAccountSwap({ ...SCOPE, ticketId })).toBe(true)
  expect(thread(h).find(item => item.accountAsk !== undefined)?.accountAsk?.resolved).toBe('waiting')
  expect(h.orchestration.quotaWaiting()).toHaveLength(1)
  expect(seen.deliveries).toBe(0)

  const result = await h.confirmAccountSwap({ ...SCOPE, ticketId, toAccountId: 'claude:trabalho' })
  expect(result).toMatchObject({ applied: true, resumed: true })
  await settle(h)
  expect(seen.deliveries).toBe(1)
  expect(thread(h).find(item => item.accountAsk !== undefined)?.accountAsk?.resolved).toBe('continued')
  // chosen by the person: no automatic-switch line, but the record exists and can be undone
  expect(thread(h).some(item => item.accountSwap !== undefined)).toBe(false)
  expect(h.getAccountSwaps(SCOPE)[0]).toMatchObject({ auto: false, undone: false, undoable: true, to: { label: 'Trabalho' } })
})

it('D-078 (policy chosen by the person): switches by itself, with a visible line + Desfazer, and the limit break is on the book', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  h.setRunnerSwapPolicy({ ...SCOPE, policy: 'next_on_limit', scope: 'workspace' })
  work(h, 'm1')
  await settle(h)
  await vi.waitFor(() => { expect(seen.deliveries).toBe(1) })
  // the Task ran again on the other account, without the person doing anything
  expect(new Set(seen.homes).size).toBe(2)
  expect(h.screens.screens.get('pp', 'active_account', 'bia')).toEqual({ accountId: 'claude:trabalho' })
  // never silent: a typed line in the thread, once, with the Desfazer data
  const lines = thread(h).filter(item => item.accountSwap !== undefined)
  expect(lines).toHaveLength(1)
  expect(lines[0]?.accountSwap).toMatchObject({
    personaName: 'Bia', from: { label: 'Pessoal' }, to: { label: 'Trabalho' }, until: RESET, auto: true, undone: false,
  })
  expect(lines[0]?.body).toContain('Bia passou para a conta Trabalho')
  expect(thread(h).some(item => item.accountAsk !== undefined)).toBe(false)
  // the limit break and the switch are on the book
  expect(h.screens.screens.list('pp', 'account_limit_log')).toHaveLength(1)
  expect(h.screens.screens.list('pp', 'account_swap')).toHaveLength(1)
  const swap = h.getAccountSwaps(SCOPE)[0]!
  expect(swap).toMatchObject({ auto: true, undoable: true })

  // Desfazer: back to the account she left, holding there; the line changes, it does not disappear
  expect(h.undoAccountSwap({ ...SCOPE, swapId: swap.swapId })).toEqual({ undone: true })
  expect(h.screens.screens.get('pp', 'active_account', 'bia')).toEqual({ accountId: 'claude:pessoal' })
  expect(thread(h).find(item => item.accountSwap !== undefined)?.accountSwap?.undone).toBe(true)
  expect(h.getAccountSwaps(SCOPE)[0]?.undoable).toBe(false)
  expect(h.undoAccountSwap({ ...SCOPE, swapId: swap.swapId })).toEqual({ undone: false, reason: 'already-undone' })
  expect(h.undoAccountSwap({ ...SCOPE, swapId: 'nao-existe' })).toEqual({ undone: false, reason: 'not-found' })
})

it('D-078: after Desfazer the policy does NOT take the persona away again until that limit clears (she waits)', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  h.setRunnerSwapPolicy({ ...SCOPE, policy: 'next_on_limit', scope: 'workspace' })
  work(h, 'm1')
  await settle(h)
  await vi.waitFor(() => { expect(seen.deliveries).toBe(1) })
  h.undoAccountSwap({ ...SCOPE, swapId: h.getAccountSwaps(SCOPE)[0]!.swapId })
  // a new Task in another channel: she is back on the account at its limit, the quota stops it again and, held, the policy only ASKS
  h.createChannel({ id: 'extra', ...SCOPE, name: 'extra', topic: '' })
  h.postMessage({ id: 'm2', ...SCOPE, streamKind: 'channel', ownerId: 'extra', body: 'Prepare a pauta da reunião de sexta', actorId: 'ana', subjectId: 's2', occurredAt: CLOCK })
  await settle(h)
  const extra = h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'extra', actorId: 'ana', afterSeq: 0, limit: 100 }).events
  expect(extra.some(item => item.accountSwap !== undefined)).toBe(false)
  expect(extra.some(item => item.accountAsk !== undefined)).toBe(true)
  expect(thread(h).filter(item => item.accountSwap !== undefined)).toHaveLength(1)
  expect(h.screens.screens.get('pp', 'active_account', 'bia')).toEqual({ accountId: 'claude:pessoal' })
  expect(seen.deliveries).toBe(1)
})

it('D-078 (fixed account): nothing is proposed or switched; the limit is still recorded and the Task waits', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  h.setRunnerSwapPolicy({ ...SCOPE, policy: 'fixed', scope: 'workspace' })
  work(h, 'm1')
  await settle(h)
  expect(h.accounts.get('claude:pessoal')?.status).toBe('limit')
  expect(h.getAccountSwapProposals(SCOPE)).toEqual([])
  expect(thread(h).some(item => item.accountAsk !== undefined || item.accountSwap !== undefined)).toBe(false)
  expect(h.screens.screens.get('pp', 'active_account', 'bia')).toEqual({ accountId: 'claude:pessoal' })
  expect(seen.deliveries).toBe(0)
  expect(h.getEngineStatus(SCOPE)).toMatchObject({ quotaWaiting: 1, quotaResetsAt: RESET })
})

it('D-078 (every account at its limit): no proposal, no switch; the band says "No limite até {hora}", the Task waits for the window', async () => {
  const h = host()
  seed(h, { otherOut: true })
  const seen = engine(h)
  h.setRunnerSwapPolicy({ ...SCOPE, policy: 'next_on_limit', scope: 'workspace' })
  work(h, 'm1')
  await settle(h)
  expect(h.getAccountSwapProposals(SCOPE)).toEqual([])
  expect(thread(h).some(item => item.accountAsk !== undefined || item.accountSwap !== undefined)).toBe(false)
  expect(seen.deliveries).toBe(0)
  expect(h.getEngineStatus(SCOPE)).toMatchObject({ quotaWaiting: 1, quotaResetsAt: RESET })
})

it('D-078: the limit is cleared when its clock passes, and the book keeps when it was cleared', async () => {
  const h = host()
  seed(h)
  engine(h)
  work(h, 'm1')
  await settle(h)
  expect(h.accounts.get('claude:pessoal')?.status).toBe('limit')
  // before the clock: still at its limit
  h.orchestration.now = () => '2026-11-04T19:59:00.000Z'
  expect(h.accountSwap.expireLimits('pp')).toBe(0)
  expect(h.accounts.get('claude:pessoal')?.status).toBe('limit')
  // after the clock: back to ok, the doc is gone, the log says when
  h.orchestration.now = () => '2026-11-04T20:00:01.000Z'
  expect(h.accountSwap.expireLimits('pp')).toBe(1)
  expect(h.accounts.get('claude:pessoal')?.status).toBe('ok')
  expect(h.screens.screens.get('pp', 'account_limit', 'claude:pessoal')).toBeUndefined()
  expect(h.screens.screens.list<{ clearedAt?: string }>('pp', 'account_limit_log')[0]?.clearedAt).toBe('2026-11-04T20:00:01.000Z')
})

it('D-078: the band offers another connected engine to use meanwhile, never the one that is at its limit', async () => {
  const h = host()
  seed(h, { otherOut: true })
  engine(h)
  work(h, 'm1')
  await settle(h)
  vi.spyOn(h.connections, 'list').mockReturnValue([
    { id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true },
    { id: 'codex', kind: 'codex', phase: 'ready', available: true, loggedIn: true },
    { id: 'cursor', kind: 'cursor', phase: 'ready', available: true, loggedIn: false },
  ] as never)
  expect(h.getEngineStatus(SCOPE).alternativeEngines).toEqual(['codex'])
})

it('D-078 (P1, "Uso e limites"): the book lists every limit and every switch, newest first, append-only', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  h.setRunnerSwapPolicy({ ...SCOPE, policy: 'next_on_limit', scope: 'workspace' })
  work(h, 'm1')
  await settle(h)
  await vi.waitFor(() => { expect(seen.deliveries).toBe(1) })
  const book = h.getAccountLimitBook(SCOPE)
  expect(book.limits).toHaveLength(1)
  expect(book.limits[0]).toMatchObject({ label: 'Pessoal', provider: 'claude', resetAt: RESET, active: true })
  expect(book.limits[0]?.clearedAt).toBeUndefined()
  expect(book.swaps).toHaveLength(1)
  expect(book.swaps[0]).toMatchObject({ auto: true, undone: false, from: { label: 'Pessoal' }, to: { label: 'Trabalho' } })
  // the window comes back: the limit is kept, now with when it was cleared; the switch is untouched
  h.orchestration.now = () => '2026-11-04T20:00:01.000Z'
  h.accountSwap.expireLimits('pp')
  const later = h.getAccountLimitBook(SCOPE)
  expect(later.limits).toHaveLength(1)
  expect(later.limits[0]).toMatchObject({ active: false, clearedAt: '2026-11-04T20:00:01.000Z' })
  expect(later.swaps).toHaveLength(1)
  // Desfazer does not erase the switch from the book
  h.undoAccountSwap({ ...SCOPE, swapId: later.swaps[0]!.swapId })
  expect(h.getAccountLimitBook(SCOPE).swaps[0]).toMatchObject({ undone: true, undoable: false })
  expect(h.getAccountLimitBook({ ...SCOPE, limit: 1 }).limits).toHaveLength(1)
})

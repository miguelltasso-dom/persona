/**
 * IV-7, 2nd slice: "usar a outra conta e retomar agora". A Task the quota stopped, a second logged-in account on the same
 * engine with room: the host PROPOSES it (`getAccountSwapProposals`), the person CONFIRMS (`confirmAccountSwap`), the persona
 * moves to that account and the stopped Task runs again on it, at once. Nothing is switched without the confirmation.
 */
import { RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const RESET = '2026-11-04T20:00:00.000Z'

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.accounts.create({ id: 'claude:pessoal', workspaceId: 'ws', provider: 'claude', label: 'Pessoal' })
  h.accounts.create({ id: 'claude:trabalho', workspaceId: 'ws', provider: 'claude', label: 'Trabalho' })
  vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }] as never)
  const window = (usedPercent: number) => [{ id: '5h', origin: 'official' as const, usedPercent, ...(usedPercent >= 100 ? { resetsAt: RESET } : {}) }]
  h.usage.putQuota('pp', { provider: 'claude', origin: 'official', windows: window(100), accountId: 'claude:pessoal', accountLabel: 'Pessoal' })
  h.usage.putQuota('pp', { provider: 'claude', origin: 'official', windows: window(20), accountId: 'claude:trabalho', accountLabel: 'Trabalho' })
}

interface Seen { deliveries: number; homes: string[]; outHome: string | undefined }

/** The account in use is told apart by the runner's home: the first one used is out of quota, any other works. */
function engine(h: PersonaHost): Seen {
  const seen: Seen = { deliveries: 0, homes: [], outHome: undefined }
  h.orchestration.runnerFactory = async (request) => {
    if (request?.purpose !== 'task') {
      const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
      return createFakeRunner()
    }
    const home = request.home ?? ''
    seen.homes.push(home)
    seen.outHome ??= home
    if (home === seen.outHome) throw new RunnerResolveError('quota_exhausted', 'claude', { resetAt: RESET })
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
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

async function stopped(h: PersonaHost): Promise<{ ticketId: string }> {
  h.postMessage({ id: 'm-work', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'Monte o cardápio da semana com preços', actorId: 'ana', subjectId: 's', occurredAt: CLOCK })
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]!
  return { ticketId: ticket.id }
}

it('IV-7 (2nd slice): the quota stops a Task, the host proposes the other account, the person confirms, the Task runs there', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  const { ticketId } = await stopped(h)
  expect(h.listTasks(SCOPE)[0]?.stage).toBe('blocked')
  expect(seen.deliveries).toBe(0)
  expect(h.orchestration.quotaRows('pp')[0]).toMatchObject({ ticketId, personaId: 'atlas', accountId: 'claude:pessoal' })

  // a proposal only: nothing moved yet
  const proposals = h.getAccountSwapProposals(SCOPE)
  expect(proposals).toHaveLength(1)
  expect(proposals[0]).toMatchObject({
    ticketId, personaName: 'Atlas', provider: 'claude', waitUntil: RESET,
    from: { accountId: 'claude:pessoal', label: 'Pessoal' },
    to: { accountId: 'claude:trabalho', label: 'Trabalho', quota: 'livre' },
    alternatives: [],
  })
  expect(seen.deliveries).toBe(0)
  expect(h.listTasks(SCOPE)[0]?.stage).toBe('blocked')

  const result = await h.confirmAccountSwap({ ...SCOPE, ticketId, toAccountId: 'claude:trabalho' })
  expect(result).toMatchObject({ applied: true, resumed: true })
  expect(result.activity).toContain('Atlas')
  expect(result.activity).toContain('Trabalho')
  await h.orchestration.flush('pp')
  expect(seen.deliveries).toBe(1)
  // the Task ran on ANOTHER home: the persona's warm runner of the first account was dropped
  expect(new Set(seen.homes).size).toBe(2)
  expect(h.listTasks(SCOPE)[0]?.stage).not.toBe('blocked')
  expect(h.orchestration.quotaWaiting()).toEqual([])
  expect(h.getAccountSwapProposals(SCOPE)).toEqual([])
  expect(h.screens.screens.get('pp', 'active_account', 'atlas')).toEqual({ accountId: 'claude:trabalho' })
})

it('IV-7 (2nd slice): the confirmation runs the Task even while the engine still reports the first account at its limit', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  const { ticketId } = await stopped(h)
  h.orchestration.engineReadinessOf = () => ({ state: 'unavailable', reason: 'quota_exhausted' })
  const result = await h.confirmAccountSwap({ ...SCOPE, ticketId, toAccountId: 'claude:trabalho' })
  expect(result.resumed).toBe(true)
  await h.orchestration.flush('pp')
  expect(seen.deliveries).toBe(1)
})

it('IV-7 (2nd slice): refuses an account that was not proposed, and a Task that no longer waits', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  const { ticketId } = await stopped(h)
  expect(await h.confirmAccountSwap({ ...SCOPE, ticketId, toAccountId: 'claude:pessoal' })).toEqual({ applied: false, resumed: false, reason: 'unknown-account' })
  expect(await h.confirmAccountSwap({ ...SCOPE, ticketId, toAccountId: 'claude:nao-existe' })).toEqual({ applied: false, resumed: false, reason: 'unknown-account' })
  expect(await h.confirmAccountSwap({ ...SCOPE, ticketId: 'no-such-ticket', toAccountId: 'claude:trabalho' })).toEqual({ applied: false, resumed: false, reason: 'not-waiting' })
  expect(seen.deliveries).toBe(0)
  expect(h.screens.screens.get('pp', 'active_account', 'atlas')).not.toEqual({ accountId: 'claude:trabalho' })
  await h.confirmAccountSwap({ ...SCOPE, ticketId, toAccountId: 'claude:trabalho' })
  // a second confirmation of the same Task finds nothing waiting and does not run it twice
  expect(await h.confirmAccountSwap({ ...SCOPE, ticketId, toAccountId: 'claude:trabalho' })).toEqual({ applied: false, resumed: false, reason: 'not-waiting' })
  await h.orchestration.flush('pp')
  expect(seen.deliveries).toBe(1)
})

it('IV-7 (2nd slice): a fixed-account policy proposes nothing; no second account proposes nothing; an account out of quota is not offered', async () => {
  const h = host()
  seed(h)
  engine(h)
  await stopped(h)
  expect(h.getAccountSwapProposals(SCOPE)).toHaveLength(1)
  h.setRunnerSwapPolicy({ ...SCOPE, policy: 'fixed', scope: 'workspace' })
  expect(h.getAccountSwapProposals(SCOPE)).toEqual([])
  h.setRunnerSwapPolicy({ ...SCOPE, policy: 'ask_before_swap', scope: 'workspace' })
  expect(h.getAccountSwapProposals(SCOPE)).toHaveLength(1)
  // the other account runs out too: nothing to propose, the person waits for the window
  h.usage.putQuota('pp', {
    provider: 'claude', origin: 'official', accountId: 'claude:trabalho', accountLabel: 'Trabalho',
    windows: [{ id: '5h', origin: 'official', usedPercent: 100, resetsAt: RESET }],
  })
  expect(h.getAccountSwapProposals(SCOPE)).toEqual([])
})

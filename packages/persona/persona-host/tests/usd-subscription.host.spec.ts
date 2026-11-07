/**
 * USD-1 / D-092 in the REAL host (persona-spec/contracts/usd-subscription.md): the Remote `estimateAsk` shapes its numbers by the kind of account that
 * runs the ask. A subscription account gets the impact on the window the vendor publishes and NO dollar anywhere in the view; only an API account
 * gets `custo`. Switching the account switches the form.
 */
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const CHANNEL = { ...SCOPE, streamKind: 'channel' as const, ownerId: 'geral' }
const WORK = 'Monte o cardápio da semana com preços'
const MONEY = /US\$|\$|microUsd|\bcost\b/iu

function seed(h: PersonaHost, runner: 'claude' | 'dsh' = 'claude'): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: runner === 'dsh' ? 'dsh' : 'cli', runnerCli: runner === 'dsh' ? '' : runner,
    runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
}

function week(usedPercent: number): { id: string; origin: 'official'; usedPercent: number; windowMinutes: number; resetsAt: string } {
  return { id: 'week', origin: 'official', usedPercent, windowMinutes: 10_080, resetsAt: '2026-11-07T16:00:00.000Z' }
}

/** The view as the screen receives it, without the `custo` key (which is the contract: null for a subscription). */
function drawn(view: unknown): string {
  return JSON.stringify(view).replace('"custo":null,', '')
}

/** Run with an environment that has (or lacks) an API key, restoring it after. */
function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const before = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]))
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try {
    return run()
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

it('a Claude Max subscription: no dollar in the view; the week is the window; "cota não medida" until the account is calibrated', () => {
  const h = host()
  seed(h)
  h.usage.putQuota('pp', { provider: 'claude', origin: 'official', detail: 'max', windows: [week(67), { id: 'model_scoped:Fable', origin: 'official', usedPercent: 0 }], accountId: 'claude:pessoal' })
  const view = withEnv({ ANTHROPIC_API_KEY: undefined, CLAUDE_CODE_USE_BEDROCK: undefined }, () => h.estimateAsk({ ...CHANNEL, texto: WORK }))
  expect(view.billing).toBe('subscription')
  expect(view.custo).toBeNull()
  expect(view.quota).toMatchObject({ window: 'week', pct: null, origin: 'not-measured', usedPct: 67, remainingPct: 33, resetsAt: '2026-11-07T16:00:00.000Z' })
  expect(view.impacto).toBe('cota não medida')
  expect(drawn(view)).not.toMatch(MONEY)
  expect(view.chamadas).toEqual({ min: 1, max: 1 })
})

it('a CLI started with an API key is an API account: US$ estimated, no window talk', () => {
  const h = host()
  seed(h)
  h.usage.putQuota('pp', { provider: 'claude', origin: 'official', detail: 'max', windows: [week(67)], accountId: 'claude:pessoal' })
  const view = withEnv({ ANTHROPIC_API_KEY: 'sk-ant-test-key' }, () => h.estimateAsk({ ...CHANNEL, texto: WORK }))
  expect(view.billing).toBe('api')
  expect(view.custo?.microUsd.max).toBeGreaterThan(0)
  expect(view.quota).toBeNull()
  expect(view.impacto).toMatch(/US\$.*\(estimativa\)$/u)
})

it('a persona stored on a DSH runner runs on the CLI the person is logged into, so the account is that CLI\'s (a subscription), not an API account', () => {
  const h = host()
  seed(h, 'dsh')
  h.orchestration.loggedCliOf = () => 'claude'
  h.usage.putQuota('pp', { provider: 'claude', origin: 'official', detail: 'max', windows: [week(40)] })
  const view = withEnv({ ANTHROPIC_API_KEY: undefined }, () => h.estimateAsk({ ...CHANNEL, texto: WORK }))
  expect(view).toMatchObject({ billing: 'subscription', custo: null })
  expect(drawn(view)).not.toMatch(MONEY)
})

it('no sign of the account type is "unknown": the safe default shows no money; a known login with no published window is a subscription with no window', () => {
  const h = host()
  seed(h)
  h.orchestration.loggedCliOf = () => undefined
  const unknown = withEnv({ ANTHROPIC_API_KEY: undefined }, () => h.estimateAsk({ ...CHANNEL, texto: WORK }))
  expect(unknown.billing).toBe('unknown')
  expect(unknown.custo).toBeNull()
  expect(unknown.quota).toBeNull()
  expect(unknown.impacto).toBe('≈ 1 chamada da sua IA')
  expect(drawn(unknown)).not.toMatch(MONEY)
  h.orchestration.loggedCliOf = () => 'claude'
  const logged = withEnv({ ANTHROPIC_API_KEY: undefined }, () => h.estimateAsk({ ...CHANNEL, texto: WORK }))
  expect(logged).toMatchObject({ billing: 'subscription', custo: null, quota: null })
  expect(drawn(logged)).not.toMatch(MONEY)
})

it('the window of the account the persona uses NOW: swapping the account swaps the numbers', () => {
  const h = host()
  seed(h)
  h.usage.putQuota('pp', { provider: 'claude', origin: 'official', detail: 'max', windows: [week(67)], accountId: 'claude:pessoal' })
  h.usage.putQuota('pp', { provider: 'claude', origin: 'official', detail: 'pro', windows: [{ ...week(12), resetsAt: '2026-11-08T10:00:00.000Z' }], accountId: 'claude:trabalho' })
  h.screens.screens.put('pp', 'active_account', 'atlas', { accountId: 'claude:pessoal' })
  const first = withEnv({ ANTHROPIC_API_KEY: undefined }, () => h.estimateAsk({ ...CHANNEL, texto: WORK }))
  expect(first.quota).toMatchObject({ usedPct: 67 })
  h.screens.screens.put('pp', 'active_account', 'atlas', { accountId: 'claude:trabalho' })
  const second = withEnv({ ANTHROPIC_API_KEY: undefined }, () => h.estimateAsk({ ...CHANNEL, texto: WORK }))
  expect(second.quota).toMatchObject({ usedPct: 12, resetsAt: '2026-11-08T10:00:00.000Z' })
  expect(drawn(second)).not.toMatch(MONEY)
})

it('a message with no call uses nothing for any account', () => {
  const h = host()
  seed(h)
  h.usage.putQuota('pp', { provider: 'claude', origin: 'official', detail: 'max', windows: [week(67)] })
  const view = withEnv({ ANTHROPIC_API_KEY: undefined }, () => h.estimateAsk({ ...CHANNEL, texto: 'valeu!' }))
  expect(view).toMatchObject({ tipo: 'sem-chamada', billing: 'subscription', impacto: 'Sem chamada da sua IA' })
  expect(drawn(view)).not.toMatch(MONEY)
})

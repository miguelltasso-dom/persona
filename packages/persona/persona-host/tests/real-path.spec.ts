import { createFakeRunner, createScriptedRunner, RunnerResolveError, type NormalizedReport } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { SCRIPTED_HELLO } from '../src/orchestration.ts'
import {
  allowsScriptedReplies,
  ensureProductionRealCli,
  resolveHostRunner,
  runnerHomeOf,
  loggedCliFromCards,
  specFromConnection,
  type PersonaRunnersSlice,
} from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

afterEach(() => {
  delete process.env.PERSONA_REAL_CLI
})

const { host } = bindHostFile()

function recordedTaskRunner(report: NormalizedReport): PersonaRunnersSlice {
  const at = '2026-11-04T12:00:00.000Z'
  return {
    createFakeRunner,
    resolveRunner: async () => createScriptedRunner({ turns: [
      { events: [{ type: 'ended', at, report: { state: 'ready', summary: 'Pedido encaminhado.' } }] },
      { events: [{ type: 'ended', at, report }] },
    ] }),
  }
}

it('publishes only the worker output with runner source and its Report summary', async () => {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  const runners = recordedTaskRunner({ state: 'ready', summary: 'Entrega real gravada no README.' })
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  ask(h, 'm-delivery', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')

  const task = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]!
  const delivered = h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 40,
  }).events.find(item => item.id === `coord-${task.id}-done`)
  expect(delivered?.source).toBe('runner')
  expect(delivered?.body).toBe('Entrega real gravada no README.')
  expect(bodies(h)).not.toMatch(/Regras recebidas|Pedido encaminhado/u)
  expect(h.orchestration.runtime('pp').repo.tickets.get(task.id)?.assignments.at(-1)?.report?.summary)
    .toBe('Entrega real gravada no README.')
})

it('a failed worker Report stays blocked instead of becoming a successful delivery', async () => {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  const runners = recordedTaskRunner({ state: 'failed', summary: 'A conexão caiu durante a execução.' })
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  ask(h, 'm-failed-report', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]?.stage).toBe('blocked')
  expect(bodies(h)).not.toContain('Pronto:')
  expect(bodies(h)).toContain('"code":"engine_unavailable"')
})

it('records each call once with its actual provider, kind, ticket and cache counters before flush finishes', async () => {
  const h = host()
  seed(h)
  h.orchestration.runnerFactory = async (request) => {
    const runner = createFakeRunner()
    return {
      ...runner,
      usage: async () => ({ inputTokens: 999, outputTokens: 999 }),
      deliver: async (sessionId, requestId, text, mode) => {
        await runner.deliver(sessionId, requestId, text, mode)
        request?.usage?.record({
          provider: 'claude', model: 'haiku', kind: 'execution', window: 'turn',
          inputTokens: 40, outputTokens: 10, cacheReadTokens: 30, cacheWriteTokens: 2,
          at: '2026-11-04T12:00:00.000Z', origin: 'measured',
        })
      },
    }
  }
  ask(h, 'm-meter', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const task = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]!
  const rows = h.ledger.list({ projectId: 'pp' })
  expect(rows).toHaveLength(2)
  expect(rows.filter(row => row.kind === 'triage')).toHaveLength(1)
  expect(rows.filter(row => row.kind === 'execution')).toMatchObject([{ ticketId: task.id }])
  expect(rows.every(row => row.engine === 'claude' && row.inputTokens === 40 && row.outputTokens === 10)).toBe(true)
  expect(rows.every(row => row.cacheReadTokens === 30 && row.cacheWriteTokens === 2)).toBe(true)
})

it('persists a waiting Report summary separately from its question and publishes the question on #geral', async () => {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  const report: NormalizedReport = {
    state: 'waiting', summary: 'Ferramenta Read recusada no nível none.',
    question: 'Precisa de você: esta ação está fora da política da persona.',
  }
  const runners = recordedTaskRunner(report)
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  ask(h, 'm-policy-detail', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const task = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]!
  const stored = h.orchestration.runtime('pp').repo.tickets.get(task.id)
  expect(stored?.assignments.at(-1)?.report).toMatchObject({ state: report.state, summary: report.summary })
  expect(stored?.attention?.question).toBe(report.question)
  expect(stored?.assignments.at(-1)?.report?.summary).not.toBe(stored?.attention?.question)
  expect(bodies(h)).toContain(report.question)
})

it('persists a blocked Report summary and question together and publishes a visible execution error', async () => {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  const report: NormalizedReport = {
    state: 'blocked', summary: 'Ferramenta Read recusada no nível none.',
    question: 'Precisa de você: esta ação está fora da política da persona.',
  }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, recordedTaskRunner(report))
  ask(h, 'm-policy-block', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const task = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]!
  const stored = h.orchestration.runtime('pp').repo.tickets.get(task.id)
  expect(stored?.assignments.at(-1)?.report).toMatchObject({ state: report.state, summary: report.summary })
  expect(stored?.attention?.question).toBe(report.question)
  expect(task.stage).toBe('blocked')
  expect(bodies(h)).toContain('"code":"engine_unavailable"')
})

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
  }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

function ask(h: PersonaHost, id: string, body: string): void {
  h.postMessage({
    id,
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    body,
    actorId: 'ana',
    subjectId: 't1',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
}

function bodies(h: PersonaHost): string {
  return h.listMessages({
    workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    actorId: 'ana', afterSeq: 0, limit: 50,
  }).events.map(item => item.body).join('\n')
}

it('sets PERSONA_REAL_CLI=1 outside VITEST', () => {
  const prevVitest = process.env.VITEST
  const prevReal = process.env.PERSONA_REAL_CLI
  delete process.env.VITEST
  delete process.env.PERSONA_SCRIPTED
  delete process.env.PERSONA_REAL_CLI
  ensureProductionRealCli()
  expect(process.env.PERSONA_REAL_CLI).toBe('1')
  expect(allowsScriptedReplies()).toBe(false)
  if (prevVitest === undefined) delete process.env.VITEST
  else process.env.VITEST = prevVitest
  if (prevReal === undefined) delete process.env.PERSONA_REAL_CLI
  else process.env.PERSONA_REAL_CLI = prevReal
})

it('production (no VITEST) never scripts and calls resolveRunner', async () => {
  const prev = process.env.VITEST
  delete process.env.VITEST
  delete process.env.PERSONA_SCRIPTED
  delete process.env.PERSONA_REAL_CLI
  try {
    expect(allowsScriptedReplies()).toBe(false)
    const seen: string[] = []
    const runners: PersonaRunnersSlice = {
      resolveRunner: async () => {
        seen.push('live')
        throw new RunnerResolveError('cli_not_found', 'claude')
      },
      createFakeRunner,
    }
    await expect(resolveHostRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      autonomy: 'on_request',
      personId: 'coord',
    }, runners)).rejects.toBeInstanceOf(RunnerResolveError)
    expect(seen).toEqual(['live'])
  } finally {
    process.env.VITEST = prev
  }
})

it('a missing production request fails explicitly instead of returning a fake runner', async () => {
  const previous = process.env.PERSONA_REAL_CLI
  process.env.PERSONA_REAL_CLI = '1'
  try {
    await expect(resolveHostRunner()).rejects.toMatchObject({ code: 'engine_unavailable' })
  } finally {
    if (previous === undefined) delete process.env.PERSONA_REAL_CLI
    else process.env.PERSONA_REAL_CLI = previous
  }
})

it('uses the logged-in CLI when the persona is still dsh', () => {
  expect(specFromConnection({ kind: 'dsh', model: 'default' }, 'claude')).toEqual({
    kind: 'cli', cli: 'claude', model: 'haiku',
  })
  expect(loggedCliFromCards([
    { kind: 'cursor', loggedIn: true },
    { kind: 'codex', loggedIn: true },
    { kind: 'claude', loggedIn: true },
  ])).toBe('claude')
  expect(loggedCliFromCards([{ kind: 'dsh', loggedIn: true }])).toBeUndefined()
  expect(specFromConnection({ kind: 'cli', cli: 'codex', model: 'm' }, 'claude')).toEqual({
    kind: 'cli', cli: 'codex', model: 'm',
  })
})

it('calls resolveRunner without an isolated home by default', async () => {
  const seen: Array<{ home?: string }> = []
  const runners: PersonaRunnersSlice = {
    resolveRunner: async (options) => {
      seen.push({ ...(options.home === undefined ? {} : { home: options.home }) })
      throw new RunnerResolveError('cli_not_found', 'claude')
    },
    createFakeRunner,
  }
  process.env.PERSONA_REAL_CLI = '1'
  expect(runnerHomeOf('pp')).toBe('')
  await expect(resolveHostRunner({
    spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
    permissionMode: 'deny',
    autonomy: 'on_request',
    home: runnerHomeOf('pp'),
    personId: 'coord',
  }, runners)).rejects.toBeInstanceOf(RunnerResolveError)
  expect(seen).toHaveLength(1)
  expect(seen[0]?.home).toBeUndefined()
})

it('never posts fixture strings on the real path', async () => {
  expect(allowsScriptedReplies()).toBe(true)
  const h = host()
  seed(h)
  h.orchestration.scripted = false
  h.orchestration.liveText = ''
  h.orchestration.runnerFactory = async () => createFakeRunner()
  ask(h, 'm-hi', 'oi, tudo bem?')
  await h.orchestration.flush('pp')
  const text = bodies(h)
  expect(text).not.toContain(SCRIPTED_HELLO)
  expect(text).toMatch(/não consegui responder/i)
})

it('turns a streamed OAR login line into Precisa de você, never the raw English', async () => {
  const h = host()
  seed(h)
  h.orchestration.scripted = false
  h.orchestration.liveText = 'Not logged in · Please run /login'
  h.orchestration.runnerFactory = async () => createFakeRunner()
  ask(h, 'm-login', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const text = bodies(h)
  expect(text).not.toMatch(/Not logged in|Please run \/login/u)
  expect(text).toMatch(/\[\[run-error:/u)
  expect(text).toMatch(/"code":"not_logged_in"/u)
  expect(text).toMatch(/"provider":"Claude"/u)
  expect(text).toMatch(/"persona":"Guia"/u)
  expect(h.getOverview({ workspaceId: 'ws', projectId: 'pp' }).needsYou.length).toBeGreaterThan(0)
  expect(h.getOverview({ workspaceId: 'ws', projectId: 'pp' }).needsYou[0]?.title).toMatch(/não está conectado|README/i)
  expect(JSON.stringify(h.getWhileAway({ workspaceId: 'ws', projectId: 'pp' }))).not.toMatch(/\bCLI\b|DSH|executor|runner/i)
})

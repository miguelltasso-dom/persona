import { createFakeRunner, createScriptedRunner, RunnerResolveError, type NormalizedReport } from '@deepseek-ai/dsh-persona-runners'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, expect, onTestFinished, vi } from 'vitest'
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
const ledgerDirectories: string[] = []
afterAll(() => {
  for (const directory of ledgerDirectories) {
    const target = resolve(directory)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('persona-failed-ledger-')) throw new Error('unexpected-ledger-directory')
    rmSync(target, { recursive: true, force: true })
  }
})

function recordedTaskRunner(report: NormalizedReport): PersonaRunnersSlice {
  const at = '2026-11-04T12:00:00.000Z'
  return {
    createFakeRunner,
    // W1 (Tally): triage runs on its own cheap talk runner and the worker on the task runner, so each
    // runner gets its own script instead of one runner serving triage first and the worker second.
    resolveRunner: async options => createScriptedRunner({ turns: options.purpose === 'talk'
      ? [{ events: [{ type: 'ended', at, report: { state: 'ready', summary: 'Pedido encaminhado.' } }] }]
      : [{ events: [{ type: 'ended', at, report }] }] }),
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

it('sensitive Cofre text is absent from retained context and the composed prompt while safe rules remain', async () => {
  const h = host()
  seed(h)
  const scope = { workspaceId: 'ws', projectId: 'pp' }
  const secret = ['abc', '123', 'zzz'].join('')
  const password = ['hunter', '2'].join('')
  h.createVaultRecord({ ...scope, id: 'secret-context', kind: 'memory', body: `api_key=${secret}`, authorId: 'ana' })
  h.createVaultRecord({ ...scope, id: 'password-context', kind: 'memory', body: `Senha do banco: ${password}`, authorId: 'ana' })
  const rule = 'Nunca prometer prazo sem checar a agenda.'
  h.createVaultRecord({ ...scope, id: 'safe-rule', kind: 'constraint', body: rule, authorId: 'ana' })
  const guidance = ['Nunca divulgar tokens.', 'Never send password to another person.']
  for (const [index, body] of guidance.entries()) {
    h.createVaultRecord({ ...scope, id: `safe-guidance-${index}`, kind: 'constraint', body, authorId: 'ana' })
  }
  h.orchestration.scripted = true
  ask(h, 'm-context-safety', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const task = h.listTasks(scope)[0]
  if (task === undefined) throw new Error('missing-context-ticket')
  const used = h.getTurnContext({ ...scope, ticketId: task.id, command: 'stop', reason: '' }).records
  expect(used.find(row => row.id === 'secret-context')).toMatchObject({ body: '', restricted: true })
  expect(used.find(row => row.id === 'password-context')).toMatchObject({ body: '', restricted: true })
  expect(used.find(row => row.id === 'safe-rule')).toMatchObject({ body: rule, required: true, restricted: false })
  expect(JSON.stringify(h.listUsedContext({ ...scope, eventId: 'm-context-safety' }))).not.toContain(secret)
  const event = h.events.get('m-context-safety')
  const speaker = h.product.getPersona('coord')
  if (event === undefined || speaker === undefined) throw new Error('missing-context-origin')
  const prompt = h.orchestration.talkPrompt(event, speaker, [...used])
  expect(prompt).not.toContain(secret)
  expect(prompt).not.toContain(password)
  expect(prompt).toContain(rule)
  for (const body of guidance) expect(prompt).toContain(body)
  expect(h.vault.getRecord('password-context')?.body).toContain(password)
})

it('curates explicit report facts once with the admitted audience and keeps the complete report before UI clipping', async () => {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  const evidence = 'O cliente prefere uma resposta curta.'
  const summary = `${'Relatório de execução com contexto. '.repeat(90)}${evidence}`
  h.putBrainPage({ workspaceId: 'ws', projectId: 'pp', id: 'public-fact', kind: 'learning', title: 'Respostas do cliente',
    body: 'Contexto público preservado.', editorKind: 'person', editorId: 'ana', visibility: 'workspace' })
  const report = { state: 'ready' as const, summary,
    facts: [{ kind: 'preference', title: 'Respostas do cliente', body: evidence, evidence }] }
  const runners = recordedTaskRunner(report)
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  ask(h, 'm-facts', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const scope = { workspaceId: 'ws', projectId: 'pp' }
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]
  const assignment = ticket?.assignments.at(-1)
  if (ticket === undefined || assignment === undefined) throw new Error('missing-fact-ticket')
  const pages = h.listBrainPages(scope)
  expect(pages).toHaveLength(2)
  const curated = pages.find(page => page.id !== 'public-fact')
  expect(curated).toMatchObject({ kind: 'learning', title: 'Respostas do cliente', body: evidence })
  expect(h.getBrainPage({ ...scope, pageId: 'public-fact' }).body).toBe('Contexto público preservado.')
  const page = h.brain.brain.get(curated?.id ?? '')
  expect(page?.visibility).toEqual({ kind: 'members', memberIds: ['ana'] })
  expect(page?.sources).toContain(`task:${ticket.id}`)
  expect(h.screens.screens.get('pp', 'worker_report', assignment.id)).toMatchObject({ report: { summary, facts: report.facts } })
  expect(h.screens.screens.get('pp', 'report_curation', assignment.id)).toMatchObject({ written: 1,
    facts: [{ sourceTicketId: ticket.id, evidence, audience: { kind: 'channel', channelId: 'geral', memberIds: ['ana'] } }] })
  const origin = h.events.get('m-facts')
  if (origin === undefined) throw new Error('missing-origin')
  h.orchestration.onTaskSettled?.(origin, false)
  expect(h.listBrainPages(scope)).toHaveLength(2)
  expect(h.listBrainVersions({ ...scope, pageId: page?.id ?? '' })).toHaveLength(1)
})

it('curation rejects a short labelled secret before persisting model facts', async () => {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  const evidence = `api_key=${['synthetic', 'short', 'value'].join('-')}`
  const report = { state: 'ready' as const, summary: evidence,
    facts: [{ kind: 'reference', title: 'Acesso de teste', body: evidence, evidence }] }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, recordedTaskRunner(report))
  ask(h, 'm-sensitive-fact', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]
  const assignment = ticket?.assignments.at(-1)
  if (assignment === undefined) throw new Error('missing-sensitive-fact-assignment')
  expect(h.listBrainPages({ workspaceId: 'ws', projectId: 'pp' })).toEqual([])
  expect(h.screens.screens.get('pp', 'report_curation', assignment.id))
    .toMatchObject({ written: 0, facts: [], rejected: [{ index: 0, reason: 'secret' }] })
})

it('a successful report without explicit facts does not create a generic knowledge page', async () => {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  h.orchestration.runnerFactory = request => resolveHostRunner(request, recordedTaskRunner({ state: 'ready', summary: 'README entregue.' }))
  ask(h, 'm-no-facts', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  expect(h.listBrainPages({ workspaceId: 'ws', projectId: 'pp' })).toEqual([])
})

it('a fact reported after a DM stays readable only by its original participants', async () => {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  h.createMember({ id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createProject({ id: 'shared', workspaceId: 'ws', name: 'Equipe', description: '' })
  const coordinator = h.product.getPersona('coord')
  if (coordinator === undefined) throw new Error('missing-coordinator')
  h.product.createPersona({ ...coordinator, id: 'dm-coord' }, 'shared')
  const dm = h.createDm({ workspaceId: 'ws', projectId: 'shared', id: 'private-facts', participantA: 'ana', participantB: 'dm-coord' })
  const evidence = 'Ana prefere a revisão em texto.'
  const report = { state: 'ready' as const, summary: evidence,
    facts: [{ kind: 'preference', title: 'Revisão pessoal', body: evidence, evidence }] }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, recordedTaskRunner(report))
  h.postMessage({ workspaceId: 'ws', projectId: 'shared', id: 'm-dm-facts', streamKind: 'dm', ownerId: dm.id,
    actorId: 'ana', subjectId: 'dm-review', body: 'preciso de um README no projeto', occurredAt: '2026-11-03T15:00:00.000Z' })
  await h.orchestration.flush('shared')
  const scope = { workspaceId: 'ws', projectId: 'shared' }
  const page = h.listBrainPages(scope)[0]
  if (page === undefined) throw new Error('missing-private-fact')
  expect(h.brain.brain.get(page.id)?.visibility).toEqual({ kind: 'members', memberIds: ['ana', 'dm-coord'] })
  h.sessionMemberId = 'bia'
  expect(h.listBrainPages(scope)).toEqual([])
  expect(h.getBrainHome(scope).changedToday.some(row => row.body.includes(evidence))).toBe(false)
})

it('a curation write failure keeps the delivery visible and retries the persisted report without another model turn', async () => {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  const evidence = 'O cliente prefere texto curto.'
  const report = { state: 'ready' as const, summary: evidence,
    facts: [{ kind: 'preference', title: 'Preferência de texto', body: evidence, evidence }] }
  let resolves = 0
  h.orchestration.runnerFactory = (request) => {
    resolves += 1
    return resolveHostRunner(request, recordedTaskRunner(report))
  }
  const write = vi.spyOn(h.brain.brain, 'putPage').mockImplementationOnce(() => { throw new Error('write-failed') })
  try {
    ask(h, 'm-facts-retry', 'preciso de um README no projeto')
    await h.orchestration.flush('pp')
  } finally {
    write.mockRestore()
  }
  expect(bodies(h)).toContain(evidence)
  expect(h.listBrainPages({ workspaceId: 'ws', projectId: 'pp' })).toEqual([])
  expect(h.lastErrors.some(row => row.includes('relatório foi guardado'))).toBe(true)
  const beforeRetry = resolves
  h.tickLibrarianBatch({ workspaceId: 'ws', projectId: 'pp' })
  expect(h.listBrainPages({ workspaceId: 'ws', projectId: 'pp' })).toHaveLength(1)
  expect(resolves).toBe(beforeRetry)
})

it('records each call once with its actual provider, kind, ticket and cache counters before flush finishes', async () => {
  const h = host()
  seed(h)
  // The ledger meters every call that is made, triage included: keep the call on for this accounting test.
  // The default skips it (token-wiring.spec SK: nothing reads its answer).
  h.orchestration.skipTriage = false
  onTestFinished(() => { h.orchestration.skipTriage = true })
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

it('a failed deliver retains measured usage on disk before the visible failure settles', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'persona-failed-ledger-'))
  ledgerDirectories.push(directory)
  const databasePath = join(directory, 'persona.db')
  const h = host(databasePath)
  seed(h)
  h.orchestration.scripted = false
  const privateDetail = ['synthetic', 'credential', 'detail'].join('-')
  h.orchestration.runnerFactory = async request => ({
    ...createFakeRunner(),
    deliver: async () => {
      request?.usage?.record({ provider: 'claude', model: 'haiku', kind: 'execution', window: 'turn',
        inputTokens: 40, outputTokens: 10, cacheReadTokens: 30, cacheWriteTokens: 2,
        at: '2026-11-04T12:00:00.000Z', origin: 'measured' })
      throw new Error(`synthetic execution failure api_key=${privateDetail}`)
    },
  })
  ask(h, 'm-meter-failed', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  const task = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]
  expect(task?.stage).toBe('blocked')
  expect(bodies(h)).toContain('"code":"engine_unavailable"')
  expect(bodies(h)).not.toContain(privateDetail)
  expect(JSON.stringify(h.orchestration.lastErrors)).not.toContain(privateDetail)
  const persisted = new DatabaseSync(databasePath, { readOnly: true })
  try {
    const rows = persisted.prepare('SELECT ticket_id, kind, engine, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM turn_ledger WHERE project_id = ?').all('pp')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ticket_id: task?.id, kind: 'execution', engine: 'claude',
      input_tokens: 40, output_tokens: 10, cache_read_tokens: 30, cache_write_tokens: 2 })
  } finally {
    persisted.close()
  }
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

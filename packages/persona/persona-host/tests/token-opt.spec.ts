import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-03T15:00:00.000Z'
const scope = { workspaceId: 'ws', projectId: 'pp' }
const stream = { ...scope, streamKind: 'channel' as const, ownerId: 'geral' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'nina', name: 'Nina', title: 'Design',
    description: 'UI.', personality: 'Calma.', instructions: 'Desenhe.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    systemRoles: ['coordination'],
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

it('folds a subject after N messages and keeps required vault in compileUsed', async () => {
  const h = host()
  seed(h)
  h.createVaultRecord({
    ...scope, id: 'rule-1', kind: 'constraint', body: 'Nunca enviar senha para ninguém.', authorId: 'ana',
  })
  const topicId = h.listConversationSubjects(stream).subjects[0]!.id
  for (let i = 1; i <= 6; i += 1) {
    h.postMessage({
      id: `m-${String(i)}`, ...stream, body: `chat ${String(i)}`, actorId: 'ana', subjectId: 's',
      occurredAt: CLOCK, topicId,
    })
  }
  const event = h.events.get('m-6')
  const speaker = h.product.getPersona('nina')
  expect(event).toBeDefined()
  expect(speaker).toBeDefined()
  const used = await h.orchestration.compileUsed(event!, speaker!)
  expect(used.some(row => row.required && row.body.includes('Nunca enviar senha'))).toBe(true)
  const fold = h.getSubjectSummary({ ...scope, topicId })
  expect(fold.summary).toContain('chat')
  expect(used.filter(row => row.kind === 'subject_recent').length).toBeLessThanOrEqual(4)
  expect(used.some(row => row.kind === 'subject_summary')).toBe(true)
})

it('stable prefix is identical across two equal turns with different user text', () => {
  const h = host()
  seed(h)
  const speaker = h.product.getPersona('nina')!
  const used = [{
    id: 'rule-1', kind: 'constraint', body: 'Nunca enviar senha.', required: true, restricted: false,
  }]
  const a = h.orchestration.talkLayers({
    id: 'e1', streamId: 'channel:geral', workspaceId: 'ws', projectId: 'pp',
    seq: 1, type: 'message', body: 'oi um', actorId: 'ana', subjectId: 's',
    occurredAt: CLOCK, deleted: false,
  }, speaker, used)
  const b = h.orchestration.talkLayers({
    id: 'e2', streamId: 'channel:geral', workspaceId: 'ws', projectId: 'pp',
    seq: 2, type: 'message', body: 'oi dois', actorId: 'ana', subjectId: 's',
    occurredAt: CLOCK, deleted: false,
  }, speaker, used)
  expect(a.prefix).toBe(b.prefix)
  expect(a.prefix).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
  expect(a.text).not.toBe(b.text)
})

it('librarian lote only scans pages changed since the cursor', () => {
  const h = host()
  seed(h)
  h.putBrainPage({
    ...scope, id: 'p1', kind: 'rule', title: 'Tom', body: 'Fale curto.',
    editorKind: 'person', editorId: 'ana', visibility: 'workspace',
  })
  const first = h.tickLibrarianBatch(scope)
  expect(first.scanned).toBeGreaterThan(0)
  const idle = h.tickLibrarianBatch(scope)
  expect(idle.scanned).toBe(0)
})

it('initiative lote stays quiet when nothing changed', () => {
  const h = host()
  seed(h)
  const quiet = h.tickInitiativeBatch({
    ...scope, leaseUntil: '2026-11-03T16:00:00.000Z', stallAfterMs: 60_000,
  })
  expect(quiet.initiatives).toBe(0)
})

it('limit pool counts the same login once across environments', () => {
  const h = host()
  seed(h)
  const pools = h.putProviderLimitReports({
    ...scope,
    reports: [
      {
        accountId: 'a1', provider: 'claude', label: 'Trabalho', email: 'ana@acme.com',
        checkedAt: CLOCK, environmentId: 'desk', environmentLabel: 'Desktop',
        windows: [{ id: '5h', kind: 'session', usedPercent: 10, resetsAt: '2026-11-03T20:00:00.000Z' }],
      },
      {
        accountId: 'a1-laptop', provider: 'claude', label: 'Trabalho', email: 'ana@acme.com',
        checkedAt: '2026-11-03T15:10:00.000Z', environmentId: 'lap', environmentLabel: 'Laptop',
        windows: [{ id: '5h', kind: 'session', usedPercent: 20, resetsAt: '2026-11-03T20:00:00.000Z' }],
      },
    ],
  })
  expect(pools[0]?.accountCount).toBe(1)
  expect(h.getProviderLimitPool(scope)[0]?.accountCount).toBe(1)
})

it('persists TurnLedgerEntry kinds and folds the Uso panel', () => {
  const h = host()
  seed(h)
  const layers = { system: 20, tools: 8, required: 0, subject: 0, recall: 0, message: 12 }
  h.recordTurnLedger({
    ...scope,
    entry: {
      id: 'turn-1', personaId: 'nina', engine: 'claude', kind: 'execution',
      inputTokens: 40, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 28,
      layers, at: CLOCK, ticketId: 'task-1', origin: 'measured',
    },
  })
  h.recordTurnLedger({
    ...scope,
    entry: {
      id: 'turn-2', personaId: 'nina', engine: 'claude', kind: 'evaluation',
      inputTokens: 50, outputTokens: 20, cacheReadTokens: 28, cacheWriteTokens: 0,
      layers: { ...layers, message: 22 }, at: CLOCK, ticketId: 'task-1', origin: 'measured',
    },
  })
  const panel = h.getUsagePanel({
    ...scope, successfulTicketIds: ['task-1'],
    period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z' },
  })
  expect(panel.origin).toBe('measured')
  expect(panel.tokensPerSuccessfulTask).toBe(120)
  expect(panel.byKind.map(row => row.key)).toEqual(['execution', 'evaluation'])
  expect(panel.cacheHitRate).toBeCloseTo(28 / 56)
  expect(h.usage.list({
    projectId: 'pp', from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z',
  }).map(row => row.window)).toEqual(['exec', 'eval'])
  expect(h.getUsagePanel({
    workspaceId: 'ws', projectId: 'pp',
    period: { from: '2025-01-01T00:00:00.000Z', to: '2025-01-31T00:00:00.000Z' },
  }).origin).toBe('estimate')
  const pro6 = h.measureProactivityV1()
  expect(pro6.total).toBe(6)
  expect(pro6.passed).toBe(6)
  expect(h.measureOpt3()).toEqual({ passed: 3, total: 3, failed: [] })
  expect(h.measureOpt4()).toEqual({ passed: 3, total: 3, failed: [] })
  expect(h.measureOpt5()).toEqual({ passed: 3, total: 3, failed: [] })
  expect(h.measureOpt6()).toEqual({ passed: 3, total: 3, failed: [] })
  const opt8 = h.measureOpt8({ workspaceId: 'ws' })
  expect(opt8.liveEntries).toBeGreaterThan(0)
  expect(opt8.liveOrigin).toBe('measured')
  expect(opt8.blocked).toEqual([])
  expect(opt8.failed).toContain('cut-40')
  const close = h.measureV1Close({ workspaceId: 'ws' })
  expect(close.passed).toBe(false)
  expect(close.proactivity.passed).toBe(6)
  expect(close.gestor.passed).toBe(3)
  expect(close.opt8.blocked).toEqual([])
  expect(close.opt8.failed).toContain('cut-40')
  expect(close.opt8.liveEntries).toBe(opt8.liveEntries)
  expect(close.opt8.liveOrigin).toBe('measured')
})

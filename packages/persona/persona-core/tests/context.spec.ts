import { expect, it } from 'vitest'
import { compileContext, recall } from '../src/index.ts'
import type { ContextRecord, ContextScope, RecallEvent } from '../src/index.ts'

const scope: ContextScope = {
  workspaceId: 'team',
  projectId: 'launch',
  agentId: 'atlas',
  actorId: 'miguel',
  audienceId: 'channel-launch',
  policyRevision: '1',
}

const record = (id: string, overrides: Partial<ContextRecord> = {}): ContextRecord => ({
  id,
  workspaceId: 'team',
  projectId: 'launch',
  revision: 1,
  kind: 'memory',
  status: 'active',
  body: id,
  sourceIds: [],
  ...overrides,
})

/** Exact synthetic budget unit, NOT a model tokenizer. */
const countTokens = (text: string) => text.length

const compile = (
  records: ContextRecord[],
  options: Partial<Parameters<typeof compileContext>[0]> = {},
) => compileContext({
  scope,
  snapshot: { revision: 's1', requiredIds: [], records },
  budgetTokens: 10000,
  countTokens,
  authorize: async () => true,
  ...options,
})

it('cross-project and cross-agent memories excluded before permissive authorization', async () => {
  const result = await compile([
    record('ok'),
    record('foreign-project', { projectId: 'private' }),
    record('foreign-agent', { agentId: 'nina' }),
  ])
  expect(result.manifest.records.map(r => r.id)).toEqual(['ok'])
})

it('DM memory unavailable in channel and derived summary inherits denial', async () => {
  const result = await compile(
    [record('dm'), record('summary', { sourceIds: ['dm'] }), record('ok')],
    { authorize: async item => item.id !== 'dm' },
  )
  expect(result.manifest.records.map(r => r.id)).toEqual(['ok'])
})

it('missing and cyclic provenance fails closed', async () => {
  const result = await compile([
    record('missing', { sourceIds: ['absent'] }),
    record('a', { sourceIds: ['b'] }),
    record('b', { sourceIds: ['a'] }),
  ])
  expect(result.manifest.records.length).toBe(0)
})

it('required decision cannot be silently dropped for token budget', async () => {
  const snapshot = {
    revision: 's1',
    requiredIds: ['rule'],
    records: [record('rule', { kind: 'decision', body: 'Long rule '.repeat(100) })],
  }
  await expect(compile([], { snapshot, budgetTokens: 100 })).rejects.toMatchObject({
    code: 'REQUIRED_CONTEXT_OVERFLOW',
  })
})

it('inaccessible, revoked or absent required facts block execution', async () => {
  for (const records of [[], [record('rule', { status: 'revoked' })]]) {
    await expect(compile([], { snapshot: { revision: 's1', requiredIds: ['rule'], records } }))
      .rejects.toMatchObject({ code: 'REQUIRED_CONTEXT_UNAVAILABLE' })
  }
  await expect(compile([], {
    snapshot: { revision: 's1', requiredIds: ['rule'], records: [record('rule')] },
    authorize: async () => false,
  })).rejects.toMatchObject({ code: 'REQUIRED_CONTEXT_UNAVAILABLE' })
})

it('conflicting authoritative decisions block execution', async () => {
  await expect(compile([], {
    snapshot: {
      revision: 's1',
      requiredIds: ['a', 'b'],
      records: [
        record('a', { kind: 'decision', factKey: 'publishing', body: 'approval' }),
        record('b', { kind: 'decision', factKey: 'publishing', body: 'automatic' }),
      ],
    },
  })).rejects.toMatchObject({ code: 'CONTEXT_CONFLICT' })
})

it('optional learned memory cannot override required decision', async () => {
  const result = await compile([], {
    snapshot: {
      revision: 's1',
      requiredIds: ['rule'],
      records: [
        record('rule', { kind: 'decision', factKey: 'publish', body: 'approval' }),
        record('old', { factKey: 'publish', body: 'automatic', relevance: 99 }),
      ],
    },
  })
  expect(result.manifest.records.map(r => r.id)).toEqual(['rule'])
})

it('deterministic context preserves identity across model changes', async () => {
  const a = await compile([record('b'), record('a')])
  const b = await compile([record('a'), record('b')])
  expect(a.text).toBe(b.text)
  expect(a.cacheKey).toBe(b.cacheKey)
  expect(a.manifest.agentId).toBe('atlas')
  // Runtime model selection deliberately has no field in persona identity/context.
})

it('policy revision and destination isolate cache entries', async () => {
  const a = await compile([record('ok')])
  for (const changed of [
    { policyRevision: '2' },
    { audienceId: 'dm-miguel' },
    { actorId: 'friend' },
  ]) {
    const b = await compile([record('ok')], { scope: { ...scope, ...changed } })
    expect(a.cacheKey).not.toBe(b.cacheKey)
  }
})

it('optional records respect budget with mandatory records preserved', async () => {
  const snapshot = {
    revision: 's1',
    requiredIds: ['rule'],
    records: [
      record('rule', { kind: 'decision' }),
      record('big', { body: 'x'.repeat(5000), relevance: 9 }),
      record('small'),
    ],
  }
  const result = await compile([], { snapshot, budgetTokens: 400 })
  expect(result.manifest.tokenCount).toBeLessThanOrEqual(400)
  expect(result.manifest.records.some(r => r.id === 'rule')).toBe(true)
  expect(result.manifest.records.some(r => r.id === 'big')).toBe(false)
})

it('input mutation during authorization cannot alter assembled snapshot', async () => {
  const mutable = record('rule')
  const result = await compile([mutable], {
    authorize: async () => {
      mutable.body = 'injected'
      return true
    },
  })
  const parsed = JSON.parse(result.text) as { records: Array<{ body: string }> }
  expect(parsed.records[0]?.body).toBe('rule')
})

it('recall returns exact authorized subject/date events with stable cursor', async () => {
  const event = (sequence: number, overrides: Partial<RecallEvent> = {}): RecallEvent => {
    const base = record(`e${sequence}`)
    return {
      id: base.id,
      workspaceId: base.workspaceId,
      projectId: base.projectId,
      sequence,
      subjectId: 'planning',
      occurredAt: '2026-11-03T13:00:00Z',
      type: 'message',
      body: base.body,
      ...overrides,
    }
  }
  const events = [
    event(1, { body: 'Original wording' }),
    event(2, { projectId: 'private' }),
    event(3, { subjectId: 'other' }),
    event(4, { body: 'DM secret' }),
    event(5),
    event(6, { occurredAt: '2026-11-02T13:00:00Z' }),
    event(7, { type: 'tool_trace' }),
  ]
  const options = {
    scope,
    events,
    subjectId: 'planning',
    since: '2026-11-03T00:00:00Z',
    until: '2026-11-03T23:59:59Z',
    authorize: async (item: RecallEvent) => item.id !== 'e4',
    limit: 1,
  }
  const first = await recall(options)
  expect(first.events[0]?.body).toBe('Original wording')
  const next = await recall({ ...options, afterSequence: first.nextSequence })
  expect(next.events.map(e => e.id)).toEqual(['e5'])
})

it('recall rejects ambiguous timezones', async () => {
  await expect(recall({
    scope,
    events: [],
    subjectId: 'a',
    since: '2026-11-03T12:00:00',
    authorize: async () => true,
  })).rejects.toMatchObject({ code: 'INVALID_TIMESTAMP' })
})

it('duplicate snapshot identifiers and invalid tokenizer fail visibly', async () => {
  await expect(compile([record('a'), record('a')])).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' })
  await expect(compile([], { countTokens: () => Number.NaN })).rejects.toMatchObject({
    code: 'INVALID_TOKEN_COUNT',
  })
})

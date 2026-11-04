import { expect, it } from 'vitest'
import { compileActiveSubject, recall, restrictSnapshotToSubject } from '../src/index.ts'
import type { ContextRecord, ContextScope, RecallEvent } from '../src/index.ts'

const scope: ContextScope = {
  workspaceId: 'team',
  projectId: 'launch',
  agentId: 'nina',
  actorId: 'miguel',
  audienceId: 'dm-nina',
  policyRevision: '1',
}

function record(id: string, overrides: Partial<ContextRecord> = {}): ContextRecord {
  return {
    id,
    workspaceId: 'team',
    projectId: 'launch',
    revision: 1,
    kind: 'memory',
    status: 'active',
    body: id,
    sourceIds: [],
    ...overrides,
  }
}

it('restricts the snapshot to the active subject plus requireds and vault decisions', () => {
  const snapshot = {
    revision: 's1',
    requiredIds: ['rule'],
    records: [
      record('rule', { kind: 'decision', body: 'cofre' }),
      record('ui-mem', { subjectId: 'subject-ui', body: 'só UI' }),
      record('fin-mem', { subjectId: 'subject-fin', body: 'só financeiro' }),
      record('vault', { kind: 'constraint', body: 'obrigatório' }),
    ],
  }
  const restricted = restrictSnapshotToSubject(snapshot, 'subject-ui')
  expect(restricted.records.map(row => row.id).sort()).toEqual(['rule', 'ui-mem', 'vault'])
})

it('compileContext of subject A omits B unless cited via Chain of Recall', async () => {
  const snapshot = {
    revision: 's1',
    requiredIds: ['rule'],
    records: [
      record('rule', { kind: 'decision', body: 'cofre' }),
      record('ui-mem', { subjectId: 'subject-ui', body: 'layout do card' }),
      record('fin-mem', { subjectId: 'subject-fin', body: 'preço do pão' }),
    ],
  }
  const quiet = await compileActiveSubject({
    scope,
    snapshot,
    budgetTokens: 10_000,
    countTokens: text => text.length,
    authorize: async () => true,
    activeSubjectId: 'subject-ui',
  })
  expect(quiet.compiled.text).toContain('layout do card')
  expect(quiet.compiled.text).not.toContain('preço do pão')
  expect(quiet.chain).toEqual([])

  const cited = await compileActiveSubject({
    scope,
    snapshot,
    budgetTokens: 10_000,
    countTokens: text => text.length,
    authorize: async () => true,
    activeSubjectId: 'subject-ui',
    citedSubjectIds: ['subject-fin'],
    subjectNodes: [
      { id: 'subject-ui', summary: 'UI', body: 'layout', neighborIds: ['subject-fin'] },
      { id: 'subject-fin', summary: 'Financeiro', body: 'preço do pão', neighborIds: [] },
    ],
  })
  expect(cited.compiled.text).not.toContain('preço do pão')
  expect(cited.chain.map(hop => hop.id)).toEqual(['subject-fin'])
  expect(cited.chain[0]?.body).toBe('preço do pão')
})

it('drops optional subject rows already in the prefix and keeps an incremental digest (OPT-4)', async () => {
  const snapshot = {
    revision: 's1',
    requiredIds: ['rule'],
    records: [
      record('rule', { kind: 'decision', body: 'Nunca inventar preço.' }),
      record('ui-mem', { subjectId: 'subject-ui', body: 'layout do card' }),
    ],
  }
  const built = await compileActiveSubject({
    scope,
    snapshot,
    budgetTokens: 10_000,
    countTokens: text => text.length,
    authorize: async () => true,
    activeSubjectId: 'subject-ui',
    prefix: 'layout do card\nAtlas coordena.',
    subjectDigest: { previous: 'ontem pão', added: 'hoje café da Ana', budget: 20 },
  })
  expect(built.compiled.text).toContain('Nunca inventar preço.')
  expect(built.compiled.text).not.toContain('layout do card')
  expect(built.digest).toContain('café')
})

it('recall stays on the asked subject and date window', async () => {
  const events: RecallEvent[] = [
    {
      id: 'e1', workspaceId: 'team', projectId: 'launch', sequence: 1,
      subjectId: 'subject-ui', occurredAt: '2026-11-01T00:00:00Z', type: 'message', body: 'ui',
    },
    {
      id: 'e2', workspaceId: 'team', projectId: 'launch', sequence: 2,
      subjectId: 'subject-fin', occurredAt: '2026-11-03T00:00:00Z', type: 'message', body: 'fin',
    },
    {
      id: 'e3', workspaceId: 'team', projectId: 'launch', sequence: 3,
      subjectId: 'subject-ui', occurredAt: '2026-11-03T00:00:00Z', type: 'message', body: 'ui-2',
    },
  ]
  const result = await recall({
    scope,
    events,
    subjectId: 'subject-ui',
    since: '2026-11-02T00:00:00Z',
    authorize: async () => true,
  })
  expect(result.events.map(row => row.id)).toEqual(['e3'])
})

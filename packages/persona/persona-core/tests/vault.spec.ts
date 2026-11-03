import { expect, it } from 'vitest'
import {
  REQUIRED_VAULT_KINDS,
  authorizeContext,
  compileVaultContext,
  isRequiredVaultKind,
  nextVaultRevision,
  requiredVaultIds,
  toContextRecord,
  vaultAppliesToProject,
  vaultSnapshot,
} from '../src/index.ts'
import type { Actor, VaultRecord } from '../src/index.ts'

const actor: Actor = {
  kind: 'persona',
  id: 'coord',
  workspaceId: 'ws',
  workspaceRole: 'member',
  projectIds: ['launch'],
  systemRoles: ['coordination'],
}

const record = (overrides: Partial<VaultRecord> = {}): VaultRecord => ({
  id: 'v1',
  workspaceId: 'ws',
  kind: 'brief',
  body: 'Somos uma agência.',
  status: 'active',
  sourceIds: [],
  authorId: 'miguel',
  visibility: { kind: 'workspace' },
  createdAt: '2026-11-03T13:00:00Z',
  revision: 1,
  ...overrides,
})

it('treats constraint and decision as the required vault kinds', () => {
  expect(REQUIRED_VAULT_KINDS).toEqual(['constraint', 'decision'])
  expect(isRequiredVaultKind('constraint')).toBe(true)
  expect(isRequiredVaultKind('decision')).toBe(true)
  expect(isRequiredVaultKind('brief')).toBe(false)
  expect(isRequiredVaultKind('memory')).toBe(false)
})

it('bumps vault revisions monotonically and rejects a non-positive current', () => {
  expect(nextVaultRevision(1)).toBe(2)
  expect(nextVaultRevision(8)).toBe(9)
  expect(() => { nextVaultRevision(0) }).toThrow('INVALID_VAULT_RECORD')
})

it('applies workspace visibility to every project and project visibility only to that project', () => {
  expect(vaultAppliesToProject(record(), 'launch')).toBe(true)
  expect(vaultAppliesToProject(record({ visibility: { kind: 'project', projectId: 'launch' } }), 'launch')).toBe(true)
  expect(vaultAppliesToProject(record({ visibility: { kind: 'project', projectId: 'ops' } }), 'launch')).toBe(false)
})

it('maps vault records onto context records, including persona agentId and factKey', () => {
  const mapped = toContextRecord(record({
    kind: 'memory',
    factKey: 'tone',
    visibility: { kind: 'persona', personaId: 'bento' },
  }), 'launch')
  expect(mapped).toMatchObject({
    id: 'v1',
    projectId: 'launch',
    kind: 'memory',
    agentId: 'bento',
    factKey: 'tone',
  })
  expect(toContextRecord(record({ visibility: { kind: 'project', projectId: 'ops' } }), 'launch').projectId).toBe('ops')
})

it('lists active required vault ids for the compilation project', () => {
  const records = [
    record({ id: 'c1', kind: 'constraint' }),
    record({ id: 'd1', kind: 'decision' }),
    record({ id: 'b1', kind: 'brief' }),
    record({ id: 'c-ops', kind: 'constraint', visibility: { kind: 'project', projectId: 'ops' } }),
    record({ id: 'c-old', kind: 'constraint', status: 'revoked' }),
  ]
  expect(requiredVaultIds(records, 'launch')).toEqual(['c1', 'd1'])
  expect(vaultSnapshot(records, 'launch', 's1').requiredIds).toEqual(['c1', 'd1'])
  expect(vaultSnapshot(records, 'launch', 's1').records.map(item => item.id)).toEqual(['c1', 'd1', 'b1', 'c-old'])
})

it('feeds required vault records into compileContext and fails closed when one is denied', async () => {
  const records = [
    record({ id: 'rule', kind: 'decision', body: 'Aprovar publicação' }),
    record({ id: 'note', kind: 'memory', body: 'opcional' }),
  ]
  const compiled = await compileVaultContext({
    scope: {
      workspaceId: 'ws',
      projectId: 'launch',
      agentId: 'coord',
      actorId: 'miguel',
      audienceId: 'geral',
      policyRevision: '1',
    },
    records,
    snapshotRevision: 's1',
    budgetTokens: 10000,
    countTokens: text => text.length,
    authorize: authorizeContext(actor),
  })
  expect(compiled.manifest.requiredIds).toEqual(['rule'])
  expect(compiled.manifest.records.map(item => item.id)).toEqual(['rule', 'note'])
  expect(compiled.text).toContain('Aprovar publicação')

  await expect(compileVaultContext({
    scope: {
      workspaceId: 'ws',
      projectId: 'launch',
      agentId: 'coord',
      actorId: 'miguel',
      audienceId: 'geral',
      policyRevision: '1',
    },
    records,
    snapshotRevision: 's1',
    budgetTokens: 10000,
    countTokens: text => text.length,
    authorize: async () => false,
  })).rejects.toMatchObject({ code: 'REQUIRED_CONTEXT_UNAVAILABLE' })
})

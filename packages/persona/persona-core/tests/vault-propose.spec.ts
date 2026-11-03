import { expect, it } from 'vitest'
import { applyVaultProposal, parseVaultRecord, proposeVaultUpdate } from '../src/index.ts'
import type { Actor } from '../src/index.ts'

const record = parseVaultRecord({
  id: 'v1', workspaceId: 'ws', kind: 'brief', body: 'Somos uma agência.', status: 'active',
  sourceIds: [], authorId: 'miguel', visibility: { kind: 'project', projectId: 'launch' },
  createdAt: '2026-11-03T15:00:00Z', revision: 1,
})

const worker: Actor = {
  kind: 'persona', id: 'bento', workspaceId: 'ws', workspaceRole: 'member', projectIds: ['launch'],
}

it('auto-approves a vault update that does not escalate visibility', () => {
  const proposal = proposeVaultUpdate({
    id: 'p1', creator: worker, current: record, nextBody: 'Somos uma agência de sites.',
    nextVisibility: { kind: 'project', projectId: 'launch' }, policy: 'auto', createdAt: '2026-11-03T15:01:00Z',
  })
  expect(proposal.status).toBe('approved')
  expect(applyVaultProposal(record, proposal).revision).toBe(2)
})

it('refuses a proposal that widens visibility beyond the creator', () => {
  expect(() => proposeVaultUpdate({
    id: 'p2', creator: worker, current: record, nextBody: 'segredo',
    nextVisibility: { kind: 'workspace' }, policy: 'auto', createdAt: '2026-11-03T15:01:00Z',
  })).toThrow('ACCESS_ESCALATION')
})

it('keeps an approval-policy proposal pending', () => {
  const proposal = proposeVaultUpdate({
    id: 'p3', creator: worker, current: record, nextBody: 'ajuste',
    nextVisibility: { kind: 'project', projectId: 'launch' }, policy: 'approval', createdAt: '2026-11-03T15:01:00Z',
  })
  expect(proposal.status).toBe('pending')
  expect(() => applyVaultProposal(record, proposal)).toThrow('ACL_DENIED')
})

it('refuses a credential-shaped body and a foreign workspace', () => {
  expect(() => proposeVaultUpdate({
    id: 'p4', creator: worker, current: record, nextBody: 'sk-ant-api03-ABCDEFGHIJKLMNOP',
    nextVisibility: { kind: 'project', projectId: 'launch' }, policy: 'auto', createdAt: '2026-11-03T15:01:00Z',
  })).toThrow('SECRET_REFUSED')
  const foreign: Actor = { ...worker, workspaceId: 'other' }
  expect(() => proposeVaultUpdate({
    id: 'p5', creator: foreign, current: record, nextBody: 'ok',
    nextVisibility: { kind: 'project', projectId: 'launch' }, policy: 'auto', createdAt: '2026-11-03T15:01:00Z',
  })).toThrow('ACL_DENIED')
})

it('applyVaultProposal refuses a mismatched record', () => {
  const proposal = proposeVaultUpdate({
    id: 'p6', creator: worker, current: record, nextBody: 'ok',
    nextVisibility: { kind: 'project', projectId: 'launch' }, policy: 'auto', createdAt: '2026-11-03T15:01:00Z',
  })
  expect(() => applyVaultProposal({ ...record, id: 'other' }, proposal)).toThrow('INVALID_VAULT_RECORD')
})

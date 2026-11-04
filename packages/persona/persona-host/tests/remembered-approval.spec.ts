import { expect, vi } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-04T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed() {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({ ...scope, id: 'nina', name: 'Nina', title: 'Conhecimento', description: '', personality: '', instructions: '',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana' })
  h.createVaultRecord({ ...scope, id: 'brief', kind: 'brief', body: 'Versão inicial.', authorId: 'ana' })
  h.sessionMemberId = 'ana'
  return h
}

it('a real vault proposal consumes an exact remembered permission once and exposes its audit', () => {
  const h = seed()
  h.grantBrainPermission({ ...scope, id: 'grant', personaId: 'nina', action: 'vault.update', target: 'vault:brief', validity: 'once' })
  const first = h.proposeVault({ ...scope, id: 'proposal-1', creatorPersonaId: 'nina', recordId: 'brief', nextBody: 'Versão autorizada.' })
  expect(first).toMatchObject({ status: 'approved', permissionGrantId: 'grant', permissionAudit: 'não perguntei porque você permitiu em 04/11' })
  expect(h.vault.getRecord('brief')?.body).toBe('Versão autorizada.')
  expect(h.listApprovals(scope).find(row => row.id === first.id)).toMatchObject({ permissionGrantId: 'grant', permissionTarget: 'vault:brief' })
  expect(h.brain.brain.getGrant('grant')?.useCount).toBe(1)
  expect(h.proposeVault({ ...scope, id: 'proposal-2', creatorPersonaId: 'nina', recordId: 'brief', nextBody: 'Exige outra pergunta.' }).status).toBe('pending')
  expect(h.vault.getRecord('brief')?.body).toBe('Versão autorizada.')
})

it('a different target, expired permission or revocation keeps the proposal pending', () => {
  const h = seed()
  h.grantBrainPermission({ ...scope, id: 'grant', personaId: 'nina', action: 'vault.update', target: 'vault:outro', validity: '7d' })
  expect(h.proposeVault({ ...scope, id: 'different', creatorPersonaId: 'nina', recordId: 'brief', nextBody: 'Outro alvo.' }).status).toBe('pending')
  h.grantBrainPermission({ ...scope, id: 'expiring', personaId: 'nina', action: 'vault.update', target: 'vault:brief', validity: '7d' })
  h.orchestration.now = () => '2026-11-12T12:00:00.000Z'
  expect(h.proposeVault({ ...scope, id: 'expired', creatorPersonaId: 'nina', recordId: 'brief', nextBody: 'Fora da validade.' }).status).toBe('pending')
  h.grantBrainPermission({ ...scope, id: 'revoked', personaId: 'nina', action: 'vault.update', target: 'vault:brief', validity: 'until-revoke' })
  h.revokeBrainPermission({ ...scope, grantId: 'revoked' })
  expect(h.proposeVault({ ...scope, id: 'revoked-proposal', creatorPersonaId: 'nina', recordId: 'brief', nextBody: 'Revogada.' }).status).toBe('pending')
})

it('an approval write failure rolls back the grant consumption and leaves the proposal pending', () => {
  const h = seed()
  h.grantBrainPermission({ ...scope, id: 'grant', personaId: 'nina', action: 'vault.update', target: 'vault:brief', validity: 'once' })
  const fail = vi.spyOn(h.vault, 'updateRecord').mockImplementationOnce(() => { throw new Error('write-failed') })
  try {
    expect(() => h.proposeVault({ ...scope, id: 'failed', creatorPersonaId: 'nina', recordId: 'brief', nextBody: 'Não gravou.' })).toThrow('write-failed')
  } finally {
    fail.mockRestore()
  }
  expect(h.brain.brain.getGrant('grant')?.useCount).toBe(0)
  expect(h.listApprovals(scope).find(row => row.id === 'failed')?.status).toBe('pending')
  expect(h.vault.getRecord('brief')?.body).toBe('Versão inicial.')
})

import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

function host(): PersonaHost {
  const ctx = new Context()
  roots.push(ctx)
  return new PersonaHost(ctx)
}

function seed(h: PersonaHost): { scope: { workspaceId: string; projectId: string } } {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  return { scope: { workspaceId: 'ws', projectId: 'pp' } }
}

it('issues, lists, redeems and revokes invites', () => {
  const h = host()
  const { scope } = seed(h)
  const issued = h.issueInvite({ ...scope, inviteId: 'inv-1', token: 'tok-1', role: 'member' })
  expect(issued.status).toBe('open')
  expect(h.listInvites(scope).map(item => item.id)).toEqual(['inv-1'])
  const redeemed = h.redeemInvite({
    ...scope, token: 'tok-1', memberId: 'bia', displayName: 'Bia', handle: 'bia',
  })
  expect(redeemed.status).toBe('used')
  expect(h.listTeam(scope).members.some(item => item.id === 'bia')).toBe(true)
  const second = h.issueInvite({ ...scope, inviteId: 'inv-2', token: 'tok-2', role: 'guest' })
  expect(h.revokeInvite({ ...scope, inviteId: second.id }).status).toBe('revoked')
})

it('imports ChatGPT, Claude.ai and Markdown with preview → confirm → rollback', () => {
  const h = host()
  const { scope } = seed(h)
  const chatgpt = h.previewImport({
    ...scope,
    files: [{
      name: 'conversations.json',
      text: JSON.stringify([{
        id: 'c1', title: 'Tom',
        mapping: { n1: { message: { id: 'm', content: { parts: ['Prefere terças.'] } } } },
      }]),
    }],
  })
  expect(chatgpt.adapterId).toBe('chatgpt')
  expect(chatgpt.accepted).toBe(1)
  expect(h.confirmImport({
    ...scope, batchId: 'cg',
    files: [{
      name: 'conversations.json',
      text: JSON.stringify([{
        id: 'c1', title: 'Tom',
        mapping: { n1: { message: { id: 'm', content: { parts: ['Prefere terças.'] } } } },
      }]),
    }],
  }).applied).toBe(1)
  expect(h.listMemory(scope).some(item => item.id.startsWith('import:chatgpt:'))).toBe(true)

  const claude = h.previewImport({
    ...scope,
    files: [{
      name: 'claude.json',
      text: JSON.stringify([{ uuid: 'u1', name: 'Brief', chat_messages: [{ uuid: 'm1', text: 'Olá' }] }]),
    }],
  })
  expect(claude.adapterId).toBe('claude')
  expect(h.confirmImport({
    ...scope, batchId: 'cl',
    files: [{
      name: 'claude.json',
      text: JSON.stringify([{ uuid: 'u1', name: 'Brief', chat_messages: [{ uuid: 'm1', text: 'Olá' }] }]),
    }],
  }).applied).toBe(1)
})

it('imports markdown preview → confirm → rollback and refuses a second apply', () => {
  const h = host()
  const { scope } = seed(h)
  const files = [{ name: 'note.md', text: 'Preferência: terças.' }]
  const preview = h.previewImport({ ...scope, files })
  expect(preview.adapterId).toBe('markdown')
  expect(preview.accepted).toBe(1)
  const batch = h.confirmImport({ ...scope, batchId: 'b1', files })
  expect(batch.applied).toBe(1)
  expect(h.getImportBatch({ ...scope, batchId: 'b1' }).rolledBack).toBe(false)
  expect(h.confirmImport({ ...scope, batchId: 'b2', files }).applied).toBe(0)
  expect(h.rollbackImport({ ...scope, batchId: 'b1' }).rolledBack).toBe(true)
})

it('persists triage rules, quiet windows and project limits', () => {
  const h = host()
  const { scope } = seed(h)
  h.putTriageRule({
    ...scope, id: 'r1', gateText: 'Só admin.', assessmentText: 'Pedir confirmação.',
    logOnly: true, speculativeEnabled: false,
  })
  expect(h.listTriageRules(scope)[0]?.gateText).toMatch(/admin/)
  expect(h.deleteTriageRule({ ...scope, id: 'r1' })).toBe(true)
  expect(h.listTriageRules(scope)).toEqual([])
  h.putQuietWindow({ ...scope, id: 'q1', label: 'Noite', start: '22:00', end: '07:00' })
  expect(h.listQuietWindows(scope)[0]?.start).toBe('22:00')
  expect(h.getProjectLimits(scope).maxProposalsPerDay).toBe(3)
  expect(h.setProjectLimits({
    ...scope, maxProposalsPerDay: 5, tokensPerPersonaMonth: 1, tokensPerProjectMonth: 2,
  }).maxProposalsPerDay).toBe(5)
  h.putTriageRule({
    ...scope, id: 'r1', gateText: 'Só admin.', assessmentText: 'Pedir.',
    logOnly: true, speculativeEnabled: false,
  })
  expect(h.simulateTriage({ ...scope, ruleId: 'r1', text: 'deploy prod' }).mode).toBe('logOnly')
  expect(h.listTriageLog(scope).length).toBe(1)
})

it('approvals cover hire, vault, skill and decide hire creates the persona', () => {
  const h = host()
  const { scope } = seed(h)
  const hire = h.proposeHire({
    ...scope, id: 'ap-h', creatorPersonaId: 'p1', name: 'Sol', title: 'Suporte', description: 'Atende.',
  })
  expect(hire.status).toBe('pending')
  const vault = h.createVaultRecord({
    ...scope, id: 'v1', kind: 'brief', body: 'Tom de voz.', authorId: 'ana',
  })
  h.proposeVault({ ...scope, id: 'ap-v', creatorPersonaId: 'p1', recordId: vault.id, nextBody: 'Tom novo.' })
  h.putSkill({ ...scope, id: 'sk1', name: 'PR', body: 'Revise o diff.', sharedWithTeam: true })
  h.proposeSkill({ ...scope, id: 'ap-s', skillId: 'sk1', title: 'PR' })
  expect(h.listApprovals(scope).map(item => item.kind).sort()).toEqual(['hire', 'skill', 'vault'])
  expect(h.decideApproval({ ...scope, id: 'ap-h', kind: 'hire', accept: true }).status).toBe('approved')
  expect(h.listPersonas(scope).some(item => item.id === 'hire:ap-h')).toBe(true)
  expect(h.decideApproval({ ...scope, id: 'ap-v', kind: 'vault', accept: true }).status).toBe('approved')
  expect(h.listVaultRecords(scope).find(item => item.id === 'v1')?.body).toBe('Tom novo.')
})

it('memory propose → edit → approve → forget', () => {
  const h = host()
  const { scope } = seed(h)
  h.proposeMemory({ ...scope, id: 'mem-1', authorId: 'p1', body: 'Prefere terças.' })
  expect(h.editMemory({ ...scope, id: 'mem-1', authorId: 'p1', body: 'Prefere quartas.' }).status).toBe('pending')
  expect(h.approveMemory({ ...scope, id: 'mem-1', authorId: 'p1', body: '' }).status).toBe('active')
  expect(h.listMemory(scope).some(item => item.status === 'active')).toBe(true)
  expect(h.forgetMemory({ ...scope, id: 'mem-1' }).status).toBe('revoked')
})

it('skill versions increment and rollback restores the previous body', () => {
  const h = host()
  const { scope } = seed(h)
  expect(h.putSkill({ ...scope, id: 'sk1', name: 'PR', body: 'v1', sharedWithTeam: false }).version).toBe(1)
  expect(h.reviseSkill({ ...scope, id: 'sk1', body: 'v2' }).status).toBe('candidate')
  const rolled = h.rollbackSkill({ ...scope, id: 'sk1' })
  expect(rolled.body).toBe('v1')
  expect(rolled.version).toBe(3)
})

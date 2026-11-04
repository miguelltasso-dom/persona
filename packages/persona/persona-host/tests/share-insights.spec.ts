import { exportPersonaFile, personaShareJson, type PersonaSpec, type SkillDirIo } from '@deepseek-ai/dsh-persona-core'
import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' } as const

function spec(): PersonaSpec {
  return {
    name: 'Guia',
    avatar: { kind: 'gallery', ref: 'luna' },
    title: 'Coordenação',
    description: 'Triagem.',
    personality: 'Calma.',
    instructions: 'Uma pergunta.',
    runner: { kind: 'dsh', model: 'deepseek-chat' },
    tools: { files: 'read' },
    skills: ['briefing'],
    limits: { concurrency: 1 },
    systemRoles: ['coordination'],
    canRecruit: true,
  }
}

function seed() {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createMember({
    id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  return h
}

function fakeSkills(): SkillDirIo {
  const files: Record<string, string> = {
    '/home/.claude/skills/brief/SKILL.md': '---\nname: Briefing\n---\nPeça o tom no Cofre.',
    '/home/.codex/skills/review/SKILL.md': '---\nname: Review\n---\nPeça testes no PR.',
  }
  const dirs = new Set([
    '/home/.claude/skills', '/home/.claude/skills/brief',
    '/home/.codex/skills', '/home/.codex/skills/review',
  ])
  return {
    home: () => '/home',
    isDir: path => dirs.has(path.replace(/\\/g, '/')),
    list: (dir) => {
      const norm = dir.replace(/\\/g, '/')
      if (norm === '/home/.claude/skills') return ['brief']
      if (norm === '/home/.codex/skills') return ['review']
      if (norm.endsWith('/brief') || norm.endsWith('/review')) return ['SKILL.md']
      return []
    },
    read: file => files[file.replace(/\\/g, '/')],
  }
}

it('exports and imports a persona as a pending proposal, never applying it', () => {
  const h = seed()
  const exported = h.exportPersona({ ...scope, personaId: 'coord' })
  expect(exported.filename).toBe('guia.persona.json')
  expect(exported.json).toContain('persona.share')
  const imported = h.importPersona({ ...scope, json: exported.json })
  expect(imported.spec.name).toBe('Guia')
  expect(h.listPersonas(scope).map(item => item.id)).toEqual(['coord'])
  expect(h.listApprovals(scope).some(item => item.kind === 'hire' && item.status === 'pending')).toBe(true)
})

it('refuses a secret in the share file and a guest writing an import', () => {
  const h = seed()
  expect(() => h.importPersona({
    ...scope,
    json: personaShareJson(exportPersonaFile({
      ...spec(),
      instructions: 'token sk-abcdefghijklmnopqrstuv',
    }, 'ana', '2026-11-03T21:00:00.000Z')),
  })).toThrow('SECRET_REFUSED')
  h.sessionMemberId = 'bia'
  expect(() => h.getActivationFunnel(scope)).toThrow('forbidden')
})

it('exports a team, imports it as proposals, and keeps CLI skills disabled', () => {
  const h = seed()
  const team = h.exportTeam(scope)
  expect(team.filename).toBe('pessoal.team.json')
  const imported = h.importTeam({ ...scope, json: team.json })
  expect(imported.personas[0]?.name).toBe('Guia')
  h.skillIo = fakeSkills()
  const preview = h.previewCliSkills()
  expect(preview.every(row => !row.enabled)).toBe(true)
  expect(preview.map(row => row.skillKey)).toEqual(['brief', 'review'])
  const proposed = h.proposeCliSkills({ ...scope, personaId: 'coord', skillKeys: ['brief'] })
  expect(proposed).toHaveLength(1)
  expect(proposed[0]?.status).toBe('candidate')
  expect(h.listSkills(scope).every(row => row.status === 'candidate')).toBe(true)
})

it('folds onboarding, useful reply, accepted proposal and a later session', async () => {
  const h = seed()
  await h.completeOnboarding({
    workspaceId: 'ws',
    personalProjectId: 'pp',
    displayName: 'Ana',
    team: [],
    templateIds: [],
    runnerChoices: [],
    cofreSeed: '',
  })
  h.postMessage({
    id: 'm-human', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um resumo', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  h.postMessage({
    id: 'm-reply', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'Aqui está o resumo pedido.', actorId: 'coord', subjectId: 't',
    occurredAt: '2026-11-03T15:01:00.000Z',
  })
  h.proposeHire({
    ...scope, id: 'hire-1', creatorPersonaId: 'coord',
    name: 'Nia', title: 'Pesquisa', description: 'Investiga.',
  })
  h.decideApproval({ ...scope, id: 'hire-1', kind: 'hire', accept: true })
  h.orchestration.now = () => '2026-11-05T15:00:00.000Z'
  h.postMessage({
    id: 'm-later', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: 'voltei', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-05T15:00:00.000Z',
  })
  const funnel = h.getActivationFunnel(scope)
  expect(funnel.onboarded).toBe(true)
  expect(funnel.firstUsefulReply).toBe(true)
  expect(funnel.returnedIn7Days).toBe(true)
  expect(funnel.stage).toBe('returned')
  const impact = h.getPersonaImpact({ ...scope, personaId: 'coord' })
  expect(impact.proposalsAccepted).toBe(1)
  expect(impact.hoursSavedLabel).toBe('estimativa')
  expect(h.listPersonaImpact(scope).some(row => row.personaId === 'coord')).toBe(true)
})

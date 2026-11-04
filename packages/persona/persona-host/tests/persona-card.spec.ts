import { expect } from 'vitest'
import { SPEAK_REFUSED, nowLineOf } from '../src/persona-card.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

function seed() {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createMember({
    id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member',
  })
  h.createProject({ id: 'team', workspaceId: 'ws', name: 'Time', description: 'compartilhado' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'team', id: 'dev', name: 'Bento', title: 'Engenharia',
    description: 'Código.', personality: 'Direto.', instructions: 'Entregue.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
  })
  return h
}

const scope = { workspaceId: 'ws', projectId: 'team' } as const

it('getPersonaCard defaults to workspace ACL, charge names, omitted quota, resting', () => {
  const h = seed()
  const card = h.getPersonaCard({ ...scope, personaId: 'dev' })
  expect(card.handle).toBe('bento')
  expect(card.systemRoles).toEqual(['coordination'])
  expect(card.nowKind).toBe('resting')
  expect(card.nowText).toBe('Descansando — nada na fila')
  expect(card.presence.online).toBe(true)
  expect(card.engine).toEqual({ runnerLabel: 'claude', modelLabel: 'haiku' })
  expect(card.currentProjectName).toBe('Time')
  expect(card.ownerName).toBe('Ana')
  expect(card.substituteName).toBeUndefined()
  expect(card.quota).toBeUndefined()
  expect(h.getPersonaTalkAcl({ ...scope, personaId: 'dev' })).toEqual({
    mode: 'workspace', principals: [],
  })
})

it('talk ACL is editable by the responsável and blocks DM and @mention with a pt-BR refusal', () => {
  const h = seed()
  expect(h.setPersonaTalkAcl({
    ...scope, personaId: 'dev', mode: 'chosen',
    principals: [{ kind: 'person', id: 'ana', name: 'Ana' }],
  })).toEqual({
    mode: 'chosen',
    principals: [{ kind: 'person', id: 'ana', name: 'Ana' }],
  })
  h.sessionMemberId = 'bia'
  expect(() => h.setPersonaTalkAcl({
    ...scope, personaId: 'dev', mode: 'workspace', principals: [],
  })).toThrow('forbidden')
  expect(() => h.createDm({
    id: 'dm-bia', ...scope, participantA: 'bia', participantB: 'dev',
  })).toThrow(SPEAK_REFUSED)
  expect(() => h.postMessage({
    id: 'm-at', ...scope, streamKind: 'channel', ownerId: 'geral',
    body: '@Bento olá', actorId: 'bia', subjectId: 't',
    occurredAt: '2026-11-03T20:00:00.000Z',
  })).toThrow(SPEAK_REFUSED)
  h.sessionMemberId = 'ana'
  expect(h.createDm({
    id: 'dm-ana', ...scope, participantA: 'ana', participantB: 'dev',
  }).id).toBe('dm-ana')
})

it('putPersonaCharge sets substituto; nowLine maps live states without fixed copy', () => {
  const h = seed()
  const charged = h.putPersonaCharge({
    ...scope, personaId: 'dev', responsibleHumanId: 'ana', substituteHumanId: 'bia',
  })
  expect(charged.ownerName).toBe('Ana')
  expect(charged.substituteName).toBe('Bia')
  expect(() => h.putPersonaCharge({
    ...scope, personaId: 'dev', responsibleHumanId: 'ana', substituteHumanId: 'ana',
  })).toThrow('substitute-is-responsible')

  const working = nowLineOf({
    paused: false, state: 'working', title: 'cláusulas do contrato', stage: 'doing',
    engineLabel: 'claude', lastActiveAt: '2026-11-03T15:00:00.000Z', limitedUntil: '',
  })
  expect(working.nowKind).toBe('working')
  expect(working.nowText).toBe('Trabalhando em cláusulas do contrato')

  const reviewing = nowLineOf({
    paused: false, state: 'working', title: 'cláusulas do contrato', stage: 'review',
    engineLabel: 'claude', lastActiveAt: '2026-11-03T15:00:00.000Z', limitedUntil: '',
  })
  expect(reviewing.nowKind).toBe('reviewing')
  expect(reviewing.nowText).toBe('Revisando cláusulas do contrato')

  const quota = nowLineOf({
    paused: false, state: 'working', title: 'README', stage: 'doing',
    engineLabel: 'claude', lastActiveAt: '2026-11-03T15:00:00.000Z',
    limitedUntil: '2026-11-03T18:30:00.000Z',
  })
  expect(quota.nowKind).toBe('quota')
  expect(quota.nowText).toBe('Esperando o plano do claude renovar às 18:30')

  const wait = nowLineOf({
    paused: false, state: 'waiting', title: 'deploy', stage: 'needs_you',
    engineLabel: 'claude', lastActiveAt: '2026-11-03T15:00:00.000Z', limitedUntil: '',
  })
  expect(wait.nowKind).toBe('waiting-approval')
  expect(wait.nowText).toBe('Esperando aprovação')
})

it('getPersonaCard surfaces official quota and omits unavailable or 0%', () => {
  const h = seed()
  h.usage.putQuota('team', {
    provider: 'claude', origin: 'official',
    windows: [{ id: '5h', origin: 'official', usedPercent: 100, resetsAt: '2026-11-04T09:15:00.000Z' }],
  })
  const card = h.getPersonaCard({ ...scope, personaId: 'dev' })
  expect(card.quota).toEqual({ fiveHourPct: 100, limitedUntil: '2026-11-04T09:15:00.000Z' })
  expect(card.nowKind).toBe('quota')
  expect(card.nowText).toMatch(/claude renovar/)
  expect(card.nowText).toMatch(/09:15/)

  h.usage.putQuota('team', {
    provider: 'claude', origin: 'official',
    windows: [{ id: '5h', origin: 'official', usedPercent: 0 }],
  })
  const empty = h.getPersonaCard({ ...scope, personaId: 'dev' })
  expect(empty.quota).toBeUndefined()
  expect(empty.nowKind).toBe('resting')
})

it('pausePersona / resumePersona / setPersonaEngine require card editor and audit', () => {
  const h = seed()
  const paused = h.pausePersona({ ...scope, personaId: 'dev' })
  expect(paused.nowKind).toBe('offline')
  expect(paused.nowText).toBe('Offline')
  expect(paused.presence.online).toBe(false)
  const resumed = h.resumePersona({ ...scope, personaId: 'dev' })
  expect(resumed.nowKind).toBe('resting')
  expect(resumed.presence.online).toBe(true)
  const engine = h.setPersonaEngine({
    ...scope, personaId: 'dev', runnerKind: 'dsh', runnerCli: '', runnerModel: 'sonnet',
  })
  expect(engine.engine).toEqual({ runnerLabel: 'dsh', modelLabel: 'sonnet' })
  h.sessionMemberId = 'bia'
  expect(() => h.pausePersona({ ...scope, personaId: 'dev' })).toThrow('forbidden')
  expect(() => h.setPersonaEngine({
    ...scope, personaId: 'dev', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku',
  })).toThrow('forbidden')
})

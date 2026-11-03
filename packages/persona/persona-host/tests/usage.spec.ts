import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => root.fiber.dispose()))
})

function host(): PersonaHost {
  const ctx = new Context()
  roots.push(ctx)
  const created = new PersonaHost(ctx)
  created.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  created.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  created.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  return created
}

it('folds fake-runner spend across a month boundary and never prints 0%', async () => {
  const h = host()
  h.usage.record({
    id: 'oct', projectId: 'pp', personaId: 'coord', provider: 'claude', model: 'haiku',
    window: 'turn', inputTokens: 40, outputTokens: 10, origin: 'measured', at: '2026-10-31T22:00:00.000Z',
  })
  h.usage.record({
    id: 'nov', projectId: 'pp', personaId: 'coord', provider: 'claude', model: 'haiku',
    window: 'turn', inputTokens: 8, outputTokens: 2, origin: 'estimate', at: '2026-11-01T02:00:00.000Z',
  })
  const across = h.getUsage({
    workspaceId: 'ws', projectId: 'pp', personaId: 'coord',
    period: { from: '2026-10-15T00:00:00.000Z', to: '2026-11-15T00:00:00.000Z' },
  })
  expect(across.runs).toBe(2)
  expect(across.tokens).toBe(60)
  expect(across.origin).toBe('estimate')
  expect(across.originLabel).toBe('estimado')
  expect(across.folds[0]).toMatchObject({ provider: 'claude', model: 'haiku', records: 2, origin: 'estimate' })
  const november = h.getUsage({
    workspaceId: 'ws', projectId: 'pp',
    period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T23:59:59.000Z' },
  })
  expect(november.runs).toBe(1)
  expect(november.tokens).toBe(10)
  const empty = h.getUsage({
    workspaceId: 'ws', projectId: 'pp',
    period: { from: '2025-01-01T00:00:00.000Z', to: '2025-01-31T00:00:00.000Z' },
  })
  expect(empty.origin).toBe('unavailable')
  expect(empty.runs).toBe(0)
  expect(JSON.stringify(empty)).not.toMatch(/"usedPercent":0/u)
  const quota = h.getOfficialQuota({ workspaceId: 'ws', projectId: 'pp', provider: 'claude' })
  expect(quota).toEqual([{ provider: 'claude', origin: 'unavailable', windows: [] }])
  expect(JSON.stringify(quota)).not.toMatch(/"usedPercent":0/u)
})

it('forbids a guest without project access', () => {
  const h = host()
  h.createMember({
    id: 'guest', workspaceId: 'ws', projectId: 'pp', displayName: 'Guest', handle: 'guest', role: 'guest',
  })
  h.sessionMemberId = 'guest'
  expect(() => h.getUsage({
    workspaceId: 'ws', projectId: 'pp',
    period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z' },
  })).toThrow(/forbidden/)
})

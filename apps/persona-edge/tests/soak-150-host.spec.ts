import { expect } from 'vitest'
import { bindHostFile, it } from '../../../packages/persona/persona-host/tests/host-harness.ts'

const { host } = bindHostFile()
const N = 150

it('150 idle personas: fair proactivity ticks, stable rss, zero AI', () => {
  const h = host()
  h.orchestration.scripted = true
  let clock = Date.parse('2026-11-04T08:00:00.000Z')
  h.orchestration.now = () => new Date(clock).toISOString()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  for (let i = 0; i < N; i += 1) {
    h.createPersona({
      workspaceId: 'ws',
      projectId: 'pp',
      id: `p${String(i).padStart(3, '0')}`,
      name: `P${String(i)}`,
      title: 'Executora',
      description: 'Idle.',
      personality: 'Calma.',
      instructions: 'Espere.',
      avatarKind: 'gallery',
      avatarRef: `p${String(i)}`,
      runnerKind: 'dsh',
      runnerCli: '',
      runnerModel: 'm',
      canRecruit: i === 0,
      createdBy: 'ana',
      ...(i === 0 ? { systemRoles: ['coordination'] as const } : {}),
    })
  }
  expect(h.listPersonas({ workspaceId: 'ws', projectId: 'pp' })).toHaveLength(N)

  let aiCalls = 0
  const inner = h.orchestration.runnerFactory
  h.orchestration.runnerFactory = async (request) => {
    aiCalls += 1
    return inner(request)
  }

  const rssBefore = process.memoryUsage().rss
  const handlesBefore = process.getActiveResourcesInfo().length
  const warmBefore = h.orchestration.warmRunners.size
  const started = Date.now()
  const ticks: number[] = []
  for (let step = 0; step < 8; step += 1) {
    clock += 15 * 60 * 1000
    h.orchestration.now = () => new Date(clock).toISOString()
    const t0 = Date.now()
    const result = h.tickProactivity({
      workspaceId: 'ws',
      projectId: 'pp',
      leaseUntil: new Date(clock + 60_000).toISOString(),
      stallAfterMs: 30 * 60 * 1000,
    })
    ticks.push(Date.now() - t0)
    expect(result.initiatives + result.skipped).toBeLessThanOrEqual(N)
  }
  const elapsedMs = Date.now() - started
  const rssDelta = process.memoryUsage().rss - rssBefore
  const handleDelta = process.getActiveResourcesInfo().length - handlesBefore

  expect(aiCalls).toBe(0)
  expect(h.orchestration.warmRunners.size).toBe(warmBefore)
  expect(elapsedMs).toBeLessThan(20_000)
  expect(Math.max(...ticks)).toBeLessThan(5_000)
  expect(rssDelta).toBeLessThan(192 * 1024 * 1024)
  expect(handleDelta).toBeLessThan(64)

  const fires = new Map<string, number>()
  for (const persona of h.listPersonas({ workspaceId: 'ws', projectId: 'pp' })) {
    fires.set(persona.id, 0)
  }
  for (const row of h.proactivity.repos.firesSince('pp', '1970-01-01T00:00:00.000Z')) {
    fires.set(row.personaId, (fires.get(row.personaId) ?? 0) + 1)
  }
  const counts = [...fires.values()]
  const max = Math.max(...counts)
  const min = Math.min(...counts)
  expect(max).toBeLessThanOrEqual(1)
  expect(max - min).toBeLessThanOrEqual(1)
})

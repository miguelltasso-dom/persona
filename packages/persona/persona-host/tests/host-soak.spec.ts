import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

it('10 idle personas for 1 simulated hour: stable rss/handles, zero AI calls', () => {
  const h = host()
  let clock = Date.parse('2026-11-03T12:00:00.000Z')
  h.orchestration.now = () => new Date(clock).toISOString()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  for (let i = 0; i < 10; i += 1) {
    h.createPersona({
      workspaceId: 'ws', projectId: 'pp', id: `p${String(i)}`, name: `P${String(i)}`, title: 'Executora',
      description: 'Idle.', personality: 'Calma.', instructions: 'Espere.',
      avatarKind: 'gallery', avatarRef: `p${String(i)}`, runnerKind: 'dsh', runnerCli: '',
      runnerModel: 'm', canRecruit: i === 0, createdBy: 'ana',
      ...(i === 0 ? { systemRoles: ['coordination'] as const } : {}),
    })
  }
  let aiCalls = 0
  const inner = h.orchestration.runnerFactory
  h.orchestration.runnerFactory = async (request) => {
    aiCalls += 1
    return inner(request)
  }
  const before = process.memoryUsage().rss
  const handlesBefore = process.getActiveResourcesInfo().length
  const warmBefore = h.orchestration.warmRunners.size
  for (let tick = 0; tick < 12; tick += 1) {
    clock += 5 * 60 * 1000
    h.orchestration.now = () => new Date(clock).toISOString()
    h.tickProactivity({
      workspaceId: 'ws', projectId: 'pp',
      leaseUntil: new Date(clock + 60_000).toISOString(),
      stallAfterMs: 30 * 60 * 1000,
    })
  }
  expect(aiCalls).toBe(0)
  expect(h.orchestration.warmRunners.size).toBe(warmBefore)
  const after = process.memoryUsage().rss
  const handlesAfter = process.getActiveResourcesInfo().length
  expect(after - before).toBeLessThan(48 * 1024 * 1024)
  expect(handlesAfter - handlesBefore).toBeLessThan(32)
})

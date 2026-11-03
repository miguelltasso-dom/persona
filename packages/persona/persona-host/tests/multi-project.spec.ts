import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { ExecutionBudget } from '../src/budget.ts'
import PersonaHost from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => root.fiber.dispose())) })

it('caps a noisy project so eight siblings still get a slot', () => {
  const budget = new ExecutionBudget(4, 2)
  const clock = () => '2026-11-03T15:00:00.000Z'
  void clock
  const noisy = 'p-noisy'
  expect(budget.acquire(noisy)).toBe(true)
  expect(budget.acquire(noisy)).toBe(true)
  expect(budget.acquire(noisy)).toBe(false)
  const others: string[] = []
  for (let index = 0; index < 8; index += 1) {
    const id = `p-${index}`
    if (budget.acquire(id)) others.push(id)
  }
  expect(others.length).toBe(2)
  budget.release(noisy)
  expect(budget.acquire('p-7')).toBe(true)
})

it('host runLaunched waits when the project is over budget', async () => {
  const ctx = new Context()
  roots.push(ctx)
  const h = new PersonaHost(ctx)
  h.orchestration.now = () => '2026-11-03T15:00:00.000Z'
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'p0' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'p0', displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (let index = 0; index < 8; index += 1) {
    const id = `p${index}`
    if (h.product.getProject(id) === undefined) {
      h.createProject({ id, workspaceId: 'ws', name: `P${index}`, description: '' })
    }
    h.createPersona({
      workspaceId: 'ws', projectId: id, id: `coord-${id}`, name: `Guia${index}`, title: 'Coordenação',
      description: 'T.', personality: 'C.', instructions: 'A.',
      avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '',
      runnerModel: 'm', canRecruit: true, createdBy: 'ana',
    })
    h.product.updatePersona({
      ...h.product.getPersona(`coord-${id}`)!,
      systemRoles: ['coordination'],
    }, id)
    h.createChannel({ id: `geral-${id}`, workspaceId: 'ws', projectId: id, name: 'geral', topic: '' })
  }
  h.orchestration.budget.acquire('p0')
  h.orchestration.budget.acquire('p0')
  h.postMessage({
    id: 'm-noisy', workspaceId: 'ws', projectId: 'p0', streamKind: 'channel', ownerId: 'geral-p0',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('p0')
  const page = h.listMessages({
    workspaceId: 'ws', projectId: 'p0', streamKind: 'channel', ownerId: 'geral-p0',
    actorId: 'ana', afterSeq: 0, limit: 20,
  })
  expect(page.events.some(item => /Aguardando vaga/i.test(item.body))).toBe(true)
})

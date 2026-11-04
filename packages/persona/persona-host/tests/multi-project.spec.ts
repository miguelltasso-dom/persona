import { expect } from 'vitest'
import { ExecutionBudget } from '../src/budget.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

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

it('a message to a project with every slot taken is held with an honest line, not lost', async () => {
  const h = host()
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
    // Creating a project already creates its #geral (the person never has to): use it, and only create one when it is missing.
    if (!h.product.listChannels(id).some(channel => channel.name === 'geral')) {
      h.createChannel({ id: `geral-${id}`, workspaceId: 'ws', projectId: id, name: 'geral', topic: '' })
    }
  }
  const geral = h.product.listChannels('p0').find(channel => channel.name === 'geral')!.id
  h.orchestration.budget.acquire('p0')
  h.orchestration.budget.acquire('p0')
  h.postMessage({
    id: 'm-noisy', workspaceId: 'ws', projectId: 'p0', streamKind: 'channel', ownerId: geral,
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('p0')
  const page = h.listMessages({
    workspaceId: 'ws', projectId: 'p0', streamKind: 'channel', ownerId: geral,
    actorId: 'ana', afterSeq: 0, limit: 20,
  })
  // The pre-router holds the message when every slot of the project is taken, and says so (never silence): no Task is opened,
  // the message stays recorded and the scheduler starts it when a slot frees up.
  const held = page.events.find(item => item.id === 'coord-m-noisy-held')
  expect(held?.body).toMatch(/Recebi\. A equipe está ocupada; começo assim que liberar\./)
  expect(page.events.some(item => item.id === 'm-noisy' && item.body === 'preciso de um README no projeto')).toBe(true)
  expect(h.orchestration.runtime('p0').repo.tickets.list()).toHaveLength(0)
})

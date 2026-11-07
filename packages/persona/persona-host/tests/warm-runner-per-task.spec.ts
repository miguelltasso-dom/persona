import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { expect, onTestFinished } from 'vitest'
import PersonaHost from '../src/index.ts'
import type { HostConnectorGrant, HostRunnerRequest } from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * HT-8/HT-9 (security): the warm runner of a persona used to be keyed by project:persona:purpose, so a session opened for Task A with
 * a connector let through (the person's words in THAT Task) would serve Task B. A Task that carries connectors now gets a runner of
 * its own; without connectors the key is the old one and nothing changes.
 */
const { host } = bindHostFile('2026-11-04T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }
const GMAIL: HostConnectorGrant = { cli: 'claude', id: 'gmail', access: 'read', basis: 'request', preAllow: ['read'] }

function seed(h: PersonaHost): { requests: HostRunnerRequest[]; runners: Runner[] } {
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false // the real runner path: the scripted replies never open a runner
  onTestFinished(() => { h.orchestration.scripted = scripted })
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['p1', 'Nina'], ['p2', 'Bento']] as const) {
    h.createPersona({
      id, ...scope, name, title: 'Engenharia', description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: name.toLowerCase(), runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku',
      canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
  h.sessionMemberId = 'ana'
  const requests: HostRunnerRequest[] = []
  const runners: Runner[] = []
  h.orchestration.warmRunners.clear()
  h.orchestration.runnerFactory = (request) => {
    if (request !== undefined) requests.push(request)
    const runner = createFakeRunner()
    runners.push(runner)
    return Promise.resolve(runner)
  }
  return { requests, runners }
}

const ask = async (h: PersonaHost, id: string, body: string): Promise<void> => {
  h.postMessage({ id, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id })
  await h.orchestration.flush('pp')
}

const bentoTasks = (requests: readonly HostRunnerRequest[]): HostRunnerRequest[] =>
  requests.filter(request => request.personId === 'p2' && request.purpose === 'task')

it('Task B does not inherit the warm runner of Task A that carried a connector', async () => {
  const h = host()
  const { requests, runners } = seed(h)
  const asked: string[] = []
  // Only the FIRST Task the host asks about is authorized for the connector (the person asked for it in that Task).
  h.orchestration.connectorsOf = (_persona, _cli, ticketId) => {
    if (ticketId === undefined) return undefined
    if (!asked.includes(ticketId)) asked.push(ticketId)
    return ticketId === asked[0] ? [GMAIL] : undefined
  }
  await ask(h, 'mA', '@Bento preciso do relatório de vendas do mês, envie por email')
  await ask(h, 'mB', '@Bento agora faça outro relatório, o de estoque do mês')
  const tasks = bentoTasks(requests)
  expect(tasks).toHaveLength(2) // B did NOT reuse A's warm runner: the factory was asked again
  expect(tasks[0]?.connectors).toEqual([GMAIL]) // A carried the connector
  expect(tasks[1]?.connectors).toBeUndefined() // B carries nothing: A's authorization did not travel
  expect(new Set(runners).size).toBe(runners.length) // and they are different runner objects
  expect(asked).toHaveLength(2)
})

it('the runner of a Task that carried a connector is found by that Task and dropped when the Task ended', async () => {
  const h = host()
  seed(h)
  h.orchestration.connectorsOf = () => [GMAIL]
  await ask(h, 'mA', '@Bento preciso do relatório de vendas do mês, envie por email')
  const rt = h.orchestration.runtime('pp')
  const ticket = rt.repo.tickets.list()[0]!
  const own = [...h.orchestration.warmRunners.keys()].filter(key => key.includes(`:task:${ticket.id}:`))
  expect(own).toHaveLength(1) // a runner of its own, keyed by the Task
  const internals = h.orchestration as unknown as { taskRunnerOf(projectId: string, ticketId: string): Runner | undefined; dropEndedTaskRunners(projectId: string, rt: unknown): void }
  expect(internals.taskRunnerOf('pp', ticket.id)).toBe(h.orchestration.warmRunners.get(own[0]!))
  rt.repo.tickets.save({ ...ticket, ended: { at: '2026-11-04T12:30:00.000Z', by: 'human', outcome: 'completed' } })
  internals.dropEndedTaskRunners('pp', rt)
  expect([...h.orchestration.warmRunners.keys()].some(key => key.includes(`:task:${ticket.id}:`))).toBe(false)
})

it('without connectors nothing changes: the warm runner is still shared between Tasks', async () => {
  const h = host()
  const { requests } = seed(h)
  h.orchestration.connectorsOf = () => undefined
  await ask(h, 'mA', '@Bento preciso do relatório de vendas do mês')
  await ask(h, 'mB', '@Bento agora faça outro relatório, o de estoque do mês')
  expect(bentoTasks(requests)).toHaveLength(1) // one runner, reused (the old key)
  expect([...h.orchestration.warmRunners.keys()].filter(key => key.includes(':task:') && !key.endsWith(':answer-only'))).toEqual([])
})

import { createFakeRunner, createScriptedRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, onTestFinished } from 'vitest'
import PersonaHost from '../src/index.ts'
import { resolveHostRunner, type PersonaRunnersSlice } from '../src/runner.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * TEAM-10 (Bolt, 07/11): a turn of a REAL CLI that called no report tool ends with the adapter's placeholder report
 * (`{ state: 'ready', summary: 'turn ended' }`, persona-runners oar/adapter.ts). The host used `report?.summary ?? live`, so the placeholder
 * — not the words the persona wrote — went to the Task's report, to the review request (the “bilhete” of the reviewer) and to the hand-off
 * hook: the reviewer answered “o bilhete diz só 'turn ended'” and no seal could exist. Scripted runners return the text as the summary, which
 * is why only the real round saw it.
 */
afterEach(() => {
  delete process.env.PERSONA_REAL_CLI
})

const { host } = bindHostFile()
const AT = '2026-11-04T12:00:00.000Z'
const WORDS = 'Texto do cartaz: Pão de queijo, 2 por R$ 9, de sexta a domingo.'

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'coord', name: 'Guia', title: 'Coordenação',
    description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: true, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

/** Run one Task on a scripted OAR-like runner whose turn says `said` and ends with `report`; return what the team hooks and the report got. */
async function deliver(report: { state: 'ready'; summary: string }, said: string): Promise<{ waits: string[]; delivered: string[]; summary: string | undefined }> {
  const h = host()
  seed(h)
  process.env.PERSONA_REAL_CLI = '1'
  h.orchestration.scripted = false
  const runners: PersonaRunnersSlice = {
    createFakeRunner,
    resolveRunner: async options => createScriptedRunner({
      turns: options.purpose === 'talk'
        ? [{ events: [{ type: 'ended', at: AT, report: { state: 'ready', summary: 'Pedido encaminhado.' } }] }]
        : [{ events: [{ type: 'delta', at: AT, text: said }, { type: 'ended', at: AT, report }] }],
    }),
  }
  h.orchestration.runnerFactory = request => resolveHostRunner(request, runners)
  const waits: string[] = []
  const delivered: string[] = []
  const originalWait = h.orchestration.handoffWait
  const originalDelivered = h.orchestration.taskDelivered
  onTestFinished(() => { h.orchestration.handoffWait = originalWait; h.orchestration.taskDelivered = originalDelivered })
  h.orchestration.handoffWait = (_projectId, _ticketId, text) => { waits.push(text); return undefined }
  h.orchestration.taskDelivered = (info) => { delivered.push(info.text); return false }
  h.postMessage({
    id: 'm-words', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't1', occurredAt: '2026-11-03T15:00:00.000Z',
  })
  await h.orchestration.flush('pp')
  const task = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })[0]
  if (task === undefined) throw new Error('no task')
  return { waits, delivered, summary: h.orchestration.runtime('pp').repo.tickets.get(task.id)?.assignments.at(-1)?.report?.summary }
}

it('a real-CLI turn that ends with the adapter\'s placeholder still delivers the persona\'s WORDS to the hand-off hook, the review and the Task report', async () => {
  const got = await deliver({ state: 'ready', summary: 'turn ended' }, WORDS)
  expect(got.waits).toEqual([WORDS]) // the reviewer's “bilhete” (handoffWait) — before: ['turn ended']
  expect(got.delivered).toEqual([WORDS]) // the reviewer's own verdict hook (taskDelivered)
  expect(got.summary).toBe(WORDS) // and the Task's report
})

it('a report that has its OWN summary is kept: only the placeholder is replaced by the words', async () => {
  const got = await deliver({ state: 'ready', summary: 'Entrega gravada no README.' }, WORDS)
  expect(got.waits).toEqual(['Entrega gravada no README.'])
  expect(got.delivered).toEqual(['Entrega gravada no README.'])
  expect(got.summary).toBe('Entrega gravada no README.')
})

it('the team layer gets the WHOLE words without a raw wire marker (P0-2); the Task report and the verdict hook keep the cap of every other summary', async () => {
  const long = `${WORDS}[[handoff:{"x":1}]] ${'palavra '.repeat(400)}`
  const got = await deliver({ state: 'ready', summary: 'turn ended' }, long)
  expect(got.waits).toHaveLength(1)
  expect(got.waits[0]).toContain(WORDS) // the persona's words, not 'turn ended'
  expect(got.waits[0]).not.toContain('[[') // no raw wire marker in what a colleague or a reviewer reads
  expect(got.waits[0]?.length).toBeGreaterThan(3000) // and not cut at 1500: the <entrega> block caps at 24k downstream
  expect(got.delivered[0]?.length).toBeLessThanOrEqual(1500) // the verdict hook and the Task report keep the short cap
  expect(got.summary).toBe(got.delivered[0])
})

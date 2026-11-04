/**
 * OPT-9: the wall time a runner measured for a turn reaches the ledger of the host (the calibration reads it back), and a turn
 * whose runner did not measure one stays WITHOUT a time — never a made-up 0. (Rivet measures it in `withUsageMeter`; this
 * proves the host hands it on.)
 */
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-04T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', ...scope, name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm',
    canRecruit: false, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.sessionMemberId = 'ana'
}

function work(h: PersonaHost, durationMs: number | undefined): void {
  h.orchestration.runnerFactory = async (request) => {
    const runner = createFakeRunner()
    return {
      ...runner,
      deliver: async (sessionId, requestId, text, mode) => {
        await runner.deliver(sessionId, requestId, text, mode)
        request?.usage?.record({
          provider: 'claude', model: 'haiku', kind: 'execution', window: 'turn',
          inputTokens: 40, outputTokens: 10, cacheReadTokens: 30, cacheWriteTokens: 2,
          at: '2026-11-04T12:00:00.000Z', origin: 'measured',
          ...(durationMs === undefined ? {} : { durationMs }),
        })
      },
    }
  }
}

it('the measured wall time of a turn is stored with it, and read back by the calibration', async () => {
  const h = host()
  seed(h)
  work(h, 4_200)
  h.postMessage({ id: 'm1', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't1' })
  await h.orchestration.flush('pp')
  const rows = h.ledger.list({ projectId: 'pp' }).filter(row => row.kind === 'execution')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ engine: 'claude', inputTokens: 40, outputTokens: 10, durationMs: 4_200 })
})

it('a runner that did not measure the time leaves the turn without one', async () => {
  const h = host()
  seed(h)
  work(h, undefined)
  h.postMessage({ id: 'm2', ...scope, streamKind: 'channel', ownerId: 'geral', body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 't2' })
  await h.orchestration.flush('pp')
  const rows = h.ledger.list({ projectId: 'pp' }).filter(row => row.kind === 'execution')
  expect(rows).toHaveLength(1)
  expect(rows[0]).not.toHaveProperty('durationMs')
})

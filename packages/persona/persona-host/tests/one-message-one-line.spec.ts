/**
 * P0 (Keel, 04/11 21:40): a message the person sends in #geral is ONE line in the thread. The E13 desk showed it twice under the same
 * "Você" (getByText resolved to two <p>). Whatever the route the message takes afterwards (a Task, a reply, "no engine" notice, a
 * block to the team), the stored thread keeps exactly one copy of the person's words.
 */
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-04T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost, withCoordination: boolean): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bob', ...scope, displayName: 'Bob', handle: 'bob', role: 'member' })
  if (withCoordination) {
    h.createPersona({
      id: 'p1', ...scope, name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.', instructions: 'Aceite.',
      avatarKind: 'gallery', avatarRef: 'guia', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
    h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  }
  h.sessionMemberId = 'ana'
}

function copies(h: PersonaHost, body: string): { stored: number; read: number } {
  const stored = h.events.listProject('pp').filter(event => event.body === body && event.actorId === 'ana').length
  const read = h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 })
    .events.filter(event => event.body === body).length
  return { stored, read }
}

const SAY = ['Olá do Alice · 8a9b6eb3', 'preciso de um README no projeto', 'qual o horário da reunião?', 'valeu, obrigada!', '@Guia pode ajudar?']

for (const withCoordination of [false, true]) {
  it(`one line per message — scripted host${withCoordination ? ', with a Coordenação' : ', no persona at all'}`, async () => {
    const h = host()
    seed(h, withCoordination)
    for (const [index, body] of SAY.entries()) {
      h.postMessage({ id: `m${String(index)}`, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: `m${String(index)}` })
      await h.orchestration.flush('pp')
      expect(copies(h, body), body).toEqual({ stored: 1, read: 1 })
    }
  })
}

it('one line per message — real runner path, engine ready or NOT ready (the D-079 notice is not a second copy of the words)', async () => {
  const h = host()
  seed(h, true)
  const scripted = h.orchestration.scripted
  const readiness = h.orchestration.engineReadinessOf
  h.orchestration.scripted = false
  h.orchestration.runnerFactory = () => Promise.resolve(createFakeRunner())
  try {
    for (const [index, state] of (['ready', 'checking', 'unavailable', 'ready'] as const).entries()) {
      h.orchestration.engineReadinessOf = () => state === 'ready' ? { state: 'ready', reason: null } : { state, reason: 'none_connected' }
      const body = `Olá do Alice · ${state} ${String(index)}`
      h.postMessage({ id: `r${String(index)}`, ...scope, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: `r${String(index)}` })
      await h.orchestration.flush('pp')
      expect(copies(h, body), `${state}: ${body}`).toEqual({ stored: 1, read: 1 })
    }
  } finally {
    h.orchestration.scripted = scripted
    h.orchestration.engineReadinessOf = readiness
  }
})

/**
 * COLHEITA 5 (Prism): the Desfazer of what a persona did inside the product, through the real host. The activity is recorded as the harness
 * does it (`onActivity`), its line lands in the thread of the person's request (`activity-line:<id>`, with `MessageView.actionEvent`), and
 * `undoPersonaAction` runs the host's own inverse once, inside the 5 minutes.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { RecordableActivity } from '../src/activity-undo.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const AT = '2026-11-03T15:00:00.000Z'

function open(): { h: PersonaHost; requestId: string } {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Atendimento' },
  ])
  say(h, 'u1', '@Bia crie a sprint de novembro')
  return { h, requestId: 'u1' } // `say` posts the person's message with this id
}

const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const WHO = (requestId: string, callId = 'call-1') => ({ workspaceId: 'ws', projectId: 'pp', personaId: 'bia', callId, requestId })
const sprintCreated = (id: string, requestId?: string): RecordableActivity => ({
  verb: 'sprint_create', target: { kind: 'sprint', id, title: 'Sprint de novembro' }, initiator: 'person-request', status: 'done', undoable: true,
  undo: { remote: 'deleteSprint', request: { workspaceId: 'ws', projectId: 'pp', sprintId: id } }, at: AT,
  ...(requestId === undefined ? {} : { requestId }),
})
const undoRequest = (activityId: string) => ({ ...SCOPE, activityId })

it('the activity gets ONE thread line of the persona with the Desfazer window, and a plain sentence for readers without the card', () => {
  const { h, requestId } = open()
  const sprint = h.createSprint({ ...SCOPE, id: 'sp-1', name: 'Sprint de novembro', objective: 'Fechar o mês' })
  const id = h.activityUndo.record(WHO(requestId), sprintCreated(sprint.id, requestId))
  h.activityUndo.record(WHO(requestId), sprintCreated(sprint.id, requestId)) // the same tool call again
  const lines = thread(h).filter(event => event.id === `activity-line:${id}`)
  expect(lines).toHaveLength(1)
  expect(lines[0]).toMatchObject({
    actorId: 'bia', body: 'Bia criou a sprint “Sprint de novembro”.',
    actionEvent: { verb: 'sprint_create', connectorName: 'Persona', target: 'Sprint de novembro', activityId: id, undoable: true, undoUntil: '2026-11-03T15:05:00.000Z' },
  })
  expect(JSON.stringify(lines[0])).not.toMatch(/deleteSprint|sp-1|harness_activity/u) // the inverse never reaches the thread
})

it('Desfazer inside the window runs the host\'s own inverse once: the sprint is gone, the line says so and does not offer it again', () => {
  const { h, requestId } = open()
  h.createSprint({ ...SCOPE, id: 'sp-1', name: 'Sprint de novembro', objective: 'Fechar o mês' })
  const id = h.activityUndo.record(WHO(requestId), sprintCreated('sp-1', requestId))
  expect(h.listSprints(SCOPE).map(row => row.id)).toContain('sp-1')
  expect(h.undoPersonaAction(undoRequest(id))).toEqual({ undone: true })
  expect(h.listSprints(SCOPE).map(row => row.id)).not.toContain('sp-1')
  const line = thread(h).find(event => event.id === `activity-line:${id}`)
  expect(line?.actionEvent).toMatchObject({ undone: true })
  expect(line?.actionEvent?.undoable).toBeUndefined()
  // a second Desfazer answers the same and runs nothing (the sprint is not "deleted again")
  expect(h.undoPersonaAction(undoRequest(id))).toEqual({ undone: true, alreadyUndone: true })
})

it('after 5 minutes the host refuses and the sprint stays', () => {
  const { h, requestId } = open()
  h.createSprint({ ...SCOPE, id: 'sp-1', name: 'Sprint de novembro', objective: 'Fechar o mês' })
  const id = h.activityUndo.record(WHO(requestId), sprintCreated('sp-1', requestId))
  h.orchestration.now = () => '2026-11-03T15:05:01.000Z'
  expect(() => h.undoPersonaAction(undoRequest(id))).toThrow(/prazo para desfazer passou/u)
  expect(h.listSprints(SCOPE).map(row => row.id)).toContain('sp-1')
})

it('an inverse that no longer applies (the sprint is already gone) fails with a safe sentence and the line is not marked undone', () => {
  const { h, requestId } = open()
  const id = h.activityUndo.record(WHO(requestId), sprintCreated('sp-ghost', requestId))
  expect(() => h.undoPersonaAction(undoRequest(id))).toThrow()
  expect(h.activityUndo.get('pp', id)?.undoneAt).toBeUndefined()
})

it('only the workspace\'s own person can undo; an unknown activity is refused', () => {
  const { h, requestId } = open()
  const id = h.activityUndo.record(WHO(requestId), sprintCreated('sp-1', requestId))
  expect(() => h.undoPersonaAction(undoRequest('ghost'))).toThrow(/não existe mais/u)
  expect(id).toBeTruthy()
})

it('an activity of a run with no request goes to the general channel (nothing is lost, nothing is addressed to a stranger)', () => {
  const { h } = open()
  const id = h.activityUndo.record({ workspaceId: 'ws', projectId: 'pp', personaId: 'bia', callId: 'call-9' }, sprintCreated('sp-2'))
  expect(thread(h).some(event => event.id === `activity-line:${id}`)).toBe(true)
})

/**
 * COLHEITA 5 (Prism): "Agir com Desfazer". What a persona does inside the product is recorded with a 5 minute window; the Desfazer runs the
 * recorded inverse once, inside the window, in the scope of the record; after it the line is plain text and the host refuses.
 */
import { describe, expect, it, vi } from 'vitest'
import { ACTIVITY_UNDO_MS, activitySentence, ActivityUndo, parseUndoCall, type ActivityDoc, type RecordableActivity, type UndoCall } from '../src/activity-undo.ts'
import { RemoteFault } from '../src/remote-guard.ts'

const AT = '2026-11-11T14:00:00.000Z'
const WHO = { workspaceId: 'ws', projectId: 'pp', personaId: 'bia', callId: 'call-1', requestId: 'msg-1' }
const at = (ms: number): string => new Date(Date.parse(AT) + ms).toISOString()

const routineCreated = (over: Partial<RecordableActivity> = {}): RecordableActivity => ({
  verb: 'routine_create', target: { kind: 'routine', id: 'r1', title: 'Post de sexta' }, initiator: 'persona-initiative', status: 'done', undoable: true,
  undo: { remote: 'deleteRoutine', request: { workspaceId: 'ws', projectId: 'pp', id: 'r1' } }, at: AT, ...over,
})

function rig(clock: { now: string } = { now: AT }) {
  const docs = new Map<string, unknown>()
  const run = vi.fn<(call: UndoCall) => unknown>(() => undefined)
  const announce = vi.fn()
  const changed = vi.fn()
  const undo = new ActivityUndo({
    screens: {
      get: <T>(projectId: string, kind: string, id: string) => docs.get(`${projectId}|${kind}|${id}`) as T | undefined,
      put: (projectId: string, kind: string, id: string, doc: unknown) => { docs.set(`${projectId}|${kind}|${id}`, doc) },
    },
    now: () => clock.now, run, announce, changed, personaName: id => (id === 'bia' ? 'Bia' : undefined),
  })
  return { undo, run, announce, changed, clock, docs }
}

describe('record', () => {
  it('an undoable activity gets a window of exactly 5 minutes and its line in the thread, once', () => {
    const { undo, announce } = rig()
    const id = undo.record(WHO, routineCreated())
    expect(id).toBe(`${AT}:call-1`)
    expect(undo.get('pp', id)).toMatchObject({ personaId: 'bia', workspaceId: 'ws', undoUntil: at(ACTIVITY_UNDO_MS) })
    expect(ACTIVITY_UNDO_MS).toBe(300_000)
    expect(undo.record(WHO, routineCreated())).toBe(id) // the same tool call again is the same document
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('an activity with no safe inverse (a sprint that started) has no window and no Desfazer', () => {
    const { undo } = rig()
    const id = undo.record({ ...WHO, callId: 'call-2' }, { ...routineCreated(), verb: 'sprint_start', target: { kind: 'sprint', id: 's1', title: 'Sprint 3' }, undoable: false, undo: undefined as never })
    expect(undo.get('pp', id)?.undoUntil).toBeUndefined()
    expect(undo.eventOf('pp', id)).toEqual({ verb: 'sprint_start', connectorName: 'Persona', target: 'Sprint 3', activityId: id })
    expect(() => undo.undo({ workspaceId: 'ws', projectId: 'pp', activityId: id })).toThrow(/não dá para desfazer/u)
  })

  it('the thread line: product connector, the human title, where it went; the client verb of an edit is routine_edit', () => {
    const { undo } = rig()
    const moved = undo.record(WHO, { ...routineCreated(), verb: 'board_card_move', target: { kind: 'card', id: 't1', title: 'Logo da padaria' }, after: 'Fazendo', undo: { remote: 'moveTicket', request: { ticketId: 't1', columnId: 'c1' } } })
    expect(undo.eventOf('pp', moved)).toMatchObject({ verb: 'board_card_move', connectorName: 'Persona', target: 'Logo da padaria', after: 'Fazendo', undoable: true, undoUntil: at(ACTIVITY_UNDO_MS) })
    const edited = undo.record({ ...WHO, callId: 'call-3' }, { ...routineCreated(), verb: 'routine_update' })
    expect(undo.eventOf('pp', edited)?.verb).toBe('routine_edit')
    expect(undo.eventOf('pp', 'nope')).toBeUndefined()
  })
})

describe('undo', () => {
  const request = (activityId: string) => ({ workspaceId: 'ws', projectId: 'pp', activityId })

  it('inside the window it runs the recorded inverse ONCE, in the scope of the record, and the line stops offering it', () => {
    const { undo, run, changed, clock } = rig()
    // the stored request names ANOTHER project: the scope is the record's, never the stored text's
    const id = undo.record(WHO, routineCreated({ undo: { remote: 'deleteRoutine', request: { workspaceId: 'other', projectId: 'other', id: 'r1' } } }))
    clock.now = at(ACTIVITY_UNDO_MS - 1_000)
    expect(undo.undo(request(id))).toEqual({ undone: true })
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({ remote: 'deleteRoutine', request: { workspaceId: 'ws', projectId: 'pp', id: 'r1' } })
    expect(changed).toHaveBeenCalledWith('pp', id)
    expect(undo.eventOf('pp', id)).toMatchObject({ undone: true })
    expect(undo.eventOf('pp', id)?.undoable).toBeUndefined()
    // a second Desfazer (a double click, a replay) answers the same and runs nothing
    expect(undo.undo(request(id))).toEqual({ undone: true, alreadyUndone: true })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('after 5 minutes the host refuses (the line is plain text) and nothing runs', () => {
    const { undo, run, clock } = rig()
    const id = undo.record(WHO, routineCreated())
    clock.now = at(ACTIVITY_UNDO_MS + 1)
    expect(() => undo.undo(request(id))).toThrow(/prazo para desfazer passou/u)
    expect(run).not.toHaveBeenCalled()
    expect(undo.get('pp', id)?.undoneAt).toBeUndefined()
  })

  it('exactly at the end of the window it still works', () => {
    const { undo, run, clock } = rig()
    const id = undo.record(WHO, routineCreated())
    clock.now = at(ACTIVITY_UNDO_MS)
    expect(undo.undo(request(id)).undone).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('an inverse that fails leaves the activity as it was: still undoable, the person is told, and it can be tried again', () => {
    const { undo, run, changed, clock } = rig()
    const id = undo.record(WHO, routineCreated())
    run.mockImplementationOnce(() => { throw new Error('ticket-moved-by-someone') })
    expect(() => undo.undo(request(id))).toThrow(/Não deu para desfazer/u)
    expect(() => undo.undo(request(id))).not.toThrow() // the second try works (the mock returns now)
    expect(run).toHaveBeenCalledTimes(2)
    expect(changed).toHaveBeenCalledTimes(1)
    clock.now = at(1)
    expect(undo.get('pp', id)?.undoneAt).toBeDefined()
  })

  it('a refusal of the host\'s own method keeps its safe sentence (never the raw error)', () => {
    const { undo, run } = rig()
    const id = undo.record(WHO, routineCreated())
    run.mockImplementationOnce(() => { throw new RemoteFault('forbidden', 'Só quem é dono da equipe pode fazer isso.') })
    expect(() => undo.undo(request(id))).toThrow('Só quem é dono da equipe pode fazer isso.')
    run.mockImplementationOnce(() => { throw new Error('SQLITE_BUSY: /Users/x/db.sqlite') })
    expect(() => undo.undo(request(id))).toThrow(/Não deu para desfazer: algo mudou depois/u)
    expect(() => undo.undo(request(id))).not.toThrow(/SQLITE/u)
  })

  it('a second Desfazer that arrives WHILE the first runs does not run the inverse again', () => {
    const { undo, run } = rig()
    const id = undo.record(WHO, routineCreated())
    let inner: unknown
    run.mockImplementationOnce(() => { inner = undo.undo(request(id)) })
    expect(undo.undo(request(id))).toEqual({ undone: true })
    expect(inner).toEqual({ undone: false })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('an unknown activity, a stored inverse that is not one of ours, or one that is half formed: refused, nothing runs', () => {
    const { undo, run } = rig()
    expect(() => undo.undo(request('ghost'))).toThrow(/não existe mais/u)
    const unknown = undo.record({ ...WHO, callId: 'a' }, routineCreated({ undo: { remote: 'deleteEverything', request: {} } }))
    const halfFormed = undo.record({ ...WHO, callId: 'b' }, routineCreated({ undo: { remote: 'moveTicket', request: { ticketId: 't1' } } }))
    expect(() => undo.undo(request(unknown))).toThrow(/não dá para desfazer/u)
    expect(() => undo.undo(request(halfFormed))).toThrow(/não dá para desfazer/u)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('parseUndoCall', () => {
  const scope = { workspaceId: 'ws', projectId: 'pp' }

  it('types each inverse the harness records, in the given scope', () => {
    expect(parseUndoCall({ remote: 'moveTicket', request: { ticketId: 't1', columnId: 'c0' } }, scope)).toEqual({ remote: 'moveTicket', request: { ...scope, ticketId: 't1', columnId: 'c0' } })
    expect(parseUndoCall({ remote: 'deleteSprint', request: { sprintId: 's1' } }, scope)).toEqual({ remote: 'deleteSprint', request: { ...scope, sprintId: 's1' } })
    expect(parseUndoCall({ remote: 'planSprint', request: { sprintId: 's1', ticketIds: ['a', 'b'] } }, scope)).toEqual({ remote: 'planSprint', request: { ...scope, sprintId: 's1', ticketIds: ['a', 'b'] } })
    expect(parseUndoCall({ remote: 'pauseRoutine', request: { id: 'r1', paused: false } }, scope)).toEqual({ remote: 'pauseRoutine', request: { ...scope, id: 'r1', paused: false } })
    expect(parseUndoCall({ remote: 'retirePersona', request: { personaId: 'p1' } }, scope)).toEqual({ remote: 'retirePersona', request: { ...scope, personaId: 'p1' } })
  })

  it('an edit keeps the empty strings that mean "clear" (silence, owner) and drops what is not a string', () => {
    const call = parseUndoCall({ remote: 'updateRoutine', request: { id: 'r1', name: 'Post', prompt: 'x', ownerPersonaId: '', silenceStart: '', silenceEnd: '', rrule: 'FREQ=DAILY', catchUp: 'weird', timeZone: 7 } }, scope)
    expect(call).toEqual({ remote: 'updateRoutine', request: { ...scope, id: 'r1', name: 'Post', prompt: 'x', ownerPersonaId: '', rrule: 'FREQ=DAILY', silenceStart: '', silenceEnd: '' } })
  })

  it('the hire inverse is only "reject the waiting card" (never an accept)', () => {
    expect(parseUndoCall({ remote: 'decideApproval', request: { id: 'hire-1', kind: 'hire', accept: false } }, scope)).toEqual({ remote: 'decideApproval', request: { ...scope, id: 'hire-1', kind: 'hire', accept: false } })
    expect(parseUndoCall({ remote: 'decideApproval', request: { id: 'hire-1', kind: 'hire', accept: true } }, scope)).toBeUndefined()
    expect(parseUndoCall({ remote: 'decideApproval', request: { id: 'x', kind: 'vault', accept: false } }, scope)).toBeUndefined()
  })

  it('half-formed requests and unknown remotes are undefined', () => {
    expect(parseUndoCall({ remote: 'moveTicket', request: { ticketId: 't1' } }, scope)).toBeUndefined()
    expect(parseUndoCall({ remote: 'planSprint', request: { sprintId: 's1', ticketIds: [1, 2] } }, scope)).toBeUndefined()
    expect(parseUndoCall({ remote: 'pauseRoutine', request: { id: 'r1' } }, scope)).toBeUndefined()
    expect(parseUndoCall({ remote: 'sendEmail', request: { to: 'ana@x.com' } }, scope)).toBeUndefined()
  })
})

describe('activitySentence', () => {
  const doc = (over: Partial<ActivityDoc>): ActivityDoc => ({ ...routineCreated(), personaId: 'bia', ...over })

  it('says what was done with the human title and no id or path', () => {
    expect(activitySentence('Bia', doc({ verb: 'routine_create' }))).toBe('Bia criou a rotina “Post de sexta”.')
    expect(activitySentence('Bia', doc({ verb: 'board_card_move', after: 'Fazendo' }))).toBe('Bia moveu “Post de sexta” para Fazendo.')
    expect(activitySentence('Bia', doc({ verb: 'board_card_create' }))).toBe('Bia criou a tarefa “Post de sexta”.')
    expect(activitySentence('Bia', doc({ verb: 'unknown_verb' }))).toBe('Bia mexeu em “Post de sexta”.')
  })
})

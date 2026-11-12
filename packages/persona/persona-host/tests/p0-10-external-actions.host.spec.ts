/**
 * P0-10 (Carbon, colheita-s1): the host side of "Segure / Editar / Desfazer". Each test first reproduced the bug (red), then the fix made it green.
 *  1. Editar: the card sends what the person changed as `{ subject, body }`; the host did `(request.edited ?? '').replace(...)` on an OBJECT: TypeError.
 *  2. Fields the preview does not show (`cc`, `bcc`, attachments, anything else) were approved blind through the hash of the COMPLETE arguments.
 *  3. A preview cut by the host (long recipients, more than 20 items) said nothing: `truncated` stayed false.
 *  4. Desfazer of a card move went through the person's own `moveTicket`, which starts the persona that owns a card moved to "Fazendo".
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { ExternalActionDoc, ActionRequestInput } from '../src/external-actions.ts'
import { activityUndoDeps, ActivityUndo, type ActivityUndoHost, type RecordableActivity } from '../src/activity-undo.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const GMAIL = { cli: 'claude', id: 'https://proxy.example.test/v1/mcp/0f0f0f0f', name: 'Gmail' }

function open(): { h: PersonaHost; notes: string[]; ticketId: string } {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Atendimento' },
  ])
  say(h, 'u1', '@Nina responda a cliente')
  const ticketId = h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Nina')!.id
  const notes: string[] = []
  h.orchestration.wakeTicket = (_projectId, _ticketId, note) => { notes.push(note); return true }
  return { h, notes, ticketId }
}

const request = (ticketId: string, over: Partial<ActionRequestInput> = {}): ActionRequestInput => ({
  projectId: 'pp', personaId: 'nina', ticketId, connector: GMAIL, tool: 'mcp__gmail__send_email', actionClass: 'send', verb: 'send',
  requestedInput: { to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.' },
  truncated: false, masked: false, argsHash: 'a'.repeat(64), requestedByPerson: true, ...over,
})
const cardOf = (h: PersonaHost, doc: ExternalActionDoc) => h.listApprovals(SCOPE).find(row => row.id === doc.id)!

it('1. Editar with { subject, body } (what the card sends) does not crash: the persona gets the change as DATA, as one text', () => {
  const { h, notes, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId))!
  const sent = { ...SCOPE, id: doc.id, kind: 'action' as const, choice: 'edit' as const, edited: { subject: 'Encomenda de sábado', body: 'Oi, Ana! Agora são 4 bolos.' } }
  const decided = h.decideApproval(sent as never)
  expect(decided.actionPreview?.status).toBe('adjusted')
  expect(notes.at(-1)).toContain('<ajuste>')
  expect(notes.at(-1)).toContain('Encomenda de sábado')
  expect(notes.at(-1)).toContain('Agora são 4 bolos.')
  expect(h.externalActions.approvedFor('pp', ticketId)).toEqual([]) // an edit approves nothing
})

it('1b. Editar still takes a plain string, and refuses an empty change or something that is not text', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId))!
  expect(() => h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'edit', edited: { subject: '  ', body: '' } } as never)).toThrow(/o que você quer mudar/iu)
  expect(() => h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'edit', edited: 42 } as never)).toThrow(/o que você quer mudar/iu)
  expect(h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'edit', edited: 'Troque "sexta" por "sábado"' }).actionPreview?.status).toBe('adjusted')
})

it('2. cc, bcc and attachments are SHOWN on the preview (never approved blind)', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId, {
    requestedInput: {
      to: 'ana@exemplo.com', cc: ['chefe@exemplo.com'], bcc: 'oculto@exemplo.com', subject: 'Orçamento', body: 'Segue.',
      attachments: ['orcamento.pdf', 'contrato.docx'],
    },
  }))!
  expect(cardOf(h, doc).actionPreview).toMatchObject({
    to: 'ana@exemplo.com', cc: 'chefe@exemplo.com', bcc: 'oculto@exemplo.com', attachments: ['orcamento.pdf', 'contrato.docx'], masked: false, truncated: false,
  })
})

it('2b. any other field of the call the card does not show makes the preview "masked" (cannot be approved), and the host refuses to approve it', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId, { requestedInput: { to: 'ana@exemplo.com', body: 'Oi', replyTo: 'golpe@exemplo.com', headers: { 'X-Foo': '1' } } }))!
  expect(cardOf(h, doc).actionPreview).toMatchObject({ masked: true })
  expect(() => h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send' })).toThrow(/não dá para aprovar sem ver tudo/iu)
  // empty or null extras are nothing to hide
  const clean = h.externalActions.record(request(ticketId, { argsHash: 'b'.repeat(64), requestedInput: { to: 'ana@exemplo.com', body: 'Oi', cc: [], bcc: '', replyTo: null } }))!
  expect(cardOf(h, clean).actionPreview).toMatchObject({ masked: false })
})

it('3. what the host CUT on the way to the card is marked truncated: a long recipients line and a delete list of more than 20', () => {
  const { h, ticketId } = open()
  const longTo = Array.from({ length: 60 }, (_, index) => `pessoa-${String(index)}@exemplo.com`).join(', ')
  const mail = h.externalActions.record(request(ticketId, { requestedInput: { to: longTo, body: 'Oi' } }))!
  expect(cardOf(h, mail).actionPreview?.truncated).toBe(true)
  expect(() => h.decideApproval({ ...SCOPE, id: mail.id, kind: 'action', choice: 'send' })).toThrow(/não dá para aprovar sem ver tudo/iu)
  const many = h.externalActions.record(request(ticketId, {
    tool: 'mcp__drive__delete', actionClass: 'delete', verb: 'delete', argsHash: 'c'.repeat(64),
    requestedInput: { items: Array.from({ length: 25 }, (_, index) => `arquivo-${String(index)}.pdf`) },
  }))!
  expect(cardOf(h, many).actionPreview).toMatchObject({ truncated: true, count: 20 })
  const fits = h.externalActions.record(request(ticketId, { argsHash: 'd'.repeat(64), requestedInput: { to: 'ana@exemplo.com', body: 'Oi' } }))!
  expect(cardOf(h, fits).actionPreview?.truncated).toBe(false)
})

it('4. Desfazer of a card move puts the card back WITHOUT starting a persona (an undo is not a request for work)', () => {
  const moved: string[] = []
  const started: string[] = []
  const events = new Map<string, unknown>()
  const host = {
    events: { append: (event: { id: string }) => { events.set(event.id, event); return event }, has: (id: string) => events.has(id), get: () => undefined, touch: () => undefined },
    product: { getPersona: () => ({ name: 'Bia' }), getProject: () => ({ workspaceId: 'ws' }) },
    orchestration: { now: () => '2026-11-12T10:00:00.000Z' },
    moveTicket: (request: { ticketId: string }) => { started.push(`startFromBoard:${request.ticketId}`) }, // the person's path: starts the persona
    moveTicketBack: (request: { ticketId: string }) => { moved.push(request.ticketId) },
    deleteSprint: () => undefined, planSprint: () => undefined, deleteRoutine: () => undefined, pauseRoutine: () => undefined,
    updateRoutine: () => undefined, retirePersona: () => undefined, decideApproval: () => undefined,
  } as unknown as ActivityUndoHost
  const docs = new Map<string, unknown>()
  const screens = { get: <T>(p: string, k: string, id: string) => docs.get(`${p}|${k}|${id}`) as T | undefined, put: (p: string, k: string, id: string, doc: unknown) => { docs.set(`${p}|${k}|${id}`, doc) } }
  const undo = new ActivityUndo(activityUndoDeps(host, screens))
  const activity: RecordableActivity = {
    verb: 'board_card_move', target: { kind: 'card', id: 't1', title: 'Post' }, initiator: 'persona-initiative', status: 'done', undoable: true,
    undo: { remote: 'moveTicket', request: { ticketId: 't1', columnId: 'doing' } }, at: '2026-11-12T10:00:00.000Z',
  }
  const id = undo.record({ workspaceId: 'ws', projectId: 'pp', personaId: 'bia', callId: 'c1' }, activity)
  undo.undo({ workspaceId: 'ws', projectId: 'pp', activityId: id })
  expect(started).toEqual([])
  expect(moved).toEqual(['t1'])
})

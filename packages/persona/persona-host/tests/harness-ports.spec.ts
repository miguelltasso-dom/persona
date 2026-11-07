import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * HT-0, the host's half (contracts/harness-tools.md §11): the run of a persona's turn becomes the identity the ports take — persona,
 * project, who started the Ticket (a person's message or the scheduler), the persona's autonomy — and a forged run gets none.
 */

function ticket(id: string, trigger: string, owner = 'Nina'): Ticket {
  const at = '2026-11-03T14:00:00.000Z'
  return {
    id, title: `Tarefa ${id}`, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `a-${id}`, state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: trigger, triggerIds: [trigger] },
    execution: { name: owner, directory: '.', assignment: `Tarefa ${id}` },
  }
}

function setup(): PersonaHost {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
  ])
  const post = (id: string, actorId: string): void => {
    h.orchestration.events.append({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', type: 'message', body: 'pedido', actorId, subjectId: '', occurredAt: '2026-11-03T13:00:00.000Z' })
  }
  post('m-person', 'ana') // a member of the workspace asked
  post('m-stranger', 'someone-else') // an author who is not a member
  post('routine-run:r1:1', 'ana') // an id the scheduler gives its own messages, whatever the author field says
  const rt = h.orchestration.runtime('pp')
  rt.repo.tickets.save(ticket('t-person', 'm-person'))
  rt.repo.tickets.save(ticket('t-stranger', 'm-stranger'))
  rt.repo.tickets.save(ticket('t-routine', 'routine-run:r1:1'))
  rt.repo.tickets.save(ticket('t-system', 'initiative:run-9'))
  return h
}

const run = (ticketId: string, personaId = 'nina') => ({ personaId, ticketId, assignmentId: `a-${ticketId}` })

it('a Ticket started by a message of a person: the persona acts on that REQUEST, and the identity carries the message id', () => {
  const h = setup()
  expect(h.harness.identityOf(run('t-person'), 'c1')).toEqual({
    ...SCOPE, personaId: 'nina', requestId: 'm-person', initiator: 'person-request', autonomy: h.proactivity.getAutonomy('pp', 'nina').mode, callId: 'c1',
  })
})

it('a Ticket the scheduler started (or an author who is not a member) is the persona\'s own INITIATIVE: no request id', () => {
  const h = setup()
  for (const ticketId of ['t-stranger', 't-routine', 't-system']) {
    const who = h.harness.identityOf(run(ticketId), 'c2')
    expect(who?.initiator, ticketId).toBe('persona-initiative')
    expect(who?.requestId, ticketId).toBeUndefined()
  }
})

it('her autonomy comes from what the person set, not from the tool call', () => {
  const h = setup()
  h.setAutonomy({ ...SCOPE, personaId: 'nina', mode: 'act', proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
  expect(h.harness.identityOf(run('t-system'), 'c3')?.autonomy).toBe('act')
  h.setAutonomy({ ...SCOPE, personaId: 'nina', mode: 'asked', proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
  expect(h.harness.identityOf(run('t-system'), 'c4')?.autonomy).toBe('asked')
})

it('a forged run gets NO identity: unknown persona, a Ticket that does not exist, or one of another project', () => {
  const h = setup()
  expect(h.harness.identityOf(run('t-person', 'ghost'), 'c5')).toBeUndefined()
  expect(h.harness.identityOf(run('nope'), 'c6')).toBeUndefined()
  expect(h.harness.identityOf({ personaId: 'nina', ticketId: 't-person', assignmentId: 'a' }, 'c7')?.projectId).toBe('pp')
})

it('the ports run with the identity the host builds: the person\'s request moves a card, her own initiative in "asked" is refused, the same call twice acts once', () => {
  const h = setup()
  const columns = Object.fromEntries(h.getProjectBoard(SCOPE).workflow.columns.map(column => [column.category, column.id]))
  const asked = h.harness.identityOf(run('t-person'), 'move-1')!
  const moved = h.harness.boards.moveCard(asked, { ticketId: 't-person', columnId: columns.doing! })
  expect(moved.ok).toBe(true)
  expect(h.harness.boards.moveCard(asked, { ticketId: 't-person', columnId: columns.doing! })).toEqual(moved) // same callId: one action
  h.setAutonomy({ ...SCOPE, personaId: 'nina', mode: 'asked', proposalBudget: 3, tokenBudget: 1, executionBudget: 1, silenceStart: '', silenceEnd: '' })
  const own = h.harness.identityOf(run('t-system'), 'move-2')!
  expect(own.initiator).toBe('persona-initiative')
  expect(h.harness.boards.moveCard(own, { ticketId: 't-system', columnId: columns.doing! })).toMatchObject({ ok: false, code: 'forbidden' })
  expect(h.harness.routines).toBeDefined() // the routine ports (Forge) are held by the same object
})

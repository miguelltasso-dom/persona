/**
 * Carbon P0-03a (colheita snapshot 1): who a run acts for is derived from the REAL origin of its Task, so a routine, an event, an initiative and a team plan never run as "a person is here".
 * RED first: nothing in the host computed it (every turn armed the gates as `person`).
 */
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it } from 'vitest'
import { authorityOfRun } from '../src/run-authority.ts'

function task(id: string, triggerId: string, extra: { triggerIds?: string[]; inputs?: Ticket['inputs'] } = {}): Ticket {
  const at = '2026-11-12T10:00:00.000Z'
  return {
    id, title: id, decisionId: 'd', mandate: { goal: id, constraints: [], doneWhen: [] } as unknown as Ticket['mandate'], channels: [],
    assignments: [], inputs: extra.inputs ?? [], undelivered: [], createdAt: at, updatedAt: at,
    origin: { triggerId, triggerIds: extra.triggerIds ?? [triggerId] },
  }
}

function lookup(rows: Ticket[]): { readonly ticket: (id: string) => Ticket | undefined } {
  return { ticket: id => rows.find(row => row.id === id) }
}

describe('who a run acts for, from where its Task really came', () => {
  it('a message a person wrote (or a proposal the person accepted) is a person', () => {
    for (const id of ['u1', 'msg-4f2a', 'proposal-accept:p9', 'steer:s1']) expect(authorityOfRun(task('t1', id), lookup([])), id).toBe('person')
  })

  it('a scheduled routine run is a routine', () => {
    expect(authorityOfRun(task('t1', 'routine-run:r1:1'), lookup([]))).toBe('routine')
    expect(authorityOfRun(task('t1', 'routine-run:r1:3'), lookup([]))).toBe('routine')
  })

  it('a run an EVENT started (a mail a routine listens to), the team\'s own initiative and a plan of the Coordenação are unattended: nobody is behind them', () => {
    expect(authorityOfRun(task('t1', 'routine-run:r1@event:mail:m1:1'), lookup([]))).toBe('unattended')
    expect(authorityOfRun(task('t1', 'initiative:run-7'), lookup([]))).toBe('unattended')
    expect(authorityOfRun(task('t1', 'plan:goal-1:2026-11-12T09:00:00.000Z'), lookup([]))).toBe('unattended')
  })

  it('the mark is CONTAGIOUS: a colleague\'s Task (handoff:) and a part of a split request carry what the Task or message they came from was', () => {
    const asker = task('t-asker', 'routine-run:r1:1')
    expect(authorityOfRun(task('t-colleague', 'handoff:t-asker:c1'), lookup([asker]))).toBe('routine')
    const initiative = task('t-init', 'initiative:run-7')
    expect(authorityOfRun(task('t-col2', 'handoff:t-init:c2'), lookup([initiative]))).toBe('unattended')
    expect(authorityOfRun(task('t-part', 'split:routine-run:r1:1:nina'), lookup([]))).toBe('routine')
    expect(authorityOfRun(task('t-part2', 'split:u1:nina'), lookup([]))).toBe('person')
    // a handoff of a handoff of a person's Task stays a person's
    const mine = task('t-mine', 'u1')
    const hop = task('t-hop', 'handoff:t-mine:c1')
    expect(authorityOfRun(task('t-hop2', 'handoff:t-hop:c2'), lookup([mine, hop]))).toBe('person')
  })

  it('a Task that absorbed more inputs, or whose Eval held a batch, is as restricted as the most restricted of them', () => {
    const batch = task('t1', 'u1', { triggerIds: ['u1', 'routine-run:r1:1'] })
    expect(authorityOfRun(batch, lookup([]))).toBe('routine')
    const absorbed = task('t2', 'u1', { inputs: [{ kind: 'trigger', triggerId: 'initiative:run-7' }] as unknown as Ticket['inputs'] })
    expect(authorityOfRun(absorbed, lookup([]))).toBe('unattended')
    const both = task('t3', 'routine-run:r1:1', { triggerIds: ['routine-run:r1:1', 'initiative:run-7'] })
    expect(authorityOfRun(both, lookup([]))).toBe('unattended') // the stricter of the two kinds
  })

  it('an unreadable history is not a person: a chain too long to walk, and a handoff whose asker is gone, never fall back to person', () => {
    const rows: Ticket[] = []
    for (let index = 0; index < 40; index += 1) rows.push(task(`t${String(index)}`, index === 39 ? 'u1' : `handoff:t${String(index + 1)}:c`))
    expect(authorityOfRun(rows[0]!, lookup(rows))).toBe('unattended')
    expect(authorityOfRun(task('t-orphan', 'handoff:t-gone:c1'), lookup([]))).toBe('unattended')
  })

  it('a cycle is cut (and a cycle that never reaches a person is not one)', () => {
    const a = task('a', 'handoff:b:c1')
    const b = task('b', 'handoff:a:c2')
    expect(authorityOfRun(a, lookup([a, b]))).toBe('unattended')
  })
})

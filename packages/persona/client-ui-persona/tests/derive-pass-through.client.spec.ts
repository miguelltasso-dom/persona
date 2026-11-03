import { describe, expect, it } from 'vitest'
import { passThroughFollowers } from '../src/client/remote/derive-pass-through.ts'
import type { PersonaNowSnapshot } from '../src/client/team/persona-work-state.ts'

const row = (
  name: string,
  role: string,
  state: PersonaNowSnapshot['member']['state'],
  task?: string,
  systemRoles?: PersonaNowSnapshot['member']['systemRoles'],
): PersonaNowSnapshot => ({
  member: { id: 'bento', name, role, state, ...(systemRoles !== undefined ? { systemRoles } : {}) },
  queueCount: 0,
  ...(task !== undefined ? { currentTask: task } : {}),
})

describe('passThroughFollowers', () => {
  it('lists workers with an active task, not coordination', () => {
    const rows = passThroughFollowers([
      row('Coord', 'Coordenação', 'working', 'Triagem', ['coordination']),
      row('Bento', 'Engenharia', 'working', 'API'),
      row('Nina', 'Pesquisa', 'resting', 'Brief'),
    ])
    expect(rows.map(item => item.name)).toEqual(['Bento'])
  })
})

import { describe, expect, it } from 'vitest'
import { rosterToHostTeam } from '../src/client/remote/seed-default-team.ts'

describe('rosterToHostTeam (DF-002 wire)', () => {
  it('maps wizard roster to host team rows (no roster key)', () => {
    const team = rosterToHostTeam([
      { name: 'Nina', role: 'Pesquisa', galleryRef: 'nina', systemRoles: [] },
    ])
    expect(team).toHaveLength(1)
    expect(team[0]).toMatchObject({
      name: 'Nina',
      title: 'Pesquisa',
      avatarKind: 'gallery',
      avatarRef: 'nina',
      runnerKind: 'dsh',
    })
    expect(Object.keys(team[0]!)).not.toContain('roster')
  })
})

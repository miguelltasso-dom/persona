import { describe, expect, it } from 'vitest'
import { mapTurnActivityFolds } from '../src/client/remote/map-turn-activity-folds.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

const TEAM: TeamView = {
  members: [],
  personas: [{
    id: 'p-bento',
    workspaceId: 'w',
    projectId: 'p',
    name: 'Bento',
    title: 'Eng',
    description: '',
    avatarKind: 'gallery',
    avatarRef: 'bento',
    canRecruit: false,
    systemRoles: [],
  }],
}

describe('mapTurnActivityFolds', () => {
  it('maps persona id to live team name and drops empty folds', () => {
    const folds = mapTurnActivityFolds([
      {
        personaId: 'p-bento',
        moreCount: 0,
        items: [{ id: 'a1', kind: 'command', title: 'pnpm test', status: 'done' }],
      },
      { personaId: 'ghost', moreCount: 0, items: [] },
    ], TEAM)
    expect(folds).toHaveLength(1)
    expect(folds[0]?.persona.name).toBe('Bento')
    expect(folds[0]?.items[0]?.title).toBe('pnpm test')
  })
})

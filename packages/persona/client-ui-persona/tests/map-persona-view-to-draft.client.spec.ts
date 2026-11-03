import { describe, expect, it } from 'vitest'
import { personaViewToDraft } from '../src/client/persona-editor/map-persona-view-to-draft.ts'

describe('personaViewToDraft', () => {
  it('maps host persona row and autonomy tier', () => {
    const draft = personaViewToDraft({
      id: 'bento',
      workspaceId: 'w',
      projectId: 'p',
      name: 'Bento',
      title: 'Engenharia',
      description: 'Implementa com prova.',
      avatarKind: 'gallery',
      avatarRef: 'bento',
      systemRoles: [],
      canRecruit: false,
    }, 'act-within-limits')
    expect(draft.name).toBe('Bento')
    expect(draft.jobTitle).toBe('Engenharia')
    expect(draft.autonomyLevel).toBe('act-within-limits')
    expect(draft.coordination).toBe(false)
  })
})

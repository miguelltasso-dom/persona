import { describe, expect, it } from 'vitest'
import { draftToCreatePersonaRequest } from '../src/client/hire/map-draft-to-create-persona.ts'
import { MOCK_PERSONA_DRAFT } from '../src/client/persona-editor/persona-draft.ts'

describe('draftToCreatePersonaRequest', () => {
  it('maps editor draft to host createPersona row', () => {
    const row = draftToCreatePersonaRequest({
      ...MOCK_PERSONA_DRAFT,
      name: 'Sol',
      coordination: true,
      watchdog: false,
    }, {
      workspaceId: 'ws',
      projectId: 'pp',
      memberId: 'owner',
    })
    expect(row.id).toBe('sol')
    expect(row.name).toBe('Sol')
    expect(row.systemRoles).toEqual(['coordination'])
    expect(row.createdBy).toBe('owner')
  })
})

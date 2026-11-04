import { describe, expect, it } from 'vitest'
import { gestorActivityPersonaFromLive } from '../src/client/governance/gestor-audit-persona.ts'
import { AVATAR_96 } from '../src/client/assets/generated-imports.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS } from './persona-live-fixtures.client.ts'

function liveWithGestor(): PersonaLiveSnapshot {
  return {
    ready: true,
    tenant: null,
    team: {
      members: [],
      personas: [{
        id: 'atlas',
        workspaceId: 'w',
        projectId: 'p',
        name: 'Atlas',
        title: 'Gestor de equipe',
        description: '',
        avatarKind: 'gallery',
        avatarRef: 'atlas-default',
        systemRoles: ['team_manager'],
        canRecruit: false,
      }],
    },
    nowRows: [],
    stripMembers: [],
    awayEvents: [],
    attentionTitles: [],
    messages: [],
    passThroughFollowers: [],
    dms: [],
    selectedDmId: null,
    dmMessages: [],
    projects: [],
    kanbanCards: [],
    dmUnreadByPersonaId: {},
    suggestedTask: null,
    turnContext: null,
    error: null,
    ...PERSONA_LIVE_GESTOR_FIELDS,
  }
}

describe('gestorActivityPersonaFromLive', () => {
  it('uses team_manager portrait from live roster', () => {
    const persona = gestorActivityPersonaFromLive(liveWithGestor())
    expect(persona.name).toBe('Atlas')
    expect(persona.avatarSrc).toBe(AVATAR_96.atlas)
  })

  it('falls back to mock Atlas when live team is missing', () => {
    const persona = gestorActivityPersonaFromLive(null)
    expect(persona.name).toBe('Atlas')
    expect(persona.avatarSrc).toBe(AVATAR_96.atlas)
  })
})

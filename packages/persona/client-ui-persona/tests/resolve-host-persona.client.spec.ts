import { describe, expect, it } from 'vitest'
import { resolveHostPersonaId } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

const TEAM = {
  personas: [
    { id: 'gallery-bento', name: 'Bento', title: 'Eng', avatarRef: 'bento', systemRoles: [] as const, canRecruit: false },
  ],
  members: [],
} as unknown as TeamView

describe('resolveHostPersonaId', () => {
  it('maps strip character id to host persona id', () => {
    expect(resolveHostPersonaId(TEAM, 'bento')).toBe('gallery-bento')
  })

  it('passes through host ids unchanged', () => {
    expect(resolveHostPersonaId(TEAM, 'gallery-bento')).toBe('gallery-bento')
  })
})

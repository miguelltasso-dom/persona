import { describe, expect, it } from 'vitest'
import { sortPersonasForUi } from '../src/client/team/sort-personas.ts'
import { defaultChannelResponderId } from '../src/client/chat/default-channel-responder.ts'

describe('sortPersonasForUi', () => {
  it('treats missing systemRoles as normal tier', () => {
    const sorted = sortPersonasForUi([
      { id: 'a', name: 'Zara', title: 'T', description: '', workspaceId: 'w', projectId: 'p', avatarKind: 'gallery', avatarRef: 'z', systemRoles: undefined as unknown as [], canRecruit: false },
      { id: 'b', name: 'Atlas', title: 'T', description: '', workspaceId: 'w', projectId: 'p', avatarKind: 'gallery', avatarRef: 'a', systemRoles: ['coordination'], canRecruit: true },
    ])
    expect(sorted.map(row => row.name)).toEqual(['Atlas', 'Zara'])
  })

  it('orders coordination first, watchdog last, and everyone else in hiring (host) order, never by name', () => {
    const view = (id: string, name: string, systemRoles: readonly string[]) => ({ id, name, title: 'T', description: '', workspaceId: 'w', projectId: 'p', avatarKind: 'gallery' as const, avatarRef: id, systemRoles: systemRoles as never, canRecruit: false })
    const sorted = sortPersonasForUi([
      view('l', 'Luna', ['watchdog']),
      view('z', 'Zeca', []),
      view('b', 'Bento', []),
      view('a', 'Atlas', ['coordination']),
      view('n', 'Nina', []),
    ])
    expect(sorted.map(row => row.name)).toEqual(['Atlas', 'Zeca', 'Bento', 'Nina', 'Luna'])
  })
})

describe('defaultChannelResponderId', () => {
  it('picks coordination even when listed last', () => {
    const id = defaultChannelResponderId([
      { id: 'luna', name: 'Luna', role: 'Vigia', state: 'waiting', systemRoles: ['watchdog'] },
      { id: 'atlas', name: 'Atlas', role: 'Coord', state: 'working', systemRoles: ['coordination'] },
    ])
    expect(id).toBe('atlas')
  })
})

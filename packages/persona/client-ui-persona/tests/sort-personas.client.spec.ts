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

  it('orders coordination first, watchdog last, then name', () => {
    const sorted = sortPersonasForUi([
      { id: 'l', name: 'Luna', title: 'Vigia', description: '', workspaceId: 'w', projectId: 'p', avatarKind: 'gallery', avatarRef: 'luna', systemRoles: ['watchdog'], canRecruit: false },
      { id: 'b', name: 'Bento', title: 'Eng', description: '', workspaceId: 'w', projectId: 'p', avatarKind: 'gallery', avatarRef: 'bento', systemRoles: [], canRecruit: false },
      { id: 'a', name: 'Atlas', title: 'Coord', description: '', workspaceId: 'w', projectId: 'p', avatarKind: 'gallery', avatarRef: 'atlas', systemRoles: ['coordination'], canRecruit: true },
    ])
    expect(sorted.map(row => row.name)).toEqual(['Atlas', 'Bento', 'Luna'])
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

import { describe, expect, it } from 'vitest'
import { talkAclViewToCardTalk } from '../src/client/profile/map-talk-acl.ts'

describe('talkAclViewToCardTalk', () => {
  it('maps workspace mode to everyone', () => {
    expect(talkAclViewToCardTalk({ mode: 'workspace', principals: [] })).toEqual({
      everyone: true,
      names: [],
    })
  })

  it('maps chosen principals to names', () => {
    expect(talkAclViewToCardTalk({
      mode: 'chosen',
      principals: [{ kind: 'person', id: 'a', name: 'Ana' }, { kind: 'group', id: 'g', name: 'Time' }],
    })).toEqual({
      everyone: false,
      names: ['Ana', 'Time'],
    })
  })
})

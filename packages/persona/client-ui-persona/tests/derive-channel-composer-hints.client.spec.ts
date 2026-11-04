import { describe, expect, it } from 'vitest'
import {
  coordinationHostPersonaId,
  quotaBlockedFromOfficialQuotas,
} from '../src/client/remote/derive-channel-composer-hints.ts'

describe('derive-channel-composer-hints', () => {
  it('finds coordination persona on team', () => {
    const id = coordinationHostPersonaId({
      personas: [
        { id: 'p-nina', name: 'Nina', title: 'R', avatarRef: 'nina', systemRoles: [] },
        { id: 'p-atlas', name: 'Atlas', title: 'C', avatarRef: 'atlas', systemRoles: ['coordination'] },
      ],
      members: [],
    } as never)
    expect(id).toBe('p-atlas')
  })

  it('blocks when official window hits 100%', () => {
    const hit = quotaBlockedFromOfficialQuotas([{
      provider: 'claude',
      origin: 'official',
      windows: [{ id: '5h', origin: 'official', usedPercent: 100, resetsAt: '2026-11-04T12:00:00.000Z' }],
    }])
    expect(hit.blocked).toBe(true)
    expect(hit.resumeLabel).toBeTruthy()
  })

  it('does not block below limit', () => {
    expect(quotaBlockedFromOfficialQuotas([{
      provider: 'claude',
      origin: 'official',
      windows: [{ id: '5h', origin: 'official', usedPercent: 99 }],
    }]).blocked).toBe(false)
  })
})

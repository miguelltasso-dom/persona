import { describe, expect, it, vi } from 'vitest'
import { moveWithGrant } from '../src/computers/move-grant.ts'

/**
 * D-121 (Keel 12/11): "Levar" writes the creator's concession "she may run on THAT computer" BEFORE the home changes (the destination's rule and the owner PC's check at every start read it), and undoes it when the move is refused.
 * Only the creator can concede: the owner of the PC moves HER OWN personas; a persona of another member is not hosted on somebody else's computer on the owner's word.
 */
const base = (over: Partial<Parameters<typeof moveWithGrant>[0]> = {}) => {
  const calls: string[] = []
  const input = {
    confirm: true, ownerId: 'ana' as string | undefined, creatorId: 'ana' as string | undefined, granted: false,
    grant: vi.fn(() => { calls.push('grant') }), revoke: vi.fn(() => { calls.push('revoke') }),
    move: vi.fn(() => { calls.push('move'); return { ok: true as const, transferId: 't1' } as { ok: true; transferId: string } | { ok: false; reason: string } }),
    ...over,
  }
  return { input, calls }
}

describe('the concession is written before the home changes', () => {
  it('a confirmed move by the creator writes the concession, THEN moves, and keeps it', () => {
    const { input, calls } = base()
    expect(moveWithGrant(input)).toEqual({ ok: true, transferId: 't1' })
    expect(calls).toEqual(['grant', 'move'])
  })

  it('a move that is refused takes the concession back (it would come back if somebody brought her again)', () => {
    const { input, calls } = base({ move: vi.fn(() => ({ ok: false as const, reason: 'destination-offline' })) })
    expect(moveWithGrant(input)).toEqual({ ok: false, reason: 'destination-offline' })
    expect(calls).toEqual(['grant', 'revoke'])
  })

  it('a concession that already stood is not written again, and is not taken back when the move is refused', () => {
    const { input, calls } = base({ granted: true, move: vi.fn(() => ({ ok: false as const, reason: 'confirm-required' })) })
    moveWithGrant(input)
    expect(calls).toEqual([])
  })

  it('without confirmation nothing is written (a preview or a "confirm-required" answer changes nothing)', () => {
    const { input, calls } = base({ confirm: false, move: vi.fn(() => ({ ok: false as const, reason: 'confirm-required' })) })
    expect(moveWithGrant(input)).toEqual({ ok: false, reason: 'confirm-required' })
    expect(calls).toEqual([])
  })
})

describe('only the creator concedes', () => {
  it.each([
    ['a persona of another member', { ownerId: 'ana', creatorId: 'gus' }],
    ['no owner is known', { ownerId: undefined, creatorId: 'ana' }],
    ['no creator is known', { ownerId: 'ana', creatorId: undefined }],
  ])('%s: a confirmed move is `host-not-allowed` and neither writes nor moves anything', (_label, who) => {
    const { input, calls } = base(who)
    expect(moveWithGrant(input)).toEqual({ ok: false, reason: 'host-not-allowed' })
    expect(calls).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { avatarRefForPersonaName, DEFAULT_SUGGESTED_PERSONAS } from '../src/client/remote/seed-default-team.ts'

describe('seed-default-team', () => {
  it('maps onboarding names to gallery avatar refs', () => {
    expect(avatarRefForPersonaName('Sol')).toBe('sol')
    expect(avatarRefForPersonaName('Luna')).toBe('luna')
    expect(avatarRefForPersonaName('Atlas')).toBe('atlas')
  })

  it('includes five suggested personas with brush ids', () => {
    expect(DEFAULT_SUGGESTED_PERSONAS.map(row => row.avatarRef)).toEqual([
      'atlas', 'bento', 'nina', 'sol', 'luna',
    ])
  })
})

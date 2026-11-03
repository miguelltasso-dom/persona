import { describe, expect, it } from 'vitest'
import { rosterFromDrafts } from '../src/client/onboarding/roster-from-draft.ts'

describe('rosterFromDrafts', () => {
  it('passes gallery ref and system roles to host roster', () => {
    const rows = rosterFromDrafts([{
      name: 'Coordenador',
      role: 'Coordenação',
      galleryRef: 'atlas',
      systemRoles: ['coordination'],
    }])
    expect(rows[0]).toEqual({
      name: 'Coordenador',
      role: 'Coordenação',
      galleryRef: 'atlas',
      systemRoles: ['coordination'],
    })
  })
})

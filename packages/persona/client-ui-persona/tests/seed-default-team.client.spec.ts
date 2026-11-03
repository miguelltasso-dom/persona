import { describe, expect, it } from 'vitest'
import {
  galleryRefForRosterPerson,
  suggestedGalleryToHostTeam,
  SUGGESTED_TEAM_GALLERY,
} from '../src/client/remote/seed-default-team.ts'
import { readClientDevSeedEnabled } from '../src/client/remote/persona-dev-seed.ts'

describe('suggested team gallery', () => {
  it('exposes five example gallery cards with brush refs', () => {
    expect(SUGGESTED_TEAM_GALLERY).toHaveLength(5)
    expect(SUGGESTED_TEAM_GALLERY.map(row => row.avatarRef)).toEqual([
      'atlas', 'bento', 'nina', 'sol', 'luna',
    ])
    expect(SUGGESTED_TEAM_GALLERY.map(row => row.name)).toEqual([
      'Atlas', 'Bento', 'Nina', 'Sol', 'Luna',
    ])
  })

  it('maps gallery to host onboarding team with coordination + watchdog roles', () => {
    const team = suggestedGalleryToHostTeam()
    expect(team.find(row => row.name === 'Atlas')?.systemRoles).toEqual(['coordination'])
    expect(team.find(row => row.name === 'Luna')?.systemRoles).toEqual(['watchdog'])
    expect(team.find(row => row.name === 'Bento')?.avatarRef).toBe('bento')
  })

  it('uses explicit galleryRef on roster rows', () => {
    expect(galleryRefForRosterPerson({ name: 'Any', role: 'R', galleryRef: 'sol' })).toBe('sol')
  })

  it('slugifies name when galleryRef omitted (no fixed character names)', () => {
    expect(galleryRefForRosterPerson({ name: 'Minha Persona', role: 'R' })).toBe('minha-persona')
  })
})

describe('persona-dev-seed', () => {
  it('is off without harness flag', () => {
    expect(readClientDevSeedEnabled()).toBe(false)
  })
})

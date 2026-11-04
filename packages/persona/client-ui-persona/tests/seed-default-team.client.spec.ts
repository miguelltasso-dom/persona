import { describe, expect, it } from 'vitest'
import {
  createDevHarnessMessageClock,
  DEV_HARNESS_BRAIN_GRANT_ID,
  devHarnessMessageTimes,
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

describe('dev harness brain grant (AG-004)', () => {
  it('uses stable grant id (dev seed path only; host onboarding AG-004 in persona-host)', () => {
    expect(DEV_HARNESS_BRAIN_GRANT_ID).toBe('dev-harness-v1-brain-grant')
  })
})

describe('devHarnessMessageTimes', () => {
  it('starts after onboarding welcome and increases monotonically', () => {
    const welcomeAt = '2026-11-03T21:00:00.000Z'
    const times = devHarnessMessageTimes([{ occurredAt: welcomeAt }], 3, Date.parse('2026-11-03T10:00:00.000Z'))
    expect(times).toHaveLength(3)
    expect(Date.parse(times[0]!)).toBeGreaterThan(Date.parse(welcomeAt))
    expect(Date.parse(times[1]!)).toBeGreaterThan(Date.parse(times[0]!))
    expect(Date.parse(times[2]!)).toBeGreaterThan(Date.parse(times[1]!))
  })

  it('createDevHarnessMessageClock continues across same-batch posts (gestor tail)', () => {
    const welcomeAt = '2026-11-03T21:00:00.000Z'
    const clock = createDevHarnessMessageClock([{ occurredAt: welcomeAt }], Date.parse('2026-11-03T10:00:00.000Z'))
    const batch = [clock.next(), clock.next(), clock.next()]
    const gestorAt = clock.next()
    expect(Date.parse(gestorAt)).toBeGreaterThan(Date.parse(batch[2]!))
    expect(devHarnessMessageTimes([{ occurredAt: welcomeAt }], 1, Date.parse('2026-11-03T10:00:00.000Z'), batch)[0]).toBe(gestorAt)
  })
})

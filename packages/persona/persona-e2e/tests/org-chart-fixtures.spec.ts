/**
 * Committed host-shaped organogram fixtures (GOVERNANCE-SPEC scale).
 * Prism/Lumen can replace the in-app mock with these files.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../src/paths.ts'

interface Member {
  readonly id: string
  readonly name: string
  readonly role: string
}

interface Group {
  readonly id: string
  readonly kind: string
  readonly members: readonly Member[]
}

interface RosterFile {
  readonly workspaceId: string
  readonly groupBy: string
  readonly personaCount: number
  readonly rightHand: { readonly role: string }
  readonly groups: readonly Group[]
}

function load(name: string): RosterFile {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'packages/persona/persona-e2e/fixtures/org-chart', name), 'utf8')) as RosterFile
}

describe('org-chart host fixtures', () => {
  it('roster-60.json is a person-view with 60 hanging personas + Gestor', () => {
    const raw = load('roster-60.json')
    expect(raw.workspaceId).toBe('ws')
    expect(raw.groupBy).toBe('person')
    expect(raw.rightHand.role).toBe('Gestor de equipe')
    const hanging = raw.groups.reduce((n, group) => n + group.members.length, 0)
    expect(hanging).toBe(60)
    expect(raw.personaCount).toBe(61)
  })

  it('roster-150.json is a sector-view with 150 hanging personas + Gestor', () => {
    const raw = load('roster-150.json')
    expect(raw.groupBy).toBe('sector')
    expect(raw.rightHand.role).toBe('Gestor de equipe')
    const hanging = raw.groups.reduce((n, group) => n + group.members.length, 0)
    expect(hanging).toBe(150)
    expect(raw.personaCount).toBe(151)
    expect(raw.groups.every(group => group.kind === 'sector')).toBe(true)
  })
})

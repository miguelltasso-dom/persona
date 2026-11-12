/**
 * Item 16, third slice: who holds which access, read from the grants the owner already gave. A persona that lacks one asks the colleague who has it.
 */
import { describe, expect, it } from 'vitest'
import { ACCESS_RULE, accessLabelOf, accessMapOf, colleaguesWhoHold } from '../src/access-map.ts'

const NAMES: Readonly<Record<string, string>> = { nina: 'Nina', bia: 'Bia', teo: 'Teo' }
const nameOf = (id: string): string | undefined => NAMES[id]

const GRANTS = [
  { personaId: 'nina', cli: 'claude', connectorId: 'insta', name: 'Instagram', access: 'write' as const },
  { personaId: 'bia', cli: 'claude', connectorId: 'insta', name: 'Instagram', access: 'read' as const },
  { personaId: 'bia', cli: 'claude', connectorId: 'gmail', name: 'Gmail', access: 'write' as const },
  { personaId: 'gone', cli: 'claude', connectorId: 'gmail', name: 'Gmail', access: 'write' as const },
  { personaId: 'nina', cli: 'claude', connectorId: 'insta', name: 'Instagram', access: 'read' as const }, // the same grant twice counts once
]

describe('accessMapOf', () => {
  it('groups the grants by what they give access to, holders by name, labels in order, a persona that is gone left out', () => {
    expect(accessMapOf(GRANTS, nameOf)).toEqual([
      { key: 'claude:gmail', label: 'Gmail', holders: [{ personaId: 'bia', name: 'Bia', access: 'write' }] },
      { key: 'claude:insta', label: 'Instagram', holders: [{ personaId: 'bia', name: 'Bia', access: 'read' }, { personaId: 'nina', name: 'Nina', access: 'write' }] },
    ])
  })

  it('says nothing when nobody holds anything', () => {
    expect(accessMapOf([], nameOf)).toEqual([])
  })
})

describe('what a persona holds, and who to ask for the rest', () => {
  const map = accessMapOf(GRANTS, nameOf)

  it('lists what she can reach, marking read-only', () => {
    expect(accessLabelOf(map, 'bia')).toBe('Gmail, Instagram (só leitura)')
    expect(accessLabelOf(map, 'nina')).toBe('Instagram')
    expect(accessLabelOf(map, 'teo')).toBe('')
  })

  it('names the colleagues who hold what she lacks', () => {
    expect(colleaguesWhoHold(map, 'nina')).toEqual([{ label: 'Gmail', names: ['Bia'] }])
    expect(colleaguesWhoHold(map, 'teo')).toEqual([
      { label: 'Gmail', names: ['Bia'] }, { label: 'Instagram', names: ['Bia', 'Nina'] },
    ])
    expect(colleaguesWhoHold(map, 'bia')).toEqual([])
  })

  it('the rule is one constant sentence (cache-stable) that sends her to the colleague, not to the owner', () => {
    expect(ACCESS_RULE).toMatch(/peça a ele/u)
    expect(ACCESS_RULE).toMatch(/em vez de dizer ao dono que falta login/u)
    expect(ACCESS_RULE).not.toMatch(/a pessoa/iu)
  })
})

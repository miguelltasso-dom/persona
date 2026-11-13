import type PersonaHost from '../src/index.ts'
import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

/**
 * D-117 on a REAL host: `computerAccessOf(personaId, commanderId)` is the ONE answer to "may this person make this persona use THIS computer now", read again at every call by the executor (`ComputerRuns`). It binds Zinc's matrix
 * (`decideComputerUse`, the single implementation) to what the host knows: her audience and the creator's offer, the owner's LOCAL grant, where she lives now, what THIS computer is, and who may use her. Everything fails closed.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const PP = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria Lua', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...PP, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bob', ...PP, displayName: 'Bob', handle: 'bob', role: 'member' })
  for (const [id, name] of [['p-bia', 'Bia'], ['p-caio', 'Caio']] as const) {
    h.createPersona({
      id, ...PP, name, title: 'Redatora', description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.sessionMemberId = 'ana'
  h.setThisComputerId('pc-ana') // personal, Ana's: the default of a machine nobody enrolled
  h.computerFactsOf = computerId => (computerId === 'pc-time' ? { computerId, kind: 'team', ownerId: 'ana', teamComputerUse: true } : computerId === 'pc-casa' ? { computerId, kind: 'personal', ownerId: 'ana' } : undefined)
}

const now = (h: PersonaHost): string => h.orchestration.now()

it('"Só eu": needs the creator\'s offer AND the owner\'s local grant, and only the owner commands; the grant is read again at every call', () => {
  const h = host()
  seed(h)
  expect(h.computerAccessOf('p-bia', 'ana')).toEqual({ allow: false, reason: 'computer-use-off' }) // off by default
  h.personaScope().set('p-bia', { audience: 'private', computerUse: 'on' }, 'ana', now(h))
  expect(h.computerAccessOf('p-bia', 'ana'), 'offered but not granted on THIS computer').toEqual({ allow: false, reason: 'computer-use-off' })
  h.computerGrants().grant('pc-ana', 'p-bia', 'ana', now(h))
  expect(h.computerAccessOf('p-bia', 'ana')).toEqual({ allow: true })
  expect(h.computerAccessOf('p-bia', 'bob')).toEqual({ allow: false, reason: 'not-owner' })
  h.computerGrants().revoke('pc-ana', 'p-bia', 'ana', now(h))
  expect(h.computerAccessOf('p-bia', 'ana'), 'taken back: the very next call refuses').toEqual({ allow: false, reason: 'computer-use-off' })
})

it('where she lives decides: moved away or being moved = not home here (and an unknown persona is refused)', () => {
  const h = host()
  seed(h)
  h.personaScope().set('p-bia', { audience: 'private', computerUse: 'on' }, 'ana', now(h))
  h.computerGrants().grant('pc-ana', 'p-bia', 'ana', now(h))
  expect(h.computerAccessOf('p-bia', 'ana')).toEqual({ allow: true })
  h.personaHome().close('p-bia', 'moving', 'pc-casa') // closed BEFORE she moves
  expect(h.computerAccessOf('p-bia', 'ana')).toEqual({ allow: false, reason: 'not-home' })
  expect(h.computerAccessOf('nao-existe', 'ana')).toEqual({ allow: false, reason: 'unreadable' })
})

it('a team computer: the persona is "da equipe", the computer must have computer use enabled, and only the owner and who the owner listed may command her', () => {
  const h = host()
  seed(h)
  h.personaScope().set('p-caio', { audience: 'team', computerUse: 'off' }, 'ana', now(h))
  h.personaHome().set('p-caio', { computerId: 'pc-time', epoch: 1 }, now(h))
  h.setThisComputerId('pc-time') // this host now IS the team computer
  h.personaScope().set('p-caio', { audience: 'team', computerUse: 'on' }, 'ana', now(h))
  h.computerGrants().grant('pc-time', 'p-caio', 'ana', now(h))
  expect(h.computerAccessOf('p-caio', 'ana'), 'the owner of the computer').toEqual({ allow: true })
  expect(h.computerAccessOf('p-caio', 'bob'), 'a member nobody listed').toEqual({ allow: false, reason: 'commander-not-allowed' })
  h.computerUsers().set('pc-time', 'p-caio', ['bob'], 'ana', now(h))
  expect(h.computerAccessOf('p-caio', 'bob'), 'listed by the owner').toEqual({ allow: true })
  h.computerUsers().set('pc-time', 'p-caio', [], 'ana', now(h))
  expect(h.computerAccessOf('p-caio', 'bob'), 'taken off the list: the next call refuses').toEqual({ allow: false, reason: 'commander-not-allowed' })
})

it('fail closed: this host being a different computer than her home, a directory that says nothing about the kind, or no word on who commands, are all refusals', () => {
  const h = host()
  seed(h)
  h.personaScope().set('p-bia', { audience: 'private', computerUse: 'on' }, 'ana', now(h))
  h.computerGrants().grant('pc-ana', 'p-bia', 'ana', now(h))
  h.setThisComputerId('pc-outro') // this host is another computer: she has no home doc, so she lives HERE, but the owner's grant was given on pc-ana (a grant is per computer)
  expect(h.computerAccessOf('p-bia', 'ana')).toEqual({ allow: false, reason: 'computer-use-off' })
  h.setThisComputerId('pc-ana')
  expect(h.computerAccessOf('p-bia', '')).toEqual({ allow: false, reason: 'invalid' })
  h.computerFactsOf = computerId => ({ computerId, kind: undefined, ownerId: 'ana' }) // the directory knows the computer but not what kind it is
  expect(h.computerAccessOf('p-bia', 'ana')).toEqual({ allow: false, reason: 'unreadable' })
})

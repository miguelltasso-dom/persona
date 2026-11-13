import { expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { HomeError } from '../src/persona-home.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * D-116/D-117 on a REAL host: the home book, the scope book and the placement rule are bound to the host's products and to Zinc's matrix (one rule, no copy). A persona with no doc lives HERE; a move to a computer the
 * host knows nothing about is refused (fail CLOSED); closing a persona stops her runner; computer use is turned OFF in the new home; Bolt's ports (`creatorOf`, `hostedBy`) answer from the real personas.
 */
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const PP = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria Lua', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...PP, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['p-bia', 'Bia'], ['p-caio', 'Caio']] as const) {
    h.createPersona({
      id, ...PP, name, title: 'Redatora', description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.sessionMemberId = 'ana'
  h.setThisComputerId('pc-ana')
  // Bolt's directory tells what the OTHER computers are (the enrollment record of each one).
  h.computerFactsOf = computerId => (computerId.startsWith('pc-time') ? { computerId, kind: 'team', ownerId: 'ana', teamComputerUse: true } : computerId === 'pc-casa' ? { computerId, kind: 'personal', ownerId: 'ana' } : undefined)
}

it('a persona with no doc lives HERE, active (nothing to show, nothing to migrate)', () => {
  const h = host()
  seed(h)
  expect(h.personaHome().resolve('p-bia')).toEqual({ computerId: 'pc-ana', epoch: 0, state: 'active', isThis: true, explicit: false })
  expect(h.personaHome().runsHere('p-bia')).toBe(true)
  expect(h.personaHome().placesOf('pc-ana').sort()).toEqual(['p-bia', 'p-caio'])
})

it('a move to a computer the host knows nothing about is refused (fail closed); a known personal PC of her creator is accepted', () => {
  const h = host()
  seed(h)
  expect(() => { h.personaHome().set('p-bia', { computerId: 'pc-fantasma', epoch: 1 }, h.orchestration.now()) }).toThrow(HomeError)
  expect(h.personaHome().resolve('p-bia').computerId).toBe('pc-ana') // nothing was written
  h.personaHome().set('p-bia', { computerId: 'pc-casa', epoch: 1 }, h.orchestration.now())
  expect(h.personaHome().resolve('p-bia')).toMatchObject({ computerId: 'pc-casa', epoch: 1, isThis: false, explicit: true })
  expect(h.personaHome().runsHere('p-bia')).toBe(false) // "fora do ar" here
  expect(h.personaHome().placesOf('pc-casa')).toEqual(['p-bia'])
})

it('the hard rule comes from the engine: a PRIVATE persona never moves to a team computer', () => {
  const h = host()
  seed(h) // no scope doc = private, computer use off (the safe default)
  let refusal = ''
  try {
    h.personaHome().set('p-bia', { computerId: 'pc-time', epoch: 1 }, h.orchestration.now())
  } catch (error: unknown) {
    refusal = error instanceof HomeError ? `${error.code}:${error.detail ?? ''}` : 'other'
  }
  expect(refusal).toBe('placement-refused:private-persona-on-team-pc')
  h.personaScope().set('p-caio', { audience: 'team', computerUse: 'off' }, 'ana', h.orchestration.now())
  h.personaHome().set('p-caio', { computerId: 'pc-time', epoch: 1 }, h.orchestration.now()) // a team persona may live there
  expect(h.personaHome().resolve('p-caio').computerId).toBe('pc-time')
})

it('closing a persona writes "moving" FIRST and then lets her runner go', () => {
  const h = host()
  seed(h)
  const evict = vi.spyOn(h.orchestration, 'evictWarmRunners')
  h.personaHome().close('p-bia', 'moving', 'pc-casa')
  expect(h.personaHome().resolve('p-bia')).toMatchObject({ state: 'moving', movingTo: 'pc-casa' })
  expect(evict).toHaveBeenCalledWith('pp', 'p-bia')
})

it('moving her to another computer turns computer use OFF and takes the local grant back (at the old computer too: it must not come back if she returns)', () => {
  const h = host()
  seed(h)
  h.personaScope().set('p-caio', { audience: 'team', computerUse: 'off' }, 'ana', h.orchestration.now())
  h.personaHome().set('p-caio', { computerId: 'pc-time', epoch: 1 }, h.orchestration.now()) // a team computer: computer use may be ON there
  h.personaScope().set('p-caio', { audience: 'team', computerUse: 'on' }, 'ana', h.orchestration.now())
  h.computerGrants().grant('pc-time', 'p-caio', 'ana', h.orchestration.now())
  expect(h.computerGrants().has('pc-time', 'p-caio')).toBe(true)
  h.personaHome().set('p-caio', { computerId: 'pc-time2', epoch: 2 }, h.orchestration.now())
  expect(h.personaScope().get('p-caio')).toEqual({ audience: 'team', computerUse: 'off' }) // the permission does not travel
  expect(h.computerGrants().has('pc-time', 'p-caio')).toBe(false)
  expect(h.computerGrants().has('pc-time2', 'p-caio')).toBe(false) // born OFF in the new home
})

it('hostGrantOf (Bolt\'s read-only port): no data = NOT granted (fail closed); keyed by computer; written only in-process; gone when she leaves that computer', () => {
  const h = host()
  seed(h)
  expect(h.hostGrantOf('p-caio', 'pc-time')).toEqual({ granted: false, by: '' }) // nobody granted anything
  expect(h.hostGrantOf('nao-existe', 'pc-time')).toEqual({ granted: false, by: '' })
  h.personaHostGrants().grant('pc-time', 'p-caio', 'ana', h.orchestration.now())
  expect(h.hostGrantOf('p-caio', 'pc-time')).toEqual({ granted: true, by: 'ana' })
  expect(h.hostGrantOf('p-caio', 'pc-time2')).toEqual({ granted: false, by: '' }) // a grant at ONE computer is nothing at another
  expect(h.hostGrantOf('p-bia', 'pc-time')).toEqual({ granted: false, by: '' }) // nor for another persona
  h.personaHostGrants().grant('pc-time2', 'p-bia', '', h.orchestration.now())
  expect(h.hostGrantOf('p-bia', 'pc-time2')).toEqual({ granted: false, by: '' }) // a grant nobody signed is no grant
  h.personaHostGrants().revoke('pc-time', 'p-caio', 'ana', h.orchestration.now())
  expect(h.hostGrantOf('p-caio', 'pc-time')).toEqual({ granted: false, by: '' }) // the creator took it back
  // She leaves the computer: its grant must not come back if somebody brings her again.
  h.personaScope().set('p-caio', { audience: 'team', computerUse: 'off' }, 'ana', h.orchestration.now())
  h.personaHostGrants().grant('pc-time', 'p-caio', 'ana', h.orchestration.now())
  h.personaHome().set('p-caio', { computerId: 'pc-time', epoch: 1 }, h.orchestration.now())
  h.personaHome().set('p-caio', { computerId: 'pc-time2', epoch: 2 }, h.orchestration.now())
  expect(h.hostGrantOf('p-caio', 'pc-time')).toEqual({ granted: false, by: '' })
})

it('creatorOf / hostedBy (the ports of Bolt\'s computers) answer from the real personas', () => {
  const h = host()
  seed(h)
  expect(h.creatorOf('p-bia')).toEqual({ memberId: 'ana', autonomy: 'baixa' })
  expect(h.creatorOf('nao-existe')).toBeUndefined()
  expect(h.hostedBy('pc-ana', 'ana')).toBe(2)
  h.personaHome().set('p-bia', { computerId: 'pc-casa', epoch: 1 }, h.orchestration.now())
  expect(h.hostedBy('pc-ana', 'ana')).toBe(1)
  expect(h.hostedBy('pc-casa', 'ana')).toBe(1)
  expect(h.hostedBy('pc-casa', 'bob')).toBe(0)
})

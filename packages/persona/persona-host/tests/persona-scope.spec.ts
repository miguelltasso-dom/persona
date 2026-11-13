import { expect, it } from 'vitest'
import { ComputerGrantBook, effectiveComputerUse, GRANT_KIND, PersonaScopeBook, ScopeError, type GrantDoc, type HomeFacts, type PlacementValidator, type ScopeDoc } from '../src/persona-scope.ts'

/**
 * D-117 (host side): ONE writer of `persona_scope`, the LOCAL grant by (computer, persona), revocation, and the forged home. The MATRIX itself (what is allowed on which kind of PC) is `persona-engine/src/computer-scope.ts`
 * (Zinc, the single implementation, with the exhaustive table): here the validator is a STUB of the same shape, so these tests prove only what the host's book does with a verdict — never the matrix.
 */
const ANA = 'ana'

/** A test double with the SHAPE of the engine's `validatePersonaComputerConfig`: enough refusals to prove the book's behavior. */
const stub: PlacementValidator = ({ persona, home }) => {
  if (home.kind === undefined) return { ok: false, reason: 'invalid' }
  if (persona.audience === 'private' && home.kind === 'team') return { ok: false, reason: 'private-persona-on-team-pc' }
  if (persona.audience === 'team' && persona.computerUse && home.kind === 'personal') return { ok: false, reason: 'team-persona-on-personal-pc' }
  return { ok: true }
}

function rig(home: HomeFacts | null = { computerId: 'pc-dono', kind: 'personal', ownerId: ANA }) {
  const docs = new Map<string, ScopeDoc>()
  const revoked: string[] = []
  const state = { home: home ?? undefined } // null = a persona with no home at all
  const seen: Array<{ audience: string; computerUse: boolean; homeKind: string | undefined; creatorId: string }> = []
  const book = new PersonaScopeBook({
    store: { get: (p, k, i) => docs.get(`${p}/${k}/${i}`), put: (p, k, i, v) => { docs.set(`${p}/${k}/${i}`, v) } },
    validate: (input) => { seen.push({ audience: input.persona.audience, computerUse: input.persona.computerUse, homeKind: input.home.kind, creatorId: input.persona.creatorId }); return stub(input) },
    projectOf: id => (id === 'bia' ? 'pp' : undefined),
    creatorOf: id => (id === 'bia' ? ANA : undefined),
    homeOf: () => state.home,
    onRevoke: (id, computerId) => { revoked.push(`${id}@${computerId}`) },
  })
  return { book, docs, revoked, state, seen }
}

it('persona_scope has ONE writer: a persona never set is private with computer use OFF (the safe default); an unknown persona is refused', () => {
  const { book } = rig()
  expect(book.get('bia')).toEqual({ audience: 'private', computerUse: 'off' })
  expect(() => book.set('fantasma', { audience: 'team', computerUse: 'off' }, ANA, 'now')).toThrow(ScopeError)
})

it('every change asks the ENGINE\'S validator with her current home: a refusal throws with the engine\'s reason and NOTHING is written; the validator sees the creator, the switch as a boolean and the kind of her home', () => {
  const personal = rig({ computerId: 'pc-dono', kind: 'personal', ownerId: ANA })
  personal.book.set('bia', { audience: 'private', computerUse: 'on' }, ANA, 'now')
  expect(personal.seen.at(-1)).toEqual({ audience: 'private', computerUse: true, homeKind: 'personal', creatorId: ANA })
  try { personal.book.set('bia', { audience: 'team', computerUse: 'on' }, ANA, 'later'); expect.unreachable() } catch (error) { expect((error as ScopeError).reason).toBe('team-persona-on-personal-pc') }
  expect(personal.book.get('bia')).toEqual({ audience: 'private', computerUse: 'on' }) // the old doc stays
  personal.book.set('bia', { audience: 'team', computerUse: 'off' }, ANA, 'later')
  expect(personal.book.get('bia')).toEqual({ audience: 'team', computerUse: 'off' })
  try { personal.book.set('bia', { audience: 'team', computerUse: 'on' }, ANA, 'later'); expect.unreachable() } catch (error) { expect((error as ScopeError).reason).toBe('team-persona-on-personal-pc') } // off -> on goes through the SAME validator
  const team = rig({ computerId: 'pc-padaria', kind: 'team', ownerId: ANA, teamComputerUse: true })
  try { team.book.set('bia', { audience: 'private', computerUse: 'off' }, ANA, 'now'); expect.unreachable() } catch (error) { expect((error as ScopeError).reason).toBe('private-persona-on-team-pc') }
  expect(team.docs.size).toBe(0)
  team.book.set('bia', { audience: 'team', computerUse: 'on' }, ANA, 'now')
  expect(team.book.get('bia')).toEqual({ audience: 'team', computerUse: 'on' })
})

it('a computer whose kind the host does not know is handed to the validator as such (the engine fails closed); a persona with no home is judged with an unknown kind', () => {
  const unknown = rig({ computerId: 'pc-x', kind: undefined })
  expect(() => unknown.book.set('bia', { audience: 'team', computerUse: 'off' }, ANA, 'now')).toThrow(ScopeError)
  const nohome = rig(null)
  try { nohome.book.set('bia', { audience: 'private', computerUse: 'off' }, ANA, 'now'); expect.unreachable() } catch (error) { expect((error as ScopeError).reason).toBe('invalid') }
  expect(nohome.seen.at(-1)).toMatchObject({ homeKind: undefined })
})

it('changing the audience, or turning computer use off, REVOKES the local grant of her home computer; an unchanged value does not; the first write revokes nothing', () => {
  const { book, revoked } = rig({ computerId: 'pc-padaria', kind: 'team', ownerId: ANA, teamComputerUse: true })
  book.set('bia', { audience: 'team', computerUse: 'on' }, ANA, 't1')
  expect(revoked).toEqual([])
  book.set('bia', { audience: 'team', computerUse: 'on' }, ANA, 't2')
  expect(revoked).toEqual([])
  book.set('bia', { audience: 'team', computerUse: 'off' }, ANA, 't3')
  expect(revoked).toEqual(['bia@pc-padaria'])
})

it('a FORGED home (a signed record naming a computer) is judged by the SAME validator and returns the engine\'s reason; an allowed one returns nothing', () => {
  const { book } = rig()
  book.set('bia', { audience: 'private', computerUse: 'off' }, ANA, 'now')
  expect(book.homeAllowed('bia', { computerId: 'pc-padaria', kind: 'team', ownerId: ANA })).toBe('private-persona-on-team-pc')
  expect(book.homeAllowed('bia', { computerId: 'pc-dono', kind: 'personal', ownerId: ANA })).toBeUndefined()
  expect(book.homeAllowed('bia', { computerId: 'pc-x', kind: undefined })).toBe('invalid')
  expect(book.homeAllowed('fantasma', { computerId: 'pc-dono', kind: 'personal', ownerId: ANA })).toBe('unknown-persona')
})

it('the local grant is keyed by (computer, persona): a grant at one computer is nothing at another, and revoking turns it off', () => {
  const docs = new Map<string, GrantDoc>()
  const grants = new ComputerGrantBook({ get: (p, k, i) => docs.get(`${p}/${k}/${i}`), put: (p, k, i, v) => { docs.set(`${p}/${k}/${i}`, v) } }, id => (id === 'bia' ? 'pp' : undefined))
  expect(grants.has('pc-padaria', 'bia')).toBe(false) // born OFF
  grants.grant('pc-padaria', 'bia', ANA, 't1')
  expect(grants.has('pc-padaria', 'bia')).toBe(true)
  expect(grants.has('pc-dono', 'bia')).toBe(false) // another computer: not granted
  expect(docs.has(`pp/${GRANT_KIND}/pc-padaria:bia`)).toBe(true)
  grants.revoke('pc-padaria', 'bia', ANA, 't2')
  expect(grants.has('pc-padaria', 'bia')).toBe(false)
  grants.grant('pc-padaria', 'fantasma', ANA, 't3') // a persona nobody knows: nothing is written
  expect(grants.has('pc-padaria', 'fantasma')).toBe(false)
})

it('the boolean handed to the engine\'s matrix is the creator\'s offer AND the owner\'s local grant — and nothing else (the matrix decides the rest)', () => {
  expect(effectiveComputerUse('on', true)).toBe(true)
  expect(effectiveComputerUse('off', true)).toBe(false)
  expect(effectiveComputerUse('on', false)).toBe(false)
})

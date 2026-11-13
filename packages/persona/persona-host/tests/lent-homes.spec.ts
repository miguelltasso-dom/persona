import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HandoffError } from '../src/computers/handoff.ts'
import { ENVELOPE_DOMAIN, LentHomes, envelopeBytes, envelopeText, readEnvelope, type LentSheet } from '../src/computers/lent-homes.ts'

/**
 * D-121 (Keel 12/11): a computer of the team that is LENT a persona (decision B: she runs her turns here, the project stays on the owner's PC) keeps only where she lives: a home record with an epoch, in a file of its own.
 * It is the home port the handoff protocol and the executor's `homeCheck` use on that computer (it has no persona row, no project, no home book). Lumen's review (22:12): L1 the newer sheet is never replaced by an older
 * transfer that ends late, L2 what the owner signs has a domain prefix and the workspace, L3 the highest epoch seen is remembered after she goes back.
 */
const dirs: string[] = []
const file = (): string => { const dir = mkdtempSync(join(tmpdir(), 'persona-lent-')); dirs.push(dir); return join(dir, 'lent-homes.json') }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const ME = 'comp-b'
const sheet = (autonomy: 'baixa' | 'media' | 'alta', text: string, creator = 'ana'): LentSheet => ({
  json: envelopeText({ v: 1, personaId: 'nina', workspaceId: 'ws1', creatorMemberId: creator, autonomy, sheet: text }), signature: `sig-${autonomy}`, signerSigningPublic: 'owner-pub',
})
const textOf = (homes: LentHomes): string | undefined => {
  const json = homes.sheetOf('nina')?.json
  return json === undefined ? undefined : (JSON.parse(json) as { sheet: string }).sheet
}

describe('where a lent persona lives', () => {
  it('a persona nobody told this computer about lives HERE at epoch 0 (the book\'s own rule): the executor will refuse an order for a later epoch', () => {
    const homes = new LentHomes(file(), () => ME)
    expect(homes.resolve('nina')).toEqual({ computerId: ME, epoch: 0, state: 'active' })
  })

  it('set is a compare-and-set by epoch: she lives here from epoch 3, an equal or lower epoch is `stale-epoch`, a higher one wins', () => {
    const homes = new LentHomes(file(), () => ME)
    homes.set('nina', { computerId: ME, epoch: 3 })
    expect(homes.resolve('nina')).toEqual({ computerId: ME, epoch: 3, state: 'active' })
    expect(() => { homes.set('nina', { computerId: ME, epoch: 3 }) }).toThrow(HandoffError)
    expect(() => { homes.set('nina', { computerId: 'comp-a', epoch: 2 }) }).toThrow(expect.objectContaining({ code: 'stale-epoch' }))
    homes.set('nina', { computerId: 'comp-c', epoch: 4 }) // she was taken on to another computer: not here any more
    expect(homes.resolve('nina')).toMatchObject({ computerId: 'comp-c', epoch: 4, state: 'active' })
  })

  it('close writes `moving` (durable) and open brings back only one that is moving; both are idempotent', () => {
    const homes = new LentHomes(file(), () => ME)
    homes.set('nina', { computerId: ME, epoch: 1 })
    homes.close('nina', 'moving', 'comp-c')
    homes.close('nina', 'moving', 'comp-c')
    expect(homes.resolve('nina')).toEqual({ computerId: ME, epoch: 1, state: 'moving', movingTo: 'comp-c' })
    homes.open('nina')
    homes.open('nina')
    expect(homes.resolve('nina')).toEqual({ computerId: ME, epoch: 1, state: 'active' })
    homes.open('nobody') // nothing to reopen: no record is invented
    expect(homes.resolve('nobody').epoch).toBe(0)
  })

  it('what it knows survives a restart, and the sheet that came with her is kept once the home is set (the owner\'s signature, law 3)', () => {
    const path = file()
    const first = new LentHomes(path, () => ME)
    first.putSheet('nina', { json: '{"v":1}', signature: 'c2ln', signerSigningPublic: 'pub' })
    expect(first.sheetOf('nina'), 'a sheet that waits is not hers yet').toBeUndefined()
    first.set('nina', { computerId: ME, epoch: 2 })
    const again = new LentHomes(path, () => ME)
    expect(again.resolve('nina')).toEqual({ computerId: ME, epoch: 2, state: 'active' })
    expect(again.sheetOf('nina')).toEqual({ json: '{"v":1}', signature: 'c2ln', signerSigningPublic: 'pub' })
    expect(again.lent()).toEqual(['nina'])
  })

  it('a file that is damaged, or says something else, is no record at all (nobody is lent anything that cannot be checked)', () => {
    const path = file()
    writeFileSync(path, '{ nope')
    expect(new LentHomes(path, () => ME).resolve('nina').epoch).toBe(0)
    writeFileSync(path, JSON.stringify({ lent: { nina: { computerId: ME, epoch: -5, state: 'active' }, bia: { computerId: 7, epoch: 1, state: 'active' }, cris: 'x' }, floor: { nina: 'x' } }))
    const homes = new LentHomes(path, () => ME)
    for (const id of ['nina', 'bia', 'cris']) expect(homes.resolve(id).epoch, id).toBe(0)
    homes.set('nina', { computerId: ME, epoch: 1 })
    expect((JSON.parse(readFileSync(path, 'utf8')) as { lent: { nina: { epoch: number } } }).lent.nina.epoch).toBe(1)
  })
})

describe('L1. the newer sheet is never replaced by an older transfer that ends late', () => {
  it('the epoch 3 arrives after the epoch 4: the compare-and-set refuses and the sheet of the epoch 4 stays', () => {
    const homes = new LentHomes(file(), () => ME)
    homes.putSheet('nina', sheet('alta', 'ficha do epoch 4'))
    homes.set('nina', { computerId: ME, epoch: 4 })
    homes.putSheet('nina', sheet('baixa', 'ficha do epoch 3')) // the receiver applies the bundle, and only THEN sets the home
    expect(() => { homes.set('nina', { computerId: ME, epoch: 3 }) }).toThrow('stale-epoch')
    expect(textOf(homes)).toBe('ficha do epoch 4')
  })

  it('control: a newer epoch takes the new sheet', () => {
    const homes = new LentHomes(file(), () => ME)
    homes.putSheet('nina', sheet('baixa', 'ficha do epoch 1'))
    homes.set('nina', { computerId: ME, epoch: 1 })
    homes.putSheet('nina', sheet('media', 'ficha do epoch 2'))
    homes.set('nina', { computerId: ME, epoch: 2 })
    expect(textOf(homes)).toBe('ficha do epoch 2')
  })
})

describe('L2. what the owner signs has its own domain and names the team', () => {
  it('the signed bytes start with the domain of this signature (the same key signs requests, certificates and transfers)', () => {
    const json = envelopeText({ v: 1, personaId: 'nina', workspaceId: 'ws1', creatorMemberId: 'ana', autonomy: 'baixa', sheet: '{}' })
    expect(ENVELOPE_DOMAIN).toBe('persona/sheet-envelope/v1\n')
    expect(envelopeBytes(json).toString('utf8')).toBe(`${ENVELOPE_DOMAIN}${json}`)
    expect(envelopeBytes(json).equals(Buffer.from(json, 'utf8')), 'not the raw text').toBe(false)
  })

  it('an envelope without the workspace, the creator, a known autonomy or the right version is not an envelope', () => {
    const ok = { v: 1, personaId: 'nina', workspaceId: 'ws1', creatorMemberId: 'ana', autonomy: 'baixa', sheet: '{}' }
    expect(readEnvelope(JSON.stringify(ok))).toEqual(ok)
    for (const bad of [{ ...ok, workspaceId: '' }, { ...ok, workspaceId: undefined }, { ...ok, creatorMemberId: '' }, { ...ok, autonomy: 'maxima' }, { ...ok, v: 2 }, { ...ok, sheet: 5 }]) expect(readEnvelope(JSON.stringify(bad)), JSON.stringify(bad)).toBeUndefined()
    expect(readEnvelope('{ nope')).toBeUndefined()
  })
})

describe('L3. the highest epoch seen is remembered after she goes back', () => {
  it('she is let go (brought back to the owner\'s PC): her record and her sheet are deleted, and an old transfer of hers can never be accepted again', () => {
    const homes = new LentHomes(file(), () => ME)
    homes.putSheet('nina', sheet('baixa', 'ficha'))
    homes.set('nina', { computerId: ME, epoch: 5 })
    homes.forget('nina')
    expect(homes.lent()).toEqual([])
    expect(homes.sheetOf('nina')).toBeUndefined()
    expect(homes.resolve('nina').epoch).toBe(0)
    expect(() => { homes.set('nina', { computerId: ME, epoch: 4 }) }, 'an old bundle').toThrow('stale-epoch')
    expect(() => { homes.set('nina', { computerId: ME, epoch: 5 }) }, 'the same one again').toThrow('stale-epoch')
    homes.set('nina', { computerId: ME, epoch: 6 })
    expect(homes.resolve('nina').epoch).toBe(6)
  })

  it('the floor survives a restart', () => {
    const path = file()
    const first = new LentHomes(path, () => ME)
    first.set('nina', { computerId: ME, epoch: 7 })
    first.forget('nina')
    expect(() => { new LentHomes(path, () => ME).set('nina', { computerId: ME, epoch: 7 }) }).toThrow('stale-epoch')
  })
})

describe('the quota of a creator counts the sheets the owner signed', () => {
  it('counts the OTHER personas of that creator that are lent here', () => {
    const homes = new LentHomes(file(), () => ME)
    homes.putSheet('nina', sheet('baixa', 'a', 'ana'))
    homes.set('nina', { computerId: ME, epoch: 1 })
    const other = (personaId: string, creator: string): LentSheet => ({ json: envelopeText({ v: 1, personaId, workspaceId: 'ws1', creatorMemberId: creator, autonomy: 'baixa', sheet: 'x' }), signature: 's', signerSigningPublic: 'p' })
    homes.putSheet('bia', other('bia', 'ana')); homes.set('bia', { computerId: ME, epoch: 1 })
    homes.putSheet('gus1', other('gus1', 'gus')); homes.set('gus1', { computerId: ME, epoch: 1 })
    expect(homes.countByCreator('ana')).toBe(2)
    expect(homes.countByCreator('ana', 'nina'), 'the one being received does not count').toBe(1)
    expect(homes.countByCreator('gus')).toBe(1)
    expect(homes.countByCreator('ninguem')).toBe(0)
  })
})

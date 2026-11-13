import { describe, expect, it, vi } from 'vitest'
import { BundleError, generateIdentity, openPersonaBundle, publicIdentity, sealPersonaBundle, type BundleMemoryItem, type BundleSkill } from '@deepseek-ai/dsh-persona-sync'
import {
  ApplyError, applyPersonaBundle, bundleOfPersona, erasePersonaData, previewOfPersona, type PersonaDataSink, type PersonaDataSource, type PersonaEraser, type SourcePage, type SourceRecord, type SourceSheet, type SourceSkill,
} from '../src/computers/persona-bundle.ts'

/**
 * D-116: what a persona carries to another computer, and what leaves the one she left. The mapping is proved over small ports; the sealing is the real one (the closed schema, the secret scan, the DM rule).
 */
const NOW = 1_800_000_000_000
const SHEET = { json: '{"name":"Nina"}', signature: 'c2ln', signerSigningPublic: 'S'.repeat(43) }
const HER = { kind: 'persona', personaId: 'nina' }
const OTHER = { kind: 'persona', personaId: 'bia' }
const TEAM = { kind: 'project' }

interface Rig {
  readonly source: PersonaDataSource
  readonly records: SourceRecord[]
  readonly pages: SourcePage[]
  readonly skills: SourceSkill[]
  readonly state: { sheet: SourceSheet | undefined; here: boolean }
}

function rig(): Rig {
  const records: SourceRecord[] = [
    { id: 'r-dm-rule', kind: 'constraint', body: 'Sempre me chame de Ana.', status: 'active', visibility: HER, createdAt: '2026-11-01T10:00:00.000Z' },
    { id: 'r-dm-fact', kind: 'memory', body: 'A Ana gosta de bolo de cenoura.', status: 'active', visibility: HER, createdAt: '2026-11-02T10:00:00.000Z' },
    { id: 'r-dm-old', kind: 'memory', body: 'Foi revogada.', status: 'revoked', visibility: HER, createdAt: '2026-11-02T11:00:00.000Z' },
    { id: 'r-team', kind: 'constraint', body: 'Nunca prometer prazo.', status: 'active', visibility: TEAM, createdAt: '2026-11-03T10:00:00.000Z' },
    { id: 'r-bia', kind: 'memory', body: 'Segredo da Bia.', status: 'active', visibility: OTHER, createdAt: '2026-11-03T11:00:00.000Z' },
    { id: 'r-brief', kind: 'brief', body: 'Briefing do projeto.', status: 'active', visibility: HER, createdAt: '2026-11-03T12:00:00.000Z' },
  ]
  const pages: SourcePage[] = [
    { id: 'p-hers', title: 'Como a Ana revisa texto', body: 'Primeiro o título, depois o resto.', status: 'active', visibility: HER, updatedAt: '2026-11-04T10:00:00.000Z' },
    { id: 'p-old', title: 'Versão velha', body: 'Substituída.', status: 'superseded', visibility: HER, updatedAt: '2026-11-04T09:00:00.000Z' },
    { id: 'p-team', title: 'Guia da equipe', body: 'Para todos.', status: 'active', visibility: TEAM, updatedAt: '2026-11-04T11:00:00.000Z' },
    { id: 'p-bia', title: 'Da Bia', body: 'Não é dela.', status: 'active', visibility: OTHER, updatedAt: '2026-11-04T12:00:00.000Z' },
  ]
  const skills: SourceSkill[] = [
    { id: 's-hers', name: 'revisar-texto', body: 'Passos para revisar um texto.', personaId: 'nina', sharedWithTeam: false },
    { id: 's-shared', name: 'checklist', body: 'Da equipe.', personaId: 'nina', sharedWithTeam: true },
    { id: 's-team', name: 'padrao', body: 'Sem dono.', sharedWithTeam: true },
    { id: 's-bia', name: 'da-bia', body: 'Não é dela.', personaId: 'bia', sharedWithTeam: false },
  ]
  const state: Rig['state'] = { sheet: SHEET, here: true }
  const source: PersonaDataSource = {
    persona: id => (id === 'nina' && state.here ? { workspaceId: 'ws1', projectId: 'p1' } : undefined),
    records: () => records, pages: () => pages, skills: () => skills, sheet: () => state.sheet,
  }
  return { source, records, pages, skills, state }
}

const bundle = (r: Rig, includesPrivateDm: boolean): NonNullable<ReturnType<typeof bundleOfPersona>> => {
  const made = bundleOfPersona(r.source, { personaId: 'nina', fromComputerId: 'comp-a', toComputerId: 'comp-b', epoch: 4, includesPrivateDm, now: NOW })
  if (made === undefined) throw new Error('no bundle')
  return made
}

describe('what travels', () => {
  it('by default: her own pages and her own skills — and nothing that was said to her in a DM', () => {
    const made = bundle(rig(), false)
    expect(made.memory.map(item => [item.id, item.kind])).toEqual([['p-hers', 'brain-page']])
    expect(made.skills).toEqual([{ name: 'revisar-texto', files: [{ path: 'SKILL.md', text: 'Passos para revisar um texto.' }] }])
    expect(made.includesPrivateDm).toBe(false)
    expect(made.rules).toEqual([])
    expect(JSON.stringify(made)).not.toContain('bolo de cenoura')
    expect(JSON.stringify(made)).not.toContain('chame de Ana')
  })

  it('with the creator\'s confirmation: the facts and the rules said to her travel, marked as private DM memory', () => {
    const made = bundle(rig(), true)
    const byId = new Map<string, BundleMemoryItem>(made.memory.map(item => [item.id, item]))
    expect([...byId.keys()].sort()).toEqual(['p-hers', 'r-dm-fact', 'r-dm-rule'])
    expect(byId.get('r-dm-rule')).toMatchObject({ kind: 'dm-rule', privateDm: true, body: 'Sempre me chame de Ana.' })
    expect(byId.get('r-dm-fact')).toMatchObject({ kind: 'note', privateDm: true })
    expect(byId.get('p-hers')?.privateDm).toBeUndefined()
    expect(made.includesPrivateDm).toBe(true)
  })

  it('never: team records, team pages, team or shared skills, another persona\'s anything, a revoked or superseded one, a brief', () => {
    const made = bundle(rig(), true)
    const text = JSON.stringify(made)
    for (const leak of ['Nunca prometer prazo', 'Guia da equipe', 'Segredo da Bia', 'Não é dela', 'Da equipe', 'Sem dono', 'Foi revogada', 'Substituída', 'Briefing do projeto']) expect(text, leak).not.toContain(leak)
    expect(made.skills.map(skill => skill.name)).toEqual(['revisar-texto'])
  })

  it('carries the signed sheet as stored and a deadline of 24 hours; a persona that is not here, or has no signed sheet, makes no bundle', () => {
    const r = rig()
    const made = bundle(r, false)
    expect(made.sheet).toEqual(SHEET)
    expect(Date.parse(made.notAfter) - Date.parse(made.createdAt)).toBe(24 * 3_600_000)
    expect([made.personaId, made.workspaceId, made.fromComputerId, made.toComputerId, made.epoch]).toEqual(['nina', 'ws1', 'comp-a', 'comp-b', 4])
    r.state.sheet = undefined
    expect(bundleOfPersona(r.source, { personaId: 'nina', fromComputerId: 'a', toComputerId: 'b', epoch: 1, includesPrivateDm: false, now: NOW })).toBeUndefined()
    r.state.sheet = SHEET
    r.state.here = false
    expect(bundleOfPersona(r.source, { personaId: 'nina', fromComputerId: 'a', toComputerId: 'b', epoch: 1, includesPrivateDm: false, now: NOW })).toBeUndefined()
  })

  it('every bundle gets its own id (a repeat is told apart from a second try)', () => {
    const r = rig()
    expect(bundle(r, false).id).not.toBe(bundle(r, false).id)
  })
})

describe('the preview', () => {
  it('counts what would travel with everything confirmed and says whether she holds private DM memory; never content', () => {
    const preview = previewOfPersona(rig().source, 'nina', true)
    expect(preview).toEqual({ memoryItems: 3, rules: 0, skills: 1, bytes: expect.any(Number) as number, openTurn: true, hasPrivateDm: true })
    expect(preview?.bytes).toBeGreaterThan(50)
    expect(JSON.stringify(preview)).not.toContain('bolo')
  })

  it('a persona with no private DM memory says so, and a persona that is not here has no preview', () => {
    const r = rig()
    r.records.splice(0, r.records.length)
    expect(previewOfPersona(r.source, 'nina', false)).toMatchObject({ hasPrivateDm: false, memoryItems: 1, openTurn: false })
    r.state.here = false
    expect(previewOfPersona(r.source, 'nina', false)).toBeUndefined()
  })
})

describe('sealing it, for real', () => {
  const A = generateIdentity()
  const B = generateIdentity()
  const seal = (made: ReturnType<typeof bundle>): ReturnType<typeof sealPersonaBundle> => sealPersonaBundle({ bundle: made, fromSigningSeed: A.signing.seed, toAgreementPublic: publicIdentity(B).agreement })

  it('the default bundle and the confirmed one are both accepted by the closed schema, and B opens exactly what A sent', () => {
    const r = rig()
    for (const confirmed of [false, true]) {
      const made = bundle(r, confirmed)
      const sealed = seal(made)
      const opened = openPersonaBundle({
        myComputerId: 'comp-b', myAgreement: B.agreement, senderSigningPublic: A.signing.publicKey, expected: { personaId: 'nina', workspaceId: 'ws1', epoch: 4, from: 'comp-a' }, now: () => NOW,
      }, sealed.sealed)
      expect(opened.bundle.memory.map(item => item.id)).toEqual(made.memory.map(item => item.id))
      expect(opened.bundle.skills).toEqual(made.skills)
    }
  })

  it('a bundle that carries a credential-shaped text is refused by the sealer, whatever the item (a token pasted into a memory)', () => {
    const r = rig()
    r.records[1] = { ...(r.records[1] as SourceRecord), body: 'A chave é sk-abcdefghijklmnopqrstuvwxyz0123456789' }
    expect(() => seal(bundle(r, true))).toThrow(BundleError)
    expect(() => seal(bundle(r, false))).not.toThrow() // not sent without the confirmation: the DM memory stays
    r.pages[0] = { ...(r.pages[0] as SourcePage), body: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789' }
    expect(() => seal(bundle(r, false))).toThrow(BundleError)
  })
})

describe('putting it in place on the destination', () => {
  function sink(here = true): PersonaDataSink & { memory: Map<string, BundleMemoryItem>; skills: Map<string, BundleSkill>; sheets: Map<string, unknown> } {
    const memory = new Map<string, BundleMemoryItem>()
    const skills = new Map<string, BundleSkill>()
    const sheets = new Map<string, unknown>()
    return {
      memory, skills, sheets,
      hasPersona: () => here, putMemory: (personaId, item) => { memory.set(`${personaId}|${item.id}`, item) }, putSkill: (personaId, skill) => { skills.set(`${personaId}|${skill.name}`, skill) }, putSheet: (personaId, sheet) => { sheets.set(personaId, sheet) },
    }
  }

  it('writes her memory, her skills and her sheet; the same bundle twice is the same state', () => {
    const made = bundle(rig(), true)
    const target = sink()
    applyPersonaBundle(target, made)
    applyPersonaBundle(target, made)
    expect([...target.memory.keys()].sort()).toEqual(['nina|p-hers', 'nina|r-dm-fact', 'nina|r-dm-rule'])
    expect([...target.skills.keys()]).toEqual(['nina|revisar-texto'])
    expect(target.sheets.get('nina')).toEqual(SHEET)
  })

  it('a computer that does not hold her row yet cannot hold her data: `no-persona-here`, and nothing is written', () => {
    const target = sink(false)
    expect(() => { applyPersonaBundle(target, bundle(rig(), true)) }).toThrow(ApplyError)
    expect(target.memory.size + target.skills.size + target.sheets.size).toBe(0)
  })
})

describe('letting her go on the source (P0-09)', () => {
  function eraser(): PersonaEraser & { calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      eraseRecord: (_project, id) => { calls.push(`record:${id}`) }, erasePage: (_project, id) => { calls.push(`page:${id}`) }, eraseSkill: (_project, id) => { calls.push(`skill:${id}`) }, scrub: (id) => { calls.push(`scrub:${id}`) },
    }
  }

  it('deletes what is HERS (her DM records of any status, her pages of any status, her own skills), never the team\'s or another persona\'s, and scrubs last', () => {
    const r = rig()
    const wipe = eraser()
    expect(erasePersonaData(r.source, wipe, 'nina')).toBe(7)
    expect(wipe.calls).toEqual(['record:r-dm-rule', 'record:r-dm-fact', 'record:r-dm-old', 'record:r-brief', 'page:p-hers', 'page:p-old', 'skill:s-hers', 'scrub:nina'])
    expect(wipe.calls.some(call => /team|bia|shared/u.test(call))).toBe(false)
  })

  it('scrubs even when there was nothing to delete (the scrub is what clears the drafts, the activity and the used-context), and does nothing for a persona that is not here', () => {
    const r = rig()
    r.records.splice(0, r.records.length)
    r.pages.splice(0, r.pages.length)
    r.skills.splice(0, r.skills.length)
    const wipe = eraser()
    expect(erasePersonaData(r.source, wipe, 'nina')).toBe(0)
    expect(wipe.calls).toEqual(['scrub:nina'])
    r.state.here = false
    const other = eraser()
    const spy = vi.spyOn(other, 'scrub')
    expect(erasePersonaData(r.source, other, 'nina')).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })
})

import { expect, it } from 'vitest'
import { ProjectResponsibleBook, ResponsibleError, RESPONSIBLE_KIND, type ResponsibleDoc, type ResponsiblePersona } from '../src/project-responsible.ts'

/** Marco Dogfood M1 (host): every project has a responsible persona (and optionally a person). Saved in the screens KV (no migration), resolved honestly, never "nobody" on the screen. */
const COORD: ResponsiblePersona = { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }
const BIA: ResponsiblePersona = { id: 'bia', name: 'Bia', title: 'Redatora', coordination: false }
const CAIO: ResponsiblePersona = { id: 'caio', name: 'Caio', title: 'Designer', coordination: false }

function rig(personas: Record<string, readonly ResponsiblePersona[]> = { pp: [COORD, BIA, CAIO], other: [{ id: 'zed', name: 'Zed', title: 'Outro', coordination: true }] }) {
  const docs = new Map<string, ResponsibleDoc>()
  const store = { get: (p: string, k: string, i: string) => docs.get(`${p}/${k}/${i}`), put: (p: string, k: string, i: string, v: ResponsibleDoc) => { docs.set(`${p}/${k}/${i}`, v) } }
  const humans = new Map([['ana', 'Ana'], ['bob', 'Bob']])
  const book = new ProjectResponsibleBook({ store, personas: project => personas[project] ?? [], humanName: id => humans.get(id) })
  return { book, docs, personas }
}

it('nothing saved: the Coordination persona is the DEFAULT (honest: source "default"); a project with no personas has nobody', () => {
  const { book } = rig()
  expect(book.resolve('pp')).toEqual({ projectId: 'pp', persona: { id: 'guia', name: 'Guia', title: 'Coordenação' }, source: 'default', stale: false })
  const empty = rig({ pp: [] }).book.resolve('pp')
  expect(empty.persona).toBeUndefined()
  expect(empty.source).toBe('default')
})

it('set: the chosen persona (and optionally a person) is what the three screens read; the doc lives under the project\'s own key', () => {
  const { book, docs } = rig()
  const result = book.set('pp', { personaId: 'bia', humanId: 'ana' }, 'ana', '2026-11-12T14:00:00.000Z')
  expect(result.changed).toBe(true)
  expect(result.view).toEqual({ projectId: 'pp', persona: { id: 'bia', name: 'Bia', title: 'Redatora' }, human: { id: 'ana', name: 'Ana' }, source: 'chosen', stale: false })
  expect(docs.get(`pp/${RESPONSIBLE_KIND}/default`)).toMatchObject({ personaId: 'bia', humanId: 'ana', setBy: 'ana', setAt: '2026-11-12T14:00:00.000Z' })
  expect(book.resolve('pp')).toEqual(result.view)
})

it('set: the same value again changes nothing (the host writes the audit line only when `changed`); an empty humanId clears ONLY the person', () => {
  const { book } = rig()
  book.set('pp', { personaId: 'bia', humanId: 'ana' }, 'ana', '2026-11-12T14:00:00.000Z')
  expect(book.set('pp', { personaId: 'bia', humanId: 'ana' }, 'ana', '2026-11-12T15:00:00.000Z').changed).toBe(false)
  expect(book.resolve('pp')).toMatchObject({ persona: { id: 'bia' }, human: { id: 'ana' } })
  const cleared = book.set('pp', { personaId: 'bia', humanId: '' }, 'ana', '2026-11-12T16:00:00.000Z')
  expect(cleared.changed).toBe(true)
  expect(cleared.view.persona?.id).toBe('bia')
  expect(cleared.view).not.toHaveProperty('human')
})

it('the FENCE: a persona of ANOTHER project is refused (nothing written); so is a person who is not in the workspace', () => {
  const { book, docs } = rig()
  expect(() => book.set('pp', { personaId: 'zed' }, 'ana', '2026-11-12T14:00:00.000Z')).toThrow(ResponsibleError)
  try { book.set('pp', { personaId: 'zed' }, 'ana', '2026-11-12T14:00:00.000Z') } catch (error) { expect((error as ResponsibleError).code).toBe('persona-not-in-project') }
  try { book.set('pp', { personaId: 'bia', humanId: 'intruso' }, 'ana', '2026-11-12T14:00:00.000Z') } catch (error) { expect((error as ResponsibleError).code).toBe('human-not-member') }
  expect(docs.size).toBe(0)
})

it('a responsible who left the project (retired/removed) is STALE: the screen falls back to the default and says "choose again"; nothing breaks', () => {
  const { book, personas } = rig()
  book.set('pp', { personaId: 'caio' }, 'ana', '2026-11-12T14:00:00.000Z')
  personas.pp = [COORD, BIA] // Caio was removed
  expect(book.resolve('pp')).toMatchObject({ persona: { id: 'guia' }, source: 'default', stale: true })
  book.set('pp', { personaId: 'bia' }, 'ana', '2026-11-12T15:00:00.000Z')
  expect(book.resolve('pp')).toMatchObject({ persona: { id: 'bia' }, source: 'chosen', stale: false })
})

it('projects do not see each other\'s responsible', () => {
  const { book } = rig()
  book.set('pp', { personaId: 'bia' }, 'ana', '2026-11-12T14:00:00.000Z')
  expect(book.resolve('other')).toMatchObject({ persona: { id: 'zed' }, source: 'default' })
})

/**
 * The seam between the permission gate's FLAT preview and the card of an external action (see action-input.ts).
 */
import { describe, expect, it } from 'vitest'
import { unflattenPreview } from '../src/action-input.ts'

describe('unflattenPreview', () => {
  it('puts a top-level list back together, in index order', () => {
    expect(unflattenPreview({ 'to[1]': 'bia@x.com', 'to[0]': 'ana@x.com', subject: 'Oi' })).toEqual({ subject: 'Oi', to: ['ana@x.com', 'bia@x.com'] })
  })
  it('offers the leaf of a nested field when nothing at the top level has that name', () => {
    expect(unflattenPreview({ 'message.body': 'Texto', 'message.subject': 'Assunto' })).toMatchObject({ body: 'Texto', subject: 'Assunto', 'message.body': 'Texto' })
    expect(unflattenPreview({ body: 'Do topo', 'message.body': 'Aninhado' }).body).toBe('Do topo')
  })
  it('a scalar and a list of the same name: the scalar wins and the list stays visible as it came', () => {
    expect(unflattenPreview({ to: 'ana@x.com', 'to[0]': 'bia@x.com' })).toEqual({ to: 'ana@x.com', 'to[0]': 'bia@x.com' })
  })
  it('leaves what it cannot restore alone (a list of objects), and never adds a value the gate did not show', () => {
    const flat = { 'files[0].name': 'a.txt', 'files[0].size': 3, amount: 'R$ 1,00' }
    const out = unflattenPreview(flat)
    expect(out).toMatchObject(flat)
    expect(Object.values(out).every(value => Object.values(flat).includes(value as never))).toBe(true)
  })
  it('keeps masks as masks and is a plain copy for a flat preview', () => {
    expect(unflattenPreview({ to: 'ana@x.com', token: '[oculto]' })).toEqual({ to: 'ana@x.com', token: '[oculto]' })
    expect(unflattenPreview({})).toEqual({})
  })
})

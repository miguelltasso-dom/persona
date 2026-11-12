import { describe, expect, it } from 'vitest'
import type { DirectoryCategory, DirectoryChannel } from '../src/channel-directory.ts'
import { CATEGORY_NAME_MAX, channelLayoutOf, checkCategoryName } from '../src/channel-layout.ts'

/** Item 22 (colheita): the sidebar's sections. No-category channels first with no header, then the categories in the person's order. */
const cat = (id: string, name: string, position: number): DirectoryCategory => ({ id, name, position })
const ch = (id: string, name: string, extra: Partial<DirectoryChannel> = {}): DirectoryChannel => ({ id, name, kind: 'custom', ...extra })

const names = (sections: ReturnType<typeof channelLayoutOf>): string[] =>
  sections.map(section => `${section.category?.name ?? '-'}: ${section.channels.map(channel => channel.name).join(',')}`)

describe('channelLayoutOf', () => {
  it('puts the channels with no category first, with no header, then each category in order', () => {
    const got = channelLayoutOf({
      categories: [cat('c2', 'Atendimento', 1), cat('c1', 'Marketing', 0)],
      channels: [ch('a', 'geral', { kind: 'general' }), ch('b', 'campanhas', { categoryId: 'c1' }), ch('c', 'chamados', { categoryId: 'c2' }), ch('d', 'artes', { categoryId: 'c1' })],
    })
    expect(names(got)).toEqual(['-: geral', 'Marketing: artes,campanhas', 'Atendimento: chamados'])
    expect(got[0]?.category).toBeUndefined()
  })
  it('orders by position first, then by name ignoring accents and case', () => {
    const got = channelLayoutOf({
      categories: [cat('c', 'Equipe', 0)],
      channels: [ch('1', 'zeta', { categoryId: 'c', position: 0 }), ch('2', 'Álbum', { categoryId: 'c', position: 0 }), ch('3', 'primeiro', { categoryId: 'c', position: -1 })],
    })
    expect(names(got)).toEqual(['Equipe: primeiro,Álbum,zeta'])
  })
  it('a group nobody arranged (all positions equal) reads by name', () => {
    expect(names(channelLayoutOf({ categories: [], channels: [ch('1', 'beta'), ch('2', 'alfa'), ch('3', 'Gama')] }))).toEqual(['-: alfa,beta,Gama'])
  })
  it('leaves archived channels out', () => {
    expect(names(channelLayoutOf({ categories: [cat('c', 'X', 0)], channels: [ch('1', 'vivo', { categoryId: 'c' }), ch('2', 'velho', { categoryId: 'c', archived: true })] }))).toEqual(['X: vivo'])
  })
  it('hides a category with nothing to show, unless asked (whoever arranges the sidebar drops channels into it)', () => {
    const input = { categories: [cat('c', 'Vazia', 0)], channels: [ch('1', 'solto')] }
    expect(names(channelLayoutOf(input))).toEqual(['-: solto'])
    expect(names(channelLayoutOf({ ...input, showEmptyCategories: true }))).toEqual(['-: solto', 'Vazia: '])
  })
  it('a category whose channels are all hidden by `visible` is empty too', () => {
    const got = channelLayoutOf({ categories: [cat('c', 'Privada', 0)], channels: [ch('1', 'secreto', { categoryId: 'c' })], visible: () => false })
    expect(got).toEqual([])
  })
  it('a channel pointing at a category that no longer exists falls into the ones with none', () => {
    expect(names(channelLayoutOf({ categories: [], channels: [ch('1', 'orfao', { categoryId: 'sumiu' })] }))).toEqual(['-: orfao'])
  })
  it('an empty project has no sections', () => {
    expect(channelLayoutOf({ categories: [], channels: [] })).toEqual([])
  })
})

describe('checkCategoryName', () => {
  it('keeps the name as typed, trimmed and with inner spaces collapsed', () => {
    expect(checkCategoryName('  Time   de   Vendas ', [])).toEqual({ ok: true, name: 'Time de Vendas' })
  })
  it('refuses an empty name, one past the limit, and a duplicate ignoring case and accents', () => {
    expect(checkCategoryName('   ', [])).toEqual({ ok: false, reason: 'empty' })
    expect(checkCategoryName('x'.repeat(CATEGORY_NAME_MAX + 1), [])).toEqual({ ok: false, reason: 'too_long' })
    expect(checkCategoryName('x'.repeat(CATEGORY_NAME_MAX), [])).toMatchObject({ ok: true })
    expect(checkCategoryName('atendimento', ['Atendimento'])).toEqual({ ok: false, reason: 'duplicate' })
    expect(checkCategoryName('Comunicação', ['comunicacao'])).toEqual({ ok: false, reason: 'duplicate' })
  })
  it('renaming a category to itself is fine when the caller leaves it out of the list', () => {
    expect(checkCategoryName('Marketing', [])).toMatchObject({ ok: true })
  })
})

// Item 16 (Carbon, 12/11): a cut quote closes like a quote — the last whole word, "…" and the closing mark; never "….", never a lost ”.
import { describe, expect, it } from 'vitest'
import { cutQuote, cutStops, cutToFit, cutWithoutLayout, stopWithin, wholeQuote } from '../src/client/memory/quote-cut.ts'

describe('quote-cut: how a cut quote closes', () => {
  it('always ends …” and drops the punctuation before the "…" (no "ninguém.…", no "....")', () => {
    expect(cutQuote('sem esquecer de ninguém. Obrigado', 25)).toBe('“sem esquecer de ninguém…”')
    expect(cutQuote('um, dois; três: quatro', 15)).toBe('“um, dois; três…”')
    expect(cutQuote('muito bom... demais', 10)).toBe('“muito bom…”')
    expect(cutQuote('muito bom!!! demais', 13)).toBe('“muito bom…”')
    for (const out of [cutQuote('a. b', 2), cutQuote('a… b', 2)]) expect(out).not.toMatch(/[.,;:!?…]…/u)
  })

  it('the whole quote is just in curly quotes', () => {
    expect(wholeQuote('A padaria abre às 7h')).toBe('“A padaria abre às 7h”')
  })

  it('cuts only between words (the start of each run of spaces or breaks), never before the first word', () => {
    expect(cutStops('um dois  três\nquatro')).toEqual([2, 7, 13])
    expect(cutStops(' começa com espaço')).toEqual([7, 11]) // the leading space (index 0) is not a place to cut
    expect(cutStops('umapalavrasó')).toEqual([])
  })

  it('stopWithin: the last whole word that fits; the first stop when none does; the limit when there are no stops', () => {
    expect(stopWithin([5, 10, 15], 12)).toBe(10)
    expect(stopWithin([5, 10, 15], 3)).toBe(5)
    expect(stopWithin([], 7)).toBe(7)
  })
})

describe('quote-cut: without layout (characters and line breaks)', () => {
  it('a short quote stays whole', () => {
    expect(cutWithoutLayout('A padaria abre às 7h', 4, 280)).toBeNull()
  })

  it('more than `lines` lines: cut after the last line that fits', () => {
    const text = 'um\ndois\ntrês\nquatro\ncinco'
    const at = cutWithoutLayout(text, 4, 280)
    expect(at).not.toBeNull()
    expect(cutQuote(text, at!)).toBe('“um\ndois\ntrês\nquatro…”')
  })

  it('more than `chars` characters: cut on a word', () => {
    const text = `${'palavra '.repeat(60)}fim`
    const at = cutWithoutLayout(text, 4, 100)
    expect(at).not.toBeNull()
    expect(at!).toBeLessThanOrEqual(100)
    expect(text.charAt(at!)).toBe(' ')
  })
})

describe('quote-cut: with layout (a measuring function stands in for the hidden copy of the box)', () => {
  // A box that holds `width` characters per line and `lines` lines.
  const box = (width: number, lines: number) => (candidate: string): boolean =>
    candidate.split('\n').reduce((sum, row) => sum + Math.max(1, Math.ceil(row.length / width)), 0) <= lines

  it('the whole quote fits: no cut', () => {
    expect(cutToFit('A padaria abre às 7h', box(40, 4))).toBeNull()
  })

  it('finds the LONGEST cut that still fits, and the cut text really fits with its “…”', () => {
    const text = Array.from({ length: 80 }, (_, i) => `palavra${String(i)}`).join(' ')
    const fits = box(30, 4)
    const at = cutToFit(text, fits)
    expect(at).not.toBeNull()
    expect(fits(cutQuote(text, at!))).toBe(true)
    // the next word would not fit
    const next = cutStops(text).find(stop => stop > at!)
    expect(next).toBeDefined()
    expect(fits(cutQuote(text, next!))).toBe(false)
  })

  it('a narrower box (200%) cuts earlier than a wide one', () => {
    const text = Array.from({ length: 80 }, (_, i) => `palavra${String(i)}`).join(' ')
    const wide = cutToFit(text, box(60, 4))!
    const narrow = cutToFit(text, box(25, 4))!
    expect(narrow).toBeLessThan(wide)
  })

  it('one huge unbroken word still gets a closed cut', () => {
    const at = cutToFit('x'.repeat(500), box(30, 4))
    expect(at).not.toBeNull()
    expect(cutQuote('x'.repeat(500), at!).endsWith('…”')).toBe(true)
  })
})

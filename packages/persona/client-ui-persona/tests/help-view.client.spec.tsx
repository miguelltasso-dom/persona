// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HelpView, searchHelp } from '../src/client/help/HelpView.tsx'
import { HELP_DOCS, RELEASE_NOTES } from '../src/client/help/generated-help.ts'
import { markSegments } from '../src/client/primitives/HelpArticle.tsx'
import { pt } from '../src/client/locale/help/locales.ts'

afterEach(cleanup)
const t = (key: string, params?: Readonly<Record<string, string | number>>): string =>
  ((pt as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/gu, (_, k: string) => String(params?.[k] ?? ''))

describe('generated help docs', () => {
  it('has every guide from docs/persona, in README order, with titles and no raw HTML', () => {
    expect(HELP_DOCS.length).toBeGreaterThanOrEqual(15)
    expect(HELP_DOCS[0]!.id).toBe('guia')
    for (const doc of HELP_DOCS) {
      expect(doc.title.length).toBeGreaterThan(0)
      expect(JSON.stringify(doc.blocks)).not.toMatch(/<script|<details|<\/?div/u)
    }
    expect(RELEASE_NOTES?.title).toMatch(/Persona/u)
  })
})

describe('searchHelp', () => {
  it('ignores accents and case, needs every word, ranks title hits first', () => {
    const r = searchHelp(HELP_DOCS, 'COTA')
    expect(r.length).toBeGreaterThan(0)
    expect(searchHelp(HELP_DOCS, 'conexoes')[0]!.id).toBe('conexoes')
    expect(searchHelp(HELP_DOCS, 'backup palavra-que-nao-existe')).toHaveLength(0)
    expect(searchHelp(HELP_DOCS, '')).toHaveLength(HELP_DOCS.length)
  })
})

describe('markSegments', () => {
  it('matches accent-free but keeps the original characters', () => {
    expect(markSegments('Conexões e cota', ['conexoes'])).toEqual([{ text: 'Conexões', hit: true }, { text: ' e cota', hit: false }])
  })
})

describe('HelpView', () => {
  it('opens a guide from the index and follows links between guides', () => {
    render(<HelpView t={t} initialDocId="primeiros-passos" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Primeiros passos' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('link', { name: 'Conexões' })[0]!)
    expect(screen.getByRole('heading', { level: 2, name: /Conexões/u })).toBeTruthy()
  })

  it('empty search says so and offers to ask the team', () => {
    const onAskTeam = vi.fn()
    render(<HelpView t={t} onAskTeam={onAskTeam} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzzqqq' } })
    expect(screen.getByText('Nada com “zzzzqqq” na ajuda')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Perguntar no #geral' }))
    expect(onAskTeam).toHaveBeenCalled()
  })

  it('Novidades tab shows the release notes', () => {
    render(<HelpView t={t} initialTab="novidades" />)
    expect(screen.getByRole('heading', { level: 2, name: RELEASE_NOTES!.title })).toBeTruthy()
    expect(screen.getByText(/Assuntos coloridos\./u)).toBeTruthy()
  })
})

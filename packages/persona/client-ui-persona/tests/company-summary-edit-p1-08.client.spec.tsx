// @vitest-environment jsdom
// Carbon P1-08 (UI, resíduo do P1-11): once the owner described the company, Memória › Resumo showed the first lines and only "Abrir" — no way to change the description, and
// the dialog always opened empty. "Editar" opens the same dialog with the text the team reads now; saving writes the newest description (it wins, the old one stays in the history).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainHomeView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { CompanyBriefDialog } from '../src/client/second-brain/CompanyBriefDialog.tsx'
import { SecondBrainHome } from '../src/client/second-brain/SecondBrainHome.tsx'
import { pt } from '../src/client/locale/second-brain/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const HOME: BrainHomeView = { startHereId: 'start', changedToday: [], activeGrants: [], contradictions: [], leftover: [] }
const PAGES: BrainPageView[] = [{ id: 'start', kind: 'company', title: 'Comece aqui', body: '# Comece aqui\n\nAtualizado sozinho.', slug: 'start', revision: 1, links: [], sources: [], editorHint: 'persona:atlas', updatedAt: '2026-11-04T12:00:00.000Z', restricted: false }]
const LINES = ['Padaria da Ana, bairro Centro', 'Pães artesanais e encomendas de festa', 'Abre de terça a domingo']

function home(extra: Partial<Parameters<typeof SecondBrainHome>[0]> = {}) {
  return render(<PreviewFrame brandLabel="Persona"><SecondBrainHome dict={pt} home={HOME} pages={PAGES} {...extra} /></PreviewFrame>)
}

describe('Resumo da empresa: Editar', () => {
  it('with a description saved, the card offers "Editar" and it opens the same dialog the invitation opens', () => {
    const onDescribeCompany = vi.fn()
    home({ companyLines: LINES, onDescribeCompany })
    fireEvent.click(screen.getByRole('button', { name: /^Editar\b/u }))
    expect(onDescribeCompany).toHaveBeenCalledTimes(1)
  })

  it('with no description yet the card is the invitation ("Descrever a empresa em 3 frases"), not "Editar"', () => {
    home({ companyLines: [], onDescribeCompany: vi.fn() })
    expect(screen.getByRole('button', { name: pt['home.startHereCta'] })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Editar\b/u })).toBeNull()
  })

  it('without a way to save (no handler) there is no "Editar" to press', () => {
    home({ companyLines: LINES })
    expect(screen.queryByRole('button', { name: /^Editar\b/u })).toBeNull()
  })
})

describe('the dialog edits what the team reads now', () => {
  it('opens with the saved text in the field (and "Salvar" ready); without it, empty as before', () => {
    render(<PreviewFrame brandLabel="Persona"><CompanyBriefDialog dict={pt} initialText="Padaria da Ana. Pães artesanais. Abre de terça a domingo." onClose={() => undefined} onSave={async () => undefined} /></PreviewFrame>)
    const field = screen.getByLabelText(pt['brief.label']) as HTMLTextAreaElement
    expect(field.value).toBe('Padaria da Ana. Pães artesanais. Abre de terça a domingo.')
    cleanup()
    render(<PreviewFrame brandLabel="Persona"><CompanyBriefDialog dict={pt} onClose={() => undefined} onSave={async () => undefined} /></PreviewFrame>)
    expect((screen.getByLabelText(pt['brief.label']) as HTMLTextAreaElement).value).toBe('')
  })
})

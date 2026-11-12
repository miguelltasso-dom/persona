// @vitest-environment jsdom
// DESIGN-01 onda 3 · #16 (Muse regra 0.3 + §5.2 #16): a aba "Resumo" da Memória da empresa. h1 = nome da aba; "Comece aqui" mostra as 3 primeiras
// linhas REAIS do perfil da empresa (ou o convite a descrevê-la); "Por tipo" não mostra zeros, mostra chips "+ Tipo"; quem organiza é uma
// persona real (ou "Atualização automática da equipe"), nunca "O bibliotecário".
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainHomeView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { SecondBrainHome } from '../src/client/second-brain/SecondBrainHome.tsx'
import { NewPageDialog } from '../src/client/second-brain/NewPageDialog.tsx'
import { pt, en } from '../src/client/locale/second-brain/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

function page(partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'title'>): BrainPageView {
  return { kind: 'company', body: 'Corpo', slug: partial.id, revision: 1, links: [], sources: [], editorHint: 'persona:atlas', updatedAt: '2026-11-04T12:00:00.000Z', restricted: false, ...partial }
}
const HOME: BrainHomeView = { startHereId: 'start', changedToday: [], activeGrants: [], contradictions: [], leftover: [] }
const PAGES = [
  page({ id: 'start', title: 'Comece aqui', body: '# Comece aqui\n\nAtualizado sozinho a partir das páginas.' }),
  page({ id: 'c1', kind: 'client', title: 'Padaria Lua' }),
  page({ id: 'p1', kind: 'process', title: 'Como atender' }),
]

function home(extra: Partial<Parameters<typeof SecondBrainHome>[0]> = {}) {
  return render(<PreviewFrame brandLabel="Persona"><SecondBrainHome dict={pt} home={HOME} pages={PAGES} {...extra} /></PreviewFrame>)
}

describe('Resumo · o título é o nome da aba', () => {
  it('h1 "Resumo" e os textos não dizem "Segundo cérebro" nem "O bibliotecário"', () => {
    home()
    expect(screen.getByRole('heading', { level: 1, name: 'Resumo' })).toBeTruthy()
    for (const dict of [pt, en]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, key).not.toMatch(/Segundo cérebro|Second brain|bibliotec|librarian/iu)
      }
    }
  })
})

describe('Resumo · "Comece aqui"', () => {
  it('com o perfil da empresa: as 3 primeiras linhas reais (nunca a frase seca do índice)', () => {
    home({ companyLines: ['Padaria da Ana, bairro Centro', 'Pães artesanais e encomendas de festa', 'Abre de terça a domingo', 'Uma quarta linha que não entra'] })
    const lines = [...document.querySelectorAll('[data-company-line]')].map(node => node.textContent)
    expect(lines).toEqual(['Padaria da Ana, bairro Centro', 'Pães artesanais e encomendas de festa', 'Abre de terça a domingo'])
    expect(screen.queryByText(/Atualizado sozinho a partir das páginas/u)).toBeNull()
  })

  it('sem perfil e sem página de início: o convite "Descrever a empresa em 3 frases"', () => {
    const onDescribeCompany = vi.fn()
    home({ home: { ...HOME, startHereId: 'nao-existe' }, onDescribeCompany })
    fireEvent.click(screen.getByRole('button', { name: 'Descrever a empresa em 3 frases' }))
    expect(onDescribeCompany).toHaveBeenCalledTimes(1)
  })

  it('sem perfil, com a página de início e com como salvar: o convite (a frase seca do índice não é o que convida)', () => {
    const onDescribeCompany = vi.fn()
    home({ onOpenPage: vi.fn(), onDescribeCompany })
    expect(screen.queryByText(/Atualizado sozinho a partir das páginas/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Descrever a empresa em 3 frases' }))
    expect(onDescribeCompany).toHaveBeenCalledTimes(1)
  })

  it('sem perfil e sem como salvar (o host não guarda): a página de início segue sendo o que se lê, sem convite falso', () => {
    home({ onOpenPage: vi.fn() })
    expect(screen.getByText(/Atualizado sozinho a partir das páginas/u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Descrever a empresa em 3 frases' })).toBeNull()
  })
})

describe('Resumo · "Por tipo" sem zeros', () => {
  it('o tipo que tem páginas mostra a contagem; o que não tem vira um chip "+ Tipo" que cria uma página desse tipo', () => {
    const onWritePage = vi.fn()
    home({ onWritePage })
    expect(screen.getByRole('button', { name: /Clientes*1/u })).toBeTruthy()
    // no row says 0 any more
    expect(screen.getAllByRole('button').some(button => /s0$/u.test(button.textContent?.trim() ?? ''))).toBe(false)
    const chip = screen.getByRole('button', { name: 'Criar uma página de Pessoa' })
    expect(chip.textContent).toBe('+ Pessoa')
    fireEvent.click(chip)
    expect(onWritePage).toHaveBeenCalledWith('person')
    // a type that already has pages has no creation chip in the strip
    expect(screen.queryByRole('button', { name: 'Criar uma página de Cliente' })).toBeNull()
  })
})

describe('a janela "Nova página" abre já no tipo do chip', () => {
  it('o tipo inicial vem do chip; sem chip, o de sempre (Processo)', () => {
    const view = render(<PreviewFrame brandLabel="Persona"><NewPageDialog dict={pt} initialKind="person" onClose={() => undefined} onCreate={async () => undefined} /></PreviewFrame>)
    expect((view.container.ownerDocument.querySelector('select') as HTMLSelectElement).value).toBe('person')
    cleanup()
    const plain = render(<PreviewFrame brandLabel="Persona"><NewPageDialog dict={pt} onClose={() => undefined} onCreate={async () => undefined} /></PreviewFrame>)
    expect((plain.container.ownerDocument.querySelector('select') as HTMLSelectElement).value).toBe('process')
  })
})

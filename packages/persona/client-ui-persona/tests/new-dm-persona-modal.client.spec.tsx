// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewDmPersonaModal, type SelectablePersonaOption } from '../src/client/chat/NewDmPersonaModal.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const PERSONAS: readonly SelectablePersonaOption[] = [
  { id: 'p-bento', name: 'Bento', role: 'Engenharia' },
  { id: 'p-atlas', name: 'Atlas', role: 'Coordenação', isCoordination: true },
  { id: 'p-nina', name: 'Nina', role: 'Pesquisa', hasExistingDm: true },
]

function open() {
  const onSelectPersona = vi.fn()
  const onClose = vi.fn()
  render(<NewDmPersonaModal t={t} open personas={PERSONAS} onClose={onClose} onSelectPersona={onSelectPersona} />)
  return { onSelectPersona, onClose }
}

describe('seletor de persona antes da DM (UX-PHASE §5)', () => {
  it('nunca cai na primeira persona: lista com ordem DM existente, Coordenação, resto', () => {
    open()
    const options = screen.getAllByRole('option')
    expect(options.map(o => within(o).getByText(/^(Bento|Atlas|Nina)$/u).textContent)).toEqual(['Nina', 'Atlas', 'Bento'])
    expect(within(options[0]!).getByText(chatPt['dm.continueConversation'])).toBeTruthy()
  })

  it('a busca filtra por nome ou função', () => {
    open()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'engen' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByText('Bento')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText(chatPt['dm.emptySearch'])).toBeTruthy()
  })

  it('setas movem, Enter abre a DM com a persona focada e fecha', () => {
    const { onSelectPersona, onClose } = open()
    const list = screen.getByRole('listbox')
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id)
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[2]!.id)
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onSelectPersona).toHaveBeenCalledWith('p-bento')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('setas dão a volta (de cima para o último)', () => {
    open()
    const list = screen.getByRole('listbox')
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[2]!.id)
  })

  it('clique também abre a DM com aquela persona', () => {
    const { onSelectPersona } = open()
    fireEvent.click(within(screen.getAllByRole('option')[1]!).getByText('Atlas'))
    expect(onSelectPersona).toHaveBeenCalledWith('p-atlas')
  })

  it('Esc fecha pelo Modal', () => {
    const { onClose } = open()
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

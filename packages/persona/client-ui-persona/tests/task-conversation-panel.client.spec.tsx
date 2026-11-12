// @vitest-environment jsdom
// COLHEITA 18 (Muse §18): the frame of the task conversation panel — not a modal, Esc/X close, tabs "Conversa · Detalhes" with arrows,
// focus in and back, and the empty state. The conversation itself is a slot (the connected view fills it with the DM's components).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskConversationEmpty, TaskConversationPanel, type TaskConversationTab } from '../src/client/kanban/TaskConversationPanel.tsx'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup(); vi.useRealTimers() })

const CARING = [{ personaId: 'bia', name: 'Bia' }, { personaId: 'teo', name: 'Téo' }]

function Harness({ onClose = vi.fn(), returnTo }: { onClose?: () => void; returnTo?: () => HTMLElement | null }) {
  const [tab, setTab] = useState<TaskConversationTab>('conversation')
  return (
    <TaskConversationPanel
      dict={kanbanPt}
      title="Post de sexta"
      columnLabel="Fazendo"
      caring={CARING}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      conversation={<p>fio da conversa</p>}
      details={<p>detalhes da tarefa</p>}
      returnFocusTo={returnTo}
    />
  )
}
const panel = (): HTMLElement => document.querySelector('[data-task-conversation-panel]') as HTMLElement

describe('o painel', () => {
  it('não é modal: um complemento da página com o nome da tarefa, sem scrim e sem aria-modal', () => {
    render(<Harness />)
    expect(screen.getByRole('complementary', { name: 'Conversa da tarefa: Post de sexta' })).toBe(panel())
    expect(panel().getAttribute('aria-modal')).toBeNull()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Post de sexta' })).toBeTruthy()
  })

  it('o cabeçalho: selo da coluna, quem cuida (para leitor de tela) e o botão de fechar', () => {
    render(<Harness />)
    expect(screen.getByText('Fazendo')).toBeTruthy()
    expect(screen.getByText('Quem cuida: Bia e Téo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fechar a conversa da tarefa' })).toBeTruthy()
  })

  it('o foco entra no painel ao abrir (no título) e volta ao cartão ao sair', () => {
    const card = document.createElement('button')
    document.body.appendChild(card)
    const view = render(<Harness returnTo={() => card} />)
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }))
    view.unmount()
    expect(document.activeElement).toBe(card)
    card.remove()
  })
})

describe('as abas', () => {
  it('"Conversa" e "Detalhes": uma por vez, a selecionada tem tabindex 0', () => {
    render(<Harness />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(tab => tab.textContent)).toEqual(['Conversa', 'Detalhes'])
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.tabIndex).toBe(-1)
    expect(screen.getByText('fio da conversa').closest('[role="tabpanel"]')!.hasAttribute('hidden')).toBe(false)
    expect(screen.getByText('detalhes da tarefa', { selector: 'p' }).closest('[role="tabpanel"]')!.hasAttribute('hidden')).toBe(true)
    fireEvent.click(tabs[1]!)
    expect(screen.getByRole('tab', { name: 'Detalhes' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('fio da conversa').closest('[role="tabpanel"]')!.hasAttribute('hidden')).toBe(true)
  })

  it('as setas, Home e End trocam de aba e levam o foco junto', () => {
    render(<Harness />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Conversa' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Detalhes' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Detalhes' }))
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Detalhes' }), { key: 'ArrowRight' }) // volta ao começo
    expect(screen.getByRole('tab', { name: 'Conversa' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Conversa' }), { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Detalhes' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Detalhes' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Conversa' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('fechar', () => {
  it('o X e o Esc saem de cena (data-state closing) e só depois avisam; uma vez só', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    expect(panel().getAttribute('data-state')).toBe('open')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar a conversa da tarefa' }))
    expect(panel().getAttribute('data-state')).toBe('closing')
    expect(onClose).not.toHaveBeenCalled()
    act(() => { panel().dispatchEvent(new Event('animationend')) })
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(1000) }) // o limite de segurança não chama de novo
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sem animationend (movimento reduzido, aba em segundo plano) o limite de segurança fecha mesmo assim', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(panel(), { key: 'Escape' })
    expect(panel().getAttribute('data-state')).toBe('closing')
    act(() => { vi.advanceTimersByTime(500) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('o Esc que um controle de dentro já usou (um menu, uma dica) não fecha o painel', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    screen.getByText('fio da conversa').addEventListener('keydown', (e) => { e.preventDefault() })
    act(() => { screen.getByText('fio da conversa').dispatchEvent(event) })
    expect(panel().getAttribute('data-state')).toBe('open')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('o vazio', () => {
  it('"Ninguém falou desta tarefa ainda." e "Peça algo a quem cuida dela."', () => {
    render(<TaskConversationEmpty dict={kanbanPt} />)
    expect(screen.getByText('Ninguém falou desta tarefa ainda.')).toBeTruthy()
    expect(screen.getByText('Peça algo a quem cuida dela.')).toBeTruthy()
  })
})

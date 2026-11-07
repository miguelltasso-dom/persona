// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonaCardPopover, usePersonaCardController } from '../src/client/primitives/index.ts'
import { PersonaInfoCard, type PersonaCardInfo } from '../src/client/profile/PersonaInfoCard.tsx'

afterEach(() => { cleanup() })

const NINA: PersonaCardInfo = {
  personaId: 'nina',
  name: 'Nina',
  handle: '@nina',
  role: 'Pesquisa',
  sector: 'Produto',
  characterId: 'nina',
  systemRoles: ['coordination'],
  nowKind: 'quota',
  nowText: 'Esperando o plano do Claude renovar',
  presence: 'online',
  talk: { everyone: true, names: [] },
  ownerName: 'Ana',
  engineLabel: 'Plano do Claude · Sonnet',
  quota: { fiveHourPct: 100, weekPct: 17, limitedUntil: '18:30' },
}

describe('PersonaInfoCard', () => {
  it('never shows a raw engine id, even when a mapper forgets to humanize it', () => {
    render(<PersonaInfoCard info={{ ...NINA, engineLabel: 'dsh · default' }} />)
    expect(screen.getByText('DeepSeek · modelo padrão')).toBeTruthy()
    expect(screen.queryByText(/dsh · default/u)).toBeNull()
  })
  it('shows identity, the human "agora" line, governance and the official quota', () => {
    render(<PersonaInfoCard info={NINA} />)
    expect(screen.getByRole('heading', { name: /Nina/u })).toBeTruthy()
    expect(screen.getByText('@nina · Pesquisa · Produto')).toBeTruthy()
    expect(screen.getByText('Coordena o time')).toBeTruthy()
    expect(screen.getByText('Esperando o plano do Claude renovar')).toBeTruthy()
    expect(screen.getByText('Toda a equipe')).toBeTruthy()
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getByText('Ninguém definido')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: '5h' }).getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getByText('No limite até 18:30')).toBeTruthy()
  })

  it('never shows 0% when the quota is unknown', () => {
    render(<PersonaInfoCard info={{ ...NINA, quota: undefined }} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('Este motor não informa a cota.')).toBeTruthy()
    expect(screen.queryByText(/0%/u)).toBeNull()
  })

  it('"Mensagem para Nina" sends to the DM', () => {
    const onSend = vi.fn()
    render(<PersonaInfoCard info={NINA} onSendMessage={onSend} />)
    const field = screen.getByRole('textbox', { name: 'Mensagem para Nina' })
    fireEvent.change(field, { target: { value: 'Oi, Nina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(onSend).toHaveBeenCalledWith('Oi, Nina')
  })

  it('menu ⋯ opens with profile/edit/engine/pause and Esc returns focus', () => {
    const onPause = vi.fn()
    render(<PersonaInfoCard info={NINA} onOpenProfile={() => undefined} onEdit={() => undefined} onSwitchEngine={() => undefined} onTogglePause={onPause} />)
    const button = screen.getByRole('button', { name: 'Mais ações para Nina' })
    fireEvent.click(button)
    const items = screen.getAllByRole('menuitem').map(node => node.textContent)
    expect(items).toEqual(['Abrir perfil', 'Editar persona', 'Trocar motor', 'Pausar'])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})

function Harness(): ReactNode {
  const card = usePersonaCardController()
  return (
    <>
      <button type="button" {...card.triggerProps('nina')}>Nina</button>
      <PersonaCardPopover {...card.popoverProps} label="Cartão de Nina">
        <PersonaInfoCard info={NINA} />
      </PersonaCardPopover>
    </>
  )
}

describe('PersonaCardPopover', () => {
  it('click opens a labelled dialog with focus inside; Esc closes and returns focus to the avatar', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Nina' })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Cartão de Nina' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(dialog)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

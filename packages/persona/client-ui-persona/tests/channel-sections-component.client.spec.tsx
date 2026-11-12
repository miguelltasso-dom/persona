// @vitest-environment jsdom
// COLHEITA 22 (Muse §22): the sidebar's sections as a component — each equipe is a collapsible section with its channels; the no-section
// channels come first with no header; a closed section with unread shows a count; the "+" exists only for who arranges the sidebar.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelSections } from '../src/client/shell/ChannelSections.tsx'
import { buildChannelSections, type ChannelLayoutWire } from '../src/client/shell/channel-sections.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const LAYOUT: ChannelLayoutWire = {
  humanCount: 1,
  sections: [
    { id: null, name: null, faceIds: [], channels: [{ id: 'geral', name: 'geral', kind: 'general' }] },
    { id: 'sec-mkt', name: 'Marketing', teamId: 'mkt', faceIds: ['lia', 'teo'], channels: [{ id: 'marketing', name: 'marketing', kind: 'team', teamId: 'mkt' }, { id: 'campanhas', name: 'campanhas', kind: 'team', teamId: 'mkt' }] },
    { id: 'sec-atd', name: 'Atendimento', teamId: 'atd', faceIds: [], channels: [{ id: 'atendimento', name: 'atendimento', kind: 'team', teamId: 'atd' }] },
  ],
}

function mount(over: { open?: Record<string, boolean>; unread?: Record<string, number>; active?: string | null; mentions?: ReadonlySet<string>; onNewChannel?: (key: string) => void } = {}) {
  const onToggleSection = vi.fn()
  const onOpenChannel = vi.fn()
  const layout = buildChannelSections({ layout: LAYOUT, unreadByChannel: over.unread ?? {}, mentionedChannelIds: over.mentions, open: over.open ?? {}, activeChannelId: over.active ?? null })
  render(
    <ChannelSections
      t={shellTranslate}
      layout={layout}
      faceSrc={id => (id === 'lia' || id === 'teo' ? `/faces/${id}.png` : undefined)}
      onToggleSection={onToggleSection}
      onOpenChannel={onOpenChannel}
      {...(over.onNewChannel === undefined ? {} : { onNewChannel: over.onNewChannel })}
    />,
  )
  return { onToggleSection, onOpenChannel }
}

describe('as seções', () => {
  it('os canais sem seção vêm primeiro e SEM cabeçalho; cada equipe é uma seção com o nome e os canais dentro', () => {
    mount()
    const root = document.querySelector('[data-channel-sections]') as HTMLElement
    expect(root.firstElementChild?.tagName).toBe('UL') // o #geral, sem seção nem cabeçalho
    expect(within(root.firstElementChild as HTMLElement).getByRole('button', { name: /geral/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Marketing/u }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /Atendimento/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /campanhas/u })).toBeTruthy()
  })

  it('o cabeçalho abre e fecha: chama onToggleSection com a chave e o estado de agora', () => {
    const { onToggleSection } = mount()
    fireEvent.click(screen.getByRole('button', { name: /Marketing/u }))
    expect(onToggleSection).toHaveBeenCalledWith('sec-mkt', true)
  })

  it('fechada: aria-expanded false e os canais ficam inertes (nem foco nem leitor de tela chegam neles)', () => {
    mount({ open: { 'sec-mkt': false } })
    expect(screen.getByRole('button', { name: /Marketing/u }).getAttribute('aria-expanded')).toBe('false')
    const body = document.querySelector('[data-section="sec-mkt"] [role="group"]') as HTMLElement
    expect(body.hasAttribute('inert')).toBe(true)
  })

  it('fechada com não lidos: o selo de contagem no cabeçalho, neutro, com o texto para leitor de tela; aberta: sem selo', () => {
    mount({ open: { 'sec-mkt': false }, unread: { marketing: 2, campanhas: 3 } })
    const header = screen.getByRole('button', { name: /Marketing/u })
    expect(header.textContent).toContain('5')
    expect(header.textContent).toContain('5 mensagens não lidas')
    expect(header.querySelector('[data-needs-you]')).toBeNull()
    cleanup()
    mount({ unread: { marketing: 2 } })
    expect(screen.getByRole('button', { name: /Marketing/u }).querySelector('[class*="seal"]')).toBeNull()
  })

  it('o selo é âmbar só quando algo espera a pessoa (uma menção)', () => {
    mount({ open: { 'sec-mkt': false }, unread: { marketing: 1 }, mentions: new Set(['marketing']) })
    expect(screen.getByRole('button', { name: /Marketing/u }).querySelector('[data-needs-you]')).not.toBeNull()
  })

  it('o canal ativo é a página atual; um canal com não lidas diz quantas', () => {
    mount({ active: 'marketing', unread: { campanhas: 1 } })
    expect(screen.getByRole('button', { name: /marketing/u, current: 'page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /campanhas/u }).textContent).toContain('1 mensagem não lida')
  })

  it('clicar num canal o abre', () => {
    const { onOpenChannel } = mount()
    fireEvent.click(screen.getByRole('button', { name: /campanhas/u }))
    expect(onOpenChannel).toHaveBeenCalledWith('campanhas')
  })

  it('só as personas com retrato viram rosto no cabeçalho (nunca inicial, nunca imagem quebrada)', () => {
    mount()
    const faces = document.querySelectorAll('[data-section="sec-mkt"] img')
    expect(faces).toHaveLength(2)
    expect(document.querySelector('[data-section="sec-atd"] img')).toBeNull()
  })
})

describe('o "+" (Novo canal em …)', () => {
  it('sem quem arruma (sem o callback) o botão NÃO existe: nenhum controle morto', () => {
    mount()
    expect(screen.queryByRole('button', { name: /Novo canal/u })).toBeNull()
  })

  it('com o callback há um "+" por equipe, com o nome da equipe, e ele chama com a chave da seção', () => {
    const onNewChannel = vi.fn()
    mount({ onNewChannel })
    expect(screen.getAllByRole('button', { name: /Novo canal em/u })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Novo canal em Marketing' }))
    expect(onNewChannel).toHaveBeenCalledWith('sec-mkt')
  })
})

describe('teclado', () => {
  it('as setas andam entre os canais da seção', () => {
    mount()
    const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-section="sec-mkt"] [data-section-row]'))
    rows[0]!.focus()
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[1])
  })
})

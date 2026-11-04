// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer, WHO_RESPONDS_HINT_KEY } from '../src/client/chat/ChannelComposer.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const TEAM: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] },
  { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'resting' },
]
const HINT = 'A Coordenação distribui o pedido'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('"Quem responde": dica de 1ª vez (UX-PHASE §5)', () => {
  it('aparece uma vez, explica a Coordenação e NÃO rouba o foco do composer', () => {
    render(<ChannelComposer t={t} members={TEAM} />)
    const hint = screen.getByRole('dialog', { name: HINT })
    expect(hint).toBeTruthy()
    expect(screen.getByText('Escolha uma persona aqui para falar direto com ela.')).toBeTruthy()
    expect(hint.contains(document.activeElement)).toBe(false)
  })

  it('"Entendi" fecha e não volta (nem depois de remontar)', () => {
    const { unmount } = render(<ChannelComposer t={t} members={TEAM} />)
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
    expect(localStorage.getItem(WHO_RESPONDS_HINT_KEY)).toBe('1')
    unmount()
    render(<ChannelComposer t={t} members={TEAM} />)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
  })

  it('Esc fecha a dica', () => {
    render(<ChannelComposer t={t} members={TEAM} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
    expect(localStorage.getItem(WHO_RESPONDS_HINT_KEY)).toBe('1')
  })

  it('trocar o seletor também fecha', () => {
    render(<ChannelComposer t={t} members={TEAM} />)
    fireEvent.change(screen.getByLabelText('Persona que responde'), { target: { value: 'nina' } })
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
  })

  it('com uma persona só não há o que escolher: sem dica', () => {
    render(<ChannelComposer t={t} members={TEAM.slice(0, 1)} />)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
  })

  it('storage bloqueado: nunca insiste (não mostra)', () => {
    const original = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(this: Storage, key: string) {
      if (key === WHO_RESPONDS_HINT_KEY) throw new Error('blocked')
      return original.call(this, key)
    })
    render(<ChannelComposer t={t} members={TEAM} />)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
  })
})

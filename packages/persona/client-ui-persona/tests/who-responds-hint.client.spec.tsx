// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

describe('o balão não esconde o que está atrás dele (Gauge SB-7/GES-6, aceite da Muse)', () => {
  it('o balão RECEBE o toque: nada de pointer-events:none (tocar no corpo dele não aciona o controle escondido embaixo)', () => {
    const css = readFileSync(resolve(__dirname, '../src/client/chat/ChannelComposer.module.css'), 'utf8')
    const rule = css.slice(css.indexOf('.whoRespondsBalloon {'), css.indexOf('@keyframes balloonFade'))
    expect(rule).not.toMatch(/pointer-events:\s*none/u)
    expect(css).not.toMatch(/\.whoRespondsBalloon button\s*\{[^}]*pointer-events/u)
  })

  it('clicar em outra coisa da tela (ex.: "Ajustar" do cartão do plano) fecha o balão, a ação acontece e ele não volta', () => {
    const onAdjust = vi.fn()
    const { unmount } = render(
      <>
        <button type="button" onClick={onAdjust}>Ajustar</button>
        <ChannelComposer t={t} members={TEAM} />
      </>,
    )
    const adjust = screen.getByRole('button', { name: 'Ajustar' })
    fireEvent.pointerDown(adjust)
    fireEvent.click(adjust)
    expect(onAdjust).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
    expect(localStorage.getItem(WHO_RESPONDS_HINT_KEY)).toBe('1')
    unmount()
    render(<ChannelComposer t={t} members={TEAM} />)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
  })

  it('tocar dentro do próprio balão (fora do botão) não o fecha', () => {
    render(<ChannelComposer t={t} members={TEAM} />)
    fireEvent.pointerDown(screen.getByText('Escolha uma persona aqui para falar direto com ela.'))
    expect(screen.getByRole('dialog', { name: HINT })).toBeTruthy()
  })

  it('o cartão do plano tem prioridade: com um plano esperando decisão a dica não aparece e não conta como vista', () => {
    const { rerender } = render(<ChannelComposer t={t} members={TEAM} suppressHint />)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
    expect(localStorage.getItem(WHO_RESPONDS_HINT_KEY)).toBeNull()
    // plano decidido: a dica volta a poder aparecer
    rerender(<ChannelComposer t={t} members={TEAM} suppressHint={false} />)
    expect(screen.getByRole('dialog', { name: HINT })).toBeTruthy()
  })

  it('um plano que chega com a dica já aberta a fecha sozinha (sem marcar como vista)', () => {
    const { rerender } = render(<ChannelComposer t={t} members={TEAM} />)
    expect(screen.getByRole('dialog', { name: HINT })).toBeTruthy()
    rerender(<ChannelComposer t={t} members={TEAM} suppressHint />)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
    expect(localStorage.getItem(WHO_RESPONDS_HINT_KEY)).toBeNull()
  })
})

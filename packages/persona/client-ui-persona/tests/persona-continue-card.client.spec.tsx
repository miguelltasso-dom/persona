// @vitest-environment jsdom
// Item 7 (colheita): o cartão "Continuar" reusa o cartão de pergunta, com hierarquia (Continuar é a ação principal, Parar por aqui de
// contorno) e dentro da régua de controles (Carbon: borda >= 3:1, 40px, movimento só por token, rótulo >= 13px, rosto no escuro).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isContinueCard, PersonaAskCard, type PersonaAskCardProps } from '../src/client/ask/PersonaAskCard.tsx'
import type { PersonaAskUi } from '../src/client/ask/persona-ask-model.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(cleanup)

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as PersonaAskCardProps['t']

const CONTINUE_OPTIONS = [{ id: 'continuar', label: 'Continuar' }, { id: 'parar', label: 'Parar por aqui' }]

function ask(extra: Partial<PersonaAskUi> = {}): PersonaAskUi {
  return {
    askId: 'att-9', ticketId: 'tk-9', personaId: 'p-nina', personaName: 'Nina',
    question: 'Quer que eu continue?', options: CONTINUE_OPTIONS, multiple: false, ...extra,
  }
}

describe('isContinueCard', () => {
  it('is exactly the two buttons the host opens (in any order), and nothing else', () => {
    expect(isContinueCard(ask())).toBe(true)
    expect(isContinueCard(ask({ options: [...CONTINUE_OPTIONS].reverse() }))).toBe(true)
    expect(isContinueCard(ask({ options: [{ id: 'continuar', label: 'Continuar' }, { id: 'outro', label: 'Outro' }] }))).toBe(false)
    expect(isContinueCard(ask({ options: [...CONTINUE_OPTIONS, { id: 'mais', label: 'Mais' }] }))).toBe(false)
    expect(isContinueCard(ask({ options: [] }))).toBe(false)
  })
})

describe('o cartão desenhado', () => {
  it('"Continuar" é a ação principal; "Parar por aqui" é o botão de contorno', () => {
    render(<PersonaAskCard t={t} ask={ask()} onAnswer={vi.fn(() => Promise.resolve())} />)
    const go = screen.getByRole('radio', { name: 'Continuar' })
    const stop = screen.getByRole('radio', { name: 'Parar por aqui' })
    expect(go.className).toMatch(/primary/u)
    expect(stop.className).not.toMatch(/primary/u)
    expect(document.querySelector('[data-variant="continue"]')).not.toBeNull()
  })

  it('um clique em cada botão manda o id certo ao host', () => {
    const onAnswer = vi.fn(() => Promise.resolve())
    render(<PersonaAskCard t={t} ask={ask()} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Continuar' }))
    expect(onAnswer).toHaveBeenLastCalledWith(expect.objectContaining({ askId: 'att-9' }), ['continuar'])
  })

  it('uma pergunta comum NÃO ganha hierarquia: sem variante e sem botão principal', () => {
    render(<PersonaAskCard t={t} ask={ask({ question: 'Qual preço?', options: [{ id: 'a', label: 'R$ 12' }, { id: 'b', label: 'R$ 15' }] })} onAnswer={vi.fn(() => Promise.resolve())} />)
    expect(document.querySelector('[data-variant="continue"]')).toBeNull()
    expect(screen.getByRole('radio', { name: 'R$ 12' }).className).not.toMatch(/primary/u)
  })
})

describe('a higiene do CSS do cartão (o que o Carbon cobrou)', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'client', 'ask', 'PersonaAskCard.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replaceAll('\r\n', '\n')
  it('nenhum movimento solto: só token', () => {
    expect(css).not.toMatch(/\b\d+ms\b/u)
    expect(css).toMatch(/transition:[^;]*var\(--motion-fast\)[^;]*var\(--ease-standard\)/u)
  })
  it('o botão está na régua (40px) e a borda de controle não é a suave', () => {
    const button = /\n\.button \{([^}]*)\}/u.exec(css)?.[1] ?? ''
    expect(button).toMatch(/min-height:\s*var\(--control-h-m\)/u)
    expect(button).toMatch(/border-color:\s*var\(--persona-outline-control\)/u)
  })
  it('o rótulo do cartão tem pelo menos 13px', () => {
    const eyebrow = /\.eyebrow \{([^}]*)\}/u.exec(css)?.[1] ?? ''
    const size = Number(/font:\s*\d+\s+(\d+)px/u.exec(eyebrow)?.[1] ?? '0')
    expect(size).toBeGreaterThanOrEqual(13)
  })
  it('o rosto de 32px tem o contorno de controle (não some no escuro)', () => {
    expect(css).toMatch(/\.row \.face \{[^}]*border-color:\s*var\(--persona-outline-control\)/u)
  })
})

// @vitest-environment jsdom
// Pré-aceite do Ember (checagem `dialogo`, sonda v2) + a forma da Muse (bundle 6): o cartão da persona passava do fundo da janela (1440×900 e 960×640) e o
// campo "Enviar" ficava de fora. Regra: a altura máxima é a janela − 16 px; o TOPO (pose, nome, papéis, "agora") fica FIXO, o MEIO (Quem pode falar … Modelo
// e cota) ROLA e o campo de mensagem rápida + Enviar ficam FIXOS embaixo; sem espaço abaixo do rosto, o cartão abre para cima (os testes de posição estão em
// `persona-card-keyboard-fit`). O layout real (o "Enviar" dentro da janela) é medido em Chrome de verdade pela galeria (`cartao-persona-rodape`) e pela
// checagem `dialogo` do pré-aceite; aqui ficam a estrutura e as guardas do CSS.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonaInfoCard, type PersonaCardInfo } from '../src/client/profile/PersonaInfoCard.tsx'

afterEach(() => { cleanup() })

const CSS = readFileSync(join(import.meta.dirname, '../src/client/primitives/PersonaCard.module.css'), 'utf8').replaceAll('\r\n', '\n')

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

/** Regra de topo `selector { … }` (primeira ocorrência), sem as que estão dentro de `@media`/`@container` (essas começam com espaços). */
function rule(selector: string): string {
  const escaped = selector.replace(/[.[\]()]/gu, '\\$&')
  return new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'mu').exec(CSS)?.[1] ?? ''
}

/** Corpo do `@media` informado (até a chave que o fecha), ou '' se não existir. */
function mediaBody(query: string): string {
  const start = CSS.indexOf(`@media ${query} {`)
  if (start < 0) return ''
  const open = CSS.indexOf('{', start)
  let depth = 0
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++
    if (CSS[i] === '}' && --depth === 0) return CSS.slice(open + 1, i)
  }
  return ''
}

describe('cartão da persona: topo fixo, meio que rola, campo de mensagem fixo embaixo', () => {
  it('a moldura tem 2 filhos (o que rola e o rodapé) e o que rola tem o topo e o meio, cada coisa no seu lugar', () => {
    const { container } = render(<PersonaInfoCard info={NINA} onSendMessage={vi.fn()} />)
    const article = container.querySelector('article')
    expect(article).not.toBeNull()
    expect(article!.children.length).toBe(2)
    const [scroll, dock] = Array.from(article!.children) as HTMLElement[]
    expect(scroll!.children.length).toBe(2)
    const [head, middle] = Array.from(scroll!.children) as HTMLElement[]

    // FIXO no topo: o nome, os papéis, o "agora"
    expect(head!.contains(screen.getByRole('heading', { name: /Nina/u }))).toBe(true)
    expect(head!.contains(screen.getByText('Coordena o time'))).toBe(true)
    expect(head!.contains(screen.getByText('Esperando o plano do Claude renovar'))).toBe(true)
    // ROLA no meio: Quem pode falar … Modelo e cota
    expect(head!.contains(screen.getByText('Quem pode falar'))).toBe(false)
    expect(middle!.contains(screen.getByText('Quem pode falar'))).toBe(true)
    expect(middle!.contains(screen.getByText('Responsável'))).toBe(true)
    expect(middle!.contains(screen.getByText(/Plano do Claude/u))).toBe(true)
    // FIXO embaixo: o campo e o Enviar (nunca dentro do que rola)
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(scroll!.contains(form)).toBe(false)
    expect(dock!.contains(form)).toBe(true)
    expect(dock!.contains(screen.getByRole('button', { name: 'Enviar' }))).toBe(true)
  })

  it('sem o campo (ninguém para quem mandar), não existe rodapé: só o que rola', () => {
    const { container } = render(<PersonaInfoCard info={NINA} />)
    expect(container.querySelector('article')!.children.length).toBe(1)
    expect(container.querySelector('form')).toBeNull()
  })

  it('o campo continua funcionando no rodapé: o texto vai para a DM e o campo esvazia', () => {
    const onSend = vi.fn()
    render(<PersonaInfoCard info={NINA} onSendMessage={onSend} />)
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Mensagem para Nina' })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Enviar' }).disabled).toBe(true) // vazio não envia
    fireEvent.change(field, { target: { value: 'Oi, Nina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(onSend).toHaveBeenCalledWith('Oi, Nina')
    expect(field.value).toBe('')
  })

  it('os fatos continuam todos na tela (nada sumiu na divisão): agora, quem pode falar, o que pode fazer, presença, responsável, substituto e modelo', () => {
    render(<PersonaInfoCard info={NINA} onSendMessage={vi.fn()} />)
    for (const text of ['Esperando o plano do Claude renovar', 'Quem pode falar', 'Toda a equipe', 'Responsável', 'Ana', 'Substituto', 'Ninguém definido', 'Modelo']) {
      expect(screen.getByText(text), text).toBeTruthy()
    }
    expect(screen.getByRole('progressbar', { name: '5h' })).toBeTruthy()
  })
})

describe('cartão da persona: CSS que mantém topo e rodapé à vista', () => {
  it('a janela flutuante tem no máximo a altura da janela − 16 px e NÃO rola inteira (quem rola é o meio)', () => {
    const popover = rule('.popover')
    expect(popover).toMatch(/max-height:\s*calc\(100dvh - 16px\)\s*;/u)
    expect(popover).toMatch(/display:\s*flex\s*;/u)
    expect(popover).toMatch(/flex-direction:\s*column\s*;/u)
    expect(popover).not.toMatch(/overflow-y:\s*auto/u)
  })

  it('o meio é a única área que rola e pode encolher; o rodapé não encolhe nem rola; a moldura continua inteira', () => {
    const scroll = rule('.scroll')
    expect(scroll).toMatch(/overflow-y:\s*auto\s*;/u)
    expect(scroll).toMatch(/min-height:\s*0\s*;/u)
    expect(scroll).toMatch(/flex:\s*1 1 auto\s*;/u)
    const dock = rule('.dock')
    expect(dock).toMatch(/flex:\s*none\s*;/u)
    expect(dock).toMatch(/background:\s*var\(--persona-card\)\s*;/u)
    expect(dock).not.toMatch(/overflow/u)
    const card = rule('.card')
    expect(card).toMatch(/display:\s*flex\s*;/u)
    expect(card).toMatch(/min-height:\s*0\s*;/u)
    expect(card).toMatch(/overflow:\s*hidden\s*;/u)
  })

  it('o topo fica grudado no alto com fundo opaco (o meio passa por baixo)', () => {
    const head = rule('.head')
    expect(head).toMatch(/position:\s*sticky\s*;/u)
    expect(head).toMatch(/top:\s*0\s*;/u)
    expect(head).toMatch(/background:\s*var\(--persona-card\)\s*;/u)
    expect(head).toMatch(/z-index:\s*2\s*;/u)
  })

  it('em janela baixa (≤ 600 px; o zoom 200% é 360) o topo rola junto e o banner encolhe: o meio sempre tem o que rolar', () => {
    const low = mediaBody('(max-height: 600px)')
    expect(low).not.toBe('')
    expect(low).toMatch(/\.head\s*\{[^}]*position:\s*static\s*;/u)
    expect(low).toMatch(/\.stage\s*\{[^}]*height:\s*72px\s*;/u)
    expect(low).toMatch(/\.pose\s*\{[^}]*height:\s*60px\s*;/u)
    // a regra baixa vem DEPOIS das de base (a cascata não a desfaz)
    const start = CSS.indexOf('@media (max-height: 600px) {')
    expect(start).toBeGreaterThan(CSS.indexOf('.stage {'))
    expect(start).toBeGreaterThan(CSS.indexOf('.pose {'))
    expect(start).toBeGreaterThan(CSS.indexOf('.head {'))
  })
})

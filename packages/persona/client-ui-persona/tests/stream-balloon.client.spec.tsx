// @vitest-environment jsdom
// FL-11 / IV-5 (Muse 19:10): a resposta que cresce é UMA mensagem (o mesmo nó entre os upserts, aria-busy, markdown aberto como texto, cursor-bloco
// só visual); o leitor de tela ouve UMA vez "{persona} está escrevendo…" e UMA "{persona} respondeu."; o Parar deixa "Você parou aqui ·
// Continuar" (o link manda "Continue de onde parou." com o chip "Retomada"). Sem as marcas do host nada disto aparece.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => { localStorage.clear(); localStorage.setItem('persona.hint.whoResponds', '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const ask: ChannelMessageUi = { id: 'm1', authorId: 'user', authorName: 'Ana', body: 'Explique o plano', timeLabel: '10:00', occurredAt: '2026-11-04T13:00:00.000Z', reactions: [] }
const reply = (over: Partial<ChannelMessageUi> = {}): ChannelMessageUi => ({
  id: 'coord-m1-reply', authorId: 'nina', authorName: 'Nina', body: 'Vou explicar em três passos:', timeLabel: '10:01', occurredAt: '2026-11-04T13:01:00.000Z', reactions: [], ...over,
})

function mount(messages: readonly ChannelMessageUi[], extra: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) {
  const onSendMessage = vi.fn()
  const element = (rows: readonly ChannelMessageUi[], more: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) => (
    <GeneralChannelView
      t={t as never}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[]}
      messages={rows}
      onSendMessage={onSendMessage}
      {...extra}
      {...more}
    />
  )
  const rendered = render(element(messages))
  return { ...rendered, element, onSendMessage }
}

const row = (id: string): HTMLElement => document.querySelector(`[data-message-id="${id}"]`) as HTMLElement

describe('a resposta que cresce', () => {
  it('marca o texto como ocupado (aria-busy) e como "em escrita" para o cursor; o markdown aberto vira texto', () => {
    mount([ask, reply({ streaming: true, body: 'Veja o código:\n\n```ts\nconst a = 1' })])
    const text = row('coord-m1-reply').querySelector('[data-streaming]') as HTMLElement
    expect(text.getAttribute('aria-busy')).toBe('true')
    expect(text.querySelector('pre')).toBeNull()
    expect(text.textContent).toContain('const a = 1')
  })

  it('resposta pronta: sem aria-busy, sem marca de escrita', () => {
    mount([ask, reply()])
    expect(row('coord-m1-reply').querySelector('[data-streaming]')).toBeNull()
    expect(row('coord-m1-reply').querySelector('[aria-busy]')).toBeNull()
  })

  it('os upserts do mesmo id mantêm O MESMO nó do DOM (não reanima nem remonta a cada pedaço)', () => {
    const { rerender, element } = mount([ask, reply({ streaming: true })])
    const before = row('coord-m1-reply')
    rerender(element([ask, reply({ streaming: true, body: 'Vou explicar em três passos: primeiro' })]))
    rerender(element([ask, reply({ streaming: true, body: 'Vou explicar em três passos: primeiro, o prazo.' })]))
    expect(row('coord-m1-reply')).toBe(before)
    expect(before.textContent).toContain('primeiro, o prazo.')
  })

  it('quando termina, o aria-busy sai e o texto final substitui o parcial', () => {
    const { rerender, element } = mount([ask, reply({ streaming: true })])
    rerender(element([ask, reply({ body: 'Texto final.' })]))
    expect(row('coord-m1-reply').querySelector('[aria-busy]')).toBeNull()
    expect(row('coord-m1-reply').textContent).toContain('Texto final.')
    expect(row('coord-m1-reply').textContent).not.toContain('Vou explicar')
  })
})

describe('o que o leitor de tela ouve', () => {
  const statusTexts = (): string[] => [...document.querySelectorAll('[role="status"]')].map(node => node.textContent ?? '')

  it('UMA vez "Nina está escrevendo…" quando a resposta começa a crescer, e NADA a cada pedaço', () => {
    const { rerender, element } = mount([ask])
    rerender(element([ask, reply({ streaming: true })]))
    expect(statusTexts()).toContain('Nina está escrevendo…')
    rerender(element([ask, reply({ streaming: true, body: 'Vou explicar em três passos: primeiro' })]))
    expect(statusTexts().filter(text => text === 'Nina está escrevendo…')).toHaveLength(1)
    expect(statusTexts().some(text => text.includes('primeiro'))).toBe(false)
  })

  it('UMA vez "Nina respondeu." quando a resposta assenta', () => {
    const { rerender, element } = mount([ask])
    rerender(element([ask, reply({ streaming: true })]))
    rerender(element([ask, reply({ body: 'Texto final.' })]))
    expect(statusTexts()).toContain('Nina respondeu.')
    expect(statusTexts()).not.toContain('Nina está escrevendo…')
  })

  it('resposta que já chegou pronta não anuncia nada (só diz o que viu acontecer)', () => {
    mount([ask, reply()])
    expect(statusTexts().some(text => text.includes('respondeu') || text.includes('escrevendo'))).toBe(false)
  })

  it('resposta parada pelo Parar não diz "respondeu" (quem diz é "Nina parou.")', () => {
    const { rerender, element } = mount([ask])
    rerender(element([ask, reply({ streaming: true })]))
    rerender(element([ask, reply({ stopped: true, body: 'Vou explicar em três passos: primeiro' })]))
    expect(statusTexts()).not.toContain('Nina respondeu.')
  })
})

describe('"Você parou aqui · Continuar"', () => {
  it('a linha aparece sob o balão que o Parar deixou, com o link Continuar', () => {
    mount([ask, reply({ stopped: true, body: 'Vou explicar em três passos: primeiro' })])
    const line = row('coord-m1-reply').querySelector('[data-persona-stopped]') as HTMLElement
    expect(line.textContent).toBe('Você parou aqui · Continuar')
    expect(line.querySelector('button')?.textContent).toBe('Continuar')
  })

  it('"Continuar" manda "Continue de onde parou." para a persona que parou (@Nome na frente: o host roteia por menção)', () => {
    const { onSendMessage } = mount([ask, reply({ stopped: true })])
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(onSendMessage).toHaveBeenCalledWith('@Nina Continue de onde parou.')
  })

  it('nome com espaço vira uma menção só', () => {
    const { onSendMessage } = mount([ask, reply({ stopped: true, authorName: 'Ana Maria' })])
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(onSendMessage).toHaveBeenCalledWith('@AnaMaria Continue de onde parou.')
  })

  it('o chip "Retomada" também vale com a menção na frente', () => {
    mount([ask, reply({ stopped: true }), { ...ask, id: 'm3', body: '@Nina Continue de onde parou.' }])
    expect(row('m3').textContent).toContain('Retomada')
  })

  it('uma mensagem que só começa com @ e não é a retomada não ganha o chip', () => {
    mount([ask, { ...ask, id: 'm4', body: '@Nina faça o logo' }])
    expect(row('m4').textContent).not.toContain('Retomada')
  })

  it('sem como enviar não há link morto: só "Você parou aqui"', () => {
    mount([ask, reply({ stopped: true })], { onSendMessage: undefined })
    const line = row('coord-m1-reply').querySelector('[data-persona-stopped]') as HTMLElement
    expect(line.textContent).toBe('Você parou aqui')
    expect(line.querySelector('button')).toBeNull()
  })

  it('a mensagem "Continue de onde parou." da pessoa leva o chip "Retomada"', () => {
    mount([ask, reply({ stopped: true }), { ...ask, id: 'm2', body: 'Continue de onde parou.' }])
    expect(row('m2').textContent).toContain('Retomada')
    expect(row('m1').textContent).not.toContain('Retomada')
  })

  it('o chip também aparece com os balões ligados (CV-9)', () => {
    localStorage.setItem('persona.flag.bubbles', '1')
    mount([ask, { ...ask, id: 'm2', body: 'Continue de onde parou.' }])
    expect(row('m2').textContent).toContain('Retomada')
  })

  it('mensagem comum não ganha a linha nem o chip', () => {
    mount([ask, reply()])
    expect(document.querySelector('[data-persona-stopped]')).toBeNull()
    expect(document.body.textContent).not.toContain('Retomada')
  })
})

describe('mensagem direcionada', () => {
  it('"Direcionou {persona}" aparece quando o host marcou (steeredPersonaName)', () => {
    mount([{ ...ask, steeredPersonaName: 'Nina' }])
    expect(row('m1').textContent).toContain('Direcionou Nina')
  })
})

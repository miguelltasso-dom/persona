// @vitest-environment jsdom
// IV-10 · a pergunta estruturada no fio (Colheita A(1); contracts/structured-question.md): os chips (única: o toque responde; várias:
// marcam e "Enviar {k}"), só leitura depois de respondida, a falha com "Tentar de novo", o teclado e a flag.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasAskChips, PersonaAskCard, type PersonaAskCardProps } from '../src/client/ask/PersonaAskCard.tsx'
import { isPersonaAskEnabled, PERSONA_ASK_FLAG_KEY } from '../src/client/ask/ask-flag.ts'
import { knownChoices, mapPersonaAsk, mapPersonaAskLive, toggleOption, type PersonaAskUi } from '../src/client/ask/persona-ask-model.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(cleanup)

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as PersonaAskCardProps['t']

const OPTIONS = [
  { id: 'padaria', label: 'Padaria' },
  { id: 'agencia', label: 'Agência' },
  { id: 'loja', label: 'Loja online' },
]

function ask(extra: Partial<PersonaAskUi> = {}): PersonaAskUi {
  return {
    askId: 'att-1', ticketId: 'tk-1', personaId: 'p-atlas', personaName: 'Atlas',
    question: 'O que a sua empresa faz?', options: OPTIONS, multiple: false, ...extra,
  }
}

describe('o mapa do host (modelo puro)', () => {
  it('descarta o que não dá para desenhar e mantém a ordem', () => {
    expect(mapPersonaAsk(undefined)).toBeUndefined()
    expect(mapPersonaAsk({ askId: '', ticketId: 't', personaId: 'p', personaName: 'A', question: 'Oi?', multiple: false })).toBeUndefined()
    expect(mapPersonaAsk({ askId: 'a', ticketId: 't', personaId: 'p', personaName: 'A', question: '   ', multiple: false })).toBeUndefined()
    const mapped = mapPersonaAsk({
      askId: 'a', ticketId: 't', personaId: 'p', personaName: 'Atlas', question: ' Qual? ', multiple: true,
      options: [{ id: 'x', label: ' X ' }, { id: 'x', label: 'repetida' }, { id: 'y', label: '' }, { id: 'z', label: 'Z' }],
    })
    expect(mapped?.question).toBe('Qual?')
    expect(mapped?.options).toEqual([{ id: 'x', label: 'X' }, { id: 'z', label: 'Z' }])
    expect(mapped?.multiple).toBe(true)
  })

  it('múltipla só com 2 ou mais opções, e a sequência só com 2 ou mais passos válidos', () => {
    const base = { askId: 'a', ticketId: 't', personaId: 'p', personaName: 'A', question: 'Q?' }
    expect(mapPersonaAsk({ ...base, multiple: true, options: [{ id: 'x', label: 'X' }] })?.multiple).toBe(false)
    expect(mapPersonaAsk({ ...base, multiple: false, options: OPTIONS, step: { index: 2, total: 3 } })?.step).toEqual({ index: 2, total: 3 })
    expect(mapPersonaAsk({ ...base, multiple: false, options: OPTIONS, step: { index: 1, total: 1 } })?.step).toBeUndefined()
    expect(mapPersonaAsk({ ...base, multiple: false, options: OPTIONS, step: { index: 4, total: 3 } })?.step).toBeUndefined()
  })

  it('a escolha: única mantém só uma; múltipla liga e desliga na ordem das opções; id estranho é ignorado', () => {
    expect(toggleOption(OPTIONS, [], 'loja', false)).toEqual(['loja'])
    expect(toggleOption(OPTIONS, ['loja'], 'padaria', false)).toEqual(['padaria'])
    expect(toggleOption(OPTIONS, ['loja'], 'padaria', true)).toEqual(['padaria', 'loja'])
    expect(toggleOption(OPTIONS, ['padaria', 'loja'], 'padaria', true)).toEqual(['loja'])
    expect(toggleOption(OPTIONS, ['loja'], 'nao-existe', true)).toEqual(['loja'])
    expect(knownChoices(OPTIONS, ['loja', 'saiu'])).toEqual(['loja'])
  })

  it('o estado vivo do host vira escolhas e texto', () => {
    expect(mapPersonaAskLive(undefined)).toBeUndefined()
    expect(mapPersonaAskLive({ status: 'answered', answer: { optionIds: ['padaria'], text: 'Itu' } })).toEqual({ status: 'answered', optionIds: ['padaria'], text: 'Itu' })
    expect(mapPersonaAskLive({ status: 'open' })).toEqual({ status: 'open', optionIds: [], text: '' })
  })

  it('só há cartão quando há chips para tocar', () => {
    expect(hasAskChips(ask())).toBe(true)
    expect(hasAskChips(ask({ options: [] }))).toBe(false)
    expect(hasAskChips(ask({ options: [OPTIONS[0]!] }))).toBe(false)
  })
})

describe('escolha única: o toque responde', () => {
  it('mostra "Pergunta i de n", a pergunta, os chips num radiogroup e o convite à caixa; tocar manda UMA escolha', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    render(<PersonaAskCard t={t} ask={ask({ step: { index: 1, total: 3 } })} onAnswer={onAnswer} timeLabel="13:44" />)
    expect(screen.getByText('Pergunta 1 de 3')).toBeTruthy()
    expect(screen.getByText('O que a sua empresa faz?')).toBeTruthy()
    const group = screen.getByRole('radiogroup')
    expect(within(group).getAllByRole('radio').map(node => node.textContent)).toEqual(['Padaria', 'Agência', 'Loja online'])
    expect(screen.getByText('ou escreva do seu jeito na caixa abaixo')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Enviar/u })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: 'Agência' }))
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer.mock.calls[0]![1]).toEqual(['agencia'])
    // depois do host aceitar: só leitura, com "Respondida" e a escolha marcada
    await waitFor(() => { expect(screen.getByText('Respondida')).toBeTruthy() })
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByText('ou escreva do seu jeito na caixa abaixo')).toBeNull()
    const chosen = document.querySelector('[data-chosen="true"]')
    expect(chosen?.textContent).toContain('Agência')
  })

  it('sem passo, o título é só "Pergunta"; com a sequência o passo aparece', () => {
    const { rerender } = render(<PersonaAskCard t={t} ask={ask()} onAnswer={vi.fn()} />)
    expect(screen.getByText('Pergunta')).toBeTruthy()
    rerender(<PersonaAskCard t={t} ask={ask({ step: { index: 2, total: 3 } })} onAnswer={vi.fn()} />)
    expect(screen.getByText('Pergunta 2 de 3')).toBeTruthy()
  })

  it('teclado: as setas movem o foco (sem responder), Enter/Espaço escolhem; um único passo de Tab', () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    render(<PersonaAskCard t={t} ask={ask()} onAnswer={onAnswer} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.filter(node => node.getAttribute('tabindex') === '0')).toHaveLength(1)
    radios[0]!.focus()
    fireEvent.keyDown(radios[0]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(radios[1])
    fireEvent.keyDown(radios[1]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(radios[2])
    fireEvent.keyDown(radios[2]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(radios[0])
    fireEvent.keyDown(radios[0]!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(radios[2])
    fireEvent.keyDown(radios[2]!, { key: 'Home' })
    expect(document.activeElement).toBe(radios[0])
    fireEvent.keyDown(radios[0]!, { key: 'End' })
    expect(document.activeElement).toBe(radios[2])
    expect(onAnswer).not.toHaveBeenCalled()
    fireEvent.click(document.activeElement as HTMLElement)
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer.mock.calls[0]![1]).toEqual(['loja'])
  })
})

describe('escolha múltipla: marca e "Enviar {k}"', () => {
  const multiple = ask({ multiple: true, step: { index: 2, total: 3 } })

  it('chips são caixas de marcar; "Enviar" só aparece com ao menos uma marcada e manda na ordem das opções', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    render(<PersonaAskCard t={t} ask={multiple} onAnswer={onAnswer} />)
    expect(screen.getByText('Pergunta 2 de 3 · pode escolher mais de uma')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Enviar/u })).toBeNull()
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[2]!)
    fireEvent.click(boxes[0]!)
    expect(boxes[0]!.getAttribute('aria-checked')).toBe('true')
    expect(boxes[1]!.getAttribute('aria-checked')).toBe('false')
    expect(onAnswer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar 2' }))
    expect(onAnswer.mock.calls[0]![1]).toEqual(['padaria', 'loja'])
    await waitFor(() => { expect(screen.getByText('Respondida')).toBeTruthy() })
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('o botão guarda o lugar (Muse 22:25): existe no DOM, escondido e fora do Tab, até a 1ª marca; nunca some do layout', () => {
    const { container } = render(<PersonaAskCard t={t} ask={multiple} onAnswer={vi.fn()} />)
    const send = container.querySelector('button[class*="send"]') as HTMLButtonElement
    expect(send).not.toBeNull()
    expect(send.getAttribute('aria-hidden')).toBe('true')
    expect(send.disabled).toBe(true)
    expect(send.tabIndex).toBe(-1)
    expect(send.className).toMatch(/sendIdle/u)
    fireEvent.click(screen.getAllByRole('checkbox')[0]!)
    expect(send.getAttribute('aria-hidden')).toBeNull()
    expect(send.disabled).toBe(false)
    expect(send.className).not.toMatch(/sendIdle/u)
    expect(send.textContent).toBe('Enviar 1')
  })

  it('desmarcar volta a esconder o "Enviar"', () => {
    render(<PersonaAskCard t={t} ask={multiple} onAnswer={vi.fn()} />)
    const box = screen.getAllByRole('checkbox')[1]!
    fireEvent.click(box)
    expect(screen.getByRole('button', { name: 'Enviar 1' })).toBeTruthy()
    fireEvent.click(box)
    expect(screen.queryByRole('button', { name: /^Enviar/u })).toBeNull()
  })
})

describe('a falha de envio', () => {
  it('"Não enviado · Tentar de novo": a escolha segue marcada e o link manda de novo', async () => {
    const onAnswer = vi.fn()
      .mockRejectedValueOnce(new Error('host down'))
      .mockResolvedValueOnce(undefined)
    render(<PersonaAskCard t={t} ask={ask()} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Padaria' }))
    await waitFor(() => { expect(screen.getByText(/Não enviado/u)).toBeTruthy() })
    expect(screen.getByRole('radio', { name: 'Padaria' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByText('Respondida')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' })) })
    await waitFor(() => { expect(screen.getByText('Respondida')).toBeTruthy() })
    expect(onAnswer).toHaveBeenCalledTimes(2)
    expect(onAnswer.mock.calls[1]![1]).toEqual(['padaria'])
  })

  it('durante o envio os chips ficam desligados (não há resposta dupla)', async () => {
    let resolve: () => void = () => {}
    const onAnswer = vi.fn(() => new Promise<void>((done) => { resolve = done }))
    render(<PersonaAskCard t={t} ask={ask()} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Padaria' }))
    expect((screen.getByRole('radio', { name: 'Agência' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Agência' }))
    expect(onAnswer).toHaveBeenCalledTimes(1)
    await act(async () => { resolve() })
    await waitFor(() => { expect(screen.getByText('Respondida')).toBeTruthy() })
  })
})

describe('respondida, cancelada e só leitura', () => {
  it('respondida pelo host: só leitura, "Respondida", a escolha âmbar, as outras esmaecidas, sem controle', () => {
    render(<PersonaAskCard t={t} ask={ask()} live={{ status: 'answered', optionIds: ['loja'], text: '' }} onAnswer={vi.fn()} />)
    expect(screen.getByText('Respondida')).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    // os chips são os <li> de dentro da lista (a própria linha do cartão no fio também é um <li>)
    const items = Array.from(document.querySelectorAll('ul li'))
    expect(items.map(node => node.getAttribute('data-chosen'))).toEqual([null, null, 'true'])
    expect(screen.getByText('escolhida', { exact: false })).toBeTruthy()
    expect(screen.queryByText('ou escreva do seu jeito na caixa abaixo')).toBeNull()
  })

  it('cancelada: a frase honesta e nenhum chip', () => {
    render(<PersonaAskCard t={t} ask={ask()} live={{ status: 'cancelled', optionIds: [], text: '' }} onAnswer={vi.fn()} />)
    expect(screen.getByText('Esta pergunta não precisa mais de resposta.')).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByText('Respondida')).toBeNull()
  })

  it('sem quem receba a resposta não há controle morto: os chips são só leitura', () => {
    render(<PersonaAskCard t={t} ask={ask()} />)
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Padaria')).toBeTruthy()
    expect(screen.queryByText('ou escreva do seu jeito na caixa abaixo')).toBeNull()
  })

  it('o cartão é um grupo com nome ("Pergunta de Atlas") e leva a persona e o horário', () => {
    render(<PersonaAskCard t={t} ask={ask()} onAnswer={vi.fn()} timeLabel="13:44" />)
    expect(screen.getByRole('region', { name: 'Pergunta de Atlas' })).toBeTruthy()
    expect(screen.getByText('Atlas')).toBeTruthy()
    expect(screen.getByText(/13:44/u)).toBeTruthy()
  })
})

describe('a flag persona.flag.personaAsk', () => {
  beforeEach(() => {
    localStorage.clear()
    delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
  })

  it('desligada por padrão; liga por localStorage ou pela janela', () => {
    expect(isPersonaAskEnabled()).toBe(false)
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '0')
    expect(isPersonaAskEnabled()).toBe(false)
    localStorage.setItem(PERSONA_ASK_FLAG_KEY, '1')
    expect(isPersonaAskEnabled()).toBe(true)
    localStorage.clear()
    ;(window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__ = { personaAsk: true }
    expect(isPersonaAskEnabled()).toBe(true)
  })
})

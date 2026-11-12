// @vitest-environment jsdom
// Colheita item 11 · o cartão de escolha do fim da vez (design/COLHEITA-MUSE.md §11): opções A a F, o toque manda a escolha, só leitura
// depois, as teclas A a F, as setas, a falha com "Tentar de novo" e a variante dentro do mapa e do Remote.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonaChoiceCard, letterOf, type PersonaChoiceCardProps } from '../src/client/ask/PersonaChoiceCard.tsx'
import { hasAskChips } from '../src/client/ask/PersonaAskCard.tsx'
import { mapPersonaAsk, mapPersonaAskLive, type PersonaAskUi } from '../src/client/ask/persona-ask-model.ts'
import { answerEndOfTurnChoice, choiceMessageIdOf } from '../src/client/ask/persona-asks-remote.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(cleanup)

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as PersonaChoiceCardProps['t']

const OPTIONS = [
  { id: 'a', label: 'Post para o Instagram' },
  { id: 'b', label: 'Post para o Facebook' },
  { id: 'c', label: 'Nenhuma, refaça' },
]

function ask(extra: Partial<PersonaAskUi> = {}): PersonaAskUi {
  return {
    kind: 'fimDoTurno', askId: 'choice:m-1', ticketId: '', personaId: 'p-bia', personaName: 'Bia',
    question: 'Qual delas publicamos?', options: OPTIONS, multiple: false, ...extra,
  }
}

describe('o mapa do host para o cartão do fim da vez', () => {
  it('o cartão do fim da vez vale sem Tarefa; o de pergunta continua exigindo a Tarefa', () => {
    const base = { askId: 'choice:m-1', ticketId: '', personaId: 'p', personaName: 'Bia', question: 'Qual?', multiple: true, options: OPTIONS }
    const end = mapPersonaAsk({ ...base, kind: 'fimDoTurno' })
    expect(end?.kind).toBe('fimDoTurno')
    expect(end?.multiple).toBe(false) // nunca múltipla
    expect(mapPersonaAsk(base)).toBeUndefined()
    expect(hasAskChips(end!)).toBe(true)
  })

  it('o estado vivo traz a hora da escolha', () => {
    expect(mapPersonaAskLive({ status: 'answered', answer: { optionIds: ['b'], text: '✓ B · Post para o Facebook', answeredAt: '2026-11-11T17:32:00.000Z' } }))
      .toMatchObject({ status: 'answered', optionIds: ['b'], answeredAt: '2026-11-11T17:32:00.000Z' })
  })

  it('o id do cartão leva à mensagem da persona, e o Remote recebe a escolha com ela', async () => {
    expect(choiceMessageIdOf('choice:m-42')).toBe('m-42')
    expect(choiceMessageIdOf('att-1')).toBeUndefined()
    const answerChoice = vi.fn((_request: Record<string, unknown>) => true)
    await answerEndOfTurnChoice({ answerChoice }, { workspaceId: 'ws', projectId: 'pp' }, 'choice:m-42', 'b')
    expect(answerChoice).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'pp', messageId: 'm-42', optionId: 'b' })
    await expect(answerEndOfTurnChoice({}, { workspaceId: 'ws', projectId: 'pp' }, 'choice:m-42', 'b')).rejects.toThrow()
    await expect(answerEndOfTurnChoice({ answerChoice }, { workspaceId: 'ws', projectId: 'pp' }, 'att-1', 'b')).rejects.toThrow('cartão inválido')
  })
})

describe('o cartão', () => {
  it('mostra o rótulo, a pergunta, as opções com as letras A a C, a linha "ou escreva" e o rodapé sem pressa', () => {
    render(<PersonaChoiceCard t={t} ask={ask()} timeLabel="14:30" onAnswer={vi.fn()} />)
    expect(screen.getByText('Escolha um caminho')).toBeTruthy()
    expect(screen.getByText('Qual delas publicamos?')).toBeTruthy()
    const group = screen.getByRole('radiogroup')
    const radios = within(group).getAllByRole('radio')
    expect(radios.map(radio => radio.getAttribute('data-letter'))).toEqual(['A', 'B', 'C'])
    expect(radios.map(radio => radio.textContent)).toEqual([
      'AOpção A: Post para o Instagram', 'BOpção B: Post para o Facebook', 'COpção C: Nenhuma, refaça',
    ])
    expect(screen.getByText('ou escreva do seu jeito na caixa abaixo')).toBeTruthy()
    expect(screen.getByText(/Sem pressa: Bia segue quando você escolher\./u)).toBeTruthy()
    expect(letterOf(5)).toBe('F')
    expect(document.querySelector('[data-persona-ask-kind="fimDoTurno"]')).not.toBeNull()
  })

  it('tocar numa opção manda a escolha uma vez; depois a escolhida fica marcada, as outras esmaecem e o rodapé diz o que você escolheu', async () => {
    const onAnswer = vi.fn((_ask: PersonaAskUi, _ids: readonly string[]) => Promise.resolve())
    render(<PersonaChoiceCard t={t} ask={ask()} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByRole('radio', { name: /Post para o Facebook/u }))
    await waitFor(() => { expect(screen.getByText(/Você escolheu B/u)).toBeTruthy() })
    expect(onAnswer).toHaveBeenCalledTimes(1)
    expect(onAnswer.mock.calls[0]?.[1]).toEqual(['b'])
    const radios = screen.getAllByRole('radio')
    expect(radios.map(radio => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios[1]?.getAttribute('data-chosen')).toBe('true')
    expect(radios[1]?.querySelector('svg')).not.toBeNull()
    // só leitura: nem a linha "ou escreva", nem um segundo toque
    expect(screen.queryByText('ou escreva do seu jeito na caixa abaixo')).toBeNull()
    fireEvent.click(radios[0]!)
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })

  it('as teclas A a F escolhem direto quando o foco está no cartão; uma letra que não é opção, ou com Ctrl, não faz nada', async () => {
    const onAnswer = vi.fn((_ask: PersonaAskUi, _ids: readonly string[]) => Promise.resolve())
    render(<PersonaChoiceCard t={t} ask={ask()} onAnswer={onAnswer} />)
    const first = screen.getAllByRole('radio')[0]!
    first.focus()
    fireEvent.keyDown(first, { key: 'f' })
    fireEvent.keyDown(first, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(first, { key: 'x' })
    expect(onAnswer).not.toHaveBeenCalled()
    fireEvent.keyDown(first, { key: 'C' })
    await waitFor(() => { expect(onAnswer).toHaveBeenCalledTimes(1) })
    expect(onAnswer.mock.calls[0]?.[1]).toEqual(['c'])
  })

  it('as setas movem o foco entre as opções (uma só parada de Tab) e Enter confirma a focada', async () => {
    const onAnswer = vi.fn((_ask: PersonaAskUi, _ids: readonly string[]) => Promise.resolve())
    render(<PersonaChoiceCard t={t} ask={ask()} onAnswer={onAnswer} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map(radio => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    radios[0]!.focus()
    fireEvent.keyDown(radios[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(radios[1])
    fireEvent.keyDown(radios[1]!, { key: 'End' })
    expect(document.activeElement).toBe(radios[2])
    fireEvent.keyDown(radios[2]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(radios[0])
    fireEvent.click(radios[0]!) // Enter num botão é o clique dele
    await waitFor(() => { expect(onAnswer).toHaveBeenCalledTimes(1) })
    expect(onAnswer.mock.calls[0]?.[1]).toEqual(['a'])
  })

  it('já respondido no host: só leitura com a hora, a escolhida marcada e nenhum controle ativo', () => {
    const live = mapPersonaAskLive({ status: 'answered', answer: { optionIds: ['c'], text: '', answeredAt: '2026-11-11T17:32:00.000Z' } })
    render(<PersonaChoiceCard t={t} ask={ask()} live={live} onAnswer={vi.fn()} />)
    expect(screen.getByText(/Você escolheu C · \d\d:\d\d/u)).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios.map(radio => radio.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    expect(radios.every(radio => radio.getAttribute('tabindex') === '-1')).toBe(true)
    expect(radios[2]?.querySelector('svg')?.parentElement?.getAttribute('data-fresh')).toBeNull()
    expect(screen.queryByText(/Sem pressa/u)).toBeNull()
  })

  it('sem onAnswer não há controle morto: o cartão é só leitura e nenhuma tecla o dispara', () => {
    render(<PersonaChoiceCard t={t} ask={ask()} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.every(radio => radio.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(screen.queryByText('ou escreva do seu jeito na caixa abaixo')).toBeNull()
  })

  it('falha de envio: "Não enviado · Tentar de novo", e tentar de novo manda a mesma opção', async () => {
    const onAnswer = vi.fn((_ask: PersonaAskUi, _ids: readonly string[]): Promise<void> => Promise.reject(new Error('sem rede')))
    render(<PersonaChoiceCard t={t} ask={ask()} onAnswer={onAnswer} />)
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    await waitFor(() => { expect(screen.getByRole('status').textContent).toContain('Não enviado') })
    onAnswer.mockImplementationOnce(() => Promise.resolve())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/u })) })
    await waitFor(() => { expect(screen.getByText(/Você escolheu B/u)).toBeTruthy() })
    expect(onAnswer).toHaveBeenCalledTimes(2)
    expect(onAnswer.mock.calls[1]?.[1]).toEqual(['b'])
  })

  it('com as palavras da persona logo acima, o cartão entra sem repetir o rosto e o nome', () => {
    const { container } = render(<PersonaChoiceCard t={t} ask={ask()} continued onAnswer={vi.fn()} />)
    expect(screen.queryByText('Bia')).toBeNull()
    expect(container.querySelector('img, svg[role="img"]')).toBeNull()
    const alone = render(<PersonaChoiceCard t={t} ask={ask()} onAnswer={vi.fn()} />)
    expect(alone.getByText('Bia')).toBeTruthy()
  })
})

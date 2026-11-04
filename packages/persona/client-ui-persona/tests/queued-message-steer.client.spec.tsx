// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const shellT = ((key: string) => shellPt[key as keyof typeof shellPt] ?? key) as never

type State = 'working' | 'resting'
const atlas = (state: State) => ({ id: 'atlas' as const, name: 'Atlas', role: 'Coordenação', state, systemRoles: ['coordination' as const] })

// A fila local agora é guardada por conversa em localStorage (sobrevive a recarregar): cada teste começa sem fila guardada.
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

function setup(state: State = 'working') {
  const onSendMessage = vi.fn()
  const view = (s: State) => (
    <GeneralChannelView t={t} shellT={shellT} members={[atlas(s)]} messages={[]} onSendMessage={onSendMessage} />
  )
  const utils = render(view(state))
  return { onSendMessage, rerenderState: (s: State) => { utils.rerender(view(s)) } }
}

function typeAndSend(text: string): void {
  const field = screen.getByRole('textbox')
  fireEvent.change(field, { target: { value: text } })
  fireEvent.submit(field.closest('form') as HTMLFormElement)
}

describe('balão da fila (UX-PHASE §6)', () => {
  it('com a persona trabalhando, "na fila" guarda a mensagem em vez de enviar', () => {
    const { onSendMessage } = setup()
    typeAndSend('Prioriza o contrato novo')
    expect(onSendMessage).not.toHaveBeenCalled()
    const bubble = screen.getByLabelText('Na fila: Prioriza o contrato novo')
    expect(bubble).toBeTruthy()
    expect(screen.getByText('Na fila · sai quando Atlas terminar o passo atual')).toBeTruthy()
    // as 3 ações são botões reais, com nome próprio (teclado: Tab + Enter/Espaço)
    expect(screen.getByRole('button', { name: 'Mandar agora a mensagem na fila' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar a mensagem na fila' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tirar a mensagem da fila' })).toBeTruthy()
    // a região live anuncia a entrada na fila
    expect(screen.getByText('Mensagem na fila', { selector: '[role="status"]' })).toBeTruthy()
  })

  it('persona livre: enviar é enviar (nenhum balão)', () => {
    const { onSendMessage } = setup('resting')
    typeAndSend('Oi, equipe')
    expect(onSendMessage).toHaveBeenCalledWith('Oi, equipe', [])
    expect(screen.queryByLabelText(/^Na fila:/u)).toBeNull()
  })

  it('"Mandar agora" envia e tira da fila', () => {
    const { onSendMessage } = setup()
    typeAndSend('Muda para o plano B')
    fireEvent.click(screen.getByRole('button', { name: 'Mandar agora a mensagem na fila' }))
    expect(onSendMessage).toHaveBeenCalledWith('Muda para o plano B')
    expect(screen.queryByLabelText(/^Na fila:/u)).toBeNull()
  })

  it('"Editar" devolve o texto ao composer com o chip e "Cancelar"; enviar troca o item original', () => {
    const { onSendMessage, rerenderState } = setup()
    typeAndSend('Versão um')
    fireEvent.click(screen.getByRole('button', { name: 'Editar a mensagem na fila' }))
    const field = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(field.value).toBe('Versão um')
    expect(screen.getByText('Editando mensagem na fila')).toBeTruthy()

    fireEvent.change(field, { target: { value: 'Versão dois' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)
    expect(screen.queryByLabelText('Na fila: Versão um')).toBeNull()
    expect(screen.getByLabelText('Na fila: Versão dois')).toBeTruthy()
    expect(screen.queryByText('Editando mensagem na fila')).toBeNull()
    expect(onSendMessage).not.toHaveBeenCalled()

    // quando a persona termina o passo, a fila sai sozinha, uma vez
    rerenderState('resting')
    expect(onSendMessage).toHaveBeenCalledTimes(1)
    expect(onSendMessage).toHaveBeenCalledWith('Versão dois')
    expect(screen.queryByLabelText(/^Na fila:/u)).toBeNull()
  })

  it('"Cancelar" a edição esvazia o campo e mantém a mensagem na fila', () => {
    setup()
    typeAndSend('Não mexe')
    fireEvent.click(screen.getByRole('button', { name: 'Editar a mensagem na fila' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
    expect(screen.getByLabelText('Na fila: Não mexe')).toBeTruthy()
  })

  it('"Tirar" remove com aviso "Desfazer" por 6 s; Desfazer devolve à fila', async () => {
    const { onSendMessage } = setup()
    typeAndSend('Cancela isso')
    fireEvent.click(screen.getByRole('button', { name: 'Tirar a mensagem da fila' }))
    expect(screen.queryByLabelText(/^Na fila:/u)).toBeNull()
    expect(screen.getByText('Mensagem tirada da fila')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByLabelText('Na fila: Cancela isso')).toBeTruthy()
    expect(screen.queryByText('Mensagem tirada da fila')).toBeNull()
    expect(onSendMessage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Tirar a mensagem da fila' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(6_100) })
    expect(screen.queryByText('Mensagem tirada da fila')).toBeNull()
    expect(screen.queryByLabelText(/^Na fila:/u)).toBeNull()
  })

  it('com 2+ itens, só "Mandar agora" fica inline e Editar/Tirar vão para o menu ⋯', () => {
    setup()
    typeAndSend('Primeira')
    typeAndSend('Segunda')
    expect(screen.getAllByRole('button', { name: 'Mandar agora a mensagem na fila' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Editar a mensagem na fila' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /Na fila · sai quando Atlas terminar o passo atual/u }).length).toBeGreaterThanOrEqual(2)
  })
})

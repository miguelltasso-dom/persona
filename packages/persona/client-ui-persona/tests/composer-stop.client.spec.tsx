// @vitest-environment jsdom
// FL-11 / IV-5 (Muse): o botão de enviar vira PARAR (Button secondary, ícone close, Tooltip "Parar" + Esc, aria-label "Parar a resposta de
// {persona}") com o campo vazio; Esc no campo vazio também para; o foco volta ao campo; "{persona} parou." é dito ao leitor de tela.
// "Direcionar agora" chama o host (onSteer) só sem anexos; sem `stop`/`onSteer` nada muda.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer, type ChannelComposerProps } from '../src/client/chat/ChannelComposer.tsx'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import type { HostTurnControls } from '../src/client/chat/host-turn.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('persona.hint.whoResponds', '1')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

const NINA_WORKING: ChannelPersonaMember = { id: 'nina' as never, name: 'Nina', role: 'Design', state: 'working' }
const NINA_IDLE: ChannelPersonaMember = { ...NINA_WORKING, state: 'resting' }
const field = (): HTMLTextAreaElement => screen.getByPlaceholderText(/Mensagem|Escreva/u) as HTMLTextAreaElement
const stopButton = (): HTMLElement | null => document.querySelector('[data-persona-composer-stop]')

function composer(props: Partial<ChannelComposerProps> = {}) {
  const onSend = vi.fn()
  const onStop = vi.fn()
  const onSteer = vi.fn()
  const onQueueMessage = vi.fn()
  render(<ChannelComposer t={t as never} members={[NINA_WORKING]} onSend={onSend} onQueueMessage={onQueueMessage} onSteer={onSteer} stop={{ onStop, personaName: 'Nina' }} {...props} />)
  return { onSend, onStop, onSteer, onQueueMessage }
}

describe('o botão Parar', () => {
  it('com o campo vazio, o Enviar vira Parar com o nome acessível da persona', () => {
    composer()
    const stop = stopButton() as HTMLElement
    expect(stop).toBeTruthy()
    expect(stop.getAttribute('aria-label')).toBe('Parar a resposta de Nina')
    expect(screen.queryByRole('button', { name: chatPt['composer.send'] })).toBeNull()
    expect(screen.queryByRole('button', { name: chatPt['composer.sendQueue'] })).toBeNull()
  })

  it('MUSE 03:26: o rótulo "Parar" é VISÍVEL (não só o ✕) e o botão tem o ícone', () => {
    composer()
    const stop = stopButton() as HTMLElement
    expect(stop.textContent).toBe('Parar')
    expect(stop.querySelector('svg')).not.toBeNull()
  })

  it('o Tooltip diz "Parar" com a tecla Esc', () => {
    vi.useFakeTimers()
    composer()
    fireEvent.focus(stopButton() as HTMLElement)
    act(() => { vi.advanceTimersByTime(450) })
    const tip = document.querySelector('[role="tooltip"]') as HTMLElement
    expect(tip.textContent).toContain('Parar')
    expect(tip.querySelector('kbd')?.textContent).toBe('Esc')
  })

  it('clicar para, e o foco volta ao campo', () => {
    const { onStop, onSend } = composer()
    fireEvent.click(stopButton() as HTMLElement)
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(field())
  })

  it('Esc no campo vazio também para', () => {
    const { onStop } = composer()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('Enter no campo vazio NÃO para nem envia (parar é um gesto de propósito)', () => {
    const { onStop, onSend, onQueueMessage } = composer()
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onStop).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
    expect(onQueueMessage).not.toHaveBeenCalled()
  })

  it('quem já escreveu algo ainda envia/enfileira: o botão volta a ser o de enviar e Esc não para', () => {
    const { onStop } = composer()
    fireEvent.change(field(), { target: { value: 'Depois mande o resumo' } })
    expect(stopButton()).toBeNull()
    expect(screen.getByRole('button', { name: chatPt['composer.sendQueue'] })).toBeTruthy()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(onStop).not.toHaveBeenCalled()
  })

  it('apagou o texto: o Parar volta', () => {
    composer()
    fireEvent.change(field(), { target: { value: 'x' } })
    expect(stopButton()).toBeNull()
    fireEvent.change(field(), { target: { value: '' } })
    expect(stopButton()).not.toBeNull()
  })

  it('sem `stop` o botão é sempre o de enviar (nada muda com a flag desligada)', () => {
    composer({ stop: undefined })
    expect(stopButton()).toBeNull()
    expect(screen.getByRole('button', { name: chatPt['composer.sendQueue'] })).toBeTruthy()
  })
})

describe('Direcionar agora', () => {
  it('Ctrl+Enter com a persona trabalhando chama o host (onSteer), não envia nem enfileira', () => {
    const { onSteer, onSend, onQueueMessage } = composer()
    fireEvent.change(field(), { target: { value: 'Corrija o rumo' } })
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true })
    expect(onSteer).toHaveBeenCalledWith('Corrija o rumo', { id: 'nina', name: 'Nina' })
    expect(onSend).not.toHaveBeenCalled()
    expect(onQueueMessage).not.toHaveBeenCalled()
    expect(field().value).toBe('')
  })

  it('Enter comum continua indo para a fila', () => {
    const { onSteer, onQueueMessage } = composer()
    fireEvent.change(field(), { target: { value: 'Depois' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onQueueMessage).toHaveBeenCalledTimes(1)
    expect(onSteer).not.toHaveBeenCalled()
  })

  it('sem `onSteer` (flag desligada) direcionar é enviar, como era', () => {
    const { onSend } = composer({ onSteer: undefined, stop: undefined })
    fireEvent.change(field(), { target: { value: 'Corrija o rumo' } })
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true })
    expect(onSend).toHaveBeenCalledWith('Corrija o rumo', [])
  })

  it('persona ociosa: o envio é normal (onSend), nunca onSteer', () => {
    const { onSteer, onSend } = composer({ members: [NINA_IDLE], stop: undefined })
    fireEvent.change(field(), { target: { value: 'Oi' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('Oi', [])
    expect(onSteer).not.toHaveBeenCalled()
  })
})

describe('MUSE 03:26: "respondendo" é só quem de fato responde a esta conversa', () => {
  const sendButton = (): HTMLElement | null => document.querySelector('button[type="submit"]')
  const modeToggle = (): HTMLElement | null => document.querySelector('[data-persona-composer-mode]')

  it('responding={false} com a persona "working" numa Tarefa: Enviar (a seta), dica de sempre, sem relógio; Enter envia e não enfileira', () => {
    const { onSend, onQueueMessage } = composer({ stop: undefined, responding: false })
    expect(stopButton()).toBeNull()
    expect(modeToggle()).toBeNull()
    expect(screen.queryByText(chatPt['composer.hintQueue'])).toBeNull()
    expect(sendButton()?.getAttribute('data-mode')).toBeNull()
    expect(sendButton()?.getAttribute('aria-label')).toBe(chatPt['composer.send'])
    fireEvent.change(field(), { target: { value: 'Oi' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('Oi', [])
    expect(onQueueMessage).not.toHaveBeenCalled()
  })

  it('responding={true}: a dica de fila, o relógio de modo (com tooltip) e o Enviar em modo fila', () => {
    vi.useFakeTimers()
    const { onQueueMessage } = composer({ stop: undefined, responding: true })
    expect(screen.getByText(chatPt['composer.hintQueue'])).toBeTruthy()
    expect(sendButton()?.getAttribute('data-mode')).toBe('queue')
    const toggle = modeToggle() as HTMLElement
    fireEvent.focus(toggle)
    act(() => { vi.advanceTimersByTime(450) })
    expect((document.querySelector('[role="tooltip"]') as HTMLElement).textContent).toBe(chatPt['composer.modeSteer'])
    fireEvent.change(field(), { target: { value: 'Depois' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onQueueMessage).toHaveBeenCalledTimes(1)
  })

  it('sem a prop (controle de trabalho desligado): vale o estado "working" da persona, como antes', () => {
    composer({ stop: undefined })
    expect(screen.getByText(chatPt['composer.hintQueue'])).toBeTruthy()
    expect(modeToggle()).not.toBeNull()
  })
})

describe('no #geral (GeneralChannelView + turnControls)', () => {
  function controls(over: Partial<HostTurnControls> = {}) {
    const stop = vi.fn()
    const steer = vi.fn()
    const value: HostTurnControls = { stoppable: { personaName: 'Nina' }, stop, steer, stoppedPersona: null, error: null, clearError: vi.fn(), ...over }
    return { value, stop, steer }
  }
  const view = (turnControls: HostTurnControls | undefined, extra: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) => (
    <GeneralChannelView
      t={t as never}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[NINA_WORKING]}
      messages={[]}
      onSendMessage={vi.fn()}
      {...(turnControls === undefined ? {} : { turnControls })}
      {...extra}
    />
  )

  it('com algo a parar, o composer mostra o Parar e ele chama o host', () => {
    const { value, stop } = controls()
    render(view(value))
    fireEvent.click(stopButton() as HTMLElement)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('nada a parar (stoppable null): o botão é o de enviar', () => {
    const { value } = controls({ stoppable: null })
    render(view(value))
    expect(stopButton()).toBeNull()
  })

  it('MUSE 03:26: com o controle ligado e a Nina trabalhando numa Tarefa (ninguém respondendo): sem ✕, sem relógio, sem dica de fila; Enter envia', () => {
    const { value } = controls({ stoppable: null })
    const onSendMessage = vi.fn()
    render(view(value, { onSendMessage, messages: [{ id: 'm9', authorId: 'nina', authorName: 'Nina', body: 'Terminei o relatório.', timeLabel: '09:00', reactions: [] }] }))
    expect(stopButton()).toBeNull()
    expect(document.querySelector('[data-persona-composer-mode]')).toBeNull()
    expect(screen.queryByText(chatPt['composer.hintQueue'])).toBeNull()
    expect(document.querySelector('button[type="submit"]')?.getAttribute('aria-label')).toBe(chatPt['composer.send'])
    fireEvent.change(field(), { target: { value: 'Valeu!' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSendMessage).toHaveBeenCalled()
  })

  it('o leitor de tela ouve "{persona} parou." quando o host parou', () => {
    const { value } = controls({ stoppedPersona: 'Nina' })
    render(view(value))
    expect(screen.getByText('Nina parou.')).toBeTruthy()
  })

  it('o erro do host no Parar/Direcionar aparece com o texto dele e some em 6 s', () => {
    vi.useFakeTimers()
    const clearError = vi.fn()
    const { value } = controls({ error: 'Só quem escreve pode parar.', clearError })
    render(view(value))
    expect(screen.getByText('Só quem escreve pode parar.')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(6_100) })
    expect(clearError).toHaveBeenCalledTimes(1)
  })

  it('direcionar pelo composer chama turnControls.steer', () => {
    const { value, steer } = controls()
    render(view(value))
    fireEvent.change(field(), { target: { value: 'Corrija o rumo' } })
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true })
    expect(steer).toHaveBeenCalledWith('Corrija o rumo', { id: 'nina', name: 'Nina' })
  })

  it('sem turnControls: nada de Parar', () => {
    render(view(undefined))
    expect(stopButton()).toBeNull()
  })
})

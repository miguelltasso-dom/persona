// @vitest-environment jsdom
// FL-11, ponte da DM (atrás de `persona.flag.workingControl`): a DM usa a MESMA fila do host do canal. Com a persona trabalhando, enviar vai para a
// fila (balão tracejado), "Mandar agora"/Editar/Tirar/Desfazer chamam o host, o Enviar vira Parar, Ctrl+Enter direciona, e "{persona} está escrevendo…"
// aparece. A persona da conversa é o único "responder": nada de seletor "Quem responde" nem `@nome` na DM. Sem a flag, a DM é a de sempre.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectMessagesView, type DmRowUi } from '../src/client/chat/DirectMessagesView.tsx'
import type { HostQueueControls } from '../src/client/chat/host-queue.ts'
import type { HostTurnControls } from '../src/client/chat/host-turn.ts'
import type { QueuedMessageItem } from '../src/client/chat/QueuedMessageBubble.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'

HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear() })

const t = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never
const NINA_WORKING: DmRowUi = { id: 'dm-nina', peerId: 'nina', peerName: 'Nina', characterId: 'nina', role: 'Pesquisa', state: 'working' }
const NINA_IDLE: DmRowUi = { ...NINA_WORKING, state: 'resting' }
const ask: ChannelMessageUi = { id: 'm1', authorId: 'user', authorName: 'Ana', body: 'Explique o plano', timeLabel: '10:00', reactions: [] }
const item = (id: string, text: string): QueuedMessageItem => ({ id, text, targetPersonaName: 'Nina', targetPersonaId: 'nina' })

function queue(over: Partial<HostQueueControls> = {}) {
  const value = { items: [], error: null, removed: null, clearError: vi.fn(), dismissRemoved: vi.fn(), enqueue: vi.fn(), sendNow: vi.fn(), submitEdit: vi.fn(), drop: vi.fn(), undoDrop: vi.fn(), ...over }
  return value as HostQueueControls & Record<'enqueue' | 'sendNow' | 'submitEdit' | 'drop' | 'undoDrop' | 'dismissRemoved' | 'clearError', ReturnType<typeof vi.fn>>
}
function turn(over: Partial<HostTurnControls> = {}) {
  const value = { stoppable: null, stop: vi.fn(), steer: vi.fn(), stoppedPersona: null, error: null, clearError: vi.fn(), ...over }
  return value as HostTurnControls & Record<'stop' | 'steer' | 'clearError', ReturnType<typeof vi.fn>>
}

function dm(row: DmRowUi, extra: Partial<React.ComponentProps<typeof DirectMessagesView>> = {}) {
  const onSend = vi.fn()
  const view = (more: Partial<React.ComponentProps<typeof DirectMessagesView>> = {}) => (
    <DirectMessagesView t={t} shellT={shellTranslate} loading={false} dms={[row]} selectedId="dm-nina" messages={[ask]} onSelect={() => undefined} onSend={onSend} {...extra} {...more} />
  )
  const rendered = render(view())
  return { ...rendered, view, onSend }
}

const field = (): HTMLTextAreaElement => screen.getByPlaceholderText('Mensagem para Nina…') as HTMLTextAreaElement
const press = (text: string, init: Record<string, unknown> = {}): void => {
  fireEvent.change(field(), { target: { value: text } })
  fireEvent.keyDown(field(), { key: 'Enter', ...init })
}
const stopButton = (): HTMLElement | null => document.querySelector('[data-persona-composer-stop]')

describe('sem a flag (nenhuma prop do host): a DM é a de sempre', () => {
  it('o composer não tem seletor "Quem responde", Parar nem fila: enviar é enviar', () => {
    const { onSend } = dm(NINA_WORKING)
    expect(document.querySelector('[data-persona-composer-responder]')).toBeNull()
    expect(stopButton()).toBeNull()
    expect(document.querySelector('[data-persona-typing]')).toBeNull()
    press('Oi, Nina')
    expect(onSend).toHaveBeenCalledWith('Oi, Nina', [])
  })
})

describe('a fila do host na DM', () => {
  it('persona trabalhando: enviar vai para a fila do host (não para o envio direto), com a persona da conversa', () => {
    const hostQueue = queue()
    const { onSend } = dm(NINA_WORKING, { hostQueue })
    press('Depois mande o resumo')
    expect(hostQueue.enqueue).toHaveBeenCalledWith('Depois mande o resumo', { id: 'nina', name: 'Nina' })
    expect(onSend).not.toHaveBeenCalled()
    expect(field().value).toBe('')
  })

  it('persona ociosa: enviar é enviar (nada fica na fila à toa)', () => {
    const hostQueue = queue()
    const { onSend } = dm(NINA_IDLE, { hostQueue })
    press('Oi')
    expect(onSend).toHaveBeenCalledWith('Oi', [])
    expect(hostQueue.enqueue).not.toHaveBeenCalled()
  })

  it('o seletor "Quem responde" e o @nome NÃO existem na DM, nem com a flag do CV-3', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    dm(NINA_WORKING, { hostQueue: queue() })
    expect(document.querySelector('[data-persona-composer-responder]')).toBeNull()
    fireEvent.change(field(), { target: { value: '@ni' } })
    field().setSelectionRange(3, 3)
    fireEvent.select(field())
    expect(document.querySelector('[data-persona-mention-menu]')).toBeNull()
  })

  it('desenha os balões tracejados do host e "Mandar agora" / "Tirar" chamam o host', () => {
    const hostQueue = queue({ items: [item('q1', 'Urgente'), item('q2', 'Pode esperar')] })
    dm(NINA_WORKING, { hostQueue })
    expect([...document.querySelectorAll('[data-persona-queued-message]')].map(node => node.textContent)).toEqual([
      expect.stringContaining('Urgente'), expect.stringContaining('Pode esperar'),
    ])
    fireEvent.click(screen.getAllByRole('button', { name: chatPt['composer.steer.sendNowLabel'] })[0] as HTMLElement)
    expect(hostQueue.sendNow).toHaveBeenCalledWith('q1')
  })

  it('com um balão só, "Tirar" fica à vista e chama o host', () => {
    const hostQueue = queue({ items: [item('q1', 'Esqueça isso')] })
    dm(NINA_WORKING, { hostQueue })
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.removeLabel'] }))
    expect(hostQueue.drop).toHaveBeenCalledWith('q1')
  })

  it('"Editar" leva o texto ao campo e enviar TROCA o texto do balão no host', () => {
    const hostQueue = queue({ items: [item('q1', 'Texto velho')] })
    const { onSend } = dm(NINA_WORKING, { hostQueue })
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.editLabel'] }))
    expect(field().value).toBe('Texto velho')
    press('Texto novo')
    expect(hostQueue.submitEdit).toHaveBeenCalledWith('q1', 'Texto novo')
    expect(hostQueue.enqueue).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('editar com a persona já ociosa também troca o texto (nunca vira mensagem nova)', () => {
    const hostQueue = queue({ items: [item('q1', 'Texto velho')] })
    const { onSend } = dm(NINA_IDLE, { hostQueue })
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.editLabel'] }))
    press('Texto novo')
    expect(hostQueue.submitEdit).toHaveBeenCalledWith('q1', 'Texto novo')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('o balão tirado mostra "Mensagem tirada da fila · Desfazer" e some sozinho em 6 s', () => {
    vi.useFakeTimers()
    const hostQueue = queue({ removed: item('q1', 'Esqueça isso') })
    dm(NINA_WORKING, { hostQueue })
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.undoRemove'] }))
    expect(hostQueue.undoDrop).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(6_100) })
    expect(hostQueue.dismissRemoved).toHaveBeenCalledTimes(1)
  })

  it('o erro do host aparece com o texto dele e some em 6 s', () => {
    vi.useFakeTimers()
    const hostQueue = queue({ error: 'Essa mensagem já saiu da fila.' })
    dm(NINA_WORKING, { hostQueue })
    expect(screen.getByText('Essa mensagem já saiu da fila.')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(6_100) })
    expect(hostQueue.clearError).toHaveBeenCalledTimes(1)
  })
})

describe('Parar, Direcionar e "está escrevendo…" na DM', () => {
  it('com algo a parar o Enviar vira Parar, e clicar chama o host', () => {
    const turnControls = turn({ stoppable: { personaName: 'Nina' } })
    dm(NINA_WORKING, { turnControls })
    expect(stopButton()?.getAttribute('aria-label')).toBe('Parar a resposta de Nina')
    fireEvent.click(stopButton() as HTMLElement)
    expect(turnControls.stop).toHaveBeenCalledTimes(1)
  })

  it('Esc no campo vazio também para', () => {
    const turnControls = turn({ stoppable: { personaName: 'Nina' } })
    dm(NINA_WORKING, { turnControls })
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(turnControls.stop).toHaveBeenCalledTimes(1)
  })

  it('MUSE 03:26: a persona trabalha numa Tarefa mas NÃO responde a esta conversa: nada a parar, Enviar é enviar (sem fila, sem relógio, sem dica de fila)', () => {
    const turnControls = turn({ stoppable: null })
    const hostQueue = queue()
    const { onSend } = dm(NINA_WORKING, { turnControls, hostQueue })
    expect(stopButton()).toBeNull()
    expect(document.querySelector('[data-persona-composer-mode]')).toBeNull()
    expect(screen.queryByText(chatPt['composer.hintQueue'])).toBeNull()
    press('Como está indo?')
    expect(onSend).toHaveBeenCalledWith('Como está indo?', [])
    expect(hostQueue.enqueue).not.toHaveBeenCalled()
  })

  it('Ctrl+Enter direciona pelo host (não enfileira nem envia)', () => {
    const turnControls = turn({ stoppable: { personaName: 'Nina' } })
    const hostQueue = queue()
    const { onSend } = dm(NINA_WORKING, { turnControls, hostQueue })
    press('Corrija o rumo', { ctrlKey: true })
    expect(turnControls.steer).toHaveBeenCalledWith('Corrija o rumo', { id: 'nina', name: 'Nina' })
    expect(hostQueue.enqueue).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
  })

  it('"Nina parou." é dito ao leitor de tela', () => {
    dm(NINA_WORKING, { turnControls: turn({ stoppedPersona: 'Nina' }) })
    expect(screen.getByText('Nina parou.')).toBeTruthy()
  })

  it('o erro do Parar/Direcionar aparece com o texto do host', () => {
    dm(NINA_WORKING, { turnControls: turn({ error: 'Só quem escreve pode parar.' }) })
    expect(screen.getByText('Só quem escreve pode parar.')).toBeTruthy()
  })

  it('"Nina está escrevendo" quando o último é da pessoa e ela trabalha; sai quando a resposta começa a crescer', () => {
    const turnControls = turn()
    const { rerender, view } = dm(NINA_WORKING, { turnControls })
    expect(screen.getByText(/Nina está escrevendo/u)).toBeTruthy()
    rerender(view({ messages: [ask, { id: 'coord-m1-reply', authorId: 'nina', authorName: 'Nina', body: 'Vou explicar', timeLabel: '10:01', reactions: [], streaming: true }] }))
    expect(document.querySelector('[data-persona-typing]')).toBeNull()
  })

  it('persona ociosa: ninguém escreve', () => {
    dm(NINA_IDLE, { turnControls: turn() })
    expect(document.querySelector('[data-persona-typing]')).toBeNull()
  })
})

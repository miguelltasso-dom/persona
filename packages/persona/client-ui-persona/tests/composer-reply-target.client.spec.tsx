// @vitest-environment jsdom
// IV-10 (Ember): "Responder" a uma pergunta da persona. O composer mostra o chip (label já composto), o ✕ chama onClear SEM apagar o texto, e com `onSendReply` o Enviar
// chama a resposta (answerAttention) em vez do postMessage / fila / direcionar / fan-out. Rejeitou = o texto volta ao campo. Sem as props nada muda.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer, type ChannelComposerProps } from '../src/client/chat/ChannelComposer.tsx'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => { localStorage.clear(); localStorage.setItem('persona.hint.whoResponds', '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const NINA: ChannelPersonaMember = { id: 'nina' as never, name: 'Nina', role: 'Design', state: 'working' }
const field = (): HTMLTextAreaElement => screen.getByPlaceholderText(/Mensagem|Escreva/u) as HTMLTextAreaElement
const chip = (): HTMLElement | null => document.querySelector('[data-persona-reply-target]')
const LABEL = 'Respondendo a Nina: Prefere A ou B?'

function composer(props: Partial<ChannelComposerProps> = {}) {
  const onSend = vi.fn()
  const onQueueMessage = vi.fn()
  const onSteer = vi.fn()
  const onClear = vi.fn()
  const onSendReply = vi.fn(() => Promise.resolve())
  render(<ChannelComposer
    t={t as never}
    members={[NINA]}
    onSend={onSend}
    onQueueMessage={onQueueMessage}
    onSteer={onSteer}
    replyTarget={{ id: 'ticket-1', label: LABEL, onClear }}
    onSendReply={onSendReply}
    {...props}
  />)
  return { onSend, onQueueMessage, onSteer, onClear, onSendReply }
}

describe('o chip "Respondendo a…"', () => {
  it('aparece acima da caixa com o label que quem chama compôs', () => {
    composer()
    expect(chip()?.textContent).toContain(LABEL)
    expect(chip()?.getAttribute('data-persona-reply-target')).toBe('ticket-1')
  })

  it('✕ chama onClear e NÃO apaga o texto que a pessoa já escreveu', () => {
    const { onClear } = composer()
    fireEvent.change(field(), { target: { value: 'Prefiro a B, por causa do prazo' } })
    fireEvent.click(chip()?.querySelector('button') as HTMLElement)
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(field().value).toBe('Prefiro a B, por causa do prazo')
  })

  it('sem replyTarget não há chip', () => {
    composer({ replyTarget: undefined, onSendReply: undefined })
    expect(chip()).toBeNull()
  })
})

describe('enviar a resposta', () => {
  it('o Enviar chama onSendReply (texto e anexos), não o envio comum, a fila nem o direcionar', () => {
    const { onSend, onQueueMessage, onSteer, onSendReply } = composer()
    fireEvent.change(field(), { target: { value: 'Prefiro a B' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSendReply).toHaveBeenCalledWith('Prefiro a B', [])
    expect(onSend).not.toHaveBeenCalled()
    expect(onQueueMessage).not.toHaveBeenCalled()
    expect(onSteer).not.toHaveBeenCalled()
  })

  it('Ctrl+Enter (direcionar) também vai para a resposta: ela não é uma mensagem nova para a persona', () => {
    const { onSendReply, onSteer } = composer()
    fireEvent.change(field(), { target: { value: 'Prefiro a B' } })
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true })
    expect(onSendReply).toHaveBeenCalledTimes(1)
    expect(onSteer).not.toHaveBeenCalled()
  })

  it('depois de enviar: o campo esvazia, o chip é desligado (onClear) e o foco volta ao campo', () => {
    const { onClear } = composer()
    fireEvent.change(field(), { target: { value: 'Prefiro a B' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(field().value).toBe('')
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(field())
  })

  it('a promessa REJEITOU: o texto volta ao campo (nada se perde)', async () => {
    const onSendReply = vi.fn(() => Promise.reject(new Error('host fora do ar')))
    composer({ onSendReply })
    fireEvent.change(field(), { target: { value: 'Prefiro a B' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(field().value).toBe('')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(field().value).toBe('Prefiro a B')
  })

  it('rejeitou mas a pessoa já escreveu outra coisa no campo: o que ela escreveu fica', async () => {
    let reject: (reason: Error) => void = () => undefined
    const onSendReply = vi.fn(() => new Promise<void>((_resolve, rej) => { reject = rej }))
    composer({ onSendReply })
    fireEvent.change(field(), { target: { value: 'Prefiro a B' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    fireEvent.change(field(), { target: { value: 'Outra ideia' } })
    await act(async () => { reject(new Error('x')); await Promise.resolve() })
    expect(field().value).toBe('Outra ideia')
  })

  it('só o chip, sem onSendReply: o envio é o de sempre (não há destino novo)', () => {
    const { onSteer, onSend } = composer({ onSendReply: undefined })
    fireEvent.change(field(), { target: { value: 'Oi' } })
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true })
    expect(onSteer).toHaveBeenCalledWith('Oi', { id: 'nina', name: 'Nina' })
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('repassado pelo canal e pela DM', () => {
  it('no #geral', () => {
    const onSendReply = vi.fn(() => Promise.resolve())
    render(<GeneralChannelView
      t={t as never}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[NINA]}
      messages={[]}
      onSendMessage={vi.fn()}
      replyTarget={{ id: 'ticket-1', label: LABEL, onClear: vi.fn() }}
      onSendReply={onSendReply}
    />)
    expect(chip()?.textContent).toContain(LABEL)
    fireEvent.change(field(), { target: { value: 'Prefiro a B' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSendReply).toHaveBeenCalledWith('Prefiro a B', [])
  })

  it('na DM', () => {
    const onSendReply = vi.fn(() => Promise.resolve())
    const onSend = vi.fn()
    const tt = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never
    render(<DirectMessagesView
      t={tt}
      shellT={shellTranslate}
      loading={false}
      dms={[{ id: 'dm-nina', peerId: 'nina', peerName: 'Nina', characterId: 'nina', role: 'Design', state: 'resting' }]}
      selectedId="dm-nina"
      messages={[]}
      onSelect={() => undefined}
      onSend={onSend}
      replyTarget={{ id: 'ticket-1', label: LABEL, onClear: vi.fn() }}
      onSendReply={onSendReply}
    />)
    expect(chip()?.textContent).toContain(LABEL)
    fireEvent.change(screen.getByPlaceholderText('Mensagem para Nina…'), { target: { value: 'Prefiro a B' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Mensagem para Nina…'), { key: 'Enter' })
    expect(onSendReply).toHaveBeenCalledWith('Prefiro a B', [])
    expect(onSend).not.toHaveBeenCalled()
  })
})

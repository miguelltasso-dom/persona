// @vitest-environment jsdom
// P0-19 (ACCOUNT-SWAP-SPEC §3): no limite o composer NUNCA desabilita; a faixa "No limite até {hora}" aparece acima dele; as
// mensagens entram na fila e saem sozinhas quando a cota volta (com o Toast); a fila local sobrevive a recarregar ("Ainda
// na fila") e nunca some calada.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer } from '../src/client/chat/ChannelComposer.tsx'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { nextQueueSeq, readQueuedMessages, writeQueuedMessages } from '../src/client/chat/composer-queue-store.ts'
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

const ATLAS_IDLE: ChannelPersonaMember = { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] }
const ATLAS_WORKING: ChannelPersonaMember = { ...ATLAS_IDLE, state: 'working' }

const field = (): HTMLTextAreaElement => screen.getByPlaceholderText(/Mensagem|Escreva/u) as HTMLTextAreaElement

describe('faixa "No limite" e composer que nunca desabilita', () => {
  function composer(props: Partial<React.ComponentProps<typeof ChannelComposer>> = {}) {
    const onSend = vi.fn()
    const onQueueMessage = vi.fn()
    render(<ChannelComposer t={t as never} members={[ATLAS_IDLE]} onSend={onSend} onQueueMessage={onQueueMessage} quotaBlocked quotaResumeLabel="18:30" {...props} />)
    return { onSend, onQueueMessage }
  }

  it('mostra a faixa com a hora, o spot-limite e o link "Ver uso e limites"', () => {
    const onSeeUsage = vi.fn()
    composer({ onSeeUsage })
    const banner = document.querySelector('[data-persona-limit-banner]') as HTMLElement
    expect(banner.textContent).toContain('No limite até 18:30 · as tarefas esperam na fila.')
    expect(banner.querySelector('img')?.getAttribute('width')).toBe('48')
    fireEvent.click(screen.getByRole('button', { name: 'Ver uso e limites' }))
    expect(onSeeUsage).toHaveBeenCalledTimes(1)
  })

  it('sem hora do host: "No limite por enquanto" (nunca uma hora inventada) e o placeholder normal', () => {
    composer({ quotaResumeLabel: undefined })
    expect(document.querySelector('[data-persona-limit-banner]')?.textContent).toContain('No limite por enquanto')
    expect(document.querySelector('[data-persona-limit-banner]')?.textContent).not.toMatch(/\d{1,2}:\d{2}/u)
    expect(screen.queryByPlaceholderText(/Escreva; sai quando/u)).toBeNull()
  })

  it('o campo e o botão de enviar NÃO ficam desabilitados; o placeholder diz quando a mensagem sai', () => {
    composer()
    expect(field().disabled).toBe(false)
    expect(field().getAttribute('placeholder')).toBe('Escreva; sai quando a cota voltar às 18:30')
    fireEvent.change(field(), { target: { value: 'Monte o cardápio' } })
    const send = screen.getByRole('button', { name: chatPt['composer.sendQueue'] }) as HTMLButtonElement
    expect(send.disabled).toBe(false)
  })

  it('enviar entra NA FILA (marcada "por cota") e não vai ao host agora', () => {
    const { onSend, onQueueMessage } = composer()
    fireEvent.change(field(), { target: { value: 'Monte o cardápio' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onQueueMessage).toHaveBeenCalledWith('Monte o cardápio', { id: 'atlas', name: 'Atlas' }, { heldForQuota: true })
    expect(onSend).not.toHaveBeenCalled()
    expect(field().value).toBe('')
  })

  it('Ctrl+Enter (direcionar) também só entra na fila enquanto a cota está esgotada', () => {
    const { onSend, onQueueMessage } = composer({ members: [ATLAS_WORKING] })
    fireEvent.change(field(), { target: { value: 'Corrija o rumo' } })
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true })
    expect(onQueueMessage).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('"Usar {motor} enquanto isso" só existe quando há outro motor e ação para ele', () => {
    composer()
    expect(screen.queryByRole('button', { name: /Usar .* enquanto isso/u })).toBeNull()
    cleanup()
    const onUse = vi.fn()
    composer({ otherEngine: { name: 'Codex', onUse } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar Codex enquanto isso' }))
    expect(onUse).toHaveBeenCalledTimes(1)
  })

  it('com a cota livre não há faixa e o envio é o de sempre', () => {
    const { onSend, onQueueMessage } = composer({ quotaBlocked: false })
    expect(document.querySelector('[data-persona-limit-banner]')).toBeNull()
    fireEvent.change(field(), { target: { value: 'Oi' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('Oi', [])
    expect(onQueueMessage).not.toHaveBeenCalled()
  })
})

describe('no fio: a fila espera a cota e depois sai com o aviso', () => {
  function channel(props: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) {
    const onSendMessage = vi.fn()
    const view = (extra: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) => (
      <GeneralChannelView
        t={t as never}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[ATLAS_IDLE]}
        messages={[]}
        onSendMessage={onSendMessage}
        quotaBlocked
        quotaResumeLabel="18:30"
        {...props}
        {...extra}
      />
    )
    const rendered = render(view())
    return { ...rendered, view, onSendMessage }
  }

  const type = (text: string): void => {
    fireEvent.change(field(), { target: { value: text } })
    fireEvent.keyDown(field(), { key: 'Enter' })
  }

  it('no limite: o balão tracejado diz "sai quando a cota voltar" e NADA vai ao host', () => {
    const { onSendMessage } = channel()
    type('Monte o cardápio da semana')
    const bubble = document.querySelector('[data-persona-queued-message]') as HTMLElement
    expect(bubble.textContent).toContain('Monte o cardápio da semana')
    expect(bubble.textContent).toContain('Na fila · sai quando a cota voltar')
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('a cota volta: a mensagem sai sozinha e aparece "A cota voltou · 1 mensagem saiu da fila"', () => {
    const { rerender, view, onSendMessage } = channel()
    type('Monte o cardápio da semana')
    expect(onSendMessage).not.toHaveBeenCalled()
    rerender(view({ quotaBlocked: false }))
    expect(onSendMessage).toHaveBeenCalledWith('Monte o cardápio da semana')
    expect(document.querySelector('[data-persona-queued-message]')).toBeNull()
    expect(screen.getByText('A cota voltou · 1 mensagem saiu da fila')).toBeTruthy()
  })

  it('várias mensagens: o aviso conta quantas saíram', () => {
    const { rerender, view, onSendMessage } = channel()
    type('Primeira')
    type('Segunda')
    rerender(view({ quotaBlocked: false }))
    expect(onSendMessage).toHaveBeenCalledTimes(2)
    expect(screen.getByText('A cota voltou · 2 mensagens saíram da fila')).toBeTruthy()
  })

  it('"Mandar agora" num balão por cota ainda funciona (o host guarda o pedido)', () => {
    const { onSendMessage } = channel()
    type('Urgente')
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.sendNowLabel'] }))
    expect(onSendMessage).toHaveBeenCalledWith('Urgente')
  })
})

describe('a fila local não some calada ao recarregar', () => {
  const mount = (members: readonly ChannelPersonaMember[], onSendMessage = vi.fn(), extra: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) => render(
    <GeneralChannelView
      t={t as never}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={members}
      messages={[]}
      onSendMessage={onSendMessage}
      {...extra}
    />,
  )

  it('persona trabalhando: a mensagem na fila volta como o mesmo balão tracejado, "Ainda na fila"', () => {
    const first = mount([ATLAS_WORKING])
    fireEvent.change(field(), { target: { value: 'Quando terminar, mande o resumo' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(localStorage.getItem('persona.composer.queue.v1:channel:geral')).toContain('Quando terminar, mande o resumo')
    first.unmount()
    mount([ATLAS_WORKING])
    const bubble = document.querySelector('[data-persona-queued-message]') as HTMLElement
    expect(bubble.textContent).toContain('Quando terminar, mande o resumo')
    expect(bubble.textContent).toContain('Ainda na fila')
  })

  it('o que saiu da fila deixa de estar guardado (nada reaparece depois)', () => {
    const first = mount([ATLAS_WORKING])
    fireEvent.change(field(), { target: { value: 'Mande depois' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.sendNowLabel'] }))
    expect(localStorage.getItem('persona.composer.queue.v1:channel:geral')).toBeNull()
    first.unmount()
    mount([ATLAS_WORKING])
    expect(document.querySelector('[data-persona-queued-message]')).toBeNull()
  })

  /** Guarda uma mensagem "por cota" e recarrega (desmonta). */
  function queueByQuotaThenReload(): void {
    const first = mount([ATLAS_IDLE], vi.fn(), { quotaBlocked: true, quotaKnown: true, quotaResumeLabel: '18:30' })
    fireEvent.change(field(), { target: { value: 'Espere a cota' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    first.unmount()
  }

  it('guardada por cota e o host já disse que segue no limite: fica, mesmo depois de muito tempo', () => {
    vi.useFakeTimers()
    queueByQuotaThenReload()
    const onSendMessage = vi.fn()
    mount([ATLAS_IDLE], onSendMessage, { quotaBlocked: true, quotaKnown: true, quotaResumeLabel: '18:30' })
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onSendMessage).not.toHaveBeenCalled()
    expect(document.querySelector('[data-persona-queued-message]')?.textContent).toContain('Espere a cota')
  })

  it('o estado da cota ainda NÃO chegou: espera por ele (não por um tempo fixo) e, quando diz que voltou, sai com o aviso', () => {
    vi.useFakeTimers()
    queueByQuotaThenReload()
    const onSendMessage = vi.fn()
    const { rerender } = mount([ATLAS_IDLE], onSendMessage, { quotaBlocked: false, quotaKnown: false })
    act(() => { vi.advanceTimersByTime(14_000) })
    expect(onSendMessage).not.toHaveBeenCalled()
    rerender(
      <GeneralChannelView
        t={t as never}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[ATLAS_IDLE]}
        messages={[]}
        onSendMessage={onSendMessage}
        quotaBlocked={false}
        quotaKnown
      />,
    )
    expect(onSendMessage).toHaveBeenCalledWith('Espere a cota')
    expect(screen.getByText('A cota voltou · 1 mensagem saiu da fila')).toBeTruthy()
  })

  it('o estado da cota não chega (host mudo): depois de 15 s decide e a mensagem sai', () => {
    vi.useFakeTimers()
    queueByQuotaThenReload()
    const onSendMessage = vi.fn()
    mount([ATLAS_IDLE], onSendMessage, { quotaBlocked: false, quotaKnown: false })
    act(() => { vi.advanceTimersByTime(14_000) })
    expect(onSendMessage).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(onSendMessage).toHaveBeenCalledWith('Espere a cota')
  })

  it('o estado chega dizendo que ainda está no limite: o item fica (conexão lenta nunca manda para conta no limite)', () => {
    vi.useFakeTimers()
    queueByQuotaThenReload()
    const onSendMessage = vi.fn()
    const { rerender } = mount([ATLAS_IDLE], onSendMessage, { quotaBlocked: false, quotaKnown: false })
    act(() => { vi.advanceTimersByTime(2_000) })
    rerender(
      <GeneralChannelView
        t={t as never}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[ATLAS_IDLE]}
        messages={[]}
        onSendMessage={onSendMessage}
        quotaBlocked
        quotaKnown
        quotaResumeLabel="18:30"
      />,
    )
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(onSendMessage).not.toHaveBeenCalled()
    expect(document.querySelector('[data-persona-queued-message]')?.textContent).toContain('Espere a cota')
  })
})

describe('o balão da fila por cota: hora e anexos', () => {
  const FILE = { id: 'att-1', name: 'planilha.xlsx' }
  const QUEUE_KEY = 'persona.composer.queue.v1:channel:geral'

  function channelWithUpload(onSendMessage = vi.fn()) {
    const uploadAttachment = vi.fn((file: File) => Promise.resolve({ id: FILE.id, name: file.name }))
    const element = (extra: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) => (
      <GeneralChannelView
        t={t as never}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[ATLAS_IDLE]}
        messages={[]}
        onSendMessage={onSendMessage}
        uploadAttachment={uploadAttachment}
        quotaBlocked
        quotaKnown
        quotaResumeLabel="18:30"
        {...extra}
      />
    )
    return { ...render(element()), element, onSendMessage }
  }

  async function attachAndQueue() {
    const utils = channelWithUpload()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], FILE.name)] } })
    await screen.findByText(FILE.name)
    fireEvent.change(field(), { target: { value: 'Veja a planilha' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    return utils
  }

  it('com a hora do host o balão diz "Na fila · sai quando a cota voltar às 18:30"', () => {
    render(
      <GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={[ATLAS_IDLE]} messages={[]} onSendMessage={vi.fn()} quotaBlocked quotaKnown quotaResumeLabel="18:30" />,
    )
    fireEvent.change(field(), { target: { value: 'Oi' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(document.querySelector('[data-persona-queued-message]')?.textContent).toContain('Na fila · sai quando a cota voltar às 18:30')
  })

  it('mensagem com anexo entra na fila COM o anexo e sai com ele quando a cota volta', async () => {
    const { rerender, element, onSendMessage } = await attachAndQueue()
    const bubble = document.querySelector('[data-persona-queued-message]') as HTMLElement
    expect(bubble.textContent).toContain('Veja a planilha')
    expect(bubble.textContent).toContain(FILE.name)
    expect(onSendMessage).not.toHaveBeenCalled()
    rerender(element({ quotaBlocked: false }))
    expect(onSendMessage).toHaveBeenCalledWith('Veja a planilha', ['att-1'])
  })

  it('o balão com anexo desta sessão não oferece "Editar" (o texto voltaria ao composer sem o anexo)', async () => {
    await attachAndQueue()
    expect(screen.queryByRole('button', { name: chatPt['composer.steer.editLabel'] })).toBeNull()
    expect(screen.getByRole('button', { name: chatPt['composer.steer.removeLabel'] })).toBeTruthy()
  })

  it('guarda só o NOME do anexo (nunca o id)', async () => {
    await attachAndQueue()
    const stored = localStorage.getItem(QUEUE_KEY) ?? ''
    expect(stored).toContain(FILE.name)
    expect(stored).not.toContain(FILE.id)
  })

  it('depois de recarregar: o balão avisa "O anexo não ficou guardado; anexe de novo" e a fila NÃO o envia calada', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const first = await attachAndQueue()
    first.unmount()
    const onSendMessage = vi.fn()
    render(
      <GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={[ATLAS_IDLE]} messages={[]} onSendMessage={onSendMessage} quotaBlocked={false} quotaKnown />,
    )
    const bubble = document.querySelector('[data-persona-queued-message]') as HTMLElement
    expect(bubble.textContent).toContain('Veja a planilha')
    expect(bubble.textContent).toContain('O anexo não ficou guardado; anexe de novo')
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onSendMessage).not.toHaveBeenCalled()
    // a pessoa decide: Editar devolve o texto ao composer para anexar de novo
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.editLabel'] }))
    expect(onSendMessage).not.toHaveBeenCalled()
  })
})

describe('composer-queue-store', () => {
  it('guarda por conversa, devolve marcado "restored" e apaga a chave quando esvazia', () => {
    writeQueuedMessages('channel:geral', [{ id: 'queued-3', text: 'a', targetPersonaName: 'Atlas', targetPersonaId: 'atlas', heldForQuota: true }])
    expect(readQueuedMessages('channel:geral')).toEqual([{ id: 'queued-3', text: 'a', targetPersonaName: 'Atlas', targetPersonaId: 'atlas', heldForQuota: true, restored: true }])
    expect(readQueuedMessages('channel:outro')).toEqual([])
    writeQueuedMessages('channel:geral', [])
    expect(localStorage.getItem('persona.composer.queue.v1:channel:geral')).toBeNull()
  })

  it('storage bloqueado, cheio ou com lixo: nunca lança e volta vazio', () => {
    localStorage.setItem('persona.composer.queue.v1:x', 'não é json')
    expect(readQueuedMessages('x')).toEqual([])
    localStorage.setItem('persona.composer.queue.v1:y', JSON.stringify([{ id: 1 }, null, { id: 'q', text: 't', targetPersonaName: 'A' }]))
    expect(readQueuedMessages('y').map(item => item.id)).toEqual(['q'])
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cheio', 'QuotaExceededError') })
    expect(() => { writeQueuedMessages('z', [{ id: 'queued-1', text: 't', targetPersonaName: 'A' }]) }).not.toThrow()
    spy.mockRestore()
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqueado', 'SecurityError') })
    expect(readQueuedMessages('z')).toEqual([])
    get.mockRestore()
  })

  it('os ids novos não repetem os dos itens recuperados', () => {
    expect(nextQueueSeq([{ id: 'queued-7', text: '', targetPersonaName: '' }, { id: 'queued-2', text: '', targetPersonaName: '' }])).toBe(7)
    expect(nextQueueSeq([])).toBe(0)
  })
})

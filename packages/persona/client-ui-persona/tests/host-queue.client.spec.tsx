// @vitest-environment jsdom
// FL-11 / P0-18: a fila por item do HOST na tela do #geral (atrás de `persona.flag.workingControl`). A tela só desenha e chama o
// `hostQueue`; aqui se prova: os balões são os do host, enviar/Mandar agora/Tirar/Editar/Desfazer chamam o host (e NÃO a fila local),
// o erro do host aparece com o texto dele, os temporizadores não reiniciam a cada render, e sem `hostQueue` nada muda.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import type { HostQueueControls } from '../src/client/chat/host-queue.ts'
import type { QueuedMessageItem } from '../src/client/chat/QueuedMessageBubble.tsx'
import { WORKING_CONTROL_FLAG_KEY, isWorkingControlEnabled } from '../src/client/chat/working-control-flag.ts'
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
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
})

const ATLAS_WORKING: ChannelPersonaMember = { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'working', systemRoles: ['coordination'] }
const item = (id: string, text: string, over: Partial<QueuedMessageItem> = {}): QueuedMessageItem => ({ id, text, targetPersonaName: 'Atlas', targetPersonaId: 'atlas', ...over })
const field = (): HTMLTextAreaElement => screen.getByPlaceholderText(/Mensagem|Escreva/u) as HTMLTextAreaElement

function controls(over: Partial<HostQueueControls> = {}): HostQueueControls & {
  enqueue: ReturnType<typeof vi.fn>; sendNow: ReturnType<typeof vi.fn>; submitEdit: ReturnType<typeof vi.fn>
  drop: ReturnType<typeof vi.fn>; undoDrop: ReturnType<typeof vi.fn>; dismissRemoved: ReturnType<typeof vi.fn>; clearError: ReturnType<typeof vi.fn>
} {
  return {
    items: [], error: null, removed: null,
    clearError: vi.fn(), dismissRemoved: vi.fn(), enqueue: vi.fn(), sendNow: vi.fn(), submitEdit: vi.fn(), drop: vi.fn(), undoDrop: vi.fn(),
    ...over,
  } as never
}

function channel(hostQueue: HostQueueControls | undefined, extra: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) {
  const onSendMessage = vi.fn()
  const view = (queue: HostQueueControls | undefined, more: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) => (
    <GeneralChannelView
      t={t as never}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[ATLAS_WORKING]}
      messages={[]}
      onSendMessage={onSendMessage}
      {...(queue === undefined ? {} : { hostQueue: queue })}
      {...extra}
      {...more}
    />
  )
  const rendered = render(view(hostQueue))
  return { ...rendered, view, onSendMessage }
}

const press = (text: string): void => {
  fireEvent.change(field(), { target: { value: text } })
  fireEvent.keyDown(field(), { key: 'Enter' })
}

describe('os balões vêm do host', () => {
  it('desenha os balões tracejados que o host guarda, com o nome de quem vai responder', () => {
    channel(controls({ items: [item('q1', 'Depois mande o resumo'), item('q2', 'E avise o time', { targetPersonaName: 'Nina', targetPersonaId: 'nina' })] }))
    const bubbles = [...document.querySelectorAll('[data-persona-queued-message]')]
    expect(bubbles.map(b => b.textContent)).toEqual([
      expect.stringContaining('Depois mande o resumo'),
      expect.stringContaining('E avise o time'),
    ])
    expect(bubbles[1]?.textContent).toContain('Nina')
  })

  it('o balão "por cota" do host diz "sai quando a cota voltar"', () => {
    channel(controls({ items: [item('q1', 'Monte o cardápio', { heldForQuota: true })] }))
    expect(document.querySelector('[data-persona-queued-message]')?.textContent).toContain('Na fila · sai quando a cota voltar')
  })

  it('sem hostQueue (flag desligada) a fila é a local de sempre', () => {
    const { onSendMessage } = channel(undefined)
    press('Mande depois')
    expect(document.querySelector('[data-persona-queued-message]')?.textContent).toContain('Mande depois')
    expect(localStorage.getItem('persona.composer.queue.v1:channel:geral')).toContain('Mande depois')
    expect(onSendMessage).not.toHaveBeenCalled()
  })
})

describe('enfileirar', () => {
  it('persona trabalhando: a mensagem vai ao host (não à fila local nem ao envio direto)', () => {
    const queue = controls()
    const { onSendMessage } = channel(queue)
    press('Quando terminar, mande o resumo')
    expect(queue.enqueue).toHaveBeenCalledWith('Quando terminar, mande o resumo', { id: 'atlas', name: 'Atlas' }, undefined)
    expect(onSendMessage).not.toHaveBeenCalled()
    expect(localStorage.getItem('persona.composer.queue.v1:channel:geral')).toBeNull()
    expect(field().value).toBe('')
  })

  it('no limite de cota: vai ao host com reason "quota"', () => {
    const queue = controls()
    channel(queue, { members: [{ ...ATLAS_WORKING, state: 'resting' }], quotaBlocked: true, quotaKnown: true, quotaResumeLabel: '18:30' })
    press('Monte o cardápio')
    expect(queue.enqueue).toHaveBeenCalledWith('Monte o cardápio', { id: 'atlas', name: 'Atlas' }, 'quota')
  })

  it('a fila local não manda sozinha o que o host guarda (nada é enviado em duplicata)', () => {
    const queue = controls({ items: [item('q1', 'Fica no host')] })
    const { onSendMessage, rerender, view } = channel(queue)
    rerender(view(queue, { members: [{ ...ATLAS_WORKING, state: 'resting' }] }))
    expect(onSendMessage).not.toHaveBeenCalled()
    expect(document.querySelector('[data-persona-queued-message]')?.textContent).toContain('Fica no host')
  })
})

describe('Mandar agora, Tirar, Editar', () => {
  it('"Mandar agora" chama o host só com o id daquele balão', () => {
    const queue = controls({ items: [item('q1', 'Urgente'), item('q2', 'Pode esperar')] })
    const { onSendMessage } = channel(queue)
    fireEvent.click(screen.getAllByRole('button', { name: chatPt['composer.steer.sendNowLabel'] })[0] as HTMLElement)
    expect(queue.sendNow).toHaveBeenCalledWith('q1')
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('"Tirar" chama o host', () => {
    const queue = controls({ items: [item('q1', 'Esqueça isso')] })
    channel(queue)
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.removeLabel'] }))
    expect(queue.drop).toHaveBeenCalledWith('q1')
  })

  it('"Editar" leva o texto ao campo e enviar TROCA o texto do balão (não cria outro nem manda à persona)', () => {
    const queue = controls({ items: [item('q1', 'Texto velho')] })
    const { onSendMessage } = channel(queue)
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.editLabel'] }))
    expect(field().value).toBe('Texto velho')
    press('Texto novo')
    expect(queue.submitEdit).toHaveBeenCalledWith('q1', 'Texto novo')
    expect(queue.enqueue).not.toHaveBeenCalled()
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('editar com a persona ociosa também troca o texto no host (e nunca manda a mensagem editada como nova)', () => {
    const queue = controls({ items: [item('q1', 'Texto velho', { heldForQuota: true })] })
    const { onSendMessage } = channel(queue, { members: [{ ...ATLAS_WORKING, state: 'resting' }], quotaBlocked: false, quotaKnown: true })
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.editLabel'] }))
    press('Texto novo')
    expect(queue.submitEdit).toHaveBeenCalledWith('q1', 'Texto novo')
    expect(onSendMessage).not.toHaveBeenCalled()
  })
})

describe('Desfazer e o erro do host', () => {
  it('o balão tirado mostra "Mensagem tirada da fila" com Desfazer, que chama o host', () => {
    const queue = controls({ removed: item('q1', 'Esqueça isso') })
    channel(queue)
    expect(screen.getByText(chatPt['composer.steer.removedToast'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.steer.undoRemove'] }))
    expect(queue.undoDrop).toHaveBeenCalledTimes(1)
  })

  it('o Toast do Tirar some sozinho em 6 s, e re-renders no meio NÃO reiniciam a contagem', () => {
    vi.useFakeTimers()
    const removed = item('q1', 'Esqueça isso')
    const queue = controls({ removed })
    const { rerender, view } = channel(queue)
    act(() => { vi.advanceTimersByTime(4_000) })
    rerender(view(queue))
    rerender(view(queue))
    act(() => { vi.advanceTimersByTime(1_900) })
    expect(queue.dismissRemoved).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(200) })
    expect(queue.dismissRemoved).toHaveBeenCalledTimes(1)
  })

  it('o erro do host aparece com a MENSAGEM DELE (nada inventado) e some sozinho', () => {
    vi.useFakeTimers()
    const queue = controls({ error: 'Essa mensagem já saiu da fila.' })
    channel(queue)
    expect(screen.getByText('Essa mensagem já saiu da fila.')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(6_100) })
    expect(queue.clearError).toHaveBeenCalledTimes(1)
  })

  it('sem erro nem balão tirado, nenhum aviso aparece', () => {
    channel(controls())
    expect(document.querySelector('[role="status"][aria-label]')).toBeNull()
    expect(screen.queryByText(chatPt['composer.steer.removedToast'])).toBeNull()
  })
})

describe('a flag persona.flag.workingControl', () => {
  it('desligada por padrão', () => {
    expect(isWorkingControlEnabled()).toBe(false)
  })

  it('liga com "1" no localStorage ou com window.__PERSONA_FLAGS__', () => {
    localStorage.setItem(WORKING_CONTROL_FLAG_KEY, '1')
    expect(isWorkingControlEnabled()).toBe(true)
    localStorage.clear()
    ;(window as unknown as { __PERSONA_FLAGS__: unknown }).__PERSONA_FLAGS__ = { workingControl: true }
    expect(isWorkingControlEnabled()).toBe(true)
  })

  it('valor que não é escolha (nem "1"/"true" nem "0"/"false") não liga: vale o padrão, desligado na faixa de testes', () => {
    localStorage.setItem(WORKING_CONTROL_FLAG_KEY, 'talvez')
    expect(isWorkingControlEnabled()).toBe(false)
  })

  it('"true" liga e "false" desliga (o leitor central aceita as duas formas)', () => {
    localStorage.setItem(WORKING_CONTROL_FLAG_KEY, 'true')
    expect(isWorkingControlEnabled()).toBe(true)
    localStorage.setItem(WORKING_CONTROL_FLAG_KEY, 'false')
    expect(isWorkingControlEnabled()).toBe(false)
  })
})

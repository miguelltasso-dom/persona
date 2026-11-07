// @vitest-environment jsdom
// FL-11: migração ÚNICA da fila local (P0-19, localStorage) para o host (atrás de `persona.flag.workingControl`). O que está guardado sem anexo vai ao host
// (com `reason:'quota'` quando era "por cota"), e só sai do armazenamento local DEPOIS que o host aceitou; o que tem anexo fica local; se o host recusar,
// nada se perde (o agendador de sempre cuida). Nada sai em duplicata.
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { readQueuedMessages, writeQueuedMessages } from '../src/client/chat/composer-queue-store.ts'
import type { HostQueueControls } from '../src/client/chat/host-queue.ts'
import type { QueuedMessageItem } from '../src/client/chat/QueuedMessageBubble.tsx'
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

const KEY = 'channel:geral'
beforeEach(() => { localStorage.clear(); localStorage.setItem('persona.hint.whoResponds', '1') })
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear() })

const ATLAS_IDLE: ChannelPersonaMember = { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] }
const local = (id: string, text: string, over: Partial<QueuedMessageItem> = {}): QueuedMessageItem => ({ id, text, targetPersonaName: 'Atlas', targetPersonaId: 'atlas', ...over })

function queue(enqueue: HostQueueControls['enqueue']): HostQueueControls {
  return { items: [], error: null, removed: null, clearError: vi.fn(), dismissRemoved: vi.fn(), enqueue, sendNow: vi.fn(), submitEdit: vi.fn(), drop: vi.fn(), undoDrop: vi.fn() }
}

function mount(hostQueue: HostQueueControls | undefined, props: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) {
  const onSendMessage = vi.fn()
  const element = (queueNow: HostQueueControls | undefined) => (
    <GeneralChannelView
      t={t as never}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[ATLAS_IDLE]}
      messages={[]}
      onSendMessage={onSendMessage}
      quotaBlocked
      quotaKnown
      quotaResumeLabel="18:30"
      {...(queueNow === undefined ? {} : { hostQueue: queueNow })}
      {...props}
    />
  )
  const rendered = render(element(hostQueue))
  return { ...rendered, onSendMessage, element }
}

const settle = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }) }

describe('a fila local vira fila do host (uma vez)', () => {
  it('o que estava "por cota" vai ao host com reason "quota" e SÓ depois sai do armazenamento local', async () => {
    writeQueuedMessages(KEY, [local('queued-1', 'Monte o cardápio', { heldForQuota: true }), local('queued-2', 'E o preço')])
    const enqueue = vi.fn().mockResolvedValue(true)
    const { onSendMessage } = mount(queue(enqueue))
    await settle()
    expect(enqueue).toHaveBeenNthCalledWith(1, 'Monte o cardápio', { id: 'atlas', name: 'Atlas' }, 'quota')
    expect(enqueue).toHaveBeenNthCalledWith(2, 'E o preço', { id: 'atlas', name: 'Atlas' }, undefined)
    expect(readQueuedMessages(KEY)).toEqual([])
    expect(localStorage.getItem(`persona.composer.queue.v1:${KEY}`)).toBeNull()
    expect(onSendMessage).not.toHaveBeenCalled()
  })

  it('enquanto o host ainda não respondeu, o agendador local NÃO manda os mesmos balões (nada em duplicata)', async () => {
    writeQueuedMessages(KEY, [local('queued-1', 'Monte o cardápio')])
    let release: (value: boolean) => void = () => undefined
    const enqueue = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve }))
    const { onSendMessage } = mount(queue(enqueue), { quotaBlocked: false })
    await settle()
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(onSendMessage).not.toHaveBeenCalled()
    await act(async () => { release(true); await Promise.resolve() })
    await settle()
    expect(onSendMessage).not.toHaveBeenCalled()
    expect(readQueuedMessages(KEY)).toEqual([])
  })

  it('o que tem anexo (o host guarda só texto) fica local e não vai ao host', async () => {
    writeQueuedMessages(KEY, [local('queued-1', 'Veja o anexo', { attachments: [{ id: 'att-1', name: 'capa.png' }] }), local('queued-2', 'Só texto')])
    const enqueue = vi.fn().mockResolvedValue(true)
    mount(queue(enqueue))
    await settle()
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledWith('Só texto', { id: 'atlas', name: 'Atlas' }, undefined)
    expect(readQueuedMessages(KEY).map(item => item.id)).toEqual(['queued-1'])
  })

  it('o que perdeu o anexo no recarregamento fica local com o aviso (não vai ao host sem o anexo)', async () => {
    writeQueuedMessages(KEY, [local('queued-1', 'Veja o anexo', { lostAttachmentNames: ['capa.png'] })])
    const enqueue = vi.fn().mockResolvedValue(true)
    mount(queue(enqueue))
    await settle()
    expect(enqueue).not.toHaveBeenCalled()
    expect(readQueuedMessages(KEY)).toHaveLength(1)
  })

  it('o host recusou: NADA se perde (continua guardado) e o agendador de sempre volta a cuidar', async () => {
    writeQueuedMessages(KEY, [local('queued-1', 'Monte o cardápio'), local('queued-2', 'E o preço')])
    const enqueue = vi.fn().mockResolvedValue(false)
    const { onSendMessage } = mount(queue(enqueue), { quotaBlocked: false, quotaKnown: true })
    await settle()
    // só tentou o 1º (parou na recusa) e os dois seguem guardados / foram para o fluxo local de sempre
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(onSendMessage).toHaveBeenCalledWith('Monte o cardápio')
    expect(onSendMessage).toHaveBeenCalledWith('E o preço')
  })

  it('só migra UMA vez (re-renders não reenfileiram)', async () => {
    writeQueuedMessages(KEY, [local('queued-1', 'Monte o cardápio')])
    const enqueue = vi.fn().mockResolvedValue(true)
    const hostQueue = queue(enqueue)
    const { rerender, element } = mount(hostQueue)
    await settle()
    rerender(element({ ...hostQueue }))
    rerender(element({ ...hostQueue }))
    await settle()
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('sem a flag (sem hostQueue) a fila local é a de sempre: nada migra', async () => {
    writeQueuedMessages(KEY, [local('queued-1', 'Monte o cardápio', { heldForQuota: true })])
    mount(undefined)
    await settle()
    expect(readQueuedMessages(KEY)).toHaveLength(1)
  })
})

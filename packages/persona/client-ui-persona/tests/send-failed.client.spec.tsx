// @vitest-environment jsdom
// P0-30: a mensagem que o host não recebeu NÃO fica no fio como se tivesse sido enviada: vira "Não enviado · Tentar de
// novo", guarda o texto e os anexos, e a retentativa manda de verdade (ou volta a falhar sem perder nada).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })
const fail = (): Promise<Result> => Promise.resolve({ ok: false, error: { code: 'unavailable', message: 'sem conexão com a equipe' } })

function build(postMessage: () => Promise<Result>) {
  const stream = {
    async* [Symbol.asyncIterator]() {
      yield { kind: 'baseline', events: [], order: [] }
      await new Promise<void>(() => {})
    },
  }
  const host: Record<string, unknown> = {
    listProjects: () => ok([{ id: 'proj-pessoal' }]),
    listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
    getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
    ping: () => ok({ protocol: 1 }),
    getOverviewNow: () => ok({ personas: [] }),
    getWhileAway: () => ok({ events: [] }),
    getOverview: () => ok({ needsYou: [], inProgress: [] }),
    listTeam: () => ok({
      personas: [{ id: 'p-atlas', name: 'Coordenação', title: 'Coordenação', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'atlas', systemRoles: ['coordination'], canRecruit: false }],
      members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
    }),
    listTasks: () => ok([]),
    listMessages: () => ok({ events: [] }),
    listDms: () => ok([]),
    markVisit: () => ok(true),
    followMessages: () => stream,
    listApprovals: () => ok([]),
    listGestorPlans: () => ok([]),
    postMessage,
  }
  return host
}

let live: PersonaLiveStore | undefined
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => {
  cleanup()
  live?.dispose()
  live = undefined
  vi.useRealTimers()
})

describe('persona-live-store: envio que falha', () => {
  it('o host recusa: a mensagem sai do fio normal e fica em "não enviadas", com o texto e sem lançar', async () => {
    const postMessage = vi.fn(fail)
    live = createPersonaLiveStore(build(postMessage) as never)
    await live.bootstrap(() => {})
    await expect(live.postChannelMessage('  Monte o cardápio da semana  ')).resolves.toBeUndefined()
    const snap = live.observable.getSnapshot()
    expect(snap.messages.some(row => row.body === 'Monte o cardápio da semana')).toBe(false)
    expect(snap.failedSends).toHaveLength(1)
    expect(snap.failedSends?.[0]).toMatchObject({ streamKind: 'channel', message: { body: 'Monte o cardápio da semana', sendFailed: true, authorId: 'user' } })
  })

  it('tentar de novo: manda de verdade, e a mensagem deixa de estar "não enviada"', async () => {
    const postMessage = vi.fn(fail)
    live = createPersonaLiveStore(build(postMessage) as never)
    await live.bootstrap(() => {})
    await live.postChannelMessage('Preciso do relatório')
    const failedId = live.observable.getSnapshot().failedSends?.[0]?.message.id as string
    postMessage.mockImplementation(() => ok({ id: 'msg-1' }))
    await live.retryFailedSend?.(failedId)
    expect(postMessage).toHaveBeenCalledTimes(2)
    expect(live.observable.getSnapshot().failedSends ?? []).toHaveLength(0)
  })

  it('a retentativa leva os mesmos anexos', async () => {
    const postMessage = vi.fn(fail)
    live = createPersonaLiveStore(build(postMessage) as never)
    await live.bootstrap(() => {})
    await live.postChannelMessage('Veja o anexo', ['att-1', 'att-2'])
    const failedId = live.observable.getSnapshot().failedSends?.[0]?.message.id as string
    postMessage.mockImplementation(() => ok({ id: 'msg-1' }))
    await live.retryFailedSend?.(failedId)
    const lastCall = postMessage.mock.calls[postMessage.mock.calls.length - 1] as unknown as [{ attachmentIds: string[] }] | []
    expect(lastCall[0]?.attachmentIds).toEqual(['att-1', 'att-2'])
  })

  it('falhou de novo na retentativa: volta a ficar "não enviada", sem perder o texto', async () => {
    live = createPersonaLiveStore(build(vi.fn(fail)) as never)
    await live.bootstrap(() => {})
    await live.postChannelMessage('Não perca isto')
    const failedId = live.observable.getSnapshot().failedSends?.[0]?.message.id as string
    await live.retryFailedSend?.(failedId)
    const failed = live.observable.getSnapshot().failedSends ?? []
    expect(failed).toHaveLength(1)
    expect(failed[0]?.message.body).toBe('Não perca isto')
  })

  it('retentativa de um id que não existe não faz nada', async () => {
    const postMessage = vi.fn(fail)
    live = createPersonaLiveStore(build(postMessage) as never)
    await live.bootstrap(() => {})
    await live.retryFailedSend?.('local-que-nao-existe')
    expect(postMessage).not.toHaveBeenCalled()
  })
})

describe('o balão "Não enviado · Tentar de novo"', () => {
  const t = (key: string) => chatPt[key as keyof typeof chatPt] ?? key
  const failedMessage = { id: 'local-1', authorId: 'user', authorName: 'Você', body: 'Monte o cardápio', timeLabel: '10:00', reactions: [], sendFailed: true }

  it('no #geral: mostra a falha com texto e ícone e a ação "Tentar de novo" que chama a retentativa', () => {
    const onRetrySend = vi.fn()
    render(
      <GeneralChannelView
        t={t as never}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        members={[]}
        messages={[failedMessage]}
        onRetrySend={onRetrySend}
      />,
    )
    const note = document.querySelector('[data-persona-send-failed]') as HTMLElement
    expect(note.textContent).toContain('Não enviado')
    expect(note.getAttribute('role')).toBe('status')
    expect(note.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetrySend).toHaveBeenCalledWith('local-1')
  })

  it('o texto da mensagem continua visível (nada some)', () => {
    render(<GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={[]} messages={[failedMessage]} onRetrySend={() => undefined} />)
    expect(screen.getByText('Monte o cardápio')).toBeTruthy()
  })

  it('mensagem normal não mostra o aviso', () => {
    render(<GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={[]} messages={[{ ...failedMessage, sendFailed: false }]} onRetrySend={() => undefined} />)
    expect(document.querySelector('[data-persona-send-failed]')).toBeNull()
  })

  it('na DM também: mesmo aviso e mesma ação', () => {
    const onRetrySend = vi.fn()
    render(
      <DirectMessagesView
        t={t as never}
        shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
        loading={false}
        dms={[{ id: 'dm-nina', peerId: 'nina', peerName: 'Nina', characterId: 'nina', role: 'Pesquisa' }]}
        selectedId="dm-nina"
        messages={[failedMessage]}
        onSelect={() => undefined}
        onSend={() => undefined}
        onRetrySend={onRetrySend}
      />,
    )
    expect(document.querySelector('[data-persona-send-failed]')?.textContent).toContain('Não enviado')
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetrySend).toHaveBeenCalledWith('local-1')
  })
})

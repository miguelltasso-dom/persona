// @vitest-environment jsdom
// Item 22 (equipes e canais, atrás de `persona.flag.channelSections`): o store abre OUTRO canal (lê, segue o fluxo e escreve nele) e guarda o layout da
// barra (`getChannelLayout`). Com a flag desligada o app é o de sempre: um canal só (#geral) e nenhum desses métodos faz nada.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHANNEL_SECTIONS_FLAG_KEY } from '../src/client/shell/channel-sections-flag.ts'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

type Result = { ok: true; value: unknown }
const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })

let live: PersonaLiveStore | undefined
afterEach(() => { live?.dispose(); live = undefined; localStorage.removeItem(CHANNEL_SECTIONS_FLAG_KEY) })

const LAYOUT = {
  humanCount: 1,
  sections: [
    { id: null, name: null, faceIds: [], channels: [{ id: 'geral', name: 'geral', kind: 'general' }] },
    { id: 'sec-vendas', name: 'Vendas', teamId: 'team-vendas', faceIds: ['nina'], channels: [{ id: 'canal-vendas', name: 'vendas', kind: 'team', teamId: 'team-vendas' }] },
  ],
}

function build() {
  const listMessages = vi.fn((request: { ownerId: string }) => ok({ events: [], ownerId: request.ownerId }))
  const followed: string[] = []
  const postMessage = vi.fn(() => ok({}))
  const remote: Record<string, unknown> = {
    listProjects: () => ok([{ id: 'proj-pessoal' }]),
    listChannels: () => ok([{ id: 'geral', name: 'geral' }, { id: 'canal-vendas', name: 'vendas' }]),
    getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
    ping: () => ok({ protocol: 1 }),
    getOverviewNow: () => ok({ personas: [] }),
    getWhileAway: () => ok({ events: [] }),
    getOverview: () => ok({ needsYou: [], inProgress: [] }),
    listTeam: () => ok({ personas: [], members: [] }),
    listTasks: () => ok([]),
    listMessages,
    listDms: () => ok([]),
    markVisit: () => ok(true),
    followMessages: (request: { ownerId: string }) => { followed.push(request.ownerId); return { async* [Symbol.asyncIterator]() { /* idle */ } } },
    listApprovals: () => ok([]),
    listDailySummaries: () => ok([]),
    getChannelLayout: vi.fn(() => ok(LAYOUT)),
    getChannelHeader: vi.fn((request: { channelId: string }) => ok({ channelId: request.channelId, name: request.channelId === 'canal-vendas' ? 'vendas' : 'geral', members: [], respondem: request.channelId === 'canal-vendas' ? 'Respondem aqui: Lia e Téo' : '', empty: { kind: 'ready', title: 'pronto', body: '' } })),
    postMessage,
  }
  return { remote, listMessages, followed, postMessage }
}

async function booted(flag: boolean) {
  if (flag) localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
  const built = build()
  live = createPersonaLiveStore(built.remote as never)
  await live.bootstrap(() => {})
  return { store: live, ...built }
}

describe('com a flag ligada', () => {
  it('guarda o layout da barra (as seções e os canais que o host mandou)', async () => {
    const { store } = await booted(true)
    await store.refreshChannelLayout!()
    expect(store.observable.getSnapshot().channelLayout?.sections.map(section => section.name)).toEqual([null, 'Vendas'])
  })

  it('o layout da barra é lido junto com o resto, sem ninguém pedir (e o canal aberto sobrevive a um refresh)', async () => {
    const { store } = await booted(true)
    await vi.waitFor(() => { expect(store.observable.getSnapshot().channelLayout?.sections).toHaveLength(2) })
    await store.selectChannel!('canal-vendas')
    await store.refresh()
    expect(store.observable.getSnapshot().selectedChannelId).toBe('canal-vendas')
    expect(store.observable.getSnapshot().channelLayout?.sections).toHaveLength(2)
  })

  it('abrir outro canal lê as mensagens DELE, segue o fluxo dele e guarda qual está aberto', async () => {
    const { store, listMessages, followed } = await booted(true)
    await store.selectChannel!('canal-vendas')
    expect(store.observable.getSnapshot().selectedChannelId).toBe('canal-vendas')
    expect(listMessages).toHaveBeenCalledWith(expect.objectContaining({ streamKind: 'channel', ownerId: 'canal-vendas' }))
    await vi.waitFor(() => { expect(followed).toContain('canal-vendas') })
  })

  it('o cabeçalho do canal que abriu vem do host e o do canal anterior sai (nunca o "Respondem aqui" de outro canal)', async () => {
    const { store } = await booted(true)
    await store.selectChannel!('canal-vendas')
    await vi.waitFor(() => { expect(store.observable.getSnapshot().channelHeader?.respondem).toBe('Respondem aqui: Lia e Téo') })
    await store.selectChannel!(null)
    await vi.waitFor(() => { expect(store.observable.getSnapshot().channelHeader?.respondem).toBe('') })
  })

  it('o que a pessoa escreve vai para o canal aberto (nunca para o #geral por engano)', async () => {
    const { store, postMessage } = await booted(true)
    await store.selectChannel!('canal-vendas')
    await store.postChannelMessage('Fechei o pedido da padaria')
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ streamKind: 'channel', ownerId: 'canal-vendas', body: 'Fechei o pedido da padaria' }))
  })

  it('voltar (null) reabre o #geral do projeto, como sempre', async () => {
    const { store, postMessage } = await booted(true)
    await store.selectChannel!('canal-vendas')
    await store.selectChannel!(null)
    expect(store.observable.getSnapshot().selectedChannelId ?? null).toBeNull()
    await store.postChannelMessage('De volta ao geral')
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ ownerId: 'geral' }))
  })
})

describe('com a flag desligada (o padrão)', () => {
  it('nenhum desses métodos mexe em nada: o app segue com o canal único', async () => {
    const { store, listMessages, remote } = await booted(false)
    const before = listMessages.mock.calls.length
    await store.selectChannel!('canal-vendas')
    await store.refreshChannelLayout!()
    expect(store.observable.getSnapshot().selectedChannelId ?? null).toBeNull()
    expect(store.observable.getSnapshot().channelLayout).toBeUndefined()
    expect(listMessages.mock.calls.length).toBe(before)
    expect(remote.getChannelLayout).not.toHaveBeenCalled()
  })
})

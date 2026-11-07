// CONVERSAS-SPEC §0: a barra única pinta a conversa aberta e abre qualquer uma com 1 clique.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { describe, expect, it, vi } from 'vitest'
import {
  activeConversation,
  conversationKey,
  createActiveConversationObservable,
  sameConversation,
  type ConversationTarget,
} from '../src/client/shell/conversation-selection.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import type { ShellStoreHandle } from '../src/client/shell/create-shell-store.ts'

const live = (patch: Partial<Pick<PersonaLiveSnapshot, 'tenant' | 'selectedDmId' | 'dms'>> = {}) => ({
  tenant: { workspaceId: 'ws', projectId: 'pp', channelId: 'geral', memberId: 'm1' },
  selectedDmId: null,
  dms: [{ id: 'dm-1', peerName: 'Bento', peerId: 'p-bento' }, { id: 'dm-2', peerName: 'Nina', peerId: 'p-nina' }],
  ...patch,
}) as unknown as Pick<PersonaLiveSnapshot, 'tenant' | 'selectedDmId' | 'dms'>

describe('activeConversation', () => {
  it('no #geral a conversa é o canal do tenant', () => {
    expect(activeConversation({ activePanel: 'channels' }, live())).toEqual({ kind: 'channel', id: 'geral' })
  })

  it('na tela de DMs com uma DM escolhida é a pessoa do outro lado', () => {
    expect(activeConversation({ activePanel: 'directMessages' }, live({ selectedDmId: 'dm-2' }))).toEqual({ kind: 'dm', personaId: 'p-nina' })
  })

  it('DMs sem escolha, DM que sumiu da lista ou tenant ainda inexistente não têm conversa ativa', () => {
    expect(activeConversation({ activePanel: 'directMessages' }, live())).toBeNull()
    expect(activeConversation({ activePanel: 'directMessages' }, live({ selectedDmId: 'dm-99' }))).toBeNull()
    expect(activeConversation({ activePanel: 'channels' }, live({ tenant: null }))).toBeNull()
  })

  it('qualquer outra tela (Visão geral, Projetos, Equipe…) não tem conversa ativa', () => {
    for (const activePanel of ['overview', 'projects', 'team', 'approvals', 'kanban'] as const) {
      expect(activeConversation({ activePanel }, live({ selectedDmId: 'dm-1' }))).toBeNull()
    }
  })
})

describe('chave e igualdade', () => {
  it('chaves estáveis e comparação por valor (null com null é igual)', () => {
    const channel: ConversationTarget = { kind: 'channel', id: 'geral' }
    const dm: ConversationTarget = { kind: 'dm', personaId: 'p-bento' }
    expect(conversationKey(channel)).toBe('channel:geral')
    expect(conversationKey(dm)).toBe('dm:p-bento')
    expect(sameConversation(channel, { kind: 'channel', id: 'geral' })).toBe(true)
    expect(sameConversation(channel, dm)).toBe(false)
    expect(sameConversation(null, null)).toBe(true)
    expect(sameConversation(dm, null)).toBe(false)
  })
})

describe('observável da barra', () => {
  function build() {
    const shell = createSnapshotStore({ activePanel: 'overview' as const as string })
    const liveStore = createSnapshotStore(live() as unknown as PersonaLiveSnapshot)
    const observable = createActiveConversationObservable(
      { observable: { getSnapshot: () => liveStore.getSnapshot(), subscribe: (l: () => void) => liveStore.subscribe(l) } } as unknown as PersonaLiveStore,
      { store: { getSnapshot: () => shell.getSnapshot(), subscribe: (l: () => void) => shell.subscribe(l) } } as unknown as Pick<ShellStoreHandle, 'store'>,
    )
    return { shell, liveStore, observable }
  }

  it('o snapshot é estável enquanto a conversa não muda (useSyncExternalStore exige)', () => {
    const { shell, liveStore, observable } = build()
    shell.set({ activePanel: 'channels' })
    const first = observable.getSnapshot()
    expect(first).toEqual({ kind: 'channel', id: 'geral' })
    expect(observable.getSnapshot()).toBe(first)
    // o live muda por outro motivo (ex.: mensagem nova): a MESMA referência de conversa
    liveStore.set({ ...liveStore.getSnapshot(), selectedDmId: null })
    expect(observable.getSnapshot()).toBe(first)
  })

  it('avisa quem assina quando a tela ou o live mudam, e a conversa acompanha', () => {
    const { shell, liveStore, observable } = build()
    const listener = vi.fn()
    const off = observable.subscribe(listener)
    shell.set({ activePanel: 'directMessages' })
    liveStore.set({ ...liveStore.getSnapshot(), selectedDmId: 'dm-1' })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(observable.getSnapshot()).toEqual({ kind: 'dm', personaId: 'p-bento' })
    off()
    shell.set({ activePanel: 'overview' })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(observable.getSnapshot()).toBeNull()
  })
})

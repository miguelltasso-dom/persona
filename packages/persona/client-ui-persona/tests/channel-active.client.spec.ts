// @vitest-environment jsdom
// Item 22 (atrás de `persona.flag.channelSections`): a linha ativa da barra é o canal ABERTO (o escolhido na barra), não sempre o #geral. Com a flag desligada nada muda.
import { afterEach, describe, expect, it } from 'vitest'
import { activeConversation } from '../src/client/shell/conversation-selection.ts'
import { CHANNEL_SECTIONS_FLAG_KEY } from '../src/client/shell/channel-sections-flag.ts'

afterEach(() => { localStorage.removeItem(CHANNEL_SECTIONS_FLAG_KEY) })

const live = (selectedChannelId?: string | null) => ({
  tenant: { workspaceId: 'ws', projectId: 'pp', channelId: 'geral', memberId: 'owner' },
  selectedDmId: null,
  dms: [],
  ...(selectedChannelId === undefined ? {} : { selectedChannelId }),
}) as never

describe('o canal ativo', () => {
  it('com a flag ligada e um canal escolhido na barra, a linha ativa é ele', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    expect(activeConversation({ activePanel: 'channels' }, live('canal-vendas'))).toEqual({ kind: 'channel', id: 'canal-vendas' })
  })

  it('sem escolha (ou voltando ao #geral): o canal do projeto, como sempre', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    expect(activeConversation({ activePanel: 'channels' }, live(null))).toEqual({ kind: 'channel', id: 'geral' })
    expect(activeConversation({ activePanel: 'channels' }, live())).toEqual({ kind: 'channel', id: 'geral' })
  })

  it('com a flag desligada (o padrão): um canal escolhido não muda nada, o #geral segue ativo', () => {
    expect(activeConversation({ activePanel: 'channels' }, live('canal-vendas'))).toEqual({ kind: 'channel', id: 'geral' })
  })

  it('fora do painel de canais nenhuma linha de canal é a ativa', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    expect(activeConversation({ activePanel: 'overview' }, live('canal-vendas'))).toBeNull()
  })
})

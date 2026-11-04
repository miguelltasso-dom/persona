// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RemoteTeamState } from '@deepseek-ai/dsh-persona-host/types'
import { RemoteTeamPanel, type RemoteTeamPanelProps } from '../src/client/remote-team/RemoteTeamPanel.tsx'
import { pt as membersPt } from '../src/client/locale/members/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(membersPt, key, params)
const CHANNELS = [{ id: 'geral', name: 'geral' }, { id: 'design', name: 'design' }]

const state = (patch: Partial<RemoteTeamState> = {}): RemoteTeamState => ({
  workspaceId: 'ws',
  projectId: 'pp',
  edgeUrl: 'http://127.0.0.1:8791',
  actorId: 'a1',
  role: 'owner',
  channelIds: ['geral'],
  status: 'connected',
  cursors: {},
  errorCode: '',
  ...patch,
})

function panel(patch: Partial<RemoteTeamPanelProps> = {}) {
  const handlers = {
    onConnect: vi.fn(),
    onAccept: vi.fn(),
    onIssueInvite: vi.fn(),
    onDismissIssued: vi.fn(),
    onRevoke: vi.fn(),
    onSync: vi.fn(),
  }
  const props: RemoteTeamPanelProps = {
    t,
    vault: 'available',
    state: null,
    channels: CHANNELS,
    invites: [],
    issued: null,
    busy: null,
    error: null,
    ...handlers,
    ...patch,
  }
  const utils = render(<RemoteTeamPanel {...props} />)
  return { ...handlers, ...utils }
}

describe('Equipe remota — sem conexão', () => {
  it('diz o que é, oferece conectar (dono) e entrar com convite, e promete que DMs nunca saem', () => {
    panel()
    expect(screen.getByRole('heading', { name: 'Equipe remota' })).toBeTruthy()
    expect(screen.getByText(/DMs, execuções e contas nunca saem daqui/u)).toBeTruthy()
    expect(screen.getByText('Não conectada')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Conectar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Entrar na equipe' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gerar convite' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sincronizar agora' })).toBeNull()
  })

  it('conectar valida endereço e canais antes de chamar o host (nada marcado por padrão: compartilhar é decisão da pessoa)', () => {
    const { onConnect } = panel()
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    expect(onConnect).not.toHaveBeenCalled()
    expect(screen.getByText(/Confira o endereço da equipe/u)).toBeTruthy()
    expect(screen.getByText('Marque pelo menos um canal para compartilhar.')).toBeTruthy()

    const channels = screen.getByRole('group', { name: 'O que compartilhar' })
    expect(within(channels).getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true)
  })

  it('conectar com endereço e canais marcados envia exatamente isso (sem barra final)', () => {
    const { onConnect } = panel()
    fireEvent.change(screen.getAllByLabelText('Endereço da equipe')[0]!, { target: { value: ' http://127.0.0.1:8791/ ' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '#geral' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '#design' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '#design' }))
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    expect(onConnect).toHaveBeenCalledWith('http://127.0.0.1:8791', ['geral'])
  })

  it('entrar com convite valida o código e o endereço; o código é um campo de senha (não fica à vista)', () => {
    const { onAccept } = panel()
    const token = screen.getAllByLabelText('Código do convite').find(el => el.tagName === 'INPUT') as HTMLInputElement
    expect(token.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na equipe' }))
    expect(onAccept).not.toHaveBeenCalled()
    expect(screen.getByText('Cole o código do convite.')).toBeTruthy()

    const addresses = screen.getAllByLabelText('Endereço da equipe')
    fireEvent.change(addresses[addresses.length - 1]!, { target: { value: 'http://127.0.0.1:8791' } })
    fireEvent.change(token, { target: { value: '  tok-secreto  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na equipe' }))
    expect(onAccept).toHaveBeenCalledWith('http://127.0.0.1:8791', 'tok-secreto')
  })
})

describe('Equipe remota — conectada', () => {
  it('mostra os canais pelo NOME (nunca o id interno), o papel e "Sincronizar agora"', () => {
    const { onSync } = panel({ state: state({ channelIds: ['geral', 'design'] }) })
    expect(screen.getByText('Conectada')).toBeTruthy()
    expect(screen.getByText('Dono')).toBeTruthy()
    expect(screen.getByText('#geral')).toBeTruthy()
    expect(screen.getByText('#design')).toBeTruthy()
    expect(screen.queryByText(/project:/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }))
    expect(onSync).toHaveBeenCalledTimes(1)
    // já conectada: nada de formulário de conexão
    expect(screen.queryByRole('button', { name: 'Conectar' })).toBeNull()
  })

  it('o dono gera convite escolhendo como a pessoa entra', () => {
    const { onIssueInvite } = panel({ state: state() })
    fireEvent.click(screen.getByRole('radio', { name: /Convidado/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite' }))
    expect(onIssueInvite).toHaveBeenCalledWith('guest')
  })

  it('o código do convite aparece UMA vez, com aviso, copia endereço+código e some ao tocar "Já enviei"', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const issued = { inviteId: 'i1', token: 'tok-abc-123', edgeUrl: 'http://127.0.0.1:8791' }
    const { onDismissIssued, rerender } = panel({ state: state(), issued })
    const group = screen.getByRole('group', { name: 'Convite criado' })
    expect(within(group).getByText('tok-abc-123')).toBeTruthy()
    expect(within(group).getByText(/aparece só agora e não fica salvo em lugar nenhum/u)).toBeTruthy()

    fireEvent.click(within(group).getByRole('button', { name: 'Copiar convite' }))
    expect(writeText).toHaveBeenCalledWith('Endereço: http://127.0.0.1:8791\nCódigo do convite: tok-abc-123')
    await screen.findByRole('button', { name: 'Copiado' })

    fireEvent.click(within(group).getByRole('button', { name: 'Já enviei' }))
    expect(onDismissIssued).toHaveBeenCalledTimes(1)

    rerender(<RemoteTeamPanel {...({ t, vault: 'available', state: state(), channels: CHANNELS, invites: [], issued: null, busy: null, error: null, onConnect: vi.fn(), onAccept: vi.fn(), onIssueInvite: vi.fn(), onDismissIssued: vi.fn(), onRevoke: vi.fn(), onSync: vi.fn() } satisfies RemoteTeamPanelProps)} />)
    expect(screen.queryByText('tok-abc-123')).toBeNull()
  })

  it('lista de convites: só o "Aceito" tem "Revogar acesso" (revogação definitiva), com ação própria', () => {
    const { onRevoke } = panel({
      state: state(),
      invites: [
        { id: 'i-open', status: 'open', expiresAt: 3 },
        { id: 'i-used', status: 'used', expiresAt: 2 },
        { id: 'i-rev', status: 'revoked', expiresAt: 1 },
      ],
    })
    expect(screen.getByText('Aberto')).toBeTruthy()
    expect(screen.getByText('Aceito')).toBeTruthy()
    expect(screen.getByText('Revogado')).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: 'Revogar acesso' })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0]!)
    expect(onRevoke).toHaveBeenCalledWith('i-used')
  })

  it('membro (não dono) não vê convites nem formulário de conexão', () => {
    panel({ state: state({ role: 'member' }) })
    expect(screen.getByText('Membro')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gerar convite' })).toBeNull()
    expect(screen.queryByText('Convites')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeTruthy()
  })
})

describe('Equipe remota — estados honestos', () => {
  it('sem conexão (offline): o que escrevi fica guardado; dá para tentar de novo', () => {
    const { onSync } = panel({ state: state({ status: 'offline' }) })
    expect(screen.getByText('Sem conexão')).toBeTruthy()
    expect(screen.getByText('O que você escrever fica guardado e sobe quando a conexão voltar.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }))
    expect(onSync).toHaveBeenCalledTimes(1)
  })

  it('revogado: acesso encerrado, nada de enviar/receber/convidar; só um novo convite reabre', () => {
    panel({ state: state({ status: 'revoked', role: 'member' }) })
    expect(screen.getByText('Acesso encerrado')).toBeTruthy()
    expect(screen.getByText(/Você não envia nem recebe mensagens desta equipe/u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sincronizar agora' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Gerar convite' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Conectar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Entrar na equipe' })).toBeTruthy()
  })

  it('Cofre indisponível: explica e NÃO oferece gravação alternativa nem formulários', () => {
    panel({ vault: 'unavailable', state: null })
    expect(screen.getByText('Cofre indisponível')).toBeTruthy()
    expect(screen.getByText(/só existe no app instalado/u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Conectar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Entrar na equipe' })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('falha do host aparece em português e sem código técnico', () => {
    panel({ error: 'vault' })
    expect(screen.getByRole('alert').textContent).toContain('Cofre indisponível. A equipe remota só funciona no app instalado.')
    expect(screen.getByRole('alert').textContent).not.toMatch(/vault-unavailable|vault_unavailable/u)
  })

  it('carregando: esqueleto, sem formulário piscando', () => {
    const { container } = panel({ loading: true })
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Conectar' })).toBeNull()
  })

  it('ocupado: o botão avisa o que está acontecendo e não deixa clicar de novo', () => {
    panel({ busy: 'connect' })
    expect((screen.getByRole('button', { name: 'Conectando…' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

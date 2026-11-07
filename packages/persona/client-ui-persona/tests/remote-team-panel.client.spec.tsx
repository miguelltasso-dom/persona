// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RemoteTeamState } from '@deepseek-ai/dsh-persona-host/types'
import { RemoteTeamPanel, type RemoteTeamPanelProps } from '../src/client/remote-team/RemoteTeamPanel.tsx'
import type { MemberRow } from '../src/client/remote-team/remote-team-model.ts'
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

  it('Muse E13: o erro do endereço some assim que o campo fica válido (ao digitar), em Conectar e nos DOIS campos de "Entrar com um convite"', () => {
    panel()
    const addressError = /Confira o endereço da equipe/u
    // nada de erro antes de tentar
    expect(screen.queryAllByText(addressError)).toHaveLength(0)
    // tentar Conectar com o campo vazio: o erro nasce no formulário de conectar (e só nele)
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    expect(screen.getAllByText(addressError)).toHaveLength(1)
    // digitar um endereço VÁLIDO: o erro some na hora, sem apertar nada
    const connectField = screen.getAllByLabelText('Endereço da equipe')[0]!
    fireEvent.change(connectField, { target: { value: 'http://127.0.0.1:56446' } })
    expect(screen.queryAllByText(addressError)).toHaveLength(0)
    // voltar a um endereço inválido: o erro volta (já tentou)
    fireEvent.change(connectField, { target: { value: 'equipe' } })
    expect(screen.getAllByText(addressError)).toHaveLength(1)
    fireEvent.change(connectField, { target: { value: 'http://127.0.0.1:56446' } })
    expect(screen.queryAllByText(addressError)).toHaveLength(0)

    // "Entrar com um convite": tentar vazio mostra endereço E código; cada um some quando fica válido
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na equipe' }))
    expect(screen.getAllByText(addressError)).toHaveLength(1)
    expect(screen.getByText('Cole o código do convite.')).toBeTruthy()
    const acceptAddress = screen.getAllByLabelText('Endereço da equipe')[1]!
    fireEvent.change(acceptAddress, { target: { value: 'https://equipe.exemplo.test' } })
    expect(screen.queryAllByText(addressError)).toHaveLength(0)
    expect(screen.getByText('Cole o código do convite.')).toBeTruthy()
    const token = screen.getAllByLabelText('Código do convite').find(el => el.tagName === 'INPUT')!
    fireEvent.change(token, { target: { value: 'tok-123' } })
    expect(screen.queryByText('Cole o código do convite.')).toBeNull()
  })

  it('#geral já vem marcado; conectar valida o endereço e, sem nenhum canal, pede um antes de chamar o host', () => {
    const { onConnect } = panel()
    const channels = screen.getByRole('group', { name: 'O que compartilhar' })
    const boxes = within(channels).getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.map(box => [box.checked, box.closest('label')?.textContent])).toEqual([[true, '#geral'], [false, '#design']])
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    expect(onConnect).not.toHaveBeenCalled()
    expect(screen.getByText(/Confira o endereço da equipe/u)).toBeTruthy()
    expect(screen.queryByText('Marque pelo menos um canal para compartilhar.')).toBeNull()

    // a pessoa desmarca tudo: a escolha é dela, e sem canal não há o que compartilhar
    fireEvent.click(screen.getByRole('checkbox', { name: '#geral' }))
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    expect(screen.getByText('Marque pelo menos um canal para compartilhar.')).toBeTruthy()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('a dica do endereço nunca mostra um IP', () => {
    panel()
    expect(screen.getByText('Está na mensagem de configuração da equipe.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\d+\.\d+\.\d+\.\d+/u)
  })

  it('conectar com endereço e canais marcados envia exatamente isso (sem barra final)', () => {
    const { onConnect } = panel()
    fireEvent.change(screen.getAllByLabelText('Endereço da equipe')[0]!, { target: { value: ' http://127.0.0.1:8791/ ' } })
    // #geral já está marcado
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
    // sem convites ainda, o vazio repete a ação (ghost): são dois botões, o primeiro é o primário
    fireEvent.click(screen.getAllByRole('button', { name: 'Gerar convite' })[0]!)
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
    // Muse: o Toast "Convite copiado" avisa; some sozinho, e o botão segue dizendo "Copiado" até o "Já enviei"
    expect(screen.getByText('Convite copiado')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Avisos' })).getByText('Convite copiado')).toBeTruthy()

    fireEvent.click(within(group).getByRole('button', { name: 'Já enviei' }))
    expect(onDismissIssued).toHaveBeenCalledTimes(1)

    rerender(<RemoteTeamPanel {...({ t, vault: 'available', state: state(), channels: CHANNELS, invites: [], issued: null, busy: null, error: null, onConnect: vi.fn(), onAccept: vi.fn(), onIssueInvite: vi.fn(), onDismissIssued: vi.fn(), onRevoke: vi.fn(), onSync: vi.fn() } satisfies RemoteTeamPanelProps)} />)
    expect(screen.queryByText('tok-abc-123')).toBeNull()
  })

  it('o papel diz o que PODE e o que NÃO pode (nunca "menos permissões")', () => {
    panel({ state: state() })
    expect(screen.getByText('Conversa nos canais compartilhados e vê o quadro deles.')).toBeTruthy()
    expect(screen.getByText('Lê e responde nos canais compartilhados. Não convida ninguém nem muda o que é compartilhado.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/menos permiss/iu)
  })

  it('lista de convites: só o "Aceito" tem "Encerrar acesso" (definitivo), pede confirmação e só então chama o host', () => {
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
    expect(screen.getByText('Encerrado')).toBeTruthy()
    // o convite aberto diz até quando vale (a data vem do host); o encerrado não repete data
    expect(screen.getAllByText(/^Vale até /u)).toHaveLength(1)
    const buttons = screen.getAllByRole('button', { name: 'Encerrar acesso' })
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0]!)
    const dialog = screen.getByRole('dialog', { name: 'Encerrar o acesso desta pessoa?' })
    expect(within(dialog).getByText('A pessoa deixa de ver os canais compartilhados a partir de agora. O que ela já viu continua com ela.')).toBeTruthy()
    expect(onRevoke).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(onRevoke).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar acesso' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Encerrar acesso' }))
    expect(onRevoke).toHaveBeenCalledWith('i-used')
    expect(document.body.textContent).not.toMatch(/revog/iu)
  })

  it('membro (não dono) não vê convites nem formulário de conexão', () => {
    panel({ state: state({ role: 'member' }) })
    expect(screen.getByText('Membro')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gerar convite' })).toBeNull()
    expect(screen.queryByText('Convites')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeTruthy()
  })
})

describe('Equipe remota — QUILL-SCREENS-SPEC', () => {
  it('colar o convite inteiro em QUALQUER um dos campos separa endereço e código sozinho', () => {
    const { onAccept } = panel()
    const invite = 'Endereço: http://equipe.exemplo.test:8791\nCódigo do convite: tok-xyz-987'
    const token = screen.getAllByLabelText('Código do convite').find(el => el.tagName === 'INPUT') as HTMLInputElement
    // o navegador achata a quebra de linha do campo: a leitura vem do que foi COLADO (área de transferência)
    fireEvent.paste(token, { clipboardData: { getData: () => invite } })
    const addresses = screen.getAllByLabelText('Endereço da equipe') as HTMLInputElement[]
    expect(addresses[addresses.length - 1]?.value).toBe('http://equipe.exemplo.test:8791')
    expect(token.value).toBe('tok-xyz-987')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na equipe' }))
    expect(onAccept).toHaveBeenCalledWith('http://equipe.exemplo.test:8791', 'tok-xyz-987')
    expect(screen.getByText('Os dois vêm juntos no convite que você recebeu.')).toBeTruthy()
  })

  it('mesmo se o convite chegar já achatado numa linha só, o endereço não engole o rótulo do código', () => {
    const { onAccept } = panel()
    const addresses = screen.getAllByLabelText('Endereço da equipe') as HTMLInputElement[]
    fireEvent.change(addresses[addresses.length - 1]!, { target: { value: 'Endereço: http://equipe.exemplo.test:8791Código do convite: tok-xyz-987' } })
    expect(addresses[addresses.length - 1]?.value).toBe('http://equipe.exemplo.test:8791')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na equipe' }))
    expect(onAccept).toHaveBeenCalledWith('http://equipe.exemplo.test:8791', 'tok-xyz-987')
  })

  it('colar só o endereço (ou só um código) não inventa o outro valor', () => {
    panel()
    const addresses = screen.getAllByLabelText('Endereço da equipe') as HTMLInputElement[]
    const accept = addresses[addresses.length - 1]!
    fireEvent.change(accept, { target: { value: 'http://equipe.exemplo.test:8791' } })
    expect(accept.value).toBe('http://equipe.exemplo.test:8791')
    const token = screen.getAllByLabelText('Código do convite').find(el => el.tagName === 'INPUT') as HTMLInputElement
    expect(token.value).toBe('')
  })

  it('cada estado tem chip com ÍCONE e texto, e a linha de ajuda certa', () => {
    const { container, rerender } = panel({ state: state() })
    expect(container.querySelector('[data-status="connected"] svg')).not.toBeNull()
    expect(screen.getByText('As mensagens novas dos canais compartilhados vão e voltam sozinhas.')).toBeTruthy()
    rerender(<RemoteTeamPanel {...({ t, vault: 'available', state: state({ status: 'offline' }), channels: CHANNELS, invites: [], issued: null, busy: null, error: null, onConnect: vi.fn(), onAccept: vi.fn(), onIssueInvite: vi.fn(), onDismissIssued: vi.fn(), onRevoke: vi.fn(), onSync: vi.fn() } satisfies RemoteTeamPanelProps)} />)
    expect(container.querySelector('[data-status="offline"] svg')).not.toBeNull()
    rerender(<RemoteTeamPanel {...({ t, vault: 'available', state: state({ status: 'revoked', role: 'member' }), channels: CHANNELS, invites: [], issued: null, busy: null, error: null, onConnect: vi.fn(), onAccept: vi.fn(), onIssueInvite: vi.fn(), onDismissIssued: vi.fn(), onRevoke: vi.fn(), onSync: vi.fn() } satisfies RemoteTeamPanelProps)} />)
    expect(container.querySelector('[data-status="revoked"] svg')).not.toBeNull()
  })

  it('conectada com troca conhecida: "Última troca há 3 min." (o relógio é o desta sessão, que viu a troca); sem troca, só a linha genérica', () => {
    const { rerender } = panel({ state: state(), lastExchangeAt: Date.now() - 3 * 60_000 })
    expect(screen.getByText('Última troca há 3 min.')).toBeTruthy()
    rerender(<RemoteTeamPanel {...({ t, vault: 'available', state: state(), channels: CHANNELS, invites: [], issued: null, busy: null, error: null, lastExchangeAt: null, onConnect: vi.fn(), onAccept: vi.fn(), onIssueInvite: vi.fn(), onDismissIssued: vi.fn(), onRevoke: vi.fn(), onSync: vi.fn() } satisfies RemoteTeamPanelProps)} />)
    expect(screen.queryByText(/Última troca/u)).toBeNull()
  })

  it('Cofre indisponível: "Abrir Ajuda" só existe quando há como abrir', () => {
    const onOpenHelp = vi.fn()
    panel({ vault: 'unavailable', state: null, onOpenHelp })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Ajuda' }))
    expect(onOpenHelp).toHaveBeenCalledTimes(1)
  })

  it('sem convites: o vazio diz isso e repete a ação (ghost), e o convite criado é um cartão com o endereço e o código em blocos que quebram linha', () => {
    const { onIssueInvite, container } = panel({ state: state(), issued: { inviteId: 'i1', token: 'x'.repeat(120), edgeUrl: 'http://equipe.exemplo.test:8791' } })
    expect(screen.getByText('Nenhum convite ainda.')).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: 'Gerar convite' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1]!)
    expect(onIssueInvite).toHaveBeenCalledWith('member')
    const group = screen.getByRole('group', { name: 'Convite criado' })
    expect(group.getAttribute('data-tone')).toBe('accent')
    expect(within(group).getByRole('button', { name: 'Copiar convite' })).toBeTruthy()
    expect(container.querySelectorAll('code').length).toBe(1)
  })
})

describe('Equipe remota — estados honestos', () => {
  it('sem conexão (offline): o que escrevi fica guardado; dá para tentar de novo', () => {
    const { onSync } = panel({ state: state({ status: 'offline' }) })
    expect(screen.getByText('Sem conexão')).toBeTruthy()
    expect(screen.getByText('As mensagens novas ficam guardadas e sobem quando a conexão voltar.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onSync).toHaveBeenCalledTimes(1)
  })

  it('revogado: acesso encerrado, nada de enviar/receber/convidar; só um novo convite reabre', () => {
    panel({ state: state({ status: 'revoked', role: 'member' }) })
    expect(screen.getByText('Acesso encerrado')).toBeTruthy()
    expect(screen.getByText('A pessoa dona da equipe encerrou o seu acesso. O que já estava aqui continua aqui.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sincronizar agora' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Gerar convite' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Conectar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Entrar na equipe' })).toBeTruthy()
  })

  it('Cofre indisponível: explica e NÃO oferece gravação alternativa nem formulários', () => {
    panel({ vault: 'unavailable', state: null })
    expect(screen.getByText('Cofre indisponível')).toBeTruthy()
    expect(screen.getByText(/Não consigo ler a chave guardada neste computador/u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Abrir Ajuda' })).toBeNull() // sem como abrir a Ajuda, nada de botão morto
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

describe('Equipe remota — o que o host já sabe (syncedAt, behindBy, pessoas)', () => {
  const ago = (ms: number): string => new Date(Date.now() - ms).toISOString()
  const PEOPLE: readonly MemberRow[] = [
    { actorId: 'a1', name: 'Alice', role: 'owner', status: 'active', joinedAt: ago(3 * 86_400_000), inviteId: '' },
    { actorId: 'b2', name: 'Bob', role: 'member', status: 'active', joinedAt: ago(10 * 60_000), inviteId: 'i-bob' },
    { actorId: 'c3', name: 'Carla', role: 'guest', status: 'revoked', joinedAt: ago(86_400_000), inviteId: 'i-carla' },
  ]

  it('a hora da última troca é a do host (syncedAt) e vence a desta sessão', () => {
    panel({ state: state({ syncedAt: ago(3 * 60_000) }), lastExchangeAt: Date.now() - 50 * 60_000 })
    expect(screen.getByText('Última troca há 3 min.')).toBeTruthy()
  })

  it('sem conexão com troca conhecida: diz que está guardado e a idade da última troca, nunca "em dia"', () => {
    panel({ state: state({ status: 'offline', syncedAt: ago(12 * 60_000), behindBy: 0 }) })
    expect(screen.getByText('As mensagens novas ficam guardadas e sobem quando a conexão voltar. Última troca há 12 min.')).toBeTruthy()
    expect(screen.queryByText('Tudo em dia.')).toBeNull()
  })

  it('o que falta sincronizar: em dia só conectada e medida; N novidades; antes de medir, nada (zero não é inventado)', () => {
    const { rerender, container } = panel({ state: state({ behindBy: 0 }) })
    expect(screen.getByText('Tudo em dia.')).toBeTruthy()
    const again = (patch: Partial<RemoteTeamState>): void => {
      rerender(<RemoteTeamPanel t={t} vault="available" state={state(patch)} channels={CHANNELS} invites={[]} issued={null} busy={null} error={null}
        onConnect={vi.fn()} onAccept={vi.fn()} onIssueInvite={vi.fn()} onDismissIssued={vi.fn()} onRevoke={vi.fn()} onSync={vi.fn()} />)
    }
    again({ behindBy: 1 })
    expect(screen.getByText('1 novidade para sincronizar.')).toBeTruthy()
    again({ behindBy: 5 })
    expect(screen.getByText('5 novidades para sincronizar.')).toBeTruthy()
    again({})
    expect(container.querySelector('[data-persona-remote-behind]')).toBeNull()
    again({ status: 'offline', behindBy: 2 })
    expect(screen.getByText('2 novidades para sincronizar.')).toBeTruthy()
    again({ status: 'offline', behindBy: 0 })
    expect(container.querySelector('[data-persona-remote-behind]')).toBeNull()
  })

  it('pessoas da equipe: nome, papel e quando entrou; quem saiu aparece como "Encerrado"; o dono é marcado como você', () => {
    panel({ state: state(), members: PEOPLE })
    const list = screen.getByRole('heading', { name: 'Pessoas na equipe' }).parentElement!
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByText(/Alice/u).textContent).toContain('Você')
    expect(within(rows[0]!).getByText('Dono')).toBeTruthy()
    expect(within(rows[1]!).getByText('Bob')).toBeTruthy()
    expect(within(rows[1]!).getByText('Membro')).toBeTruthy()
    expect(within(rows[1]!).getByText('Entrou há 10 min')).toBeTruthy()
    expect(within(rows[2]!).getByText('Convidado')).toBeTruthy()
    expect(within(rows[2]!).getByText('Encerrado')).toBeTruthy()
    expect(within(rows[2]!).queryByText(/^Entrou/u)).toBeNull()
  })

  it('o dono encerra o acesso de quem entrou por convite, vendo o nome; não há botão para si, para o dono inicial nem para quem já saiu', () => {
    const { onRevoke } = panel({ state: state(), members: PEOPLE })
    expect(screen.getAllByRole('button', { name: /^Encerrar acesso de /u })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar acesso de Bob' }))
    const dialog = screen.getByRole('dialog', { name: 'Encerrar o acesso de Bob?' })
    expect(onRevoke).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Encerrar acesso' }))
    expect(onRevoke).toHaveBeenCalledWith('i-bob')
  })

  it('quem não é o dono vê as pessoas, sem botão de encerrar; revogada, a tela some com a lista', () => {
    panel({ state: state({ role: 'member', actorId: 'b2' }), members: PEOPLE })
    expect(screen.getByRole('heading', { name: 'Pessoas na equipe' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Encerrar acesso/u })).toBeNull()
    cleanup()
    panel({ state: state({ status: 'revoked' }), members: PEOPLE })
    expect(screen.queryByRole('heading', { name: 'Pessoas na equipe' })).toBeNull()
  })

  it('convite aceito que já é uma pessoa não aparece duas vezes; sobrando só o que está em aberto (ou o vazio honesto)', () => {
    const invites = [
      { id: 'i-bob', status: 'used' as const, expiresAt: 5 },
      { id: 'i-open', status: 'open' as const, expiresAt: Date.now() + 3_600_000 },
    ]
    const { container } = panel({ state: state(), members: PEOPLE, invites })
    const invitesBlock = screen.getByRole('heading', { name: 'Convites' }).parentElement!
    expect(within(invitesBlock).getByText('Aberto')).toBeTruthy()
    expect(within(invitesBlock).queryByText('Aceito')).toBeNull()
    cleanup()
    panel({ state: state(), members: PEOPLE, invites: [invites[0]!] })
    expect(screen.getByText('Nenhum convite em aberto.')).toBeTruthy()
    expect(container).toBeTruthy()
  })
})

describe('Equipe remota — "Acesso encerrado" com o nome de quem encerrou (Muse, polimento)', () => {
  const owner: MemberRow = { actorId: 'a1', name: 'Alice', role: 'owner', status: 'active', joinedAt: new Date().toISOString(), inviteId: '' }

  it('com o dono conhecido pelo host: "{nome} encerrou o seu acesso…" e o spot ao lado do texto (decorativo)', () => {
    const { container } = panel({ state: state({ status: 'revoked', role: 'member', actorId: 'b2' }), members: [owner] })
    expect(screen.getByText('Alice encerrou o seu acesso a esta equipe. O que já estava aqui continua aqui.')).toBeTruthy()
    const art = container.querySelector('[data-status="revoked"] img')
    expect(art?.getAttribute('alt')).toBe('')
    expect(art?.getAttribute('aria-hidden')).toBe('true')
    expect(art?.getAttribute('width')).toBe('96')
  })

  it('sem saber quem foi: a frase de antes, sem nome inventado', () => {
    panel({ state: state({ status: 'revoked', role: 'member', actorId: 'b2' }) })
    expect(screen.getByText('A pessoa dona da equipe encerrou o seu acesso. O que já estava aqui continua aqui.')).toBeTruthy()
  })
})

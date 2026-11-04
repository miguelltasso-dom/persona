// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InviteView, RemoteTeamState } from '@deepseek-ai/dsh-persona-host/types'
import { ConnectedRemoteTeamPanel } from '../src/client/remote-team/ConnectedRemoteTeamPanel.tsx'
import { RemoteMembersPanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { pt as membersPt } from '../src/client/locale/members/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

installPreviewTheme()
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(membersPt, key, params)
const ok = <T,>(value: T) => ({ ok: true as const, value })
const fail = (code: string, message: string) => ({ ok: false as const, error: { code, message } })
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function connected(patch: Partial<RemoteTeamState> = {}): RemoteTeamState {
  return {
    ...SCOPE,
    edgeUrl: 'http://127.0.0.1:8791',
    actorId: 'a1',
    role: 'owner',
    channelIds: ['geral'],
    status: 'connected',
    cursors: {},
    errorCode: '',
    ...patch,
  }
}

/** Host de mentira com o estado do contrato `remote-team.md`. */
function fakeHost(initial: { state?: RemoteTeamState | null; vault?: 'available' | 'unavailable' | 'test'; invites?: InviteView[] } = {}) {
  const host = {
    state: initial.state ?? null,
    vault: initial.vault ?? 'available',
    invites: initial.invites ?? [],
  }
  const remote = {
    getRemoteTeamAvailability: vi.fn(() => Promise.resolve(ok({ vault: host.vault }))),
    getRemoteTeamState: vi.fn(() => Promise.resolve(ok(host.state))),
    listChannels: vi.fn(() => Promise.resolve(ok([{ id: 'geral', name: 'geral' }, { id: 'design', name: 'design' }]))),
    listInvites: vi.fn(() => Promise.resolve(ok(host.invites))),
    connectRemoteTeam: vi.fn((request: { edgeUrl: string; channelIds: readonly string[] }): Promise<unknown> => {
      host.state = connected({ edgeUrl: request.edgeUrl, channelIds: request.channelIds })
      return Promise.resolve(ok(host.state))
    }),
    acceptInvite: vi.fn((request: { edgeUrl: string }) => {
      host.state = connected({ edgeUrl: request.edgeUrl, role: 'member' })
      return Promise.resolve(ok(host.state))
    }),
    issueInvite: vi.fn((request: { inviteId: string }) => {
      host.invites = [...host.invites, { id: request.inviteId, workspaceId: 'ws', token: '', status: 'open', expiresAt: 9 }]
      return Promise.resolve(ok({ id: request.inviteId, workspaceId: 'ws', token: 'tok-do-edge-777', status: 'open', expiresAt: 9 }))
    }),
    revokeMember: vi.fn(() => Promise.resolve(ok(true))),
    syncRemoteTeam: vi.fn(() => Promise.resolve(ok(host.state))),
  }
  return { host, remote }
}

function mount(remote: object, props: { pollMs?: number } = {}) {
  return render(<ConnectedRemoteTeamPanel t={t} remote={remote} scope={SCOPE} pollMs={props.pollMs ?? 0} />)
}

describe('ConnectedRemoteTeamPanel (E13: convidar → aceitar → ver o canal)', () => {
  it('lê estado e canais do host; sem conexão mostra conectar/entrar', async () => {
    const { remote } = fakeHost()
    mount(remote)
    await screen.findByText('Não conectada')
    expect(remote.getRemoteTeamState).toHaveBeenCalledWith(SCOPE)
    expect(screen.getByRole('checkbox', { name: '#design' })).toBeTruthy()
  })

  it('dono conecta escolhendo canais: manda endereço+canais e passa a mostrar "Conectada" com o nome dos canais', async () => {
    const { remote } = fakeHost()
    mount(remote)
    await screen.findByText('Não conectada')
    fireEvent.change(screen.getAllByLabelText('Endereço da equipe')[0]!, { target: { value: 'http://127.0.0.1:8791' } })
    // #geral já vem marcado
    expect((screen.getByRole('checkbox', { name: '#geral' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    await screen.findByText('Conectada')
    expect(remote.connectRemoteTeam).toHaveBeenCalledWith({ ...SCOPE, edgeUrl: 'http://127.0.0.1:8791', channelIds: ['geral'] })
    expect(screen.getByText('#geral')).toBeTruthy()
    expect(screen.queryByText('#design')).toBeNull()
  })

  it('convidar: o código do edge aparece uma vez e some ao "Já enviei"; o host nunca recebe um token inventado pela tela', async () => {
    const { remote } = fakeHost({ state: connected() })
    mount(remote)
    await screen.findByText('Conectada')
    fireEvent.click(screen.getAllByRole('button', { name: 'Gerar convite' })[0]!)
    await screen.findByText('tok-do-edge-777')
    expect(remote.issueInvite).toHaveBeenCalledWith(expect.objectContaining({ ...SCOPE, role: 'member', token: '' }))
    // o código nunca vai para o armazenamento do navegador
    expect(JSON.stringify({ ...localStorage })).not.toContain('tok-do-edge-777')
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('tok-do-edge-777')
    fireEvent.click(screen.getByRole('button', { name: 'Já enviei' }))
    await waitFor(() => { expect(screen.queryByText('tok-do-edge-777')).toBeNull() })
    // a lista de convites mostra o convite como "Aberto", sem o código
    expect(await screen.findByText('Aberto')).toBeTruthy()
  })

  it('aceitar convite do outro lado: entra como membro, vê os canais e não vê convites', async () => {
    const { remote } = fakeHost()
    mount(remote)
    await screen.findByText('Não conectada')
    const addresses = screen.getAllByLabelText('Endereço da equipe')
    fireEvent.change(addresses[addresses.length - 1]!, { target: { value: 'http://127.0.0.1:8791' } })
    const token = screen.getAllByLabelText('Código do convite').find(el => el.tagName === 'INPUT') as HTMLInputElement
    fireEvent.change(token, { target: { value: 'tok-recebido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na equipe' }))
    await screen.findByText('Conectada')
    expect(remote.acceptInvite).toHaveBeenCalledWith({ ...SCOPE, edgeUrl: 'http://127.0.0.1:8791', token: 'tok-recebido' })
    expect(screen.getByText('Membro')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gerar convite' })).toBeNull()
  })

  it('encerrar acesso pede confirmação, chama o host com o convite aceito e relê o estado', async () => {
    const { remote } = fakeHost({
      state: connected(),
      invites: [{ id: 'i-used', workspaceId: 'ws', token: '', status: 'used', expiresAt: 5 }],
    })
    mount(remote)
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar acesso' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Encerrar acesso' }))
    await waitFor(() => { expect(remote.revokeMember).toHaveBeenCalledWith({ ...SCOPE, inviteId: 'i-used' }) })
  })

  it('host com listRemoteMembers: mostra as pessoas com o nome do host, "Tudo em dia." do behindBy, e encerra pelo convite da pessoa', async () => {
    const { remote } = fakeHost({
      state: connected({ behindBy: 0, syncedAt: new Date(Date.now() - 2 * 60_000).toISOString() }),
      invites: [{ id: 'i-bob', workspaceId: 'ws', token: '', status: 'used', expiresAt: 5 }],
    })
    const members = [
      { actorId: 'a1', displayName: 'Alice', role: 'owner', status: 'active', joinedAt: '2026-11-01T10:00:00.000Z', inviteId: '' },
      { actorId: 'b2', displayName: 'Bob', role: 'member', status: 'active', joinedAt: '2026-11-03T10:00:00.000Z', inviteId: 'i-bob' },
    ]
    const listRemoteMembers = vi.fn(() => Promise.resolve(ok(members)))
    mount({ ...remote, listRemoteMembers })
    await screen.findByText('Bob')
    expect(listRemoteMembers).toHaveBeenCalledWith(SCOPE)
    expect(screen.getByText('Tudo em dia.')).toBeTruthy()
    expect(screen.getByText('Última troca há 2 min.')).toBeTruthy()
    // o convite aceito é a própria pessoa: não duplica na lista de convites
    expect(screen.queryByText('Aceito')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar acesso de Bob' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Encerrar o acesso de Bob?' })).getByRole('button', { name: 'Encerrar acesso' }))
    await waitFor(() => { expect(remote.revokeMember).toHaveBeenCalledWith({ ...SCOPE, inviteId: 'i-bob' }) })
  })

  it('host sem listRemoteMembers (ou que falha): a lista de convites segue como era, sem erro na tela', async () => {
    const { remote } = fakeHost({
      state: connected(),
      invites: [{ id: 'i-used', workspaceId: 'ws', token: '', status: 'used', expiresAt: 5 }],
    })
    mount(remote)
    expect(await screen.findByText('Aceito')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Pessoas na equipe' })).toBeNull()
    cleanup()
    mount({ ...remote, listRemoteMembers: vi.fn(() => Promise.resolve(fail('forbidden', 'forbidden'))) })
    expect(await screen.findByText('Aceito')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('o host recusa por Cofre indisponível: mensagem em português, sem o código, e a tela continua usável', async () => {
    const { remote } = fakeHost()
    remote.connectRemoteTeam.mockImplementation(() => Promise.resolve(fail('vault-unavailable', 'Cofre indisponível.')))
    mount(remote)
    await screen.findByText('Não conectada')
    fireEvent.change(screen.getAllByLabelText('Endereço da equipe')[0]!, { target: { value: 'http://127.0.0.1:8791' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('A equipe remota só funciona no app instalado.')
    expect(alert.textContent).not.toMatch(/vault-unavailable/u)
    expect((screen.getByRole('button', { name: 'Conectar' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('web sem Cofre (availability=unavailable): explica e não oferece formulários', async () => {
    const { remote } = fakeHost({ vault: 'unavailable' })
    mount(remote)
    await screen.findByText('Cofre indisponível')
    expect(screen.queryByRole('button', { name: 'Conectar' })).toBeNull()
    expect(remote.connectRemoteTeam).not.toHaveBeenCalled()
  })

  it('"Sincronizar agora" chama o host e mostra o estado devolvido (offline conserva o trabalho)', async () => {
    const { host, remote } = fakeHost({ state: connected() })
    remote.syncRemoteTeam.mockImplementation(() => {
      host.state = connected({ status: 'offline' })
      return Promise.resolve(ok(host.state))
    })
    mount(remote)
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar agora' }))
    await screen.findByText('Sem conexão')
    expect(screen.getByText('As mensagens novas ficam guardadas e sobem quando a conexão voltar.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })

  it('acompanha o estado do host (revogado do outro lado aparece sozinho, sem recarregar)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { host, remote } = fakeHost({ state: connected({ role: 'member' }) })
      mount(remote, { pollMs: 1_000 })
      await screen.findByText('Conectada')
      host.state = connected({ role: 'member', status: 'revoked' })
      await vi.advanceTimersByTimeAsync(1_200)
      await screen.findByText('Acesso encerrado')
      expect(screen.queryByRole('button', { name: 'Sincronizar agora' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('host sem os métodos de equipe remota (versão antiga): o painel não aparece nem quebra', () => {
    const { container } = mount({})
    expect(container.textContent).toBe('')
  })
})

describe('Membros: a Equipe remota aparece como seção da tela', () => {
  function tenantHarness() {
    const store = createSnapshotStore<PersonaTenantSnapshot>({
      status: 'ready',
      scope: { workspaceId: 'ws', projectId: 'pp', actorId: 'owner' },
    })
    return bindObservableForTest({ getSnapshot: () => store.getSnapshot(), subscribe: listener => store.subscribe(listener) })
  }

  it('com só o dono na equipe (estado vazio) a seção Equipe remota continua acessível', async () => {
    const { remote } = fakeHost()
    const persona = {
      ...remote,
      listTeam: vi.fn(() => Promise.resolve(ok({ personas: [], members: [] }))),
    } as unknown as PersonaRemoteClient
    const shell = bindObservableForTest(createShellStore().store)
    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteMembersPanel persona={persona} useTenant={tenantHarness()} useShell={shell} />
      </PreviewFrame>,
    )
    expect(await screen.findByRole('heading', { name: 'Equipe remota' })).toBeTruthy()
    expect(await screen.findByText('Não conectada')).toBeTruthy()
  })
})

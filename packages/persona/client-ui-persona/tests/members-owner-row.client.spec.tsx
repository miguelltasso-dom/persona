// @vitest-environment jsdom
// Cena 20 (Muse, DESIGN-01 §1 e TOP 20 #20) + revisão do Carbon (quill-final, item 2): o dono aparece como "Dono · Neste computador"
// (sem a fileira de chips) e sem o e-mail placeholder; "Convidar por link" e a seção remota só existem com a equipe ligada; sem ela,
// o mesmo estado calmo do cartão Equipe à distância ("Ainda não ligada"), sem o alerta de cofre.
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MembersView } from '../src/client/members/MembersView.tsx'
import type { WorkspaceMember } from '../src/client/members/mock-data.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { publishRemoteTeamStatus } from '../src/client/remote-team/remote-team-status.ts'

installPreviewTheme()
afterEach(() => {
  cleanup()
  publishRemoteTeamStatus('unknown')
})

const SELF_OWNER: WorkspaceMember = {
  id: 'self',
  name: 'Miguel',
  email: 'owner@workspace.local',
  role: 'admin',
  status: 'active',
  isSelf: true,
}

describe('Membros: o dono neste computador', () => {
  it('mostra "Dono · Neste computador" no lugar do e-mail placeholder, sem a fileira de chips', () => {
    render(<MembersView members={[SELF_OWNER]} initialState="ready" />)
    expect(screen.queryByText('owner@workspace.local')).toBeNull()
    expect(screen.getByText('Dono · Neste computador')).toBeTruthy()
    expect(screen.queryByText('Ativo')).toBeNull()
  })

  it('não mostra "Convidar por link" sem handler de convite (remota desligada não tem convite)', () => {
    render(<MembersView members={[SELF_OWNER]} initialState="ready" />)
    expect(screen.queryByRole('button', { name: 'Convidar por link' })).toBeNull()
  })

  it('mostra "Convidar por link" quando há handler e a equipe remota está ligada', () => {
    publishRemoteTeamStatus('connected')
    render(<MembersView members={[SELF_OWNER]} initialState="ready" onInvite={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Convidar por link' })).toBeTruthy()
  })

  it('com handler mas a equipe ainda não ligada, o convite fica escondido', () => {
    publishRemoteTeamStatus('vault_unavailable')
    render(<MembersView members={[SELF_OWNER]} initialState="ready" onInvite={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Convidar por link' })).toBeNull()
  })

  it('sem a equipe ligada, a seção remota é o estado calmo "Ainda não ligada" e nunca o alerta de cofre', () => {
    render(<MembersView members={[SELF_OWNER]} initialState="ready" extra={<p>Painel remoto</p> as ReactNode} />)
    expect(screen.getByText('Ainda não ligada')).toBeTruthy()
    // O painel remoto segue montado (publica o estado), mas escondido: nada dele aparece sem a equipe ligada.
    expect(screen.getByText('Painel remoto').closest('[hidden]')).not.toBeNull()
    expect(screen.queryByText(/Cofre indisponível/u)).toBeNull()
  })

  it('com a equipe ligada, a seção remota (extra) aparece no lugar do estado calmo', () => {
    publishRemoteTeamStatus('connected')
    render(<MembersView members={[SELF_OWNER]} initialState="ready" extra={<p>Painel remoto</p> as ReactNode} />)
    expect(screen.getByText('Painel remoto')).toBeTruthy()
    expect(screen.queryByText('Ainda não ligada')).toBeNull()
  })

  it('colegas continuam mostrando o e-mail deles', () => {
    const colleague: WorkspaceMember = { id: 'c1', name: 'Bia', email: 'bia@exemplo.com', role: 'member', status: 'active' }
    render(<MembersView members={[SELF_OWNER, colleague]} initialState="ready" />)
    expect(screen.getByText('bia@exemplo.com')).toBeTruthy()
  })
})

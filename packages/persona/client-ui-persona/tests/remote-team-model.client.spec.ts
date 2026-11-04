import { describe, expect, it } from 'vitest'
import type { RemoteTeamState } from '@deepseek-ai/dsh-persona-host/types'
import {
  canRevokeInvite,
  checkEdgeUrl,
  deriveRemoteTeamStatus,
  inviteRows,
  inviteShareText,
  remoteTeamCapabilities,
  remoteTeamErrorKind,
  toggleChannel,
} from '../src/client/remote-team/remote-team-model.ts'

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

describe('remote-team model (E13)', () => {
  it('estado apresentado: sem conexão + Cofre indisponível diz isso, em vez de oferecer um formulário que falha', () => {
    expect(deriveRemoteTeamStatus(null, 'available')).toBe('none')
    expect(deriveRemoteTeamStatus(null, 'test')).toBe('none')
    expect(deriveRemoteTeamStatus(null, undefined)).toBe('none')
    expect(deriveRemoteTeamStatus(null, 'unavailable')).toBe('vault_unavailable')
    expect(deriveRemoteTeamStatus(state({ status: 'offline' }), 'available')).toBe('offline')
    expect(deriveRemoteTeamStatus(state({ status: 'revoked' }), 'available')).toBe('revoked')
    expect(deriveRemoteTeamStatus(state({ status: 'vault_unavailable' }), 'unavailable')).toBe('vault_unavailable')
  })

  it('o que cada estado permite: revogado só reabre com um novo convite; só o dono convida', () => {
    expect(remoteTeamCapabilities('none', undefined)).toEqual({ canConnect: true, canAccept: true, canInvite: false, canSync: false })
    expect(remoteTeamCapabilities('connected', 'owner')).toEqual({ canConnect: false, canAccept: false, canInvite: true, canSync: true })
    expect(remoteTeamCapabilities('offline', 'owner').canInvite).toBe(true)
    expect(remoteTeamCapabilities('connected', 'member').canInvite).toBe(false)
    expect(remoteTeamCapabilities('connected', 'guest').canInvite).toBe(false)
    expect(remoteTeamCapabilities('revoked', 'member')).toEqual({ canConnect: false, canAccept: true, canInvite: false, canSync: false })
    expect(remoteTeamCapabilities('vault_unavailable', undefined)).toEqual({ canConnect: false, canAccept: false, canInvite: false, canSync: false })
  })

  it('endereço da equipe: só http(s), sem espaços nem barra final', () => {
    expect(checkEdgeUrl('  http://127.0.0.1:8791/  ')).toEqual({ ok: true, url: 'http://127.0.0.1:8791' })
    expect(checkEdgeUrl('https://equipe.exemplo.com.br')).toEqual({ ok: true, url: 'https://equipe.exemplo.com.br' })
    expect(checkEdgeUrl('')).toEqual({ ok: false, reason: 'empty' })
    expect(checkEdgeUrl('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(checkEdgeUrl('equipe.exemplo.com')).toEqual({ ok: false, reason: 'invalid' })
    expect(checkEdgeUrl('ftp://equipe.exemplo.com')).toEqual({ ok: false, reason: 'invalid' })
    expect(checkEdgeUrl('javascript:alert(1)')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('erro do Remote vira um motivo apresentável; o código fica fora da tela', () => {
    expect(remoteTeamErrorKind(Object.assign(new Error('Cofre indisponível.'), { code: 'vault-unavailable' }))).toBe('vault')
    expect(remoteTeamErrorKind(new Error('O host não conseguiu concluir (vault-unavailable)'))).toBe('vault')
    expect(remoteTeamErrorKind(Object.assign(new Error('x'), { code: 'forbidden' }))).toBe('forbidden')
    expect(remoteTeamErrorKind(new Error('boom'))).toBe('generic')
    expect(remoteTeamErrorKind('???')).toBe('generic')
    expect(remoteTeamErrorKind(null)).toBe('generic')
  })

  it('convites: do mais novo ao mais antigo; só "aceito" pode ter o acesso revogado', () => {
    const rows = inviteRows([
      { id: 'a', workspaceId: 'ws', token: '', status: 'used', expiresAt: 100 },
      { id: 'b', workspaceId: 'ws', token: '', status: 'open', expiresAt: 300 },
      { id: 'c', workspaceId: 'ws', token: '', status: 'revoked', expiresAt: 200 },
    ])
    expect(rows.map(row => row.id)).toEqual(['b', 'c', 'a'])
    expect(rows.map(canRevokeInvite)).toEqual([false, false, true])
    // o token do host nunca passa para a linha da tela
    expect(JSON.stringify(rows)).not.toContain('token')
  })

  it('texto do convite para colar: endereço e código em duas linhas', () => {
    expect(inviteShareText({ address: 'Endereço', code: 'Código do convite' }, 'http://127.0.0.1:8791', 'abc-123'))
      .toBe('Endereço: http://127.0.0.1:8791\nCódigo do convite: abc-123')
  })

  it('marcar e desmarcar canais', () => {
    expect(toggleChannel([], 'geral')).toEqual(['geral'])
    expect(toggleChannel(['geral'], 'design')).toEqual(['geral', 'design'])
    expect(toggleChannel(['geral', 'design'], 'geral')).toEqual(['design'])
  })
})

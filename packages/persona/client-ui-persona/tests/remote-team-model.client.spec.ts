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
  toggleChannel, splitInviteText,
  behindLine,
  canRevokeMember,
  invitesWithoutMembers,
  memberRows,
  parseSyncedAt } from '../src/client/remote-team/remote-team-model.ts'

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

describe('convite colado (QUILL-SCREENS-SPEC)', () => {
  it('o texto inteiro do convite vira endereço + código', () => {
    expect(splitInviteText('Endereço: http://equipe.exemplo.test:8791\nCódigo do convite: tok-xyz-987')).toEqual({ address: 'http://equipe.exemplo.test:8791', token: 'tok-xyz-987' })
    expect(splitInviteText('http://equipe.exemplo.test:8791 tok-abc')).toEqual({ address: 'http://equipe.exemplo.test:8791', token: 'tok-abc' })
  })

  it('sem os dois valores não separa nada (digitação normal não é interceptada)', () => {
    expect(splitInviteText('http://equipe.exemplo.test:8791')).toEqual({ address: 'http://equipe.exemplo.test:8791' })
    expect(splitInviteText('tok-abc-123')).toEqual({})
    expect(splitInviteText('')).toEqual({})
    expect(splitInviteText('http://a.test uma frase com várias palavras')).toEqual({ address: 'http://a.test' })
  })

})

describe('Equipe remota — campos opcionais do host (syncedAt, behindBy, listRemoteMembers)', () => {
  const view = (patch: Record<string, unknown> = {}) => ({
    actorId: 'a1', displayName: 'Alice', role: 'owner', status: 'active', joinedAt: '2026-11-04T10:00:00.000Z', inviteId: '', ...patch,
  })

  it('memberRows: só aceita linhas do formato do contrato, dono primeiro, quem saiu por último; sem lista = host antigo', () => {
    expect(memberRows(undefined)).toBeUndefined()
    expect(memberRows({ not: 'a list' })).toBeUndefined()
    const rows = memberRows([
      view({ actorId: 'c3', displayName: 'Carla', role: 'guest', status: 'revoked', inviteId: 'i3', joinedAt: '2026-11-04T09:00:00.000Z' }),
      view({ actorId: 'b2', displayName: 'Bob', role: 'member', inviteId: 'i2', joinedAt: '2026-11-04T11:00:00.000Z' }),
      { actorId: 'x', displayName: 'Sem papel' },
      null,
      view(),
    ])
    expect(rows?.map(row => row.name)).toEqual(['Alice', 'Bob', 'Carla'])
    expect(memberRows([view({ displayName: '   ' })])?.[0]?.name).toBe('a1')
  })

  it('canRevokeMember: só quem está ativo, entrou por convite e não é a própria pessoa', () => {
    const [owner, bob, carla] = memberRows([
      view(),
      view({ actorId: 'b2', displayName: 'Bob', role: 'member', inviteId: 'i2' }),
      view({ actorId: 'c3', displayName: 'Carla', role: 'guest', status: 'revoked', inviteId: 'i3' }),
    ])!
    expect(canRevokeMember(owner!, 'a1')).toBe(false)
    expect(canRevokeMember(bob!, 'a1')).toBe(true)
    expect(canRevokeMember(bob!, 'b2')).toBe(false)
    expect(canRevokeMember(carla!, 'a1')).toBe(false)
  })

  it('invitesWithoutMembers: convite aceito que já é uma pessoa da lista não aparece duas vezes; sem lista nada muda', () => {
    const invites = inviteRows([
      { id: 'i2', workspaceId: 'ws', token: '', status: 'used', expiresAt: 3 },
      { id: 'i-open', workspaceId: 'ws', token: '', status: 'open', expiresAt: 2 },
      { id: 'i-orphan', workspaceId: 'ws', token: '', status: 'used', expiresAt: 1 },
    ])
    const members = memberRows([view({ actorId: 'b2', displayName: 'Bob', role: 'member', inviteId: 'i2' })])
    expect(invitesWithoutMembers(invites, members).map(row => row.id)).toEqual(['i-open', 'i-orphan'])
    expect(invitesWithoutMembers(invites, undefined)).toBe(invites)
  })

  it('parseSyncedAt: ISO do host em ms; ausente ou ilegível = desconhecido (nunca inventa hora)', () => {
    expect(parseSyncedAt('2026-11-04T10:00:00.000Z')).toBe(Date.parse('2026-11-04T10:00:00.000Z'))
    expect(parseSyncedAt(undefined)).toBeNull()
    expect(parseSyncedAt('ontem')).toBeNull()
  })

  it('behindLine: antes da primeira medição não diz nada; "em dia" só conectada; offline só fala de pendência', () => {
    expect(behindLine('connected', undefined)).toBeNull()
    expect(behindLine('connected', 0)).toEqual({ key: 'zero', count: 0 })
    expect(behindLine('connected', 1)).toEqual({ key: 'one', count: 1 })
    expect(behindLine('connected', 7)).toEqual({ key: 'many', count: 7 })
    expect(behindLine('offline', 0)).toBeNull()
    expect(behindLine('offline', 4)).toEqual({ key: 'many', count: 4 })
    expect(behindLine('revoked', 3)).toBeNull()
    expect(behindLine('none', 3)).toBeNull()
    expect(behindLine('connected', -1)).toBeNull()
    expect(behindLine('connected', Number.NaN)).toBeNull()
  })
})

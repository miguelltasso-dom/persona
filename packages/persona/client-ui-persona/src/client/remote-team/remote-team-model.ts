/**
 * Equipe remota (E13) — modelo puro da UI sobre o contrato do host (`contracts/remote-team.md`).
 * Sem React. O texto vem de chaves de locale; códigos de erro do host são dado de suporte, nunca a mensagem.
 */
import type { InviteView, RemoteTeamAvailability, RemoteTeamState } from '@deepseek-ai/dsh-persona-host/types'

export type RemoteTeamStatusUi = 'none' | 'connected' | 'offline' | 'revoked' | 'vault_unavailable'
export type RemoteTeamTone = 'neutral' | 'success' | 'warning' | 'danger'
export type RemoteTeamErrorKind = 'vault' | 'address' | 'channels' | 'token' | 'forbidden' | 'generic'

/**
 * Estado apresentado. Sem conexão e com o Cofre indisponível (web sem Electron) a UI diz isso em vez de oferecer
 * um formulário que só vai falhar, e nunca oferece gravação alternativa do token.
 */
export function deriveRemoteTeamStatus(
  state: RemoteTeamState | null,
  vault: RemoteTeamAvailability['vault'] | undefined,
): RemoteTeamStatusUi {
  if (state === null) return vault === 'unavailable' ? 'vault_unavailable' : 'none'
  return state.status
}

export const STATUS_TONE: Readonly<Record<RemoteTeamStatusUi, RemoteTeamTone>> = {
  none: 'neutral',
  connected: 'success',
  offline: 'warning',
  revoked: 'danger',
  vault_unavailable: 'warning',
}

/** Chave de locale (sufixo) do rótulo e do corpo de cada estado. */
export const STATUS_KEY: Readonly<Record<RemoteTeamStatusUi, string>> = {
  none: 'none',
  connected: 'connected',
  offline: 'offline',
  revoked: 'revoked',
  vault_unavailable: 'vaultUnavailable',
}

/** O que a pessoa pode fazer em cada estado. Revogação é definitiva: só um novo convite reabre. */
export function remoteTeamCapabilities(status: RemoteTeamStatusUi, role: RemoteTeamState['role'] | undefined): {
  readonly canConnect: boolean
  readonly canAccept: boolean
  readonly canInvite: boolean
  readonly canSync: boolean
} {
  return {
    canConnect: status === 'none',
    canAccept: status === 'none' || status === 'revoked',
    canInvite: (status === 'connected' || status === 'offline') && role === 'owner',
    canSync: status === 'connected' || status === 'offline',
  }
}

export type EdgeUrlCheck =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: 'empty' | 'invalid' }

/** Endereço da equipe: só http(s), sem espaços, sem barra final. */
export function checkEdgeUrl(input: string): EdgeUrlCheck {
  const text = input.trim()
  if (text.length === 0) return { ok: false, reason: 'empty' }
  let parsed: URL
  try { parsed = new URL(text) } catch { return { ok: false, reason: 'invalid' } }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'invalid' }
  if (parsed.hostname.length === 0) return { ok: false, reason: 'invalid' }
  return { ok: true, url: text.replace(/\/+$/u, '') }
}

/** Código tipado do Remote → motivo apresentável. O texto final é do locale. */
export function remoteTeamErrorKind(error: unknown): RemoteTeamErrorKind {
  const code = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : ''
  const message = error instanceof Error ? error.message : ''
  const text = `${code} ${message}`.toLowerCase()
  if (text.includes('vault-unavailable') || text.includes('vault_unavailable')) return 'vault'
  if (text.includes('forbidden')) return 'forbidden'
  return 'generic'
}

export interface InviteRow {
  readonly id: string
  readonly status: InviteView['status']
  readonly expiresAt: number
}

/** Convites do mais novo para o mais antigo; só os "aceitos" podem ter o acesso revogado. */
export function inviteRows(invites: readonly InviteView[]): readonly InviteRow[] {
  return [...invites]
    .sort((a, b) => b.expiresAt - a.expiresAt)
    .map(row => ({ id: row.id, status: row.status, expiresAt: row.expiresAt }))
}

export function canRevokeInvite(row: InviteRow): boolean {
  return row.status === 'used'
}

/** Texto de um convite para colar numa conversa: endereço + código, em duas linhas, sem rótulo técnico. */
export function inviteShareText(labels: { readonly address: string; readonly code: string }, edgeUrl: string, token: string): string {
  return `${labels.address}: ${edgeUrl}\n${labels.code}: ${token}`
}

/** Canais selecionáveis (id interno fica como dado; a pessoa vê o nome). */
export interface SharableChannel {
  readonly id: string
  readonly name: string
}

export function toggleChannel(selected: readonly string[], id: string): readonly string[] {
  return selected.includes(id) ? selected.filter(row => row !== id) : [...selected, id]
}

/**
 * Equipe remota (E13) — modelo puro da UI sobre o contrato do host (`contracts/remote-team.md`).
 * Sem React. O texto vem de chaves de locale; códigos de erro do host são dado de suporte, nunca a mensagem.
 */
import type { InviteView, RemoteMemberView, RemoteTeamAvailability, RemoteTeamState } from '@deepseek-ai/dsh-persona-host/types'

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

/** Icon of each status chip (state is never colour alone: icon + text). `none` has no icon. */
export const STATUS_ICON: Readonly<Record<RemoteTeamStatusUi, 'check' | 'clock' | 'lock' | 'alert' | null>> = {
  none: null,
  connected: 'check',
  offline: 'clock',
  revoked: 'lock',
  vault_unavailable: 'alert',
}

/**
 * Pasting the whole invite ("Endereço: http://… / Código do convite: …") into either field fills both.
 * Address = the first http(s) URL; code = what follows a "código" label, or else the one remaining word.
 */
export function splitInviteText(text: string): { readonly address?: string; readonly token?: string } {
  // A single-line field turns a pasted line break into nothing or a space: stop the address where the next label starts too.
  const address = /https?:\/\/.*?(?=c[óo]digo|\s|$)/isu.exec(text)?.[0]
  if (address === undefined) return {}
  const rest = text.replace(address, ' ')
  const labelled = /c[óo]digo(?:\s+do\s+convite)?\s*[:：-]\s*([^\s]+)/iu.exec(rest)?.[1]
  const words = rest.split(/\s+/u).filter(word => word.length > 0 && !/^(?:endere[çc]o|c[óo]digo|do|convite)[:：-]?$/iu.test(word))
  const token = labelled ?? (words.length === 1 ? words[0] : undefined)
  return { address: address.replace(/[.,;]+$/u, ''), ...(token === undefined ? {} : { token }) }
}

/** A person of the remote project (host `listRemoteMembers`): the name comes from the host, never from the invite label. */
export interface MemberRow {
  readonly actorId: string
  readonly name: string
  readonly role: RemoteMemberView['role']
  readonly status: RemoteMemberView['status']
  readonly joinedAt: string
  readonly inviteId: string
}

function isMemberView(row: unknown): row is RemoteMemberView {
  if (typeof row !== 'object' || row === null) return false
  const view = row as Partial<Record<keyof RemoteMemberView, unknown>>
  return typeof view.actorId === 'string' && typeof view.displayName === 'string'
    && (view.role === 'owner' || view.role === 'member' || view.role === 'guest')
    && (view.status === 'active' || view.status === 'revoked')
    && typeof view.joinedAt === 'string' && typeof view.inviteId === 'string'
}

/**
 * Rows of `listRemoteMembers`: active people first (the owner leads), then who left; rows of another shape are dropped.
 * `undefined` = the host did not answer with a list (older host): the screen keeps the invite list as it was.
 */
export function memberRows(value: unknown): readonly MemberRow[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rows = (value as readonly unknown[]).filter(isMemberView).map((row): MemberRow => ({
    actorId: row.actorId,
    name: row.displayName.trim().length > 0 ? row.displayName.trim() : row.actorId,
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt,
    inviteId: row.inviteId,
  }))
  const rank = (row: MemberRow): number => (row.status === 'revoked' ? 2 : row.role === 'owner' ? 0 : 1)
  return rows.sort((a, b) => rank(a) - rank(b) || a.joinedAt.localeCompare(b.joinedAt))
}

/** Only the owner ends access, only for an active person who came through an invite (the owner row has none), never their own. */
export function canRevokeMember(row: MemberRow, selfActorId: string | undefined): boolean {
  return row.status === 'active' && row.inviteId.length > 0 && row.actorId !== selfActorId
}

/** An accepted invite is the same fact as the person in the list: with the people known, it shows there (with a name), not twice. */
export function invitesWithoutMembers(invites: readonly InviteRow[], members: readonly MemberRow[] | undefined): readonly InviteRow[] {
  if (members === undefined) return invites
  const known = new Set(members.map(member => member.inviteId).filter(id => id.length > 0))
  return invites.filter(row => !known.has(row.id))
}

/** ISO time of the host (`syncedAt`) as epoch ms; missing or unreadable = unknown, never invented. */
export function parseSyncedAt(value: string | undefined): number | null {
  if (value === undefined) return null
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : at
}

/**
 * The backlog line from `behindBy` (pending uploads + missing downloads at the last measurement).
 * Unknown stays unknown; "all caught up" is only said when connected (offline, zero is just the last sample).
 */
export function behindLine(status: RemoteTeamStatusUi, behindBy: number | undefined): { readonly key: 'zero' | 'one' | 'many'; readonly count: number } | null {
  if (behindBy === undefined || (status !== 'connected' && status !== 'offline')) return null
  if (!Number.isFinite(behindBy) || behindBy < 0) return null
  if (behindBy === 0) return status === 'connected' ? { key: 'zero', count: 0 } : null
  return { key: behindBy === 1 ? 'one' : 'many', count: behindBy }
}

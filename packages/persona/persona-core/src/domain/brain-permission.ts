/**
 * Remembered permissions (SECOND-BRAIN §3). The approval gate may skip a
 * question only for the same persona, action, target and limits. Never expands.
 */

import { DomainError } from './schemas.ts'
import type { BrainPage, BrainVisibility } from './brain.ts'

export type PermissionValidity = 'once' | 'days7' | 'until_revoked'

export interface PermissionGrant {
  readonly id: string
  readonly grantorId: string
  readonly personaId: string
  readonly action: string
  readonly target: string
  readonly maxUses: number
  readonly validity: PermissionValidity
  readonly grantedAt: number
  readonly expiresAt: number
  readonly revoked: boolean
  readonly uses: number
}

export type PermissionConsult =
  | { readonly kind: 'skip'; readonly grantId: string; readonly audit: string }
  | { readonly kind: 'ask'; readonly why: string }

const DAY_MS = 86_400_000

function ambiguousScope(scope: Pick<PermissionGrant, 'personaId' | 'action' | 'target'>): boolean {
  return [scope.personaId, scope.action, scope.target].some(value => value.trim() === '' || value.includes('*'))
}

/**
 * @param input - Human grant after "Lembrar esta permissão".
 * @param now - Clock (ms).
 */
export function rememberPermission(input: {
  readonly id: string
  readonly grantorId: string
  readonly personaId: string
  readonly action: string
  readonly target: string
  readonly maxUses?: number
  readonly validity: PermissionValidity
  readonly now: number
}): PermissionGrant {
  if (ambiguousScope(input)) {
    throw new DomainError('INVALID_BRAIN', 'SCOPE')
  }
  const days7 = input.validity === 'days7'
  return {
    id: input.id,
    grantorId: input.grantorId,
    personaId: input.personaId,
    action: input.action,
    target: input.target,
    maxUses: input.maxUses ?? (input.validity === 'once' ? 1 : 0),
    validity: input.validity,
    grantedAt: input.now,
    expiresAt: days7 ? input.now + 7 * DAY_MS : 0,
    revoked: false,
    uses: 0,
  }
}

/**
 * Immediate revoke. Next consult asks again.
 * @param grant - Current grant.
 */
export function revokePermission(grant: PermissionGrant): PermissionGrant {
  return { ...grant, revoked: true }
}

function dayLabel(ms: number): string {
  const date = new Date(ms)
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

/**
 * Approval gate. Exact match only — a broader action, other target, other
 * persona, expiry or revoke always asks.
 * @param grant - Stored grant (or undefined).
 * @param ask - This sensitive call.
 */
export function consultPermission(
  grant: PermissionGrant | undefined,
  ask: {
    readonly personaId: string
    readonly action: string
    readonly target: string
    readonly now: number
  },
): PermissionConsult {
  if (grant === undefined) return { kind: 'ask', why: 'sem permissão lembrada' }
  if (ambiguousScope(grant)) {
    return { kind: 'ask', why: 'escopo ambíguo' }
  }
  if (ambiguousScope(ask)) {
    return { kind: 'ask', why: 'escopo ambíguo' }
  }
  if (grant.revoked) return { kind: 'ask', why: 'revogada' }
  if (grant.personaId !== ask.personaId) return { kind: 'ask', why: 'outra persona' }
  if (grant.action !== ask.action) return { kind: 'ask', why: 'ação diferente ou mais ampla' }
  if (grant.target !== ask.target) return { kind: 'ask', why: 'outro alvo' }
  if (grant.expiresAt > 0 && ask.now >= grant.expiresAt) return { kind: 'ask', why: 'expirada' }
  if (grant.validity === 'once' && grant.uses >= 1) return { kind: 'ask', why: 'já usada uma vez' }
  if (grant.maxUses > 0 && grant.uses >= grant.maxUses) return { kind: 'ask', why: 'limite de usos' }
  return {
    kind: 'skip',
    grantId: grant.id,
    audit: `não perguntei porque você permitiu em ${dayLabel(grant.grantedAt)}`,
  }
}

/**
 * Record one skip. `once` grants become spent.
 * @param grant - Grant that just covered a call.
 */
export function markPermissionUsed(grant: PermissionGrant): PermissionGrant {
  return { ...grant, uses: grant.uses + 1 }
}

/**
 * Pick the covering grant, if any. First exact match that skips.
 * @param grants - Active remembered permissions.
 * @param ask - This call.
 */
export function consultPermissionList(
  grants: readonly PermissionGrant[],
  ask: {
    readonly personaId: string
    readonly action: string
    readonly target: string
    readonly now: number
  },
): PermissionConsult {
  let lastAsk: PermissionConsult = { kind: 'ask', why: 'sem permissão lembrada' }
  for (const grant of grants) {
    const hit = consultPermission(grant, ask)
    if (hit.kind === 'skip') return hit
    lastAsk = hit
  }
  return lastAsk
}

/**
 * Read a *Permissão concedida* page. Missing persona/action/target ⇒ uncovered.
 * @param page - Candidate page.
 */
export function grantFromPermissionPage(page: BrainPage): PermissionGrant | undefined {
  if (page.kind !== 'permission' || page.status !== 'active') return undefined
  const action = page.properties.action ?? ''
  const target = page.properties.target ?? ''
  const personaId = page.properties.personaId ?? ''
  if (ambiguousScope({ action, target, personaId })) return undefined
  const validity = page.properties.validity
  const known: PermissionValidity = validity === 'once' || validity === 'days7' || validity === 'until_revoked'
    ? validity
    : 'until_revoked'
  return {
    id: page.id,
    grantorId: page.properties.grantorId ?? page.authorId,
    personaId,
    action,
    target,
    maxUses: Number(page.properties.maxUses ?? '0') || 0,
    validity: known,
    grantedAt: page.createdAt,
    expiresAt: Number(page.properties.expiresAt ?? '0') || 0,
    revoked: page.properties.revoked === 'true',
    uses: Number(page.properties.uses ?? '0') || 0,
  }
}

/**
 * Persist a grant as a *Permissão concedida* page.
 * @param grant - Remembered permission.
 * @param workspaceId - Workspace.
 * @param visibility - Usually workspace (the human granted it).
 */
export function permissionPageFromGrant(
  grant: PermissionGrant,
  workspaceId: string,
  visibility: BrainVisibility,
): BrainPage {
  return {
    id: grant.id,
    workspaceId,
    kind: 'permission',
    title: `${grant.action} · ${grant.target}`,
    body: `${grant.personaId} pode ${grant.action} em ${grant.target}.`,
    properties: {
      grantorId: grant.grantorId,
      personaId: grant.personaId,
      action: grant.action,
      target: grant.target,
      maxUses: String(grant.maxUses),
      validity: grant.validity,
      expiresAt: String(grant.expiresAt),
      revoked: grant.revoked ? 'true' : 'false',
      uses: String(grant.uses),
    },
    sources: [{ kind: 'approval', id: grant.id }],
    visibility,
    revision: 1,
    confirmedAt: grant.grantedAt,
    links: [],
    required: false,
    status: grant.revoked ? 'revoked' : 'active',
    authorId: grant.grantorId,
    createdAt: grant.grantedAt,
    lastUsedAt: grant.grantedAt,
    replacedBy: '',
  }
}

/**
 * Gate over permission pages. Ambiguous or missing fields never skip.
 * @param pages - Workspace pages.
 * @param ask - This sensitive call.
 */
export function consultPermissionPages(
  pages: readonly BrainPage[],
  ask: {
    readonly personaId: string
    readonly action: string
    readonly target: string
    readonly now: number
  },
): PermissionConsult {
  const grants = pages
    .map(grantFromPermissionPage)
    .filter((grant): grant is PermissionGrant => grant !== undefined)
  return consultPermissionList(grants, ask)
}

/**
 * Connection choice (D6). A failed paid connection never silently becomes
 * another one; the user must pick.
 */

import { DomainError } from './schemas.ts'
import type { PersonaRunner } from './schemas.ts'

export type ConnectionKind = 'dsh' | 'claude' | 'codex' | 'cursor' | 'opencode'

export interface ConnectionCapabilities {
  mcp: boolean
  resume: boolean
  steer: boolean
  paid: boolean
}

/** What the UI should tell the user about a kind. */
export const CONNECTION_CAPABILITIES: Record<ConnectionKind, ConnectionCapabilities> = {
  dsh: { mcp: true, resume: true, steer: true, paid: false },
  claude: { mcp: true, resume: true, steer: true, paid: true },
  codex: { mcp: true, resume: true, steer: true, paid: true },
  cursor: { mcp: false, resume: true, steer: true, paid: true },
  opencode: { mcp: true, resume: true, steer: true, paid: true },
}

export interface Connection {
  id: string
  kind: ConnectionKind
  healthy: boolean
}

export type ConnectionChoice =
  | { kind: 'ok'; connection: Connection }
  | { kind: 'failed'; connectionId: string; reason: 'unhealthy' | 'missing' | 'ambiguous'; askUser: true }

/**
 * Pick exactly the connection the user (or the persona runner) named.
 * @param persona - Persona whose runner kind must match, unless `preferredId` is set.
 * @param runtime - Connections the host currently sees.
 * @param connections - Configured connections (may include offline ones).
 * @param preferredId - Explicit user choice. Required when more than one paid connection matches.
 */
export function chooseConnection(
  persona: { runner: PersonaRunner },
  runtime: { available: readonly Connection[] },
  connections: readonly Connection[],
  preferredId?: string,
): ConnectionChoice {
  if (preferredId !== undefined) {
    const chosen = connections.find(item => item.id === preferredId) ?? runtime.available.find(item => item.id === preferredId)
    if (chosen === undefined) return { kind: 'failed', connectionId: preferredId, reason: 'missing', askUser: true }
    if (!chosen.healthy) return { kind: 'failed', connectionId: chosen.id, reason: 'unhealthy', askUser: true }
    return { kind: 'ok', connection: chosen }
  }
  const want = persona.runner.kind === 'dsh' ? 'dsh' : persona.runner.cli
  const matches = connections.filter(item => item.kind === want)
  const healthy = matches.filter(item => item.healthy)
  if (healthy.length === 1) {
    const only = healthy[0]
    if (only === undefined) throw new DomainError('CONNECTION_UNDECIDED')
    return { kind: 'ok', connection: only }
  }
  if (healthy.length === 0 && matches.length === 1) {
    const only = matches[0]
    if (only === undefined) throw new DomainError('CONNECTION_UNDECIDED')
    return { kind: 'failed', connectionId: only.id, reason: 'unhealthy', askUser: true }
  }
  return { kind: 'failed', connectionId: matches[0]?.id ?? want, reason: 'ambiguous', askUser: true }
}

/**
 * @param kind - Connection kind.
 */
export function describeConnection(kind: ConnectionKind): string {
  const caps = CONNECTION_CAPABILITIES[kind]
  const mcp = caps.mcp ? 'com MCP' : 'sem MCP'
  return `${kind}: ${mcp}, resume ${caps.resume ? 'sim' : 'não'}, steer ${caps.steer ? 'sim' : 'não'}`
}

/**
 * Refuse to substitute B when A failed.
 * @param failedId - Connection that just failed.
 * @param other - Another connection the host is tempted to use.
 */
export function refuseSilentFallback(failedId: string, other: Connection): never {
  throw new DomainError('CONNECTION_UNDECIDED', `${failedId}->${other.id}`)
}

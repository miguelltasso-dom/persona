/**
 * Support dump: versions, counts, scheduler, connections. No secrets or message bodies.
 */

import { looksLikeCredential } from '@deepseek-ai/dsh-persona-core'
import { PERSONA_SCHEMA_VERSION, type PersonaStore, type ProductRepos } from '@deepseek-ai/dsh-persona-store'
import type { HostFlagsView } from './flags.ts'
import type { HostScheduler } from './scheduler.ts'

/** JSON-safe diagnostic card. */
export interface DiagnosticsView {
  readonly product: 'persona'
  readonly protocol: number
  readonly schemaVersion: number
  readonly recoveredFrom: string
  readonly recoveryMessage: string
  readonly counts: {
    readonly workspaces: number
    readonly projects: number
    readonly personas: number
    readonly members: number
    readonly events: number
  }
  readonly lastErrors: readonly string[]
  /** TEAM-15: the v1.1 switches as the host resolved them at boot (smoke: the installed app came up ON with no env). */
  readonly flags?: HostFlagsView
  /** EFF-1: where each engine's menu of models came from (`cli` | `static`). */
  readonly menus?: Readonly<Record<string, 'cli' | 'static'>>
  readonly scheduler: {
    readonly armed: readonly string[]
    readonly hasTimer: boolean
    readonly lastReadyMs: number
  }
  readonly watchdog: {
    readonly lastCount: number
  }
  readonly connections: readonly {
    readonly id: string
    readonly installed: boolean
    readonly loggedIn: boolean
  }[]
}

/** Host slice the dump reads. */
export interface DiagnosticsSource {
  readonly protocol: number
  readonly product: ProductRepos
  readonly store: PersonaStore
  readonly lastErrors: readonly string[]
  readonly scheduler: HostScheduler
  readonly flags?: HostFlagsView
  readonly menus?: Readonly<Record<string, 'cli' | 'static'>>
}

/**
 * Build the card. Caller must persist nothing that failed {@link looksLikeCredential}.
 * @param host - Open host slice.
 */
export function collectDiagnostics(host: DiagnosticsSource): DiagnosticsView {
  const workspaces = host.product.listWorkspaces()
  let projects = 0
  let personas = 0
  let members = 0
  for (const workspace of workspaces) {
    const list = host.product.listProjects(workspace.id)
    projects += list.length
    members += host.product.listMembers(workspace.id).length
    for (const project of list) personas += host.product.listPersonas(project.id).length
  }
  const eventRow = host.store.db.prepare('SELECT COUNT(*) AS n FROM event').get() as { n: number } | undefined
  const connections: DiagnosticsView['connections'] = [{
    id: 'dsh',
    installed: true,
    loggedIn: typeof process.env.DEEPSEEK_API_KEY === 'string' && process.env.DEEPSEEK_API_KEY.length > 0,
  }]
  return {
    product: 'persona',
    protocol: host.protocol,
    schemaVersion: host.store.schemaVersion() || PERSONA_SCHEMA_VERSION,
    recoveredFrom: host.store.recoveredFrom ?? '',
    recoveryMessage: host.store.recoveryMessage ?? '',
    counts: {
      workspaces: workspaces.length,
      projects,
      personas,
      members,
      events: eventRow?.n ?? 0,
    },
    lastErrors: [...host.lastErrors],
    ...(host.flags === undefined ? {} : { flags: host.flags }),
    ...(host.menus === undefined || Object.keys(host.menus).length === 0 ? {} : { menus: host.menus }),
    scheduler: {
      armed: [...host.scheduler.armed],
      hasTimer: host.scheduler.timer !== undefined,
      lastReadyMs: host.scheduler.lastReadyMs,
    },
    watchdog: {
      lastCount: 0,
    },
    connections,
  }
}

/**
 * @param view - Card.
 * @returns JSON that refused to serialize secrets.
 */
export function stringifyDiagnostics(view: DiagnosticsView): string {
  const json = JSON.stringify(view)
  if (looksLikeCredential(json)) throw new Error('diagnostics-secret')
  return json
}

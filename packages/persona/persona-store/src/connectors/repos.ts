/**
 * D-084 (antes ISO-2): the PERMANENT permission of a persona to use a connector of the person's CLI on her own initiative
 * ("Sempre permitir para a Nina"). Stored apart from `persona.tools` on purpose: `tools` is a map whose highest level decides the
 * persona's effective tool level, so a connector `write` kept there would raise it (files/shell) in silence. A permission here is a
 * POINTER with a level — never a command, URL or token. Persona-bound: it goes with the persona when she is deleted (the log stays).
 * Contract: persona-spec/contracts/connector-grants.md.
 */

import { randomUUID } from 'node:crypto'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** `write` includes `read`. */
export type ConnectorAccess = 'read' | 'write'
/** The classes of external, irreversible action that ask for a preview by default. */
export type ConfirmClass = 'send' | 'pay' | 'delete'
/** `never` = the person EXPLICITLY waived the preview for that class (and only that class, for that persona and that connector). */
export type ConfirmMode = 'ask' | 'never'
/** One mode per class. Pay and delete are waived only by an explicit permission of their own, never by the `send` box or a generic "Sempre permitir". */
export type ConfirmPolicy = Readonly<Record<ConfirmClass, ConfirmMode>>

/** Nothing waived: every irreversible action asks. */
export const ASK_ALWAYS: ConfirmPolicy = { send: 'ask', pay: 'ask', delete: 'ask' }

/** Most connectors one persona may hold. */
export const MAX_CONNECTOR_GRANTS_PER_PERSONA = 64
// 256: a connector of the ACCOUNT is identified by its proxy URL (ISO-5), longer than an MCP name.
const MAX_ID = 256
const MAX_NAME = 80
const CLI_PATTERN = /^[a-z0-9._-]{1,32}$/u
const CONTROL = /[\u0000-\u001f\u007f]/u
const CLASSES: readonly ConfirmClass[] = ['send', 'pay', 'delete']

/** One permission as stored. `name` is a label the client got from the CLI's config: untrusted text. */
export interface StoredConnectorGrant {
  readonly workspaceId: string
  readonly personaId: string
  readonly cli: string
  readonly connectorId: string
  readonly name: string
  readonly access: ConnectorAccess
  readonly confirm: ConfirmPolicy
  readonly grantedBy: string
  readonly grantedAt: string
}

/** What a `put` did. `unchanged`: the same level and the same waivers were already there (nothing is written, nothing is logged). */
export interface ConnectorGrantChange {
  readonly action: 'grant' | 'change' | 'unchanged'
  readonly grant: StoredConnectorGrant
}

/** One line of the append-only log (kept when the persona is deleted). */
export interface ConnectorGrantLogRow {
  readonly id: string
  readonly workspaceId: string
  readonly personaId: string
  readonly cli: string
  readonly connectorId: string
  readonly action: 'grant' | 'change' | 'revoke'
  readonly access?: ConnectorAccess
  readonly confirm?: ConfirmPolicy
  readonly actorId: string
  readonly at: string
}

/** Input of {@link ConnectorGrantRepos.put}: every class not named stays `ask`. */
export type ConnectorGrantInput = Omit<StoredConnectorGrant, 'grantedAt' | 'confirm'> & { readonly confirm?: Partial<ConfirmPolicy> }

function assertField(ok: boolean, field: string): void {
  if (!ok) throw new StoreError('constraint', field)
}

/** SQLite book for `connector_grant` and its append-only `connector_grant_log` (schema ≥ 22). */
export class ConnectorGrantRepos {
  /**
   * @param store - Open store.
   * @param now - Instant factory (tests inject it).
   */
  constructor(readonly store: PersonaStore, private readonly now: () => string = () => new Date().toISOString()) {}

  /**
   * @param workspaceId - Tenant.
   * @param personaId - One persona; omitted lists the whole workspace.
   * @returns Permissions ordered by persona, CLI, then connector id (stable: the runner derives a fingerprint from this order).
   */
  list(workspaceId: string, personaId?: string): StoredConnectorGrant[] {
    return this.store.db.prepare(
      `SELECT workspace_id, persona_id, cli, connector_id, name, access, confirm_send, confirm_pay, confirm_delete, granted_by, granted_at
         FROM connector_grant WHERE workspace_id = ? AND (? IS NULL OR persona_id = ?)
        ORDER BY persona_id ASC, cli ASC, connector_id ASC`,
    ).all(workspaceId, personaId ?? null, personaId ?? null).map(readGrant)
  }

  /**
   * @param workspaceId - Tenant.
   * @param personaId - Persona.
   * @param cli - CLI the connector comes from.
   * @param connectorId - The connector's id in that CLI.
   */
  get(workspaceId: string, personaId: string, cli: string, connectorId: string): StoredConnectorGrant | undefined {
    const row = this.store.db.prepare(
      `SELECT workspace_id, persona_id, cli, connector_id, name, access, confirm_send, confirm_pay, confirm_delete, granted_by, granted_at
         FROM connector_grant WHERE workspace_id = ? AND persona_id = ? AND cli = ? AND connector_id = ?`,
    ).get(workspaceId, personaId, cli, connectorId)
    return row === undefined ? undefined : readGrant(row)
  }

  /**
   * @param workspaceId - Tenant.
   * @param personaId - Persona.
   */
  count(workspaceId: string, personaId: string): number {
    const row = this.store.db.prepare('SELECT COUNT(*) AS total FROM connector_grant WHERE workspace_id = ? AND persona_id = ?').get(workspaceId, personaId)
    const total = row?.total
    return typeof total === 'number' ? total : 0
  }

  /**
   * Give (or change) a permission. Repeating the same level and waivers changes nothing and logs nothing.
   * @param input - The permission; `grantedAt` is stamped now.
   * @returns What happened, and the stored permission.
   * @throws StoreError `constraint` for a field outside its limits, or `connector-limit` past 64 per persona.
   */
  put(input: ConnectorGrantInput): ConnectorGrantChange {
    assertField(CLI_PATTERN.test(input.cli), 'cli')
    assertField(input.connectorId.length >= 1 && input.connectorId.length <= MAX_ID && !CONTROL.test(input.connectorId), 'connector_id')
    const name = input.name.trim()
    assertField(name.length >= 1 && name.length <= MAX_NAME && !CONTROL.test(name), 'name')
    const level: string = input.access // callers may pass anything from the wire: refuse unless it is one of the two
    assertField(level === 'read' || level === 'write', 'access')
    assertField(input.workspaceId !== '' && input.personaId !== '' && input.grantedBy !== '', 'identity')
    const confirm = confirmOf(input.confirm)
    const current = this.get(input.workspaceId, input.personaId, input.cli, input.connectorId)
    if (current?.access === input.access && sameConfirm(current.confirm, confirm)) return { action: 'unchanged', grant: current }
    if (current === undefined && this.count(input.workspaceId, input.personaId) >= MAX_CONNECTOR_GRANTS_PER_PERSONA) {
      throw new StoreError('constraint', 'connector-limit')
    }
    const at = this.now()
    const action = current === undefined ? 'grant' : 'change'
    const grant: StoredConnectorGrant = { ...input, name, confirm, grantedAt: at }
    this.store.tx((db) => {
      run(db, `INSERT INTO connector_grant
        (workspace_id, persona_id, cli, connector_id, name, access, confirm_send, confirm_pay, confirm_delete, granted_by, granted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, persona_id, cli, connector_id) DO UPDATE SET
          name = excluded.name, access = excluded.access, confirm_send = excluded.confirm_send, confirm_pay = excluded.confirm_pay,
          confirm_delete = excluded.confirm_delete, granted_by = excluded.granted_by, granted_at = excluded.granted_at`, [
        grant.workspaceId, grant.personaId, grant.cli, grant.connectorId, grant.name, grant.access,
        confirm.send, confirm.pay, confirm.delete, grant.grantedBy, grant.grantedAt,
      ])
      this.appendLog(db, {
        workspaceId: grant.workspaceId, personaId: grant.personaId, cli: grant.cli, connectorId: grant.connectorId,
        action, access: grant.access, confirm, actorId: grant.grantedBy, at,
      })
    })
    return { action, grant }
  }

  /**
   * Take a permission back. Idempotent: nothing there ⇒ nothing is logged.
   * @param workspaceId - Tenant.
   * @param personaId - Persona.
   * @param cli - CLI the connector comes from.
   * @param connectorId - The connector's id in that CLI.
   * @param actorId - Who took it back.
   * @returns The permission that was removed, or `undefined` when there was none.
   */
  revoke(workspaceId: string, personaId: string, cli: string, connectorId: string, actorId: string): StoredConnectorGrant | undefined {
    const current = this.get(workspaceId, personaId, cli, connectorId)
    if (current === undefined) return undefined
    const at = this.now()
    this.store.tx((db) => {
      run(db, 'DELETE FROM connector_grant WHERE workspace_id = ? AND persona_id = ? AND cli = ? AND connector_id = ?', [workspaceId, personaId, cli, connectorId])
      this.appendLog(db, { workspaceId, personaId, cli, connectorId, action: 'revoke', actorId, at })
    })
    return current
  }

  /**
   * @param workspaceId - Tenant.
   * @param personaId - One persona; omitted reads the whole workspace.
   * @returns The append-only log, oldest first.
   */
  log(workspaceId: string, personaId?: string): ConnectorGrantLogRow[] {
    return this.store.db.prepare(
      `SELECT id, workspace_id, persona_id, cli, connector_id, action, access, confirm_json, actor_id, at
         FROM connector_grant_log WHERE workspace_id = ? AND (? IS NULL OR persona_id = ?) ORDER BY at ASC, id ASC`,
    ).all(workspaceId, personaId ?? null, personaId ?? null).map((row) => {
      const access = optionalText(row, 'access')
      const raw = optionalText(row, 'confirm_json')
      const action = text(row, 'action')
      return {
        id: text(row, 'id'),
        workspaceId: text(row, 'workspace_id'),
        personaId: text(row, 'persona_id'),
        cli: text(row, 'cli'),
        connectorId: text(row, 'connector_id'),
        action: action === 'grant' || action === 'change' ? action : 'revoke',
        ...(access === 'read' || access === 'write' ? { access } : {}),
        ...(raw === undefined ? {} : { confirm: confirmOf(JSON.parse(raw) as Partial<ConfirmPolicy>) }),
        actorId: text(row, 'actor_id'),
        at: text(row, 'at'),
      }
    })
  }

  private appendLog(db: DatabaseSync, row: Omit<ConnectorGrantLogRow, 'id'>): void {
    run(db, `INSERT INTO connector_grant_log (id, workspace_id, persona_id, cli, connector_id, action, access, confirm_json, actor_id, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      `${row.action}:${row.at}:${randomUUID()}`, row.workspaceId, row.personaId, row.cli, row.connectorId, row.action,
      row.access ?? null, row.confirm === undefined ? null : JSON.stringify(row.confirm), row.actorId, row.at,
    ])
  }
}

/** Every class not named stays `ask`; a value from the wire that is not `never` is `ask` too (the safe side). */
function confirmOf(input: Partial<ConfirmPolicy> | undefined): ConfirmPolicy {
  const pick = (name: ConfirmClass): ConfirmMode => ((input as Record<string, unknown> | undefined)?.[name] === 'never' ? 'never' : 'ask')
  return { send: pick('send'), pay: pick('pay'), delete: pick('delete') }
}

function sameConfirm(a: ConfirmPolicy, b: ConfirmPolicy): boolean {
  return CLASSES.every(name => a[name] === b[name])
}

function readGrant(row: Record<string, SQLOutputValue>): StoredConnectorGrant {
  const access = text(row, 'access')
  return {
    workspaceId: text(row, 'workspace_id'),
    personaId: text(row, 'persona_id'),
    cli: text(row, 'cli'),
    connectorId: text(row, 'connector_id'),
    name: text(row, 'name'),
    access: access === 'write' ? 'write' : 'read',
    confirm: {
      send: text(row, 'confirm_send') === 'never' ? 'never' : 'ask',
      pay: text(row, 'confirm_pay') === 'never' ? 'never' : 'ask',
      delete: text(row, 'confirm_delete') === 'never' ? 'never' : 'ask',
    },
    grantedBy: text(row, 'granted_by'),
    grantedAt: text(row, 'granted_at'),
  }
}

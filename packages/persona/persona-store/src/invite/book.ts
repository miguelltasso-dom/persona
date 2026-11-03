/**
 * Persistence for Forge invite/grant/purge functions. The functions stay in
 * persona-core; this book stores the invite, the granted actor, and the
 * vault/memory rows `purgeSource` rewrites.
 */

import type { Actor, AgedMemory, Invite, VaultRecord } from '@deepseek-ai/dsh-persona-core'
import type { SQLOutputValue } from 'node:sqlite'
import { run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Invite + grant + purge rows the host keeps after Forge functions run. */
export interface InviteBook {
  /**
   * @param invite - Issued, redeemed, or revoked invite.
   */
  putInvite(invite: Invite): void
  /**
   * @param id - Invite id.
   */
  getInvite(id: string): Invite | undefined
  /**
   * @param workspaceId - Workspace that issued the token.
   */
  listInvites(workspaceId: string): Invite[]
  /**
   * @param workspaceId - Workspace that issued the token.
   * @param token - One-time token.
   */
  getInviteByToken(workspaceId: string, token: string): Invite | undefined
  /**
   * @param actor - Actor after apply/revoke grant.
   */
  putActor(actor: Actor): void
  /**
   * @param workspaceId - Workspace.
   * @param actorId - Actor id.
   */
  getActor(workspaceId: string, actorId: string): Actor | undefined
  /**
   * @param records - Vault rows (full replace-by-id).
   */
  putVaultRecords(records: readonly VaultRecord[]): void
  /** @returns Stored vault rows. */
  listVaultRecords(): VaultRecord[]
  /**
   * @param memories - Aged memories (full replace-by-id).
   */
  putMemories(memories: readonly AgedMemory[]): void
  /** @returns Stored aged memories. */
  listMemories(): AgedMemory[]
}

/** SQLite {@link InviteBook} (schema ≥ 3). */
export class SqliteInviteBook implements InviteBook {
  readonly store: PersonaStore

  /**
   * @param store - Open store (schema ≥ 3).
   */
  constructor(store: PersonaStore) {
    this.store = store
  }

  /**
   * @param invite - Issued, redeemed, or revoked invite.
   */
  putInvite(invite: Invite): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO invite (id, workspace_id, token, expires_at, used_at, revoked_at, body)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          token = excluded.token,
          expires_at = excluded.expires_at,
          used_at = excluded.used_at,
          revoked_at = excluded.revoked_at,
          body = excluded.body`, [
        invite.id,
        invite.workspaceId,
        invite.token,
        invite.expiresAt,
        invite.usedAt ?? null,
        invite.revokedAt ?? null,
        JSON.stringify(invite),
      ])
    })
  }

  /**
   * @param id - Invite id.
   */
  getInvite(id: string): Invite | undefined {
    const row = this.store.db.prepare('SELECT body FROM invite WHERE id = ?').get(id)
    return row === undefined ? undefined : readInvite(row)
  }

  /**
   * @param workspaceId - Workspace that issued the token.
   */
  listInvites(workspaceId: string): Invite[] {
    return this.store.db.prepare(
      'SELECT body FROM invite WHERE workspace_id = ? ORDER BY rowid DESC',
    ).all(workspaceId).map(readInvite)
  }

  /**
   * @param workspaceId - Workspace that issued the token.
   * @param token - One-time token.
   */
  getInviteByToken(workspaceId: string, token: string): Invite | undefined {
    const row = this.store.db.prepare(
      'SELECT body FROM invite WHERE workspace_id = ? AND token = ?',
    ).get(workspaceId, token)
    return row === undefined ? undefined : readInvite(row)
  }

  /**
   * @param actor - Actor after apply/revoke grant.
   */
  putActor(actor: Actor): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO invite_actor (workspace_id, actor_id, body) VALUES (?, ?, ?)
        ON CONFLICT(workspace_id, actor_id) DO UPDATE SET body = excluded.body`, [
        actor.workspaceId, actor.id, JSON.stringify(actor),
      ])
    })
  }

  /**
   * @param workspaceId - Workspace.
   * @param actorId - Actor id.
   */
  getActor(workspaceId: string, actorId: string): Actor | undefined {
    const row = this.store.db.prepare(
      'SELECT body FROM invite_actor WHERE workspace_id = ? AND actor_id = ?',
    ).get(workspaceId, actorId)
    return row === undefined ? undefined : readActor(row)
  }

  /**
   * @param records - Vault rows (full replace-by-id).
   */
  putVaultRecords(records: readonly VaultRecord[]): void {
    this.store.tx((db) => {
      for (const record of records) {
        run(db, `INSERT INTO invite_vault (id, body) VALUES (?, ?)
          ON CONFLICT(id) DO UPDATE SET body = excluded.body`, [record.id, JSON.stringify(record)])
      }
    })
  }

  /** @returns Stored vault rows. */
  listVaultRecords(): VaultRecord[] {
    return this.store.db.prepare('SELECT body FROM invite_vault ORDER BY rowid ASC').all()
      .map(row => readVault(row))
  }

  /**
   * @param memories - Aged memories (full replace-by-id).
   */
  putMemories(memories: readonly AgedMemory[]): void {
    this.store.tx((db) => {
      for (const memory of memories) {
        run(db, `INSERT INTO invite_memory (id, body) VALUES (?, ?)
          ON CONFLICT(id) DO UPDATE SET body = excluded.body`, [memory.id, JSON.stringify(memory)])
      }
    })
  }

  /** @returns Stored aged memories. */
  listMemories(): AgedMemory[] {
    return this.store.db.prepare('SELECT body FROM invite_memory ORDER BY rowid ASC').all()
      .map(row => readMemory(row))
  }
}

function readInvite(row: Record<string, SQLOutputValue>): Invite {
  return structuredClone(JSON.parse(text(row, 'body')) as Invite)
}

function readActor(row: Record<string, SQLOutputValue>): Actor {
  return structuredClone(JSON.parse(text(row, 'body')) as Actor)
}

function readVault(row: Record<string, SQLOutputValue>): VaultRecord {
  return structuredClone(JSON.parse(text(row, 'body')) as VaultRecord)
}

function readMemory(row: Record<string, SQLOutputValue>): AgedMemory {
  return structuredClone(JSON.parse(text(row, 'body')) as AgedMemory)
}

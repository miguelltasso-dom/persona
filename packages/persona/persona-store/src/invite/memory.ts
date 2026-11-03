/**
 * In-memory {@link InviteBook} so the invite contract suite runs on both
 * backends without touching persona-core.
 */

import type { Actor, AgedMemory, Invite, VaultRecord } from '@deepseek-ai/dsh-persona-core'
import type { InviteBook } from './book.ts'

/** Ephemeral invite book for the shared contract suite. */
export class MemoryInviteBook implements InviteBook {
  private readonly invites = new Map<string, Invite>()
  private readonly actors = new Map<string, Actor>()
  private readonly vault = new Map<string, VaultRecord>()
  private readonly memories = new Map<string, AgedMemory>()

  /**
   * @param invite - Issued, redeemed, or revoked invite.
   */
  putInvite(invite: Invite): void {
    this.invites.set(invite.id, invite)
  }

  /**
   * @param id - Invite id.
   */
  getInvite(id: string): Invite | undefined {
    return this.invites.get(id)
  }

  /**
   * @param workspaceId - Workspace that issued the token.
   */
  listInvites(workspaceId: string): Invite[] {
    return [...this.invites.values()].filter(invite => invite.workspaceId === workspaceId)
  }

  /**
   * @param workspaceId - Workspace that issued the token.
   * @param token - One-time token.
   */
  getInviteByToken(workspaceId: string, token: string): Invite | undefined {
    for (const invite of this.invites.values()) {
      if (invite.workspaceId === workspaceId && invite.token === token) return invite
    }
    return undefined
  }

  /**
   * @param actor - Actor after apply/revoke grant.
   */
  putActor(actor: Actor): void {
    this.actors.set(`${actor.workspaceId}:${actor.id}`, actor)
  }

  /**
   * @param workspaceId - Workspace.
   * @param actorId - Actor id.
   */
  getActor(workspaceId: string, actorId: string): Actor | undefined {
    return this.actors.get(`${workspaceId}:${actorId}`)
  }

  /**
   * @param records - Vault rows (full replace-by-id).
   */
  putVaultRecords(records: readonly VaultRecord[]): void {
    for (const record of records) this.vault.set(record.id, record)
  }

  /** @returns Stored vault rows. */
  listVaultRecords(): VaultRecord[] {
    return [...this.vault.values()]
  }

  /**
   * @param memories - Aged memories (full replace-by-id).
   */
  putMemories(memories: readonly AgedMemory[]): void {
    for (const memory of memories) this.memories.set(memory.id, memory)
  }

  /** @returns Stored aged memories. */
  listMemories(): AgedMemory[] {
    return [...this.memories.values()]
  }
}

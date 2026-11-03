/**
 * Wire {@link SyncClient} to the desktop SQLite log. The edge URL is optional;
 * without it the client stays offline (outbox only).
 */

import { SyncClient, HttpTransport, MemoryTransport } from '@deepseek-ai/dsh-persona-sync'
import { MemorySyncLog } from '@deepseek-ai/dsh-persona-core'
import { SqliteSyncLog, type PersonaStore } from '@deepseek-ai/dsh-persona-store'
import type { SyncTransport } from '@deepseek-ai/dsh-persona-sync'

/**
 * @param store - Open store (schema ≥ 3).
 * @param transport - Edge or test double.
 */
export function openHostSync(store: PersonaStore, transport: SyncTransport): SyncClient {
  return new SyncClient({ log: new SqliteSyncLog(store), transport })
}

/**
 * @param store - Open store.
 * @param edgeUrl - Worker origin, or empty to stay offline.
 * @param workspaceId - Workspace for HTTP.
 */
export function openHostSyncFromEnv(
  store: PersonaStore,
  edgeUrl: string = '',
  workspaceId: string = 'ws',
): SyncClient {
  if (edgeUrl === '') {
    return openHostSync(store, new MemoryTransport(new MemorySyncLog(), false))
  }
  return openHostSync(store, new HttpTransport(edgeUrl, workspaceId))
}

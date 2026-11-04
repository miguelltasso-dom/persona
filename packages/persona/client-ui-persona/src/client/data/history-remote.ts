/**
 * Projeto › Histórico over the host (SW-6: `listRestorePoints` / `undoApply`). The Typert client may lag the host, so the
 * methods are reached through a narrow wire; when the host does not have them yet the screen is simply read-only/empty.
 * Contract the UI expects: persona-spec/contracts/simple-workspace-ui.md.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { HistoryEntryUi } from '../review/simple/ProjectHistoryView.tsx'
import { splitPath } from '../review/simple/patch-to-changes.ts'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'

/** One "Aplicar" the host can take back. Everything but `id`, `createdAt` and `files` is optional. */
export interface RestorePointWire {
  readonly id: string
  /** ISO time the changes were applied to the folder. */
  readonly createdAt: string
  /** Who applied ("Bia"); empty = the person themself. */
  readonly actorName?: string | undefined
  readonly files: readonly { readonly path: string }[]
  readonly undone?: boolean | undefined
}

interface HistoryWire {
  listRestorePoints(request: ProjectScopeRequest): Promise<RemoteResult<readonly RestorePointWire[]>>
  undoApply(request: ProjectScopeRequest & { readonly id: string }): Promise<RemoteResult<unknown>>
}

export interface PersonaHistoryRemote {
  /** The host knows the history Remotes (SW-6 shipped). */
  readonly available: boolean
  list(scope: ProjectScopeRequest): Promise<readonly RestorePointWire[]>
  undo(scope: ProjectScopeRequest, id: string): Promise<void>
}

export function personaHistoryRemote(persona: PersonaRemoteClient): PersonaHistoryRemote {
  const wire = persona as PersonaRemoteClient & Partial<HistoryWire>
  if (typeof wire.listRestorePoints !== 'function' || typeof wire.undoApply !== 'function') {
    return { available: false, list: () => Promise.resolve([]), undo: () => Promise.reject(new Error('history-unavailable')) }
  }
  const ready = wire as PersonaRemoteClient & HistoryWire
  return {
    available: true,
    list: async scope => unwrapRemote(await ready.listRestorePoints(scope)),
    undo: async (scope, id) => { await unwrapRemote(await ready.undoApply({ ...scope, id })) },
  }
}

/** Host restore points → list rows. File names only: never a path outside the project. */
export function restorePointsToEntries(points: readonly RestorePointWire[], fallbackWho: string): readonly HistoryEntryUi[] {
  return points.map(point => ({
    id: point.id,
    who: point.actorName !== undefined && point.actorName.trim() !== '' ? point.actorName.trim() : fallbackWho,
    at: point.createdAt,
    files: point.files.map(file => ({ name: splitPath(file.path).name })),
    ...(point.undone === true ? { undone: true } : {}),
  }))
}

/**
 * Projeto › Histórico over the host (SW-6, contracts/simple-workspace.md): `listRestorePoints` answers a status plus the
 * points; `undoApply` answers restored / expired / blocked (with a safe pt-BR sentence). The Typert client may lag the
 * host, so the methods are reached through a narrow wire; without them the screen is an honest read-only "unavailable".
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ProjectScopeRequest,
  RestorePointListView,
  RestorePointView,
  UndoApplyRequest,
  UndoApplyView,
} from '@deepseek-ai/dsh-persona-host/types'
import type { HistoryEntryUi } from '../review/simple/ProjectHistoryView.tsx'
import { splitPath } from '../review/simple/patch-to-changes.ts'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'

interface HistoryWire {
  listRestorePoints(request: ProjectScopeRequest): Promise<RemoteResult<RestorePointListView>>
  undoApply(request: UndoApplyRequest): Promise<RemoteResult<UndoApplyView>>
}

/**
 * The screen's own handle on the history (NOT a wire type: the host methods are listRestorePoints / undoApply, reached through
 * HistoryWire above). Named "Client" so the wire-contract comparator does not mistake its list/undo for host Remotes.
 */
export interface ProjectHistoryClient {
  /** The host knows the history Remotes (SW-6 shipped in this host). */
  readonly available: boolean
  list(scope: ProjectScopeRequest): Promise<RestorePointListView>
  undo(scope: ProjectScopeRequest, restorePointId: string): Promise<UndoApplyView>
}

export function personaHistoryRemote(persona: PersonaRemoteClient): ProjectHistoryClient {
  const wire = persona as PersonaRemoteClient & Partial<HistoryWire>
  if (typeof wire.listRestorePoints !== 'function' || typeof wire.undoApply !== 'function') {
    return {
      available: false,
      list: () => Promise.resolve({ status: 'unsupported', points: [] }),
      undo: () => Promise.reject(new Error('history-unavailable')),
    }
  }
  const ready = wire
  return {
    available: true,
    list: async scope => unwrapRemote(await ready.listRestorePoints(scope)),
    undo: async (scope, restorePointId) => unwrapRemote(await ready.undoApply({ ...scope, restorePointId })),
  }
}

/** What the screen knows about a Tarefa (from the board): its name, and the persona who did the work. */
export interface HistoryTaskInfo {
  readonly title: string
  readonly personaName?: string | undefined
}

/**
 * Host restore points → list rows. File names only (never a folder outside the project); the Tarefa's name comes from
 * the board by `ticketId`; an expired point is gone, an undone one stays as "Desfeito".
 */
export function restorePointsToEntries(
  points: readonly RestorePointView[],
  /** Who to name when the board does not know the Tarefa's persona; `undefined` = name nobody (the line says "1 mudança aplicada"). */
  fallbackWho: string | undefined,
  tasks: ReadonlyMap<string, HistoryTaskInfo> = new Map(),
): readonly HistoryEntryUi[] {
  return points
    .filter(point => point.state !== 'expired')
    .map((point): HistoryEntryUi => {
      const task = tasks.get(point.ticketId)
      const who = task?.personaName !== undefined && task.personaName.trim() !== '' ? task.personaName.trim() : fallbackWho
      return {
        id: point.id,
        who,
        at: point.createdAt,
        files: point.files.map(path => ({ name: splitPath(path).name })),
        ...(task === undefined ? {} : { taskTitle: task.title }),
        ...(point.state === 'undone' ? { undone: true } : {}),
      }
    })
}

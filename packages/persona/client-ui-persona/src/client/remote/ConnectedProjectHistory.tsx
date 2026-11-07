/** Projeto › Histórico, loaded from the host (SW-8). Same project chrome as the board: back link and tabs. */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import { Button, Screen, UiIcon } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as reviewDict } from '../locale/review/locales.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { personaHistoryRemote, restorePointsToEntries, type HistoryTaskInfo } from '../data/history-remote.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { ProjectWorkspaceTabs, type ProjectWorkspaceTab } from '../shell/ProjectWorkspaceTabs.tsx'
import { ProjectHistoryView } from '../review/simple/ProjectHistoryView.tsx'

export interface ConnectedProjectHistoryProps {
  readonly persona: PersonaRemoteClient
  readonly scope: ProjectScopeRequest
  /** Kanban dictionary: the tabs and the back link speak its words. */
  readonly kanbanDict: LocaleDict
  /** Board cards: the host names a restore point only by its Tarefa id. */
  readonly tasks?: readonly { readonly id: string; readonly title: string; readonly assignee?: { readonly name?: string | undefined } | undefined }[]
  readonly onBack: () => void
  readonly onWorkspaceTabChange: (tab: ProjectWorkspaceTab) => void
}

export function ConnectedProjectHistory({
  persona,
  scope,
  kanbanDict,
  tasks = [],
  onBack,
  onWorkspaceTabChange,
}: ConnectedProjectHistoryProps): ReactNode {
  const history = useMemo(() => personaHistoryRemote(persona), [persona])
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [undoMessage, setUndoMessage] = useState<string | null>(null)
  const load = useCallback(async () => history.list(scope), [history, scope])
  const { state, retry } = usePersonaRemoteLoad(true, `${scope.workspaceId}:${scope.projectId}:history`, load)
  const taskInfo = useMemo(
    () => new Map<string, HistoryTaskInfo>(tasks.map(task => [task.id, { title: task.title, personaName: task.assignee?.name }])),
    [tasks],
  )

  const undo = (id: string): void => {
    setUndoingId(id)
    setUndoMessage(null)
    void history.undo(scope, id)
      .then((result) => {
        if (result.kind === 'restored') retry()
        else if (result.kind === 'expired') setUndoMessage(bindLocale(reviewDict, 'undo.expired'))
        // blocked: the host already wrote a safe sentence (a file you changed since would be overwritten)
        else setUndoMessage(result.explanation)
      })
      .catch(() => { setUndoMessage(bindLocale(reviewDict, 'undo.failed')) })
      .finally(() => { setUndoingId(null) })
  }

  const listed = state.status === 'ready' ? state.data : null

  return (
    <Screen width="full" data-persona-kanban="project-history">
      <Button variant="ghost" icon={<UiIcon name="chevronRight" size={18} />} onClick={onBack}>
        {bindLocale(kanbanDict, 'boards.backToGrid')}
      </Button>
      <ProjectWorkspaceTabs dict={kanbanDict} value="history" onChange={onWorkspaceTabChange} />
      <ProjectHistoryView
        state={state.status === 'ready' ? 'ready' : state.status === 'error' ? 'error' : 'loading'}
        entries={listed === null ? [] : restorePointsToEntries(listed.points, undefined, taskInfo)}
        canUndo={history.available && listed?.status === 'available'}
        unavailable={listed !== null && listed.status !== 'available'}
        undoingId={undoingId}
        onUndo={undo}
        onRetry={retry}
      />
      {undoMessage !== null && <p role="alert">{undoMessage}</p>}
    </Screen>
  )
}

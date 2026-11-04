/** Projeto › Histórico, loaded from the host (SW-8). Same project chrome as the board: back link and tabs. */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import { Button, Screen, UiIcon } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as reviewDict } from '../locale/review/locales.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { personaHistoryRemote, restorePointsToEntries } from '../data/history-remote.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { ProjectWorkspaceTabs, type ProjectWorkspaceTab } from '../shell/ProjectWorkspaceTabs.tsx'
import { ProjectHistoryView } from '../review/simple/ProjectHistoryView.tsx'

export interface ConnectedProjectHistoryProps {
  readonly persona: PersonaRemoteClient
  readonly scope: ProjectScopeRequest
  /** Kanban dictionary: the tabs and the back link speak its words. */
  readonly kanbanDict: LocaleDict
  readonly onBack: () => void
  readonly onWorkspaceTabChange: (tab: ProjectWorkspaceTab) => void
}

export function ConnectedProjectHistory({
  persona,
  scope,
  kanbanDict,
  onBack,
  onWorkspaceTabChange,
}: ConnectedProjectHistoryProps): ReactNode {
  const history = useMemo(() => personaHistoryRemote(persona), [persona])
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [undoError, setUndoError] = useState(false)
  const load = useCallback(async () => history.list(scope), [history, scope])
  const { state, retry } = usePersonaRemoteLoad(true, `${scope.workspaceId}:${scope.projectId}:history`, load)
  const fallbackWho = bindLocale(reviewDict, 'persona.fallback')

  const undo = (id: string): void => {
    setUndoingId(id)
    setUndoError(false)
    void history.undo(scope, id)
      .then(() => { retry() })
      .catch(() => { setUndoError(true) })
      .finally(() => { setUndoingId(null) })
  }

  return (
    <Screen width="full" data-persona-kanban="project-history">
      <Button variant="ghost" icon={<UiIcon name="chevronRight" size={18} />} onClick={onBack}>
        {bindLocale(kanbanDict, 'boards.backToGrid')}
      </Button>
      <ProjectWorkspaceTabs dict={kanbanDict} value="history" onChange={onWorkspaceTabChange} />
      <ProjectHistoryView
        state={state.status === 'ready' ? 'ready' : state.status === 'error' ? 'error' : 'loading'}
        entries={state.status === 'ready' ? restorePointsToEntries(state.data, fallbackWho) : []}
        canUndo={history.available}
        undoingId={undoingId}
        onUndo={undo}
        onRetry={retry}
      />
      {undoError && <p role="alert">{bindLocale(reviewDict, 'undo.failed')}</p>}
    </Screen>
  )
}

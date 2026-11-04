import { useEffect, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '../shell/create-shell-store.ts'
import { requestComposerFocus } from '../chat/composer-focus.ts'
import { SearchPlaceholderView, type SearchAction, type SearchContentResult } from '../shell/SearchPlaceholderView.tsx'
import type { PersonaLiveSnapshot, PersonaLiveStore } from './persona-live-store.ts'
import type { RailPersona } from '../shell/RailTeam.tsx'

export interface ConnectedSearchInjected {
  readonly hooks: {
    readonly team: HostObservable<readonly RailPersona[]>
    readonly live: HostObservable<PersonaLiveSnapshot>
  }
  readonly navigate: (panel: MainPanelId) => void
  readonly openPersonaProfile: (personaId: string) => void
  readonly liveStore: PersonaLiveStore
  /** Ctrl K that does (Muse, T3-UX-HARVEST §2). */
  readonly actions?: readonly SearchAction[] | undefined
  readonly personaActions?: ((persona: RailPersona) => readonly SearchAction[]) | undefined
}

export type ConnectedSearchViewProps =
  & PropsLocale<'persona.shell'>
  & InjectFace<ConnectedSearchInjected>

/** Busca: Muse UX-06 navigation + Prism host `search()` for messages. */
export function ConnectedSearchView({
  t,
  useTeam,
  navigate,
  openPersonaProfile,
  liveStore,
  actions,
  personaActions,
}: ConnectedSearchViewProps): ReactNode {
  const [query, setQuery] = useState('')
  const [contentResults, setContentResults] = useState<readonly SearchContentResult[]>([])

  const goPanel = (panel: MainPanelId): void => {
    navigate(panel)
    if (panel === 'channels') requestComposerFocus()
  }

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setContentResults([])
      return
    }
    const handle = window.setTimeout(() => {
      void liveStore.searchMessages(trimmed).then((rows) => {
        setContentResults(rows.map(row => ({
          id: row.id,
          meta: row.meta,
          text: row.text,
          onOpen: () => { goPanel('channels') },
        })))
      })
    }, 200)
    return () => { window.clearTimeout(handle) }
  }, [liveStore, navigate, query])

  return (
    <SearchPlaceholderView
      t={t}
      useTeam={useTeam}
      navigate={goPanel}
      openPersonaProfile={openPersonaProfile}
      contentResults={contentResults}
      onQueryChange={setQuery}
      {...(actions === undefined ? {} : { actions })}
      {...(personaActions === undefined ? {} : { personaActions })}
    />
  )
}

import type { ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { GlobalKanban } from '../kanban/GlobalKanban.tsx'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'

export interface ConnectedKanbanInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
}

export type ConnectedGlobalKanbanProps = InjectFace<ConnectedKanbanInjected>

export function ConnectedGlobalKanban({ useLive }: ConnectedGlobalKanbanProps): ReactNode {
  const live = useLive(state => state)
  if (!live.ready) return <GlobalKanban initialState="loading" />
  if (live.kanbanCards.length === 0) return <GlobalKanban initialState="empty" initialCards={[]} />
  return <GlobalKanban initialCards={live.kanbanCards} />
}

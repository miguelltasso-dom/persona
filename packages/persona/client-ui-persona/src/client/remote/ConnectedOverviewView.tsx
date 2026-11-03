import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { OverviewView } from '../overview/OverviewView.tsx'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'

export interface ConnectedOverviewInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  navigate(panel: 'channels' | 'kanban' | 'approvals'): void
}

export type ConnectedOverviewViewProps = PropsLocale<'persona.shell'> & InjectFace<ConnectedOverviewInjected>

export function ConnectedOverviewView({ t, useLive, navigate }: ConnectedOverviewViewProps): ReactNode {
  const live = useLive(state => state)
  const awayEvents = live.awayEvents.map(event => ({
    id: event.id,
    body: event.body,
    taskLabel: event.taskLabel,
  }))
  return (
    <OverviewView
      t={t}
      attentionItems={live.attentionTitles}
      nowRows={live.nowRows}
      awayEvents={awayEvents}
      userName={live.messages.find(message => message.authorId === 'user')?.authorName}
      onNavigate={navigate}
    />
  )
}

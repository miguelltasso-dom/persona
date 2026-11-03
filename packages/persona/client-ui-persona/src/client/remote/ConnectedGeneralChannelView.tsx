import type { ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { GeneralChannelView } from '../chat/GeneralChannelView.tsx'
import type { TurnContextUi } from './turn-context-ui.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from './persona-live-store.ts'

export interface ConnectedChannelInjected {
  hooks: { live: HostObservable<PersonaLiveSnapshot> }
  postChannelMessage(body: string): void
  loadTurnContext(ticketId: string): void
}

export type ConnectedGeneralChannelViewProps =
  & PropsLocale<'persona.chat'>
  & InjectFace<ConnectedChannelInjected>
  & {
    readonly shellT: PropsLocale<'persona.shell'>['t']
    readonly onBuildTeam?: (() => void) | undefined
  }

export function ConnectedGeneralChannelView({
  t,
  shellT,
  useLive,
  postChannelMessage,
  loadTurnContext,
  onBuildTeam,
}: ConnectedGeneralChannelViewProps): ReactNode {
  const live = useLive(state => state)
  return (
    <GeneralChannelView
      t={t}
      shellT={shellT}
      members={live.stripMembers}
      messages={live.messages}
      passThroughFollowers={live.passThroughFollowers}
      turnContext={live.turnContext}
      onLoadTurnContext={loadTurnContext}
      onBuildTeam={onBuildTeam}
      onSendMessage={(body) => { void postChannelMessage(body) }}
    />
  )
}

export type { TurnContextUi }

export type { PersonaLiveStore }

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { RunErrorCard, describeRunError, runErrorText, type RunErrorPayload } from '../primitives/index.ts'
import type { RunErrorHandlerContext } from './run-error-handlers.ts'
import { runRunErrorAction } from './run-error-handlers.ts'

export interface ConversationRunErrorCardProps {
  readonly t: PropsLocale<'persona.chat'>['t']
  readonly personaName: string
  readonly payload: RunErrorPayload
  readonly hostPersonaId?: string | undefined
  readonly handlers: RunErrorHandlerContext
}

/** Persona-voiced run error in the channel/DM stream (Muse RunErrorCard + Prism handlers). */
export function ConversationRunErrorCard({ t, personaName, payload, hostPersonaId, handlers }: ConversationRunErrorCardProps): ReactNode {
  const desc = describeRunError({ ...payload, persona: payload.persona ?? personaName })
  const text = runErrorText(desc, (key, params) => t(key as never, params as never))
  const run = (action: typeof desc.primary): void => { runRunErrorAction(action, handlers, hostPersonaId) }
  return (
    <RunErrorCard
      tone={desc.tone}
      persona={{ name: personaName }}
      title={text.title}
      body={text.body}
      {...(desc.command === undefined ? {} : { command: desc.command })}
      primary={{ label: text.primary, onClick: () => { run(desc.primary) } }}
      {...(text.secondary === undefined || desc.secondary === undefined
        ? {}
        : { secondary: { label: text.secondary, onClick: () => { run(desc.secondary!) } } })}
      labels={{
        copy: t('runError.copy'),
        copied: t('runError.copied'),
        commandLabel: t('runError.commandLabel'),
      }}
    />
  )
}

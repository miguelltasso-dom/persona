import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { LocaleDict } from '../preview/locale-bind.ts'
import type { PersonaCardInfo } from '../profile/PersonaInfoCard.tsx'

/** Shared host card wiring (rail, #geral, organograma, quadro). */
export interface PersonaCardShellBridge {
  readonly cardInfo: (personaId: string) => PersonaCardInfo | undefined
  readonly prefetch: (personaId: string) => void
  readonly cardDict: LocaleDict
  readonly revision: HostObservable<{ readonly n: number }>
  readonly sendToPersona: (personaId: string, text: string) => void
  readonly togglePause: (personaId: string) => void
  readonly switchEngine: (personaId: string) => void
  readonly editTalk: (personaId: string) => void
  readonly editPersona: (personaId: string) => void
  readonly teachPersona: (personaId: string) => void
}

/** Wire DTO for Anvil `getPersonaCard` (PERSONA-CARD-SPEC); keep client-local to avoid host value imports. */

import type { PersonaNowKind } from '../primitives/index.ts'

export interface PersonaCardHostDto {
  readonly personaId: string
  readonly handle: string
  readonly name: string
  readonly title: string
  readonly systemRoles: readonly ('coordination' | 'watchdog')[]
  readonly nowKind: PersonaNowKind
  readonly nowText: string
  readonly presence: { readonly online: boolean; readonly lastActiveAt: string }
  readonly engine: {
    readonly runnerLabel: string
    readonly modelLabel: string
    readonly runnerModel?: string | null
    /** Nome nativo do nível de esforço (o que o motor chama: low, medium, high, xhigh, max, ultra…); `null` = Padrão do motor. */
    readonly runnerEffort?: string | null
  }
  readonly sectorName?: string
  readonly ownerName?: string
  readonly substituteName?: string
  readonly currentProjectName?: string
  readonly quota?: {
    readonly fiveHourPct?: number
    readonly weekPct?: number
    readonly limitedUntil?: string
  }
}

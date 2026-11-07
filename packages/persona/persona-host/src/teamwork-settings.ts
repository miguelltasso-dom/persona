/**
 * D-090 / TEAM-3: what the PERSON decides about teamwork, per persona — whether she may ask colleagues for help, how many asks a day,
 * and how many rounds of opinion a Task may use. Defaults are the team behavior (on, 6 a day, 2 rounds); the principle is the person's:
 * nothing here is decided for them, every number is theirs to change. Stored as a screen document (no migration). The engine's
 * handoff door (`handoffs.ts`, Forge) reads {@link TeamworkSettings.get} through a port; this file never decides who asks whom.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { RemoteFault } from './remote-guard.ts'
import type { PersonaTeamworkView, SetPersonaTeamworkRequest } from './types.ts'

const KIND = 'persona_teamwork'

/** Ask cap per persona per day, in the person's hands (Configurações › Personas). */
export const ASK_CAP_PER_DAY = { min: 1, max: 20, standard: 6 } as const
/** Opinion rounds per Task. */
export const OPINION_ROUNDS = { min: 1, max: 3, standard: 2 } as const

/** What the person names to change: the persona and any of the three settings. */
export type TeamworkChange = Omit<SetPersonaTeamworkRequest, 'workspaceId' | 'projectId'>

/** What is stored for one persona. */
export interface TeamworkSettingsValue {
  readonly canAskColleagues: boolean
  readonly askCapPerDay: number
  readonly maxOpinionRounds: number
}

const STANDARD: TeamworkSettingsValue = {
  canAskColleagues: true, askCapPerDay: ASK_CAP_PER_DAY.standard, maxOpinionRounds: OPINION_ROUNDS.standard,
}

function integerIn(value: unknown, range: { readonly min: number; readonly max: number }): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max
}

/** Per-persona teamwork settings over the host's screen documents. */
export class TeamworkSettings {
  /** How many asks the persona already made today (the engine's handoff registry; zero until it is connected). */
  askedToday: (projectId: string, personaId: string) => number = () => 0

  /** @param screens - Screen documents of the host store. */
  constructor(private readonly screens: ScreenRepos) {}

  /**
   * @param projectId - Tenant.
   * @param personaId - The persona.
   * @returns What the person set, or the team defaults; never partial.
   */
  get(projectId: string, personaId: string): TeamworkSettingsValue {
    const stored = this.screens.get<Partial<TeamworkSettingsValue>>(projectId, KIND, personaId)
    return {
      canAskColleagues: typeof stored?.canAskColleagues === 'boolean' ? stored.canAskColleagues : STANDARD.canAskColleagues,
      askCapPerDay: integerIn(stored?.askCapPerDay, ASK_CAP_PER_DAY) ? stored.askCapPerDay : STANDARD.askCapPerDay,
      maxOpinionRounds: integerIn(stored?.maxOpinionRounds, OPINION_ROUNDS) ? stored.maxOpinionRounds : STANDARD.maxOpinionRounds,
    }
  }

  /**
   * Change only what the request names; anything outside the ranges is refused whole, nothing is half-written.
   * @param projectId - Tenant.
   * @param request - The persona and the person's choices (the scope is the project).
   * @returns The settings now in force.
   */
  set(projectId: string, request: TeamworkChange): TeamworkSettingsValue {
    const now = this.get(projectId, request.personaId)
    if (request.canAskColleagues !== undefined && typeof request.canAskColleagues !== 'boolean') {
      throw new RemoteFault('invalid-payload', 'Escolha ligar ou desligar o pedido de ajuda a colegas.')
    }
    if (request.askCapPerDay !== undefined && !integerIn(request.askCapPerDay, ASK_CAP_PER_DAY)) {
      throw new RemoteFault('invalid-payload', `Escolha de ${String(ASK_CAP_PER_DAY.min)} a ${String(ASK_CAP_PER_DAY.max)} pedidos por dia.`)
    }
    if (request.maxOpinionRounds !== undefined && !integerIn(request.maxOpinionRounds, OPINION_ROUNDS)) {
      throw new RemoteFault('invalid-payload', `Escolha de ${String(OPINION_ROUNDS.min)} a ${String(OPINION_ROUNDS.max)} rodadas de opinião.`)
    }
    const next: TeamworkSettingsValue = {
      canAskColleagues: request.canAskColleagues ?? now.canAskColleagues,
      askCapPerDay: request.askCapPerDay ?? now.askCapPerDay,
      maxOpinionRounds: request.maxOpinionRounds ?? now.maxOpinionRounds,
    }
    this.screens.put(projectId, KIND, request.personaId, next)
    return next
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - The persona.
   * @returns The wire view for Configurações › Personas.
   */
  view(projectId: string, personaId: string): PersonaTeamworkView {
    return { ...this.get(projectId, personaId), askedToday: this.askedToday(projectId, personaId) }
  }
}

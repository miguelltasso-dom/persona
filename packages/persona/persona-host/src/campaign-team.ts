/**
 * TEAM-12 (b), EQ-8/EQ-9: a goal that is a CAMPAIGN but does not list its functions ("Monte um time para a campanha de lançamento do
 * produto") still needs text, art and posts. The Gestor used to read only the functions the goal spelled out, so it fell back to the
 * generic structure (Atendimento, Financeiro, Pessoas — nothing to do with a campaign), hired three strangers and opened no Task.
 *
 * Here a campaign that did not name its functions gets the campaign team: for each function, the persona of the team that already does
 * it is REUSED (the same reading as the routing by function), and only what nobody does is hired. A goal that lists its functions, asks
 * for sectors by name, or is not a campaign is none of this module's business: it returns undefined and the Gestor works as before.
 * Pure and deterministic (no model).
 */

import { parseStructureAsk } from '@deepseek-ai/dsh-persona-core'
import { functionOwner, routeByFunction, type RoutablePersona } from './function-route.ts'

/** A function every campaign needs: the word that asks for it and the title of the person who does it. */
export const CAMPAIGN_FUNCTIONS = [
  { ask: 'texto', title: 'Redação' },
  { ask: 'arte', title: 'Design' },
  { ask: 'posts', title: 'Mídia' },
] as const

/** What makes a goal a campaign. */
const CAMPAIGN = /\b(?:campanh[ao]s?|lan[cç]amento|divulga(?:r|[cç][aã]o)|marketing|an[uú]ncios?|promo[cç][aã]o)\b/iu

/** A person to hire for a function nobody on the team does. */
export interface CampaignHire {
  readonly id: string
  readonly title: string
  readonly sectorName: string
  readonly continuous: true
}

/** The team of a campaign: who is reused, who is hired, and the words that ask each function (the parts of the work, in order). */
export interface CampaignTeam {
  readonly reuse: readonly { readonly personaId: string; readonly function: string }[]
  readonly hire: readonly CampaignHire[]
  /** `texto, arte, posts` — the request the routing by function reads to open one Task per function. */
  readonly request: string
}

/**
 * @param goal - What the person asked the Gestor.
 * @param roster - The project's personas (Coordination is never given a function).
 * @returns The team of the campaign, or undefined when the goal is not a campaign without functions (the Gestor goes on as before).
 */
export function campaignTeamOf(goal: string, roster: readonly RoutablePersona[]): CampaignTeam | undefined {
  if (!CAMPAIGN.test(goal)) return undefined
  if (parseStructureAsk(goal).sectorNames.length > 0) return undefined // the person named the sectors: that structure is hers
  const listed = routeByFunction(roster, goal)
  if (listed?.kind === 'split') return undefined // the goal already lists its functions: the routing by function reads them as it is
  const reuse: { personaId: string; function: string }[] = []
  const hire: CampaignHire[] = []
  for (const need of CAMPAIGN_FUNCTIONS) {
    const owner = functionOwner(roster, need.ask)
    // The title SHE has (the Gestor checks it when the plan is applied: a persona whose title changed meanwhile makes the plan stale).
    if (owner !== undefined) reuse.push({ personaId: owner.id, function: owner.title })
    else hire.push({ id: need.ask, title: need.title, sectorName: 'Marketing', continuous: true })
  }
  return { reuse, hire, request: CAMPAIGN_FUNCTIONS.map(need => need.ask).join(', ') }
}

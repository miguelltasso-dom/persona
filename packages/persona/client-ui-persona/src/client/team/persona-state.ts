import type { ShellKey } from '../locale/shell/locales.ts'
import type { PersonaStateName } from '../theme/tokens.ts'
import type { ChipTone } from '../primitives/Chip.tsx'
import type { PersonaPoseState } from '../assets/asset-url.ts'
import type { WorkStateOverlayId } from './persona-work-state.ts'

/**
 * The ONE vocabulary of "what a persona is doing" (DESIGN-01-MUSE §0.2). The rail PESSOAS, the team strip, the cards, the Visão
 * geral "Agora", the org chart and the DM header all read a persona's state through this module, so the same state always has
 * the same color token, the same dot, the same pose and the same words. Nothing else may keep its own state → dot or state → text map.
 *
 * Green means "working or reviewing", never "the app is open". Idle states draw a ring, not a filled dot.
 */
export type { PersonaStateName }

/** What the host says a persona is doing right now (the activity), before the vocabulary names it. */
export type PersonaActivity = 'working' | 'reviewing' | 'waiting' | 'stuck' | 'resting' | 'offline'

/** The facts the vocabulary needs. Only `activity` is required; the rest narrow an idle persona. */
export interface PersonaStateFacts {
  readonly activity: PersonaActivity
  /** Files already changed in the persona's draft: a working persona in a draft reads "Num rascunho". */
  readonly draftFiles?: number | undefined
  /** Inside a Janela de silêncio, or the whole team is paused: an idle persona reads "Descansando". */
  readonly quiet?: boolean | undefined
  /** This persona was paused on purpose: "Pausada". */
  readonly paused?: boolean | undefined
}

/**
 * Names the state of one persona. A disconnected engine always wins (nothing else is true without it), then a deliberate pause,
 * then what she is doing. An idle persona is "Disponível" unless she is inside a silence window ("Descansando").
 *
 * @param facts The activity plus the optional draft, quiet and paused facts.
 * @returns The vocabulary name that every surface draws.
 */
export function derivePersonaState(facts: PersonaStateFacts): PersonaStateName {
  if (facts.activity === 'offline') return 'offline'
  if (facts.paused === true) return 'paused'
  if (facts.activity === 'reviewing') return 'reviewing'
  if (facts.activity === 'waiting') return 'waiting'
  if (facts.activity === 'stuck') return 'stuck'
  if (facts.activity === 'working') return (facts.draftFiles ?? 0) >= 1 ? 'draft' : 'working'
  return facts.quiet === true ? 'resting' : 'available'
}

/**
 * The state of anything that carries a persona's activity (a rail row, a conversation row, a stage member, a "Agora" row).
 * No activity means the host has not said anything, and a persona nobody has heard bad news about is "Disponível", never green.
 *
 * @param source The row: its `state` is the activity; `draftFiles`, `quiet` and `paused` narrow it.
 * @returns The vocabulary name that every surface draws.
 */
export function personaStateOf(source: {
  readonly state?: PersonaActivity | undefined
  readonly draftFiles?: number | undefined
  readonly quiet?: boolean | undefined
  readonly paused?: boolean | undefined
  readonly reviewing?: boolean | undefined
}): PersonaStateName {
  const state = source.state ?? 'resting'
  // A stage member is only "working"; the board says she is reviewing (`persona-reviewing.ts`).
  const activity: PersonaActivity = source.reviewing === true && state === 'working' ? 'reviewing' : state
  return derivePersonaState({ activity, draftFiles: source.draftFiles, quiet: source.quiet, paused: source.paused })
}

/** The visible words of each state (the SAME key everywhere). */
export const PERSONA_STATE_LABEL: Readonly<Record<PersonaStateName, ShellKey>> = {
  working: 'team.statusWorking',
  reviewing: 'team.statusReviewing',
  waiting: 'team.statusWaiting',
  draft: 'team.statusDraft',
  stuck: 'team.statusStuck',
  available: 'team.statusAvailable',
  resting: 'team.statusResting',
  paused: 'team.statusPaused',
  offline: 'team.statusOffline',
}

/** The chip tone of each state, for the cards that show a chip (waiting is amber with dark ink). */
export const PERSONA_STATE_CHIP_TONE: Readonly<Record<PersonaStateName, ChipTone>> = {
  working: 'success',
  reviewing: 'success',
  waiting: 'accent',
  draft: 'brand',
  stuck: 'danger',
  available: 'neutral',
  resting: 'neutral',
  paused: 'neutral',
  offline: 'neutral',
}

/** The pose of the figure on the stage for each state: only a persona inside a silence window sleeps. */
export const PERSONA_STATE_POSE: Readonly<Record<PersonaStateName, PersonaPoseState>> = {
  working: 'trabalhando',
  reviewing: 'trabalhando',
  waiting: 'aguardando-aprovacao',
  draft: 'trabalhando',
  stuck: 'erro',
  available: 'disponivel',
  resting: 'descansando',
  paused: 'descansando',
  offline: 'disponivel',
}

/** The small drawing over the figure: only a persona inside a silence window or paused shows the zZz; an available one shows nothing. */
export const PERSONA_STATE_OVERLAY: Readonly<Record<PersonaStateName, WorkStateOverlayId | undefined>> = {
  working: 'typing-dots',
  reviewing: 'review-loupe',
  waiting: 'approval-badge',
  draft: 'typing-dots',
  stuck: 'error-badge',
  available: undefined,
  resting: 'zzz',
  paused: 'zzz',
  offline: undefined,
}

/** Active states draw a filled dot; idle states draw a ring (DESIGN-01-MUSE §0.2). */
export function isPersonaStateActive(state: PersonaStateName): boolean {
  return state === 'working' || state === 'reviewing' || state === 'waiting' || state === 'draft' || state === 'stuck'
}

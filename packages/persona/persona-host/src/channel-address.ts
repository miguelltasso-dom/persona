/**
 * Item 22 (colheita): who ANSWERS a message written in a channel. The rule the product already had ("an `@name` takes the persona it names; a
 * request that names nobody goes to the persona of its function") now has two additions and one fence:
 *
 *   - `@Marketing` (the name of an equipe) calls the WHOLE equipe, and `@equipe` calls the equipe of the channel it is written in (in a
 *     channel with no equipe of its own it calls everyone on the channel). A persona and an equipe with the same name: the persona wins.
 *   - THE FENCE: only personas ON the channel answer there. A persona named but not on the channel is not woken; the caller says so
 *     ("Bia não está neste canal") instead of staying silent. The function route (`routeByFunction`) runs among the members only.
 *
 * Pure and deterministic: no model, no store, no clock. The caller gives the roster, the equipes and who is on the channel (see
 * {@link ChannelDirectory}) and gets back a plain answer it can act on or test.
 */

import type { DirectoryTeam } from './channel-directory.ts'
import { routeByFunction, type FunctionRoute, type RoutablePersona } from './function-route.ts'
import { mentionsOf } from './mentions.ts'

/** What the router reads of a persona: the same shape the function route uses. */
export type AddressPersona = RoutablePersona

export interface AddressInput {
  /** The message as the person wrote it. */
  readonly body: string
  /** The project's personas in roster order. */
  readonly personas: readonly AddressPersona[]
  /** The project's equipes. */
  readonly teams: readonly DirectoryTeam[]
  /** The channel the message is in: its equipe, when it has one. `undefined` = not a channel (a DM): `@equipe` means nothing there. */
  readonly channel?: { readonly teamId?: string } | undefined
  /** Persona ids on the channel (`ChannelDirectory.membersOf`). `undefined` = no fence (a DM, or a channel the directory does not know). */
  readonly members?: readonly string[] | undefined
}

/** Why these personas answer. */
export type AddressVia = 'mention' | 'team' | 'function' | 'none'

export interface Addressing {
  /** Who answers, in a stable order: the personas named (in the order the text names them), then the equipes called (roster order each). */
  readonly personas: readonly AddressPersona[]
  /** `mention`: someone was named. `team`: only an equipe was called. `function`: nobody was named, the request's function chose. `none`: the caller keeps its default. */
  readonly via: AddressVia
  /** The equipes the message called (named by `@Name`, or the channel's own by `@equipe`), whether or not they have anyone on the channel. */
  readonly teams: readonly DirectoryTeam[]
  /** Personas the message named that are NOT on this channel (never woken). */
  readonly outsidePersonas: readonly AddressPersona[]
  /** Equipes called that have nobody on this channel (never woken). */
  readonly outsideTeams: readonly DirectoryTeam[]
  /** The function route, when `via` is `function`. */
  readonly route?: FunctionRoute
}

const WORD = /[\p{L}\p{N}_]/u

/** Whether a standalone `@equipe` (or `@time`) is written: whole word, not glued to a word before it (an e-mail never counts). */
export function callsOwnTeam(body: string): boolean {
  const pattern = /@(equipe|time)/giu
  for (let hit = pattern.exec(body); hit !== null; hit = pattern.exec(body)) {
    const before = hit.index === 0 ? '' : (body[hit.index - 1] ?? '')
    const after = body[hit.index + hit[0].length] ?? ''
    if (before !== '' && (WORD.test(before) || before === '@')) continue
    if (after !== '' && WORD.test(after)) continue
    return true
  }
  return false
}

/**
 * Decide who answers a message written in a channel.
 * @param input - The message, the roster, the equipes and who is on the channel.
 * @returns The personas that answer, why, and what was named but is outside the channel.
 */
export function addressChannel(input: AddressInput): Addressing {
  const { body, personas, teams } = input
  const fence = input.members === undefined ? undefined : new Set(input.members)
  const inside = (persona: AddressPersona): boolean => fence === undefined || fence.has(persona.id)
  const folded = (text: string): string => text.trim().toLocaleLowerCase('pt-BR')

  // 1. Personas named by `@name`: the ones on the channel answer; the others are reported, never woken.
  const named = mentionsOf(personas, body)
  const namedInside = named.filter(inside)
  const outsidePersonas = named.filter(persona => !inside(persona))

  // 2. Equipes called: by their own name (a persona with the same name wins), and `@equipe` = the channel's own.
  const personaNames = new Set(personas.map(persona => folded(persona.name)))
  const byName = mentionsOf(teams.filter(team => !personaNames.has(folded(team.name))), body)
  const called: DirectoryTeam[] = [...byName]
  if (input.channel !== undefined && callsOwnTeam(body)) {
    const own = input.channel.teamId === undefined ? undefined : teams.find(team => team.id === input.channel?.teamId)
    if (own !== undefined) {
      if (!called.includes(own)) called.push(own)
    } else if (fence !== undefined) {
      // A channel with no equipe of its own: `@equipe` is everyone on it.
      called.push({ id: '', name: 'equipe', personaIds: personas.filter(inside).map(persona => persona.id) })
    }
  }
  const answering: AddressPersona[] = [...namedInside]
  const outsideTeams: DirectoryTeam[] = []
  for (const team of called) {
    const ids = new Set(team.personaIds)
    const members = personas.filter(persona => ids.has(persona.id) && inside(persona))
    if (members.length === 0 && team.id !== '') outsideTeams.push(team) // id '' = "everyone on this channel": nobody there is not an error
    for (const persona of members) if (!answering.some(item => item.id === persona.id)) answering.push(persona)
  }
  if (answering.length > 0) {
    return { personas: answering, via: namedInside.length > 0 ? 'mention' : 'team', teams: called, outsidePersonas, outsideTeams }
  }

  // 3. Somebody was named (or an equipe called) but nobody of them is on this channel: the person chose, so the function route does not
  //    guess another persona. The caller says who is outside.
  if (outsidePersonas.length > 0 || called.length > 0) return { personas: [], via: 'none', teams: called, outsidePersonas, outsideTeams }

  // 4. Nobody named: the persona of the request's function, among the members of the channel only.
  const route = routeByFunction(personas.filter(inside), body)
  if (route === undefined) return { personas: [], via: 'none', teams: [], outsidePersonas: [], outsideTeams: [] }
  const chosen = route.kind === 'single' ? [route.part.persona] : route.parts.map(part => part.persona)
  const rostered = personas.filter(persona => chosen.some(item => item.id === persona.id))
  return { personas: rostered, via: 'function', teams: [], outsidePersonas: [], outsideTeams: [], route }
}

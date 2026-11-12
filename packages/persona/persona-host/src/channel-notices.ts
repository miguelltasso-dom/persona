/**
 * Item 22 (colheita): the words of the channel, written by Muse (12/11 00:42) and kept in ONE place so the screen and the host say the
 * same thing. Plain Portuguese, no article before a name, never blocking and never a modal: they sit as a system line in the thread right
 * after the message, with the one-click answer next to them. Pure: the host decides WHEN (see `addressChannel`), the screen draws.
 */

import type { Addressing } from './channel-address.ts'
import type { DirectoryTeam } from './channel-directory.ts'

/** What the line offers next to its text. The screen draws the buttons; the host runs the action. */
export interface ChannelNotice {
  /** `outside-personas`: someone named is not on the channel. `outside-team`: an equipe was called with nobody on the channel. */
  readonly kind: 'outside-personas' | 'outside-team'
  /** The system line, e.g. "Lia não está em #marketing." */
  readonly text: string
  /** The primary one-click action: put them on the channel ("Pôr Lia no canal"). */
  readonly add: { readonly label: string; readonly personaIds: readonly string[]; readonly teamId?: string }
  /** `outside-personas`: the quiet way out ("Agora não"). */
  readonly dismissLabel?: string
  /** `outside-team`: go to the equipe's own channel ("Ir para #marketing"), when it has one. */
  readonly goTo?: { readonly label: string; readonly channelId: string }
}

/** Up to 3 names in full ("Lia, Téo e Bia"); more than 3 say the first two and how many are left ("Lia, Téo e mais 4"). */
export function namesLine(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1] ?? ''}`
  return `${names[0] ?? ''}, ${names[1] ?? ''} e mais ${String(names.length - 2)}`
}

/** What an `@` menu shows for an equipe: "Marketing · 4 pessoas". @param team - The equipe. @param count - People of it on the channel. */
export function teamMentionLabel(team: Pick<DirectoryTeam, 'name'>, count: number): string {
  return `${team.name} · ${String(count)} ${count === 1 ? 'pessoa' : 'pessoas'}`
}

/**
 * The lines to write after a message that called someone outside the channel (never silence, never blocking).
 * @param addressing - The result of `addressChannel`.
 * @param channelName - The channel as the person sees it ("marketing"), without the "#".
 * @param teamChannelOf - The channel of an equipe, for "Ir para #marketing" (omit when unknown).
 * @returns One line for the personas named outside (all in one), then one per equipe with nobody here. Empty when nothing was outside.
 */
export function outsideNotices(
  addressing: Addressing,
  channelName: string,
  teamChannelOf?: (teamId: string) => { readonly id: string; readonly name: string } | undefined,
): ChannelNotice[] {
  const channel = `#${channelName}`
  const notices: ChannelNotice[] = []
  const people = addressing.outsidePersonas
  if (people.length > 0) {
    const names = people.map(persona => persona.name)
    notices.push({
      kind: 'outside-personas',
      text: `${namesLine(names)} ${people.length === 1 ? 'não está' : 'não estão'} em ${channel}.`,
      add: { label: `Pôr ${namesLine(names)} no canal`, personaIds: people.map(persona => persona.id) },
      dismissLabel: 'Agora não',
    })
  }
  for (const team of addressing.outsideTeams) {
    const own = teamChannelOf?.(team.id)
    notices.push({
      kind: 'outside-team',
      text: `Ninguém de ${team.name} está em ${channel}.`,
      add: { label: `Pôr ${team.name} no canal`, personaIds: team.personaIds, teamId: team.id },
      ...(own === undefined ? {} : { goTo: { label: `Ir para #${own.name}`, channelId: own.id } }),
    })
  }
  return notices
}

/** The empty state of a channel's thread (text only; the button of the `nobody` state is drawn by the screen). */
export type EmptyChannelNotice =
  | { readonly kind: 'ready'; readonly title: string; readonly body: string }
  | { readonly kind: 'nobody'; readonly title: string; readonly actionLabel: string }

/**
 * @param channelName - The channel as the person sees it, without the "#".
 * @param memberNames - Who is on it now (display names, roster order).
 */
export function emptyChannelNotice(channelName: string, memberNames: readonly string[]): EmptyChannelNotice {
  const channel = `#${channelName}`
  if (memberNames.length === 0) return { kind: 'nobody', title: `Ainda não tem ninguém em ${channel}.`, actionLabel: 'Pôr pessoas no canal' }
  return {
    kind: 'ready',
    title: `${channel} está pronto.`,
    body: `Aqui estão ${namesLine(memberNames)}. Escreva um pedido e quem cuida disso responde.`,
  }
}

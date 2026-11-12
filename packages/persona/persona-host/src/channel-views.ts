/**
 * Item 22 (colheita): the READ views the screen draws for equipes and channels (Muse's §22, built by the Prism). Each one is a pure function
 * of the {@link ChannelDirectory} and the roster, so the Remote that serves it is a thin call and the words live in the host
 * (`channel-notices.ts`). Nothing here writes; arranging sections and putting people on a channel are separate, later doors.
 *
 * On the screen "equipe" and "categoria" are ONE thing: each equipe is a collapsible section with its channels inside.
 */

import type { ChannelDirectory, DirectoryChannelKind } from './channel-directory.ts'
import { channelLayoutOf } from './channel-layout.ts'
import { emptyChannelNotice, namesLine, teamMentionLabel, type EmptyChannelNotice } from './channel-notices.ts'

/** The roster as the views read it: persona ids and names in roster order. */
export interface ViewPersona {
  readonly id: string
  readonly name: string
}

/** A channel row of the sidebar. */
export interface ChannelRowView {
  readonly id: string
  readonly name: string
  readonly kind: DirectoryChannelKind
  readonly teamId?: string
}

/** A block of the sidebar: the channels with no section (listed first, no header), or one section (an equipe, or one the person made). */
export interface ChannelSectionView {
  /** `null` = the channels with no section. */
  readonly id: string | null
  readonly name: string | null
  /** The equipe this section is; absent for a section made by hand. */
  readonly teamId?: string
  /** Up to 3 persona ids of the equipe in roster order: the 16 px faces of the header. */
  readonly faceIds: readonly string[]
  readonly channels: readonly ChannelRowView[]
}

export interface ChannelLayoutView {
  readonly sections: readonly ChannelSectionView[]
  /** Real people in the workspace (the owner counts). The sidebar's "Pessoas" section shows only from the 2nd one on. */
  readonly humanCount: number
}

/** Most faces a section header shows. */
export const SECTION_FACES_MAX = 3

/**
 * The sidebar: no-section channels first, then one section per equipe in the organogram's order.
 * @param directory - The directory.
 * @param projectId - Tenant project.
 * @param roster - The project's personas in roster order (for the faces).
 * @param options - `showEmptySections`: show a section with no channel (whoever arranges the sidebar). `humanCount`: the real people of the
 *   workspace, passed through for the "Pessoas" section (default 0: the directory knows only personas).
 */
export function channelLayoutViewOf(
  directory: ChannelDirectory,
  projectId: string,
  roster: readonly ViewPersona[],
  options: { readonly showEmptySections?: boolean; readonly humanCount?: number } = {},
): ChannelLayoutView {
  const teams = directory.teams(projectId)
  const rosterIds = roster.map(persona => persona.id)
  const sections = channelLayoutOf({
    categories: directory.categories(projectId),
    channels: directory.channels(projectId),
    showEmptyCategories: options.showEmptySections === true,
  })
  return {
    humanCount: Math.max(0, Math.floor(options.humanCount ?? 0)),
    sections: sections.map((section) => {
      const team = section.category?.teamId === undefined ? undefined : teams.find(item => item.id === section.category?.teamId)
      const faceIds = team === undefined ? [] : rosterIds.filter(id => team.personaIds.includes(id)).slice(0, SECTION_FACES_MAX)
      return {
        id: section.category?.id ?? null,
        name: section.category?.name ?? null,
        ...(section.category?.teamId === undefined ? {} : { teamId: section.category.teamId }),
        faceIds,
        channels: section.channels.map(channel => ({
          id: channel.id, name: channel.name, kind: channel.kind, ...(channel.teamId === undefined ? {} : { teamId: channel.teamId }),
        })),
      }
    }),
  }
}

/** A member as the channel header shows it (named apart from `ChannelMemberView` of the members list: this one leads the face stack). */
export interface ChannelHeaderMemberView {
  readonly kind: 'persona' | 'human'
  readonly id: string
  readonly name: string
}

/** The header of a channel: who is on it and "Respondem aqui: Lia, Téo e Bia". */
export interface ChannelHeaderView {
  readonly channelId: string
  readonly name: string
  /** The equipe of the channel, when it has one (the neutral chip). */
  readonly teamId?: string
  readonly teamName?: string
  /** Who is on the channel now, in roster order (personas; people come with real people in the same chat). */
  readonly members: readonly ChannelHeaderMemberView[]
  /** "Respondem aqui: Lia, Téo e Bia" (more than 3: "Lia, Téo e mais 4"); '' when nobody is on the channel. */
  readonly respondem: string
  /** What the empty thread says (text only). */
  readonly empty: EmptyChannelNotice
}

/**
 * @param directory - The directory.
 * @param projectId - Tenant project.
 * @param channelId - The channel.
 * @param roster - The project's personas in roster order.
 * @returns The header, or `undefined` for a channel the directory does not know (a DM).
 */
export function channelHeaderViewOf(
  directory: ChannelDirectory,
  projectId: string,
  channelId: string,
  roster: readonly ViewPersona[],
): ChannelHeaderView | undefined {
  const channel = directory.channels(projectId).find(item => item.id === channelId)
  const ids = directory.membersOf(projectId, channelId)
  if (channel === undefined || ids === undefined) return undefined
  const members = roster.filter(persona => ids.includes(persona.id)).map(persona => ({ kind: 'persona' as const, id: persona.id, name: persona.name }))
  const names = members.map(member => member.name)
  const team = channel.teamId === undefined ? undefined : directory.teams(projectId).find(item => item.id === channel.teamId)
  return {
    channelId,
    name: channel.name,
    ...(team === undefined ? {} : { teamId: team.id, teamName: team.name }),
    members,
    respondem: names.length === 0 ? '' : `Respondem aqui: ${namesLine(names)}`,
    empty: emptyChannelNotice(channel.name, names),
  }
}

/** The request of the `@` menu: the project, and the channel being written in (absent = a DM). */
export interface MentionOptionsRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly channelId?: string
}

/** One entry of the `@` menu. */
export interface MentionOptionView {
  /** `own-team`: "@equipe · a equipe deste canal". `team`: an equipe by name. `persona`: one persona. */
  readonly kind: 'own-team' | 'team' | 'persona'
  readonly id: string
  /** What goes after the `@` when chosen ("Marketing", "equipe", "Bia"). */
  readonly insert: string
  /** What the menu shows ("Marketing · 4 pessoas", "@equipe · a equipe deste canal", "Bia"). */
  readonly label: string
  /** Up to 3 persona ids for the small faces. */
  readonly faceIds: readonly string[]
  /** Persona: she is on this channel (the others are offered with "Pôr no canal"). Always true for an equipe entry. */
  readonly onChannel: boolean
}

/**
 * The `@` menu of a channel: the equipes first (the channel's own as "@equipe", then the others), then the personas. A persona with the
 * name of an equipe hides the equipe (the persona wins, as in `addressChannel`).
 * @param directory - The directory.
 * @param projectId - Tenant project.
 * @param channelId - The channel being written in (`undefined` = a DM: only personas).
 * @param roster - The project's personas in roster order.
 */
export function mentionOptionsOf(
  directory: ChannelDirectory,
  projectId: string,
  channelId: string | undefined,
  roster: readonly ViewPersona[],
): MentionOptionView[] {
  const options: MentionOptionView[] = []
  const members = channelId === undefined ? undefined : directory.membersOf(projectId, channelId)
  const known = (id: string): boolean => members === undefined || members.includes(id)
  const faces = (ids: readonly string[]): string[] => roster.map(persona => persona.id).filter(id => ids.includes(id)).slice(0, SECTION_FACES_MAX)
  if (channelId !== undefined && members !== undefined) {
    const channel = directory.channels(projectId).find(item => item.id === channelId)
    const own = channel?.teamId === undefined ? undefined : directory.teams(projectId).find(item => item.id === channel.teamId)
    if (own !== undefined) {
      options.push({ kind: 'own-team', id: own.id, insert: 'equipe', label: '@equipe · a equipe deste canal', faceIds: faces(own.personaIds), onChannel: true })
    }
  }
  const personaNames = new Set(roster.map(persona => persona.name.trim().toLocaleLowerCase('pt-BR')))
  for (const team of directory.teams(projectId)) {
    if (personaNames.has(team.name.trim().toLocaleLowerCase('pt-BR'))) continue
    const count = roster.filter(persona => team.personaIds.includes(persona.id)).length
    if (count === 0) continue
    options.push({ kind: 'team', id: team.id, insert: team.name, label: teamMentionLabel(team, count), faceIds: faces(team.personaIds), onChannel: true })
  }
  for (const persona of roster) {
    options.push({ kind: 'persona', id: persona.id, insert: persona.name, label: persona.name, faceIds: [persona.id], onChannel: known(persona.id) })
  }
  return options
}

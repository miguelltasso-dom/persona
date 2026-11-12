/**
 * Item 22 (colheita): equipes e canais estilo Discord, local, só personas. The ONE door the routing, `@equipe` and the sidebar read:
 * who the teams are, which channels exist, in which category each one sits, and who is on a channel RIGHT NOW. The host asks this port;
 * where the answer is kept (today the organogram's sectors and `ChannelRepos`, tomorrow the model the Carbon recommends for real people
 * in the same chat) is behind it, so changing the storage never touches the routing.
 *
 * Pure types plus two small adapters (an in-memory directory for tests and a bridge over CV-6's {@link TeamChannels}). No model, no clock.
 * Clean room: the idea of categories, groups and "reports to" was read from the public ADR summaries only; names and rules here are ours.
 */

import type { TeamChannelMember } from './team-channels.ts'

/** An equipe: a named set of personas the person can call as one (`@Marketing`). */
export interface DirectoryTeam {
  readonly id: string
  readonly name: string
  /** Persona ids, any order (the roster order of the project is what answers use). */
  readonly personaIds: readonly string[]
}

/** A named, ordered section of the sidebar that opens and closes (the open/closed state is each person's, on the screen, not here). */
export interface DirectoryCategory {
  readonly id: string
  readonly name: string
  /** Order among the categories (smaller first); equal positions read by name. */
  readonly position: number
  /** The equipe this section IS (the app makes one section per equipe); absent for a section the person made by hand. */
  readonly teamId?: string
}

export type DirectoryChannelKind = 'general' | 'team' | 'directorate' | 'custom'

/** A channel as the sidebar and the router need it. */
export interface DirectoryChannel {
  readonly id: string
  readonly name: string
  readonly kind: DirectoryChannelKind
  /** The equipe whose channel this is (a `team` channel, or a custom one the person tied to a team). */
  readonly teamId?: string
  /** The category it sits in; absent = no category (listed first, with no header). */
  readonly categoryId?: string
  /** Order inside its category (smaller first); equal positions read by name. */
  readonly position?: number
  /** Archived channels are not listed and nobody answers in them. */
  readonly archived?: boolean
}

/** What the host asks. Read-only on purpose: arranging teams and categories is a separate, later door. */
export interface ChannelDirectory {
  /** @param projectId - Tenant project. @returns Its equipes. */
  teams(projectId: string): readonly DirectoryTeam[]
  /** @param projectId - Tenant project. @returns Its categories (any order). */
  categories(projectId: string): readonly DirectoryCategory[]
  /** @param projectId - Tenant project. @returns Its channels, archived ones included (the caller filters). */
  channels(projectId: string): readonly DirectoryChannel[]
  /**
   * Who is on a channel now, as persona ids in a stable order. `general` = every persona of the project; `team` = the team's personas;
   * `custom` = the members the person put in. An archived or unknown channel has nobody. `undefined` = the directory does not know the
   * channel (a DM, say): the caller applies NO channel restriction.
   * @param projectId - Tenant project.
   * @param channelId - Channel.
   */
  membersOf(projectId: string, channelId: string): readonly string[] | undefined
}

/** The data an in-memory directory holds. */
export interface MemoryDirectoryData {
  readonly teams?: readonly DirectoryTeam[]
  readonly categories?: readonly DirectoryCategory[]
  readonly channels?: readonly (DirectoryChannel & {
    /** `custom` channels: the persona ids put in by hand. `general`: ignored (everyone); `team`: ignored (the team). */
    readonly members?: readonly string[]
  })[]
  /** The project's roster (persona ids, roster order): who `general` means. */
  readonly roster?: readonly string[]
}

/**
 * A directory held in memory: for tests, for a screen's preview and as the reference of what the port means.
 * @param data - Teams, categories, channels and the roster. One project: the project id is not checked.
 */
export function memoryDirectory(data: MemoryDirectoryData): ChannelDirectory {
  const channels = data.channels ?? []
  const teams = data.teams ?? []
  const roster = data.roster ?? []
  const inRoster = (ids: readonly string[]): string[] => roster.length === 0 ? [...ids] : roster.filter(id => ids.includes(id))
  return {
    teams: () => teams,
    categories: () => data.categories ?? [],
    channels: () => channels.map(({ members: _members, ...channel }) => channel),
    membersOf: (_projectId, channelId) => {
      const channel = channels.find(item => item.id === channelId)
      if (channel === undefined) return undefined
      if (channel.archived === true) return []
      if (channel.kind === 'general') return [...roster]
      if (channel.kind === 'team' || (channel.kind === 'custom' && channel.teamId !== undefined && channel.members === undefined)) {
        return inRoster(teams.find(item => item.id === channel.teamId)?.personaIds ?? [])
      }
      return inRoster(channel.members ?? [])
    },
  }
}

/** The id of the sidebar section that IS an equipe (the bridge makes one per equipe). */
export const teamSectionIdOf = (teamId: string): string => `team:${teamId}`

/** What the CV-6 bridge reads (structural, so the host passes its own instances). */
export interface TeamChannelsBridgeDeps {
  readonly teamChannels: {
    membersOf(projectId: string, channelId: string): TeamChannelMember[]
  }
  readonly channels: {
    list(projectId: string): readonly {
      readonly id: string
      readonly name: string
      readonly kind: DirectoryChannelKind
      readonly sourceId?: string
      readonly archivedAt?: string
    }[]
    get(channelId: string): { readonly id: string } | undefined
  }
  /** The organogram's sectors of the project's workspace: they ARE the equipes until the person's own teams exist. */
  readonly sectors: (projectId: string) => readonly { readonly id: string; readonly name: string }[]
  /** persona id → sector id. */
  readonly sectorOf: (projectId: string) => ReadonlyMap<string, string>
  /** The equipes the PERSON assembled (item 22, H22). A mirror of a sector (`sourceId`) is the sector itself: it adds no equipe. Absent = none. */
  readonly equipes?: (projectId: string) => readonly { readonly id: string; readonly name: string; readonly sourceId?: string; readonly archivedAt?: string; readonly personaIds: readonly string[] }[]
  /** The categories the person made by hand. Absent = none. */
  readonly categories?: (projectId: string) => readonly { readonly id: string; readonly name: string; readonly position: number }[]
  /** Where the person put channels: channel id → category and order. A placement wins over the automatic section of a team channel. Absent = none. */
  readonly placements?: (projectId: string) => ReadonlyMap<string, { readonly categoryId: string; readonly position: number }>
}

/** Sections the person made come AFTER the automatic ones (one per equipe), whatever their positions. */
const HAND_MADE_SECTION_BASE = 1000

/**
 * The directory over what exists today: the organogram's sectors are the equipes, CV-6's channels are the channels, and who is on a channel
 * is CV-6's own answer (`TeamChannels.membersOf`, personas only). One section (category) per equipe that has a channel; sections made by hand
 * need storage that does not exist yet.
 * @param deps - The host's CV-6 parts.
 */
export function directoryOverTeamChannels(deps: TeamChannelsBridgeDeps): ChannelDirectory {
  return {
    teams: (projectId) => {
      const sectorOf = deps.sectorOf(projectId)
      const own = (deps.equipes?.(projectId) ?? []).filter(equipe => equipe.sourceId === undefined && equipe.archivedAt === undefined)
      return [
        ...deps.sectors(projectId).map(sector => ({
          id: sector.id,
          name: sector.name,
          personaIds: [...sectorOf].filter(([, sectorId]) => sectorId === sector.id).map(([personaId]) => personaId),
        })),
        ...own.map(equipe => ({ id: equipe.id, name: equipe.name, personaIds: equipe.personaIds })),
      ]
    },
    // The app makes ONE section per equipe (the screen shows no difference between "equipe" and "categoria"): the section of an equipe exists
    // while the equipe has a channel that is not archived, in the order of the organogram's sectors. Sections the person made by hand come
    // with the storage of categories (not built yet).
    categories: (projectId) => {
      const withChannel = new Set(deps.channels.list(projectId).filter(channel => channel.kind === 'team' && channel.sourceId !== undefined && channel.archivedAt === undefined).map(channel => channel.sourceId))
      const automatic = deps.sectors(projectId)
        .filter(sector => withChannel.has(sector.id))
        .map((sector, position) => ({ id: teamSectionIdOf(sector.id), name: sector.name, position, teamId: sector.id }))
      const byHand = (deps.categories?.(projectId) ?? []).map(category => ({ id: category.id, name: category.name, position: HAND_MADE_SECTION_BASE + category.position }))
      return [...automatic, ...byHand]
    },
    channels: (projectId) => {
      const placed = deps.placements?.(projectId)
      return deps.channels.list(projectId).map((channel) => {
        const place = placed?.get(channel.id)
        return {
          id: channel.id,
          name: channel.name,
          kind: channel.kind,
          ...(channel.sourceId === undefined ? {} : { teamId: channel.sourceId }),
          ...(place !== undefined
            ? { categoryId: place.categoryId, position: place.position }
            : channel.kind === 'team' && channel.sourceId !== undefined ? { categoryId: teamSectionIdOf(channel.sourceId) } : {}),
          ...(channel.archivedAt === undefined ? {} : { archived: true }),
        }
      })
    },
    membersOf: (projectId, channelId) => {
      if (deps.channels.get(channelId) === undefined) return undefined
      return deps.teamChannels.membersOf(projectId, channelId).filter(member => member.kind === 'persona').map(member => member.id)
    },
  }
}

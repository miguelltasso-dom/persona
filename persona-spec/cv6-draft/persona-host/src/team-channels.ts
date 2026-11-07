/**
 * CV-6 (contracts/team-channels.md): the channels of the organogram. Every team (sector) with 2 or more personas in the project has its
 * #channel, the managers have the #diretoria, and a channel the organogram made is NEVER deleted: when its team goes, it is archived with
 * one line ("A equipe {x} não existe mais. O canal foi arquivado; nada foi apagado.") and it comes back, history intact, if the team does.
 * The members of those channels are not copied: they are derived from the organogram when read. Only a channel the person made keeps members.
 *
 * DRAFT — written during the host freeze (Keel, 05/11 03:58): NOT yet under persona-host/src. Goes there in the second host window.
 * Zero model, zero clock beyond the host's `now`.
 */

import type { ArchiveReason, ChannelMember, ChannelRepos, StoredPersona, TeamChannel } from '@deepseek-ai/dsh-persona-store'

/** Longest channel name (contract: 1–32). */
export const CHANNEL_NAME_MAX = 32

/** The id of the #diretoria of a project (one per project). */
export const directorateIdOf = (projectId: string): string => `diretoria:${projectId}`
/** The id of the channel of a team in a project. */
export const teamChannelIdOf = (projectId: string, sectorId: string): string => `equipe:${projectId}:${sectorId}`

/** Lower case, no accents, `[a-z0-9-]`, at most 32; "Geral" and the like are given a suffix by the caller when the name is taken. */
export function slugOf(name: string): string {
  const flat = name.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()
  const slug = flat.replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, CHANNEL_NAME_MAX).replace(/-+$/u, '')
  return slug === '' ? 'equipe' : slug
}

/** First free name for `base`: itself, then `-equipe`, then `-equipe-2`, … (never over 32). */
export function freeName(base: string, taken: ReadonlySet<string>): string {
  const fit = (stem: string, suffix: string): string => `${stem.slice(0, CHANNEL_NAME_MAX - suffix.length).replace(/-+$/u, '')}${suffix}`
  if (!taken.has(base)) return base
  for (let n = 1; n < 1000; n += 1) {
    const candidate = fit(base, n === 1 ? '-equipe' : `-equipe-${String(n)}`)
    if (!taken.has(candidate)) return candidate
  }
  return fit(base, `-${String(taken.size + 1)}`)
}

/** Host parts the reconciler reads and writes. */
export interface TeamChannelsDeps {
  readonly channels: Pick<ChannelRepos, 'get' | 'list' | 'bySource' | 'byKind' | 'create' | 'rename' | 'archive' | 'unarchive' | 'members'>
  /** Personas of the project that are on the team now (retired ones are not). */
  readonly personas: (projectId: string) => readonly StoredPersona[]
  readonly project: (projectId: string) => { readonly id: string; readonly workspaceId: string } | undefined
  /** Sectors of the workspace (the organogram's teams). */
  readonly sectors: (workspaceId: string) => readonly { readonly id: string; readonly name: string }[]
  /** persona id → sector id, from the persona's charge. */
  readonly sectorOf: (workspaceId: string) => ReadonlyMap<string, string>
  /** Human members who count as "the owner" of the workspace (the #diretoria includes them). */
  readonly ownerIds: (workspaceId: string) => readonly string[]
  /** Write the line in the channel. false when it already exists. The author is the project's Coordenação (a visible face), never a technical one. */
  readonly say: (line: { readonly id: string; readonly workspaceId: string; readonly projectId: string; readonly channelId: string; readonly actorId: string; readonly body: string; readonly at: string }) => boolean
  readonly now: () => string
  /** Whether the team layer is on. Off: nothing is created or archived. */
  readonly enabled: () => boolean
}

/** What a channel is to a person who looks at the list. */
export interface TeamChannelMember {
  readonly kind: 'persona' | 'human'
  readonly id: string
}

/** Reconciles the organogram's channels and tells who is on each. */
export class TeamChannels {
  constructor(private readonly deps: TeamChannelsDeps) {}

  /**
   * Make the channels match the organogram. Idempotent; cheap (a few reads) so it can run on every list, at boot, and when the organogram changes.
   * @param projectId - Tenant project.
   */
  reconcile(projectId: string): void {
    const { deps } = this
    if (!deps.enabled()) return
    const project = deps.project(projectId)
    if (project === undefined) return
    const personas = deps.personas(projectId)
    const sectors = deps.sectors(project.workspaceId)
    const sectorOf = deps.sectorOf(project.workspaceId)
    const coordination = personas.find(persona => persona.systemRoles.includes('coordination'))
    const all = deps.channels.list(projectId)
    const taken = new Set(all.map(channel => channel.name))

    // 1. Teams: a sector with 2+ personas of this project has its channel; a channel whose team is gone is archived, never deleted.
    const bySector = new Map<string, number>()
    for (const persona of personas) {
      const sectorId = sectorOf.get(persona.id)
      if (sectorId !== undefined) bySector.set(sectorId, (bySector.get(sectorId) ?? 0) + 1)
    }
    for (const sector of sectors) {
      const count = bySector.get(sector.id) ?? 0
      const channel = deps.channels.bySource(projectId, sector.id)
      if (channel === undefined) {
        if (count < 2) continue
        const name = freeName(slugOf(sector.name), taken)
        taken.add(name)
        deps.channels.create({ id: teamChannelIdOf(projectId, sector.id), workspaceId: project.workspaceId, projectId, name, kind: 'team', sourceId: sector.id })
        continue
      }
      if (count === 0) {
        this.archiveWithLine(channel, 'team-gone', `A equipe ${sector.name} não existe mais. O canal foi arquivado; nada foi apagado.`, coordination, project.workspaceId)
        continue
      }
      this.bringBack(channel, 'team-gone')
      // The sector was renamed: the channel follows unless the person renamed the channel.
      const wanted = slugOf(sector.name)
      if (!channel.nameLocked && channel.name !== wanted) {
        const name = freeName(wanted, new Set([...taken].filter(item => item !== channel.name)))
        if (name !== channel.name) {
          taken.delete(channel.name)
          taken.add(name)
          deps.channels.rename(channel.id, name, false)
        }
      }
    }
    // A team channel whose sector no longer exists at all (the sector was removed).
    const sectorIds = new Set(sectors.map(sector => sector.id))
    for (const channel of deps.channels.byKind(projectId, 'team')) {
      if (channel.sourceId !== undefined && !sectorIds.has(channel.sourceId)) {
        this.archiveWithLine(channel, 'team-gone', `A equipe ${channel.name} não existe mais. O canal foi arquivado; nada foi apagado.`, coordination, project.workspaceId)
      }
    }

    // 2. The directorate: the managers' channel, as long as there is at least one manager.
    const managers = personas.filter(persona => persona.systemRoles.includes('team_manager'))
    const directorate = deps.channels.byKind(projectId, 'directorate')[0]
    if (managers.length > 0) {
      if (directorate === undefined) {
        const name = freeName('diretoria', taken)
        deps.channels.create({ id: directorateIdOf(projectId), workspaceId: project.workspaceId, projectId, name, kind: 'directorate' })
      } else {
        this.bringBack(directorate, 'directorate-gone')
      }
    } else if (directorate !== undefined) {
      this.archiveWithLine(directorate, 'directorate-gone', 'A diretoria não tem mais gestores. O canal foi arquivado; nada foi apagado.', coordination, project.workspaceId)
    }
  }

  /**
   * Who is on a channel, in a stable order (by kind, then id): team = the sector's personas; directorate = the managers + the owner;
   * custom = the members the person put in; general = every persona of the project. An archived or unknown channel has nobody.
   * @param projectId - Tenant project.
   * @param channelId - Channel.
   */
  membersOf(projectId: string, channelId: string): TeamChannelMember[] {
    const { deps } = this
    const channel = deps.channels.get(channelId)
    if (channel === undefined || channel.projectId !== projectId || channel.archivedAt !== undefined) return []
    const project = deps.project(projectId)
    if (project === undefined) return []
    const personas = deps.personas(projectId)
    const asPersonas = (list: readonly StoredPersona[]): TeamChannelMember[] => [...list].sort(byNameThenId).map(persona => ({ kind: 'persona' as const, id: persona.id }))
    switch (channel.kind) {
      case 'team': {
        const sectorOf = deps.sectorOf(project.workspaceId)
        return asPersonas(personas.filter(persona => sectorOf.get(persona.id) === channel.sourceId))
      }
      case 'directorate': {
        const humans = deps.ownerIds(project.workspaceId).map(id => ({ kind: 'human' as const, id }))
        return [...asPersonas(personas.filter(persona => persona.systemRoles.includes('team_manager'))), ...humans]
      }
      case 'custom': {
        const known = new Set(personas.map(persona => persona.id))
        return deps.channels.members(channelId).filter((member: ChannelMember) => member.kind === 'human' || known.has(member.id)).map(member => ({ kind: member.kind, id: member.id }))
      }
      case 'general':
        return asPersonas(personas)
    }
  }

  /**
   * CV-8's seam (`PersonaHost.teamOf`): the personas of a channel, with the paused ones (whoever filters pause/limit/budget is the fan-out),
   * in a stable order, without the retired. An archived or unknown channel gives [].
   * @param projectId - Tenant project.
   * @param channelId - Channel.
   */
  teamPersonasOf(projectId: string, channelId: string): StoredPersona[] {
    const ids = new Set(this.membersOf(projectId, channelId).filter(member => member.kind === 'persona').map(member => member.id))
    return this.deps.personas(projectId).filter(persona => ids.has(persona.id)).sort(byNameThenId)
  }

  private bringBack(channel: TeamChannel, reason: ArchiveReason): void {
    if (channel.archivedAt !== undefined && channel.archivedReason === reason) this.deps.channels.unarchive(channel.id)
  }

  private archiveWithLine(channel: TeamChannel, reason: ArchiveReason, body: string, coordination: StoredPersona | undefined, workspaceId: string): void {
    if (channel.archivedAt !== undefined) return // the line is written once, with the archive
    this.deps.channels.archive(channel.id, reason)
    if (coordination === undefined) return
    this.deps.say({ id: `${reason}:${channel.id}`, workspaceId, projectId: channel.projectId, channelId: channel.id, actorId: coordination.id, body, at: this.deps.now() })
  }
}

function byNameThenId(a: StoredPersona, b: StoredPersona): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}

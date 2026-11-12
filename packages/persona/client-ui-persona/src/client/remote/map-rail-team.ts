import type { PersonaCharacterId } from '../assets/asset-url.ts'
import type { KanbanCardModel } from '../kanban/types.ts'
import type { RailPersona, RailPersonaState } from '../shell/RailTeam.tsx'
import type { ChannelPersonaMember, PersonaWorkUiState } from '../team/persona-work-state.ts'
import { isPersonaReviewing } from '../team/persona-reviewing.ts'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'
import { characterIdForPersona as hostCharacterIdOf } from './map-host-ui.ts'
import type { PersonaView } from './persona-remote-types.ts'
import { sortPersonasForUi } from '../team/sort-personas.ts'

const KNOWN: ReadonlySet<string> = new Set(['atlas', 'bento', 'nina', 'sol', 'luna'])

function characterIdForPersona(persona: PersonaView): RailPersona['characterId'] {
  const ref = persona.avatarRef.toLowerCase()
  if (KNOWN.has(ref)) return ref as PersonaCharacterId
  const head = ref.split(/[-_.]/u)[0] ?? ref
  if (KNOWN.has(head)) return head as PersonaCharacterId
  for (const id of KNOWN) {
    if (ref.includes(id)) return id as PersonaCharacterId
  }
  return ref.slice(0, 32) || persona.id
}

type StateFacts = Pick<RailPersona, 'draftFiles' | 'quiet' | 'paused' | 'step'>

/**
 * The facts the one state vocabulary needs besides the activity (draft files, silence window, pause), copied from the stage member, and the
 * step she is on NOW (the host's own words, only while she works: never invented here).
 */
function stateFactsOf(member: ChannelPersonaMember): StateFacts {
  return {
    ...(member.draftFiles === undefined ? {} : { draftFiles: member.draftFiles }),
    ...(member.quiet === undefined ? {} : { quiet: member.quiet }),
    ...(member.paused === undefined ? {} : { paused: member.paused }),
    ...(member.step === undefined ? {} : { step: member.step }),
  }
}

function nowForPersona(
  snap: PersonaLiveSnapshot,
  persona: PersonaView,
): { readonly state: PersonaWorkUiState; readonly currentTask?: string; readonly facts: StateFacts } {
  const row = snap.nowRows.find(r => r.member.name === persona.name)
  if (row !== undefined) {
    const facts = stateFactsOf(row.member)
    return row.currentTask === undefined
      ? { state: row.member.state, facts }
      : { state: row.member.state, currentTask: row.currentTask, facts }
  }
  const strip = snap.stripMembers.find(m => m.name === persona.name)
  if (strip !== undefined) return { state: strip.state, facts: stateFactsOf(strip) }
  return { state: 'resting', facts: {} }
}

function railState(
  hostOnline: boolean,
  ui: PersonaWorkUiState,
  currentTask: string | undefined,
  cards: readonly KanbanCardModel[],
): RailPersonaState {
  if (!hostOnline) return 'offline'
  if (isPersonaReviewing(ui, currentTask, cards)) return 'reviewing'
  if (ui === 'stuck') return 'stuck'
  if (ui === 'waiting') return 'waiting'
  if (ui === 'resting') return 'resting'
  return 'working'
}

function unreadForPersona(
  snap: PersonaLiveSnapshot,
  personaId: string,
): number {
  const fromMap = snap.dmUnreadByPersonaId[personaId]
  if (fromMap !== undefined) return fromMap
  const dm = snap.dms.find(row => row.peerId === personaId)
  if (dm === undefined) return 0
  if (snap.selectedDmId === dm.id) return 0
  return 0
}

/** Live snapshot → sidebar rail rows (host persona ids + honest state). */
export function mapRailTeamFromLive(
  snap: PersonaLiveSnapshot,
  hostOnline: boolean,
): readonly RailPersona[] {
  if (!snap.ready || snap.team === null) return []
  const arriving = snap.arrivingHostPersonaIds ?? []
  return sortPersonasForUi(snap.team.personas).map((persona) => {
    const now = nowForPersona(snap, persona)
    const gestor = persona.systemRoles.includes('team_manager')
    return {
      id: persona.id,
      // The SAME animal the DM header and the stage draw (never a letter, D-069): the shared rule first, this file's guess only as a last resort.
      characterId: hostCharacterIdOf(snap.team, persona.id) ?? characterIdForPersona(persona),
      name: persona.name,
      role: persona.title,
      state: railState(hostOnline, now.state, now.currentTask, snap.kanbanCards),
      ...now.facts,
      unread: unreadForPersona(snap, persona.id),
      ...(gestor ? { gestor: true as const } : {}),
      ...(arriving.includes(persona.id) ? { arriving: true as const } : {}),
    }
  })
}

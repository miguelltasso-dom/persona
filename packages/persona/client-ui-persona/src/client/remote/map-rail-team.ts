import type { PersonaCharacterId } from '../assets/asset-url.ts'
import type { KanbanCardModel } from '../kanban/types.ts'
import type { RailPersona, RailPersonaState } from '../shell/RailTeam.tsx'
import type { PersonaWorkUiState } from '../team/persona-work-state.ts'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'
import type { PersonaView, TeamView } from './persona-remote-types.ts'

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

function nowForPersona(
  snap: PersonaLiveSnapshot,
  persona: PersonaView,
): { readonly state: PersonaWorkUiState; readonly currentTask?: string } {
  const row = snap.nowRows.find(r => r.member.name === persona.name)
  if (row !== undefined) {
    return row.currentTask === undefined
      ? { state: row.member.state }
      : { state: row.member.state, currentTask: row.currentTask }
  }
  const strip = snap.stripMembers.find(m => m.name === persona.name)
  if (strip !== undefined) return { state: strip.state }
  return { state: 'resting' }
}

function railState(
  hostOnline: boolean,
  ui: PersonaWorkUiState,
  currentTask: string | undefined,
  cards: readonly KanbanCardModel[],
): RailPersonaState {
  if (!hostOnline) return 'offline'
  const reviewTitles = new Set(
    cards.filter(card => card.column === 'in_review').map(card => card.title),
  )
  if (currentTask !== undefined && reviewTitles.has(currentTask)) return 'reviewing'
  if (ui === 'stuck') return 'stuck'
  if (ui === 'waiting') return 'waiting'
  if (ui === 'resting') return 'resting'
  if (ui === 'working' && reviewTitles.size > 0 && currentTask !== undefined) return 'reviewing'
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

function sortPersonas(team: TeamView): readonly PersonaView[] {
  const personas = [...team.personas]
  personas.sort((a, b) => {
    const aCoord = a.systemRoles.includes('coordination') ? 0 : 1
    const bCoord = b.systemRoles.includes('coordination') ? 0 : 1
    if (aCoord !== bCoord) return aCoord - bCoord
    return a.name.localeCompare(b.name, 'pt-BR')
  })
  return personas
}

/** Live snapshot → sidebar rail rows (host persona ids + honest state). */
export function mapRailTeamFromLive(
  snap: PersonaLiveSnapshot,
  hostOnline: boolean,
): readonly RailPersona[] {
  if (!snap.ready || snap.team === null) return []
  return sortPersonas(snap.team).map((persona) => {
    const now = nowForPersona(snap, persona)
    return {
      id: persona.id,
      characterId: characterIdForPersona(persona),
      name: persona.name,
      role: persona.title,
      state: railState(hostOnline, now.state, now.currentTask, snap.kanbanCards),
      unread: unreadForPersona(snap, persona.id),
    }
  })
}

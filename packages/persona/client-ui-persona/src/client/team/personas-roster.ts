/**
 * Equipe › Personas (NAV-SPEC; Keel 03:33 + Muse 03:34): a LISTA de personas da equipe, uma por cartão. Este módulo só monta e ordena os dados;
 * quem desenha é o `PersonasTeamPanel`.
 *
 * ORDEM (Muse 03:51): Coordenação → Precisa de ajuda → Aguardando você → Trabalhando → o resto por nome. É calculada ao ABRIR a aba e não
 * reordena ao vivo (o estado de cada cartão muda no lugar, o cartão não pula de posição); persona nova entra no fim do que já está na tela.
 */

import type { PersonaCharacterId } from '../assets/asset-url.ts'
import type { PersonaView, TeamView } from '../remote/persona-remote-types.ts'
import { characterIdForPersona } from '../remote/map-host-ui.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot, PersonaWorkUiState } from './persona-work-state.ts'
import { sortPersonasForUi } from './sort-personas.ts'

export interface RosterEntry {
  /** O id da persona no host (o perfil abre por ele). */
  readonly id: string
  readonly name: string
  readonly role: string
  readonly characterId: PersonaCharacterId
  readonly state: PersonaWorkUiState
  /** Rascunho, Janela de silêncio e pausa: estreitam `state` no vocabulário único (`persona-state.ts`). */
  readonly draftFiles?: number | undefined
  readonly quiet?: boolean | undefined
  readonly paused?: boolean | undefined
  /** O título da tarefa atual (nunca um id). */
  readonly currentTask?: string | undefined
  readonly queueCount: number
  readonly coordination: boolean
  /** "Quem cuida: {nome}": a pessoa responsável, quando o host diz. */
  readonly caretaker?: string | undefined
}

/**
 * A ordem de "quem importa agora" (Muse 03:51): 0 Coordenação → 1 Precisa de ajuda → 2 Aguardando você → 3 Trabalhando → 4 o resto (por nome, dentro de cada grupo).
 */
export function rosterPriority(entry: Pick<RosterEntry, 'coordination' | 'state'>): 0 | 1 | 2 | 3 | 4 {
  if (entry.coordination) return 0
  switch (entry.state) {
    case 'stuck': return 1
    case 'waiting': return 2
    case 'working': return 3
    default: return 4
  }
}

/** Os ids na ordem em que a aba abre (função pura: o painel a congela). */
export function orderRosterIds(entries: readonly RosterEntry[]): readonly string[] {
  return [...entries]
    .sort((a, b) => rosterPriority(a) - rosterPriority(b) || a.name.localeCompare(b.name, 'pt-BR'))
    .map(entry => entry.id)
}

/**
 * Junta a equipe do host com o estado vivo de cada persona. `stripMembers` vem na MESMA ordem de `sortPersonasForUi(team.personas)` (é como a faixa da equipe
 * é montada), então o estado de cada uma é o da mesma posição; tarefa atual e fila vêm do "Agora" (`nowRows`), achado pelo mesmo bicho + nome.
 */
export function buildRoster(
  team: TeamView | null,
  stripMembers: readonly ChannelPersonaMember[],
  nowRows: readonly PersonaNowSnapshot[],
  caretakers: ReadonlyMap<string, string> = new Map(),
): readonly RosterEntry[] {
  if (team === null) return []
  const sorted = sortPersonasForUi(team.personas)
  return sorted.map((persona: PersonaView, index) => {
    // A persona vem do próprio time, então o rosto sempre resolve (o `?? ` é só para o tipo).
    const characterId = characterIdForPersona(team, persona.id) ?? ('atlas' as PersonaCharacterId)
    const strip = stripMembers[index]
    const now = nowRows.find(row => row.member.id === characterId && row.member.name === persona.name)
    const state: PersonaWorkUiState = now?.member.state ?? (strip !== undefined && strip.name === persona.name ? strip.state : 'resting')
    const caretaker = caretakers.get(persona.id)
    const facts = now?.member ?? (strip !== undefined && strip.name === persona.name ? strip : undefined)
    return {
      id: persona.id,
      name: persona.name,
      role: persona.title,
      characterId,
      state,
      ...(facts?.draftFiles === undefined ? {} : { draftFiles: facts.draftFiles }),
      ...(facts?.quiet === undefined ? {} : { quiet: facts.quiet }),
      ...(facts?.paused === undefined ? {} : { paused: facts.paused }),
      ...(now?.currentTask === undefined || now.currentTask === '' ? {} : { currentTask: now.currentTask }),
      queueCount: now?.queueCount ?? 0,
      coordination: persona.systemRoles?.includes('coordination') === true,
      ...(caretaker === undefined || caretaker === '' ? {} : { caretaker }),
    }
  })
}

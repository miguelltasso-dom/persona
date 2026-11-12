/**
 * CV-1 (CONVERSAS-SPEC §0): de onde a barra lilás única tira as linhas de Canais e Pessoas.
 *
 *  - {@link mapConversationsSource}: puro. Junta a faixa da equipe (rosto, função, estado, não lidas), as DMs do host (quem já
 *    conversou e em que ordem) e a equipe de cada persona no organograma, e devolve o que o modelo espera.
 *  - {@link createSectorsObservable}: lê `getOrgChart({ groupBy: 'sector' })` (cada setor = uma equipe) uma vez quando o tenant
 *    existe e de novo quando o elenco muda. Falha ou host antigo = ninguém tem equipe (um grupo só, sem inventar nome).
 *  - {@link createConversationsObservable}: o que o `PersonaSidebar` assina (snapshot estável: só muda quando uma entrada muda).
 *
 * Honestidade: o host ainda não devolve a última mensagem por DM; sem ela a linha mostra só nome e função, e a ordem dos
 * "Recentes" é a ordem das DMs que o host entrega. Quando existir `lastBody`/`lastAt`, entram aqui sem mudar a barra.
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { unwrapRemote } from '../data/remote-call.ts'
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import type { ConversationChannel, ConversationPerson } from './conversations-model.ts'
import type { RailPersona } from './RailTeam.tsx'

export interface ConversationsSource {
  readonly channels: readonly ConversationChannel[]
  readonly people: readonly ConversationPerson[]
}

export const EMPTY_CONVERSATIONS: ConversationsSource = { channels: [], people: [] }

/** A equipe (setor do organograma) de cada persona, pelo id da persona. */
export type SectorByPersonaId = Readonly<Record<string, { readonly id: string; readonly title: string }>>

export interface MapConversationsInput {
  readonly rail: readonly RailPersona[]
  /** DMs do host, na ordem em que ele entrega (a mais recente primeiro, até o host dizer o contrário). */
  readonly dms: readonly { readonly id: string; readonly peerId: string }[]
  /** Id do canal geral do tenant; `null` antes de o host responder. */
  readonly channelId: string | null
  /** Nome do canal geral sem o `#` (já traduzido). */
  readonly generalName: string
  readonly sectorByPersonaId: SectorByPersonaId
}

export function mapConversationsSource(input: MapConversationsInput): ConversationsSource {
  const rankByPersona = new Map<string, number>()
  input.dms.forEach((dm, index) => {
    if (!rankByPersona.has(dm.peerId)) rankByPersona.set(dm.peerId, index)
  })
  const people = input.rail.map((persona): ConversationPerson => {
    const sector = input.sectorByPersonaId[persona.id]
    const rank = rankByPersona.get(persona.id)
    return {
      id: persona.id,
      name: persona.name,
      role: persona.role,
      characterId: persona.characterId,
      state: persona.state,
      ...(persona.draftFiles === undefined ? {} : { draftFiles: persona.draftFiles }),
      ...(persona.quiet === undefined ? {} : { quiet: persona.quiet }),
      ...(persona.paused === undefined ? {} : { paused: persona.paused }),
      teamId: sector?.id ?? null,
      teamName: sector?.title ?? null,
      unread: persona.unread,
      hasConversation: rank !== undefined,
      ...(rank === undefined ? {} : { recentRank: rank }),
    }
  })
  const channels: readonly ConversationChannel[] = input.channelId === null || input.channelId === ''
    ? []
    : [{ id: input.channelId, name: input.generalName, unread: 0 }]
  return { channels, people }
}

// --- equipes (setores do organograma) ---------------------------------------------------------------------------

interface OrgGroupWire {
  readonly id?: unknown
  readonly title?: unknown
  readonly kind?: unknown
  readonly members?: unknown
}

/** Lê `groups[]` de um `OrgChartView` qualquer e monta persona → setor. Linha estranha é ignorada. */
export function sectorsFromOrgChart(view: unknown): SectorByPersonaId {
  const out: Record<string, { id: string; title: string }> = {}
  const groups = (view as { groups?: unknown } | null)?.groups
  if (!Array.isArray(groups)) return out
  for (const raw of groups as readonly OrgGroupWire[]) {
    if (typeof raw?.id !== 'string' || typeof raw.title !== 'string' || raw.kind !== 'sector' || !Array.isArray(raw.members)) continue
    for (const member of raw.members as readonly { readonly id?: unknown }[]) {
      if (typeof member?.id === 'string' && out[member.id] === undefined) out[member.id] = { id: raw.id, title: raw.title }
    }
  }
  return out
}

export interface SectorsRemote {
  getOrgChart?(request: { workspaceId: string; groupBy: 'sector' }): unknown
}

export interface SectorsSource {
  readonly remote: SectorsRemote | undefined
  /** `null` antes de o host responder ao bootstrap. */
  readonly workspaceId: () => string | null
  /** Avisa quando o tenant ou o elenco podem ter mudado (a leitura sai de novo). */
  readonly subscribeChange: (listener: () => void) => () => void
}

const NO_SECTORS: SectorByPersonaId = {}

function sameSectors(a: SectorByPersonaId, b: SectorByPersonaId): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every(key => a[key]?.id === b[key]?.id && a[key]?.title === b[key]?.title)
}

async function settle(value: unknown): Promise<unknown> {
  const resolved = await Promise.resolve(value)
  return isRemoteResult(resolved) ? unwrapRemote(resolved) : resolved
}

/** A equipe de cada persona. Só consulta o host enquanto alguém assina. */
export function createSectorsObservable(source: SectorsSource): HostObservable<SectorByPersonaId> {
  let snapshot: SectorByPersonaId = NO_SECTORS
  const listeners = new Set<() => void>()
  let dispose: (() => void) | undefined
  let generation = 0
  let inFlight = false
  let rerun = false

  const publish = (next: SectorByPersonaId): void => {
    if (sameSectors(snapshot, next)) return
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  const load = async (): Promise<void> => {
    if (inFlight) { rerun = true; return }
    const workspaceId = source.workspaceId()
    const remote = source.remote
    if (workspaceId === null || remote?.getOrgChart === undefined) return
    inFlight = true
    const mine = generation
    try {
      const view = await settle(remote.getOrgChart({ workspaceId, groupBy: 'sector' }))
      if (mine === generation) publish(sectorsFromOrgChart(view))
    } catch {
      /* host antigo ou ocupado: segue sem equipes (um grupo só) */
    } finally {
      inFlight = false
    }
    if (rerun && mine === generation) { rerun = false; void load() }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (listeners.size === 1) {
        generation += 1
        dispose = source.subscribeChange(() => { void load() })
        void load()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          generation += 1
          dispose?.()
          dispose = undefined
          inFlight = false
          rerun = false
        }
      }
    },
  }
}

// --- quando reler as equipes -------------------------------------------------------------------------------------

/**
 * Avisa só quando o tenant aparece ou o ELENCO muda (quem entrou, quem saiu), não a cada mensagem do live: é o que dispara a
 * releitura do organograma.
 */
export function createRosterChangeSubscriber(live: PersonaLiveStore): (listener: () => void) => () => void {
  return (listener) => {
    let last = ''
    return live.observable.subscribe(() => {
      const snap = live.observable.getSnapshot()
      const next = `${snap.tenant?.workspaceId ?? ''}|${snap.team?.personas.map(persona => persona.id).join(',') ?? ''}`
      if (next === last) return
      last = next
      listener()
    })
  }
}

// --- o que a barra assina ----------------------------------------------------------------------------------------

export interface ConversationsObservableInput {
  readonly live: PersonaLiveStore
  readonly railTeam: HostObservable<readonly RailPersona[]>
  readonly sectors: HostObservable<SectorByPersonaId>
  /** Nome do canal geral sem o `#` (já traduzido), lido a cada recálculo (a língua pode mudar). */
  readonly generalName: () => string
}

/** Observável estável: recalcula só quando uma das entradas muda de referência (senão o React reclama de snapshot instável). */
export function createConversationsObservable(input: ConversationsObservableInput): HostObservable<ConversationsSource> {
  let lastLive: ReturnType<PersonaLiveStore['observable']['getSnapshot']> | undefined
  let lastRail: readonly RailPersona[] | undefined
  let lastSectors: SectorByPersonaId | undefined
  let last: ConversationsSource = EMPTY_CONVERSATIONS
  let lastKey = ''
  return {
    getSnapshot(): ConversationsSource {
      const live = input.live.observable.getSnapshot()
      const rail = input.railTeam.getSnapshot()
      const sectors = input.sectors.getSnapshot()
      if (live !== lastLive || rail !== lastRail || sectors !== lastSectors) {
        lastLive = live
        lastRail = rail
        lastSectors = sectors
        const next = mapConversationsSource({
          rail,
          dms: live.dms,
          channelId: live.tenant?.channelId ?? null,
          generalName: input.generalName(),
          sectorByPersonaId: sectors,
        })
        // O live muda a cada mensagem; a barra só precisa re-renderizar quando o que ela mostra mudou.
        const key = JSON.stringify(next)
        if (key !== lastKey) {
          lastKey = key
          last = next
        }
      }
      return last
    },
    subscribe(listener: () => void): () => void {
      const unsubscribers = [
        input.live.observable.subscribe(listener),
        input.railTeam.subscribe(listener),
        input.sectors.subscribe(listener),
      ]
      return () => { for (const unsubscribe of unsubscribers) unsubscribe() }
    },
  }
}

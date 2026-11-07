/**
 * FL-11 / P0-18: liga a fila por item do HOST a UMA conversa (o canal ou uma DM) e devolve o que a tela precisa (`HostQueueControls`).
 * Atrás de `persona.flag.workingControl` (desligada por padrão, D-077): desligada, sem host com as chamadas do IV-5 ou sem a conversa,
 * devolve `undefined` e a tela segue com a fila local de sempre.
 * A fila pendente de uma persona PARADA (o Parar mantém a fila) ou recarregada com a tela continua visível: ver `use-working-queue.ts`.
 */
import { useState } from 'react'
import type { HostQueueControls } from '../chat/host-queue.ts'
import { isWorkingControlEnabled } from '../chat/working-control-flag.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { resolveHostPersonaId } from './map-host-ui.ts'
import type { PersonaTenantScope, TeamView } from './persona-remote-types.ts'
import { useWorkingQueue } from './use-working-queue.ts'
import { hostSubjectId, workingRemoteFrom, type WorkingScope } from './working-control.ts'

export interface ConnectedHostQueueInput {
  /** O Remote do host (`ctx.remote.persona`); sem as chamadas do IV-5, nada muda na tela. */
  readonly remote: object | undefined
  readonly tenant: Pick<PersonaTenantScope, 'workspaceId' | 'projectId'> | null
  readonly team: TeamView | null
  readonly members: readonly ChannelPersonaMember[]
  /** Quem responde por padrão (a fila dela é sempre lida, mesmo ociosa). '' = ninguém. */
  readonly responderMemberId: string
  /** Canal: o assunto aberto; DM: o id da DM. */
  readonly subjectId: string
  readonly streamKind: 'channel' | 'dm'
  /** O id do canal ou da DM; `null` enquanto o host não respondeu. */
  readonly ownerId: string | null
  /** Muda quando o fio muda (mensagem nova): a fila pode ter saído sozinha. */
  readonly refreshKey: string | number
}

export function useConnectedHostQueue(input: ConnectedHostQueueInput): HostQueueControls | undefined {
  const { remote, tenant, team, members, responderMemberId, subjectId, streamKind, ownerId, refreshKey } = input
  const [flagOn] = useState(isWorkingControlEnabled)
  const host = workingRemoteFrom(remote)
  const ready = flagOn && host !== undefined && tenant !== null && ownerId !== null && ownerId !== '' && subjectId !== ''

  const hostIdOf = (ref: string): string => resolveHostPersonaId(team, ref)
  const personaIds = [
    ...members.filter(member => member.state === 'working').map(member => hostIdOf(member.id)),
    ...(responderMemberId === '' ? [] : [hostIdOf(responderMemberId)]),
  ]
  // Quem PODE ter fila pendente sem estar trabalhando (parada pelo Parar, que mantém a fila, ou "por cota"): todas as personas desta conversa,
  // lidas uma vez ao abri-la ou recarregar a tela. A chave leva os ids para que quem entrar na equipe depois também seja descoberta.
  const discoverIds = [...new Set(members.map(member => hostIdOf(member.id)))].sort()
  const discoverKey = `${streamKind}|${ownerId ?? ''}|${subjectId}|${discoverIds.join(',')}`
  const queue = useWorkingQueue({
    remote: host,
    enabled: ready,
    scopeFor: (personaId): WorkingScope | null => (tenant === null || ownerId === null
      ? null
      : { workspaceId: tenant.workspaceId, projectId: tenant.projectId, personaId, subjectId: hostSubjectId(subjectId, ownerId), streamKind, ownerId }),
    personaIds,
    nameOf: personaId => team?.personas.find(persona => persona.id === personaId)?.name ?? personaId,
    refreshKey,
    discoverIds,
    discoverKey,
  })
  if (!ready) return undefined

  return {
    items: queue.items,
    error: queue.error,
    clearError: queue.clearError,
    removed: queue.removed,
    dismissRemoved: queue.dismissRemoved,
    enqueue: (text, responder, reason) => queue.enqueue(hostIdOf(responder.id), text, reason),
    sendNow: (id) => { void queue.sendNow(id) },
    submitEdit: (id, text) => { void queue.edit(id, text) },
    drop: (id) => { void queue.drop(id) },
    undoDrop: () => { void queue.undoDrop() },
  }
}

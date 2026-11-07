/**
 * FL-11 / IV-5: liga o Parar e o "Direcionar agora" de UMA conversa (o canal ou uma DM) ao host. Atrás de `persona.flag.workingControl`
 * (desligada por padrão, D-077): desligada, sem as chamadas do IV-5 ou sem a conversa, devolve `undefined` e a tela segue como era.
 * Nunca inventa texto: o erro é a mensagem pronta do host.
 */
import { useCallback, useEffect, useState } from 'react'
import type { HostTurnControls } from '../chat/host-turn.ts'
import { isWorkingControlEnabled } from '../chat/working-control-flag.ts'
import type { ChannelPersonaMember } from '../team/persona-work-state.ts'
import { resolveHostPersonaId, type ChannelMessageUi } from './map-host-ui.ts'
import type { PersonaTenantScope, TeamView } from './persona-remote-types.ts'
import { hostSubjectId, steerTurn, stopTurn, workingErrorText, workingRemoteFrom, type WorkingScope } from './working-control.ts'
import { pickStopTarget } from './working-turn.ts'

export interface ConnectedTurnControlsInput {
  readonly remote: object | undefined
  readonly tenant: Pick<PersonaTenantScope, 'workspaceId' | 'projectId'> | null
  readonly team: TeamView | null
  readonly members: readonly ChannelPersonaMember[]
  /** As mensagens da conversa aberta (a resposta que cresce é uma delas). */
  readonly messages: readonly ChannelMessageUi[]
  readonly responderMemberId: string
  /** Canal: o assunto aberto; DM: o id da DM. */
  readonly subjectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string | null
}

/** Quanto tempo "{persona} parou." fica na região ao vivo antes de esvaziar (para um novo Parar ser dito de novo). */
const STOPPED_ANNOUNCE_MS = 4_000

export function useConnectedTurnControls(input: ConnectedTurnControlsInput): HostTurnControls | undefined {
  const { remote, tenant, team, members, messages, responderMemberId, subjectId, streamKind, ownerId } = input
  const [flagOn] = useState(isWorkingControlEnabled)
  const [error, setError] = useState<string | null>(null)
  const [stoppedPersona, setStoppedPersona] = useState<string | null>(null)
  const clearError = useCallback(() => { setError(null) }, [])
  useEffect(() => {
    if (stoppedPersona === null) return undefined
    const timer = setTimeout(() => { setStoppedPersona(null) }, STOPPED_ANNOUNCE_MS)
    return () => { clearTimeout(timer) }
  }, [stoppedPersona])

  const host = workingRemoteFrom(remote)
  if (!flagOn || host === undefined || tenant === null || ownerId === null || ownerId === '' || subjectId === '') return undefined

  const scopeFor = (personaId: string): WorkingScope => ({
    workspaceId: tenant.workspaceId, projectId: tenant.projectId, personaId, subjectId: hostSubjectId(subjectId, ownerId), streamKind, ownerId,
  })
  const target = pickStopTarget({ messages, members, team, responderMemberId })
  return {
    stoppable: target === null ? null : { personaName: target.personaName },
    stop: () => {
      if (target === null) return
      stopTurn(host, scopeFor(target.personaId), target.eventId === undefined ? {} : { eventId: target.eventId })
        .then((view) => {
          setError(null)
          // `none` = nada rodando mais (a resposta terminou no mesmo instante): não é erro e não há o que dizer.
          if (view.stopped !== 'none') setStoppedPersona(target.personaName)
        })
        .catch((failure: unknown) => { setError(workingErrorText(failure)) })
    },
    steer: (text, responder) => {
      steerTurn(host, scopeFor(resolveHostPersonaId(team, responder.id)), text)
        .then(() => { setError(null) })
        .catch((failure: unknown) => { setError(workingErrorText(failure)) })
    },
    stoppedPersona,
    error,
    clearError,
  }
}

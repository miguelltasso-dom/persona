/**
 * IV-10: liga o cartão da pergunta estruturada ao HOST (o canal ou uma DM) e devolve o que a tela precisa. Atrás de
 * `persona.flag.personaAsk` (`ask-flag.ts`, desligada por padrão, D-077): desligada, sem as duas chamadas no host, sem escopo ou sem
 * nenhuma pergunta com chips no fio, devolve `undefined` e o fio segue com a frase simples que o host escreve junto.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import type { PersonaTenantScope } from '../remote/persona-remote-types.ts'
import { isPersonaAskEnabled } from './ask-flag.ts'
import { hasAskChips } from './PersonaAskCard.tsx'
import type { PersonaAskLiveUi, PersonaAskUi } from './persona-ask-model.ts'
import { answerAskChoices, listAskStates, personaAsksRemoteFrom } from './persona-asks-remote.ts'

export interface PersonaAsksBinding {
  /** O estado vivo por `askId`; pergunta que o host ainda não listou conta como aberta. */
  readonly liveById: Readonly<Record<string, PersonaAskLiveUi>>
  /** Responde pelos chips; rejeita quando o host não aceitou (o cartão mostra "Não enviado · Tentar de novo"). */
  readonly onAnswer: (ask: PersonaAskUi, optionIds: readonly string[]) => Promise<void>
}

export interface ConnectedPersonaAsksInput {
  /** O Remote do host (`ctx.remote.persona`). */
  readonly remote: object | undefined
  readonly tenant: Pick<PersonaTenantScope, 'workspaceId' | 'projectId'> | null
  readonly messages: readonly ChannelMessageUi[]
  /** Muda quando o fio muda (mensagem nova): a próxima pergunta da sequência e o estado das anteriores. */
  readonly refreshKey: string | number
}

export function useConnectedPersonaAsks({ remote, tenant, messages, refreshKey }: ConnectedPersonaAsksInput): PersonaAsksBinding | undefined {
  const [flagOn] = useState(isPersonaAskEnabled)
  const [hostById, setHostById] = useState<Readonly<Record<string, PersonaAskLiveUi>>>({})
  /** O que ESTA pessoa respondeu: vale enquanto a leitura do host ainda diz "aberta" (ela pode chegar um instante depois). */
  const [mine, setMine] = useState<Readonly<Record<string, PersonaAskLiveUi>>>({})
  const [bump, setBump] = useState(0)
  const host = personaAsksRemoteFrom(remote)
  const workspaceId = tenant?.workspaceId ?? ''
  const projectId = tenant?.projectId ?? ''
  const withChips = messages.some(message => message.personaAsk !== undefined && hasAskChips(message.personaAsk))
  const ready = flagOn && host !== undefined && workspaceId !== '' && projectId !== '' && withChips

  useEffect(() => {
    if (!ready || host === undefined) return undefined
    let cancelled = false
    void listAskStates(host, { workspaceId, projectId })
      .then((next) => { if (!cancelled) setHostById(next) })
      .catch(() => { /* sem o estado vivo o cartão segue aberto; a próxima mudança do fio tenta de novo */ })
    return () => { cancelled = true }
    // `host` é o próprio Remote (estável); o que refaz a leitura é o escopo, o fio e uma resposta enviada.
  }, [ready, host, workspaceId, projectId, refreshKey, bump])

  const onAnswer = useCallback(async (ask: PersonaAskUi, optionIds: readonly string[]): Promise<void> => {
    if (host === undefined) throw new Error('sem host')
    await answerAskChoices(host, { workspaceId, projectId }, ask.ticketId, optionIds)
    setMine(current => ({ ...current, [ask.askId]: { status: 'answered', optionIds, text: '' } }))
    setBump(value => value + 1)
  }, [host, workspaceId, projectId])

  const liveById = useMemo(() => {
    const merged: Record<string, PersonaAskLiveUi> = { ...hostById }
    for (const [askId, answer] of Object.entries(mine)) {
      const fromHost = hostById[askId]
      if (fromHost === undefined || fromHost.status === 'open') merged[askId] = answer
    }
    return merged
  }, [hostById, mine])

  return ready ? { liveById, onAnswer } : undefined
}

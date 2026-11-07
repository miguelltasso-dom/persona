/**
 * P1-9: liga o cartão "Proposta de {persona}" ao HOST (o #geral) e devolve o que a tela precisa. Atrás de `persona.flag.taskProposal`
 * (`proposal-flag.ts`, desligada por padrão, D-077): desligada, sem as três chamadas no host, sem escopo ou sem nenhuma proposta no fio,
 * devolve `undefined` e o fio segue com a frase simples que o host escreve junto.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import type { PersonaTenantScope } from '../remote/persona-remote-types.ts'
import { isTaskProposalEnabled } from './proposal-flag.ts'
import type { ProposalLiveUi } from './task-proposal-model.ts'
import { decideProposal, listProposalStates, reopenProposal, taskProposalsRemoteFrom } from './task-proposals-remote.ts'

export interface TaskProposalsBinding {
  /** O estado vivo por id do item; item que o host ainda não listou conta como aberto. */
  readonly liveById: Readonly<Record<string, ProposalLiveUi>>
  /** Aceitar (`true`) ou "Agora não"; rejeita quando o host não registrou (o item mostra "Não consegui registrar agora. Tentar de novo"). */
  readonly onDecide: (itemId: string, accept: boolean) => Promise<void>
  /** O Desfazer do "Agora não"; rejeita quando o host não reabriu. */
  readonly onUndo: (itemId: string) => Promise<void>
}

export interface ConnectedTaskProposalsInput {
  /** O Remote do host (`ctx.remote.persona`). */
  readonly remote: object | undefined
  readonly tenant: Pick<PersonaTenantScope, 'workspaceId' | 'projectId'> | null
  readonly messages: readonly ChannelMessageUi[]
  /** Muda quando o fio muda (mensagem nova): uma proposta nova ou o estado das anteriores. */
  readonly refreshKey: string | number
}

export function useConnectedTaskProposals({ remote, tenant, messages, refreshKey }: ConnectedTaskProposalsInput): TaskProposalsBinding | undefined {
  const [flagOn] = useState(isTaskProposalEnabled)
  const [hostById, setHostById] = useState<Readonly<Record<string, ProposalLiveUi>>>({})
  /** O que o host respondeu a ESTA pessoa; vale até a próxima leitura da lista (que é a verdade). */
  const [mine, setMine] = useState<Readonly<Record<string, ProposalLiveUi>>>({})
  const [bump, setBump] = useState(0)
  const host = taskProposalsRemoteFrom(remote)
  const workspaceId = tenant?.workspaceId ?? ''
  const projectId = tenant?.projectId ?? ''
  const withProposal = messages.some(message => message.taskProposal !== undefined)
  const ready = flagOn && host !== undefined && workspaceId !== '' && projectId !== '' && withProposal

  useEffect(() => {
    if (!ready || host === undefined) return undefined
    let cancelled = false
    void listProposalStates(host, { workspaceId, projectId })
      .then((next) => { if (!cancelled) { setHostById(next); setMine({}) } })
      .catch(() => { /* sem o estado vivo o cartão segue aberto; a próxima mudança do fio tenta de novo */ })
    return () => { cancelled = true }
    // `host` é o próprio Remote (estável); o que refaz a leitura é o escopo, o fio e uma decisão enviada.
  }, [ready, host, workspaceId, projectId, refreshKey, bump])

  const onDecide = useCallback(async (itemId: string, accept: boolean): Promise<void> => {
    if (host === undefined) throw new Error('sem host')
    const live = await decideProposal(host, { workspaceId, projectId }, itemId, accept)
    setMine(current => ({ ...current, [itemId]: live ?? { status: accept ? 'accepted' : 'declined' } }))
    setBump(value => value + 1)
  }, [host, workspaceId, projectId])

  const onUndo = useCallback(async (itemId: string): Promise<void> => {
    if (host === undefined) throw new Error('sem host')
    const live = await reopenProposal(host, { workspaceId, projectId }, itemId)
    setMine(current => ({ ...current, [itemId]: live ?? { status: 'open' } }))
    setBump(value => value + 1)
  }, [host, workspaceId, projectId])

  const liveById = useMemo(() => ({ ...hostById, ...mine }), [hostById, mine])

  return ready ? { liveById, onDecide, onUndo } : undefined
}

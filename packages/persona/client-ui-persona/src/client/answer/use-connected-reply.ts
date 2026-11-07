/**
 * IV-10 · o "Responder" do lado do composer: liga a loja do alvo (`reply-target.ts`) ao composer da conversa (o canal ou uma DM) e devolve
 * as duas props que o composer do Flint já entende — `replyTarget` ({id, label, onClear}) e `onSendReply` (que chama `answerAttention`).
 * Atrás de `persona.flag.personaAsk` (a mesma do cartão com chips, D-077): desligada, sem `answerAttention` no host, sem escopo ou com o alvo
 * em OUTRA conversa, devolve `undefined` e o composer segue como sempre (o texto vai como mensagem comum).
 */
import { useMemo, useState } from 'react'
import type { PersonaTenantScope } from '../remote/persona-remote-types.ts'
import { isPersonaAskEnabled } from '../ask/ask-flag.ts'
import { answerRemoteFrom, answerWithText } from './answer-remote.ts'
import { replyTargetStore, summarizeQuestion, targetFor, useReplyTarget, type ReplyTarget, type ReplyTargetStore } from './reply-target.ts'

export interface ConnectedReplyInput {
  /** O Remote do host (`ctx.remote.persona`). */
  readonly remote: object | undefined
  readonly tenant: Pick<PersonaTenantScope, 'workspaceId' | 'projectId'> | null
  readonly streamKind: 'channel' | 'dm'
  /** O id do canal ou da DM; `null` enquanto o host não respondeu. */
  readonly ownerId: string | null
  /** A frase do chip: `t('reply.chip', { name, question })` do locale `chat`. */
  readonly chipLabel: (name: string, question: string) => string
  /** Injetável nos testes. */
  readonly store?: ReplyTargetStore
}

export interface ConnectedReplyProps {
  readonly replyTarget: { readonly id: string; readonly label: string; readonly onClear: () => void }
  readonly onSendReply: (text: string, attachmentIds: readonly string[]) => Promise<void>
}

export function useConnectedReply({ remote, tenant, streamKind, ownerId, chipLabel, store = replyTargetStore }: ConnectedReplyInput): ConnectedReplyProps | undefined {
  const [flagOn] = useState(isPersonaAskEnabled)
  const target: ReplyTarget | undefined = targetFor(useReplyTarget(store), streamKind, ownerId ?? '')
  const host = answerRemoteFrom(remote)
  const workspaceId = tenant?.workspaceId ?? ''
  const projectId = tenant?.projectId ?? ''
  return useMemo(() => {
    if (!flagOn || host === undefined || workspaceId === '' || projectId === '' || target === undefined || ownerId === null) return undefined
    return {
      replyTarget: {
        id: target.ticketId,
        label: chipLabel(target.personaName, summarizeQuestion(target.question)),
        onClear: () => { store.clear() },
      },
      // O composer limpa o alvo ao enviar; se o host recusar, o texto volta ao campo (o chip não volta: a pessoa toca em "Responder" de novo).
      onSendReply: async (text: string, attachmentIds: readonly string[]) => {
        await answerWithText(host, { workspaceId, projectId }, target.ticketId, text, attachmentIds)
      },
    }
  }, [flagOn, host, workspaceId, projectId, target, ownerId, chipLabel, store])
}

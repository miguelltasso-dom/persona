/**
 * COLHEITA §14 (Quill): figurinha sozinha no composer vai ao fio como mensagem da PESSOA e NÃO abre turno (a persona não responde).
 * Puro: monta o evento; quem grava é o host (`index.ts`, método `sendSticker`, que chama `events.append` direto, sem `orchestration.ingest`).
 * Corpo do evento = o marcador `[[sticker:<id>]]`; o cliente desenha a figurinha em 96 px, sem balão.
 * Reação em balão de persona não passa por aqui: é `reactToMessage` (já não abre turno).
 */
import { isChatSticker } from './stickers.ts'

export interface SendStickerRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly id: string
  readonly stickerId: string
  /** Quem manda: o host preenche com a sessão (nunca confia no argumento). */
  readonly actorId?: string | undefined
  readonly occurredAt?: string | undefined
  readonly topicId?: string | undefined
  readonly subjectId?: string | undefined
}

/** O marcador que o cliente reconhece no corpo: `[[sticker:<id>]]`. */
export function stickerBody(stickerId: string): string {
  return `[[sticker:${stickerId}]]`
}

/** O id da figurinha de um corpo; `undefined` quando o corpo não é uma figurinha. */
export function stickerIdOfBody(body: string): string | undefined {
  const match = /^\[\[sticker:([a-z-]+)\]\]$/u.exec(body)
  return match?.[1]
}

/** Monta o evento da figurinha. Falha fechada: id fora do catálogo ou sem autor = recusa (nada gravado). */
export function stickerMessageEvent(request: SendStickerRequest, now: string) {
  if (!isChatSticker(request.stickerId)) throw new Error('unknown-sticker')
  if (request.actorId === undefined || request.actorId === '') throw new Error('sticker-without-author')
  // exactOptionalPropertyTypes: o tópico entra só quando existe (nunca `topicId: undefined`).
  const topic: string | undefined = request.topicId === undefined || request.topicId === '' ? undefined : request.topicId
  const subject: string = request.subjectId === undefined || request.subjectId === '' ? request.id : request.subjectId
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    projectId: request.projectId,
    streamKind: request.streamKind,
    ownerId: request.ownerId,
    type: 'message' as const,
    body: stickerBody(request.stickerId),
    actorId: request.actorId,
    occurredAt: request.occurredAt ?? now,
    // O store grava subjectId sempre (um parâmetro SQL não aceita undefined): sem assunto, a própria figurinha é o assunto.
    subjectId: subject,
    ...(topic === undefined ? {} : { topicId: topic }),
  }
}

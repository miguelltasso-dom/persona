/**
 * Persona Intake (E-6): channel / DM / routine → Trigger.
 * Idempotent on `id`. Bots are `human: false` and fail the gate unless listed.
 */

import { key } from '../core/ids.ts'
import type { Trigger } from '../core/model.ts'
import { internalSourceScope, type InternalSourceKind } from '../sources.ts'

export interface InternalMessage {
  source: InternalSourceKind
  streamId: string
  messageId: string
  actorId: string
  text: string
  at: string
  human: boolean
  addressed?: 'mention' | 'direct'
}

/**
 * Stable trigger id: same stream+message never creates a second Trigger.
 * @param message - Authenticated host message.
 */
export function internalTriggerId(message: Pick<InternalMessage, 'source' | 'streamId' | 'messageId'>): string {
  return key('in', message.source, message.streamId, message.messageId)
}

/**
 * @param message - Channel, DM, or routine fire.
 */
export function internalMessageToTrigger(message: InternalMessage): Trigger {
  const thread = { source: message.source, id: message.streamId }
  const trigger: Trigger = {
    id: internalTriggerId(message),
    source: message.source,
    threads: [thread],
    actor: { source: message.source, id: message.actorId },
    human: message.human,
    at: message.at,
    text: message.text,
    channel: { source: message.source, thread: message.streamId, address: { message: message.messageId } },
    meta: { [`${message.source}Id`]: message.streamId, messageId: message.messageId },
  }
  if (message.addressed !== undefined) trigger.addressed = message.addressed
  return trigger
}

export const channelMessageToTrigger = internalMessageToTrigger
export const dmMessageToTrigger = internalMessageToTrigger
export const routineFireToTrigger = internalMessageToTrigger

export { internalSourceScope }

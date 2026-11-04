/**
 * External Sources (X-3): Rivet maps Slack/Discord/Telegram/e-mail/ICS → Trigger.
 * Host calls {@link receiveExternal}; this package never imports runners or vault.
 */

import type { EngineForSources, ReceiveResult, SourceScope, Trigger } from '../core/index.ts'

export const TELEGRAM_SOURCE = 'telegram'
export const EMAIL_SOURCE = 'email'
export const SLACK_SOURCE = 'slack'
export const DISCORD_SOURCE = 'discord'
export const CALENDAR_SOURCE = 'calendar'

export type ExternalChannelSource =
  | typeof TELEGRAM_SOURCE
  | typeof EMAIL_SOURCE
  | typeof SLACK_SOURCE
  | typeof DISCORD_SOURCE
  | typeof CALENDAR_SOURCE

const CHANNELS: readonly ExternalChannelSource[] = [
  TELEGRAM_SOURCE, EMAIL_SOURCE, SLACK_SOURCE, DISCORD_SOURCE, CALENDAR_SOURCE,
]

/**
 * Listening scope for one external channel. Host composes with GitHub / internal.
 * @param kind - telegram, email, slack, discord, or calendar.
 */
export function externalSourceScope(kind: ExternalChannelSource): SourceScope {
  return {
    scope(input): { listened: true; observed: boolean; row: string } | { listened: false; reason: string } {
      if (input.source !== kind) return { listened: false, reason: 'sourceMismatch' }
      const row = typeof input.meta.row === 'string' && input.meta.row.length > 0 ? input.meta.row : kind
      return { listened: true, observed: false, row }
    },
  }
}

/**
 * First matching scope wins. Last mismatch reason is kept.
 * @param scopes - Internal + GitHub + telegram + email + slack + discord + calendar.
 */
export function composeSourceScope(...scopes: readonly SourceScope[]): SourceScope {
  return {
    scope(input) {
      let last: ReturnType<SourceScope['scope']> = { listened: false, reason: 'sourceMismatch' }
      for (const item of scopes) {
        const result = item.scope(input)
        if (result.listened) return result
        last = result
      }
      return last
    },
  }
}

/**
 * All Rivet-mapped external scopes in one composer.
 */
export function allExternalSourceScope(): SourceScope {
  return composeSourceScope(...CHANNELS.map(externalSourceScope))
}

/**
 * Ingest one Slack / Discord / Telegram / e-mail / calendar Trigger.
 * Same id is `duplicate`. Reply stays on `trigger.channel`.
 * @param engine - Source face of the Engine.
 * @param trigger - Mapped inbound (no token).
 */
export function receiveExternal(engine: EngineForSources, trigger: Trigger): ReceiveResult {
  if (!CHANNELS.includes(trigger.source as ExternalChannelSource)) throw new Error('external-source')
  return engine.receive(trigger)
}

/**
 * Poll batch: each Trigger independently stored or duplicated.
 * @param engine - Source face.
 * @param triggers - Mapped updates.
 */
export function receiveExternalBatch(
  engine: EngineForSources,
  triggers: readonly Trigger[],
): ReceiveResult[] {
  return triggers.map(item => receiveExternal(engine, item))
}

/** Where Anvil posts the Coordination reply. */
export interface OriginReply {
  source: ExternalChannelSource
  chat?: string
  channel?: string
  to?: string
  subject?: string
  message?: string
  uid?: string
  dtstart?: string
}

/**
 * Origin address for a reply on the inbound channel. Never a secret.
 * @param trigger - Stored Trigger.
 */
export function originReply(trigger: Trigger): OriginReply | undefined {
  if (!CHANNELS.includes(trigger.source as ExternalChannelSource)) return undefined
  const source = trigger.source as ExternalChannelSource
  const channel = trigger.channel
  if (channel === undefined) return { source }
  const address = channel.address
  if (source === TELEGRAM_SOURCE) {
    return {
      source,
      ...(address.chat === undefined ? {} : { chat: address.chat }),
      ...(address.message === undefined ? {} : { message: address.message }),
    }
  }
  if (source === SLACK_SOURCE) {
    return {
      source,
      ...(address.channel === undefined ? {} : { channel: address.channel }),
      ...(address.ts === undefined ? {} : { message: address.ts }),
    }
  }
  if (source === DISCORD_SOURCE) {
    return {
      source,
      ...(address.channel === undefined ? {} : { channel: address.channel }),
      ...(address.message === undefined ? {} : { message: address.message }),
    }
  }
  if (source === CALENDAR_SOURCE) {
    return {
      source,
      ...(address.uid === undefined ? {} : { uid: address.uid }),
      ...(address.dtstart === undefined ? {} : { dtstart: address.dtstart }),
    }
  }
  const to = address.to ?? address.from
  return {
    source,
    ...(to === undefined ? {} : { to }),
    ...(typeof trigger.meta.subject === 'string' ? { subject: trigger.meta.subject } : {}),
    ...(address.message === undefined ? {} : { message: address.message }),
  }
}

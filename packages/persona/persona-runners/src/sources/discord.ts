/**
 * Discord gateway message → engine Trigger. Bot token stays in the vault.
 */

import type { Trigger } from '@deepseek-ai/dsh-persona-engine'
import { withSourceRequest, type ProcessBudget } from '../resolve/resource-budget.ts'

export const DISCORD_SOURCE = 'discord'

export interface DiscordMessage {
  id: string
  content?: string
  channel_id: string
  timestamp?: string
  author?: { id: string; bot?: boolean; username?: string }
}

/**
 * Map one Discord message onto an immutable Trigger.
 * @param message - REST/gateway message.
 */
export function discordMessageToTrigger(message: DiscordMessage): Trigger | undefined {
  const text = message.content?.trim() ?? ''
  if (text === '') return undefined
  const channel = message.channel_id
  const actor = message.author?.id ?? 'unknown'
  return {
    id: `discord:${channel}:${message.id}`,
    source: DISCORD_SOURCE,
    threads: [{ source: DISCORD_SOURCE, id: channel }],
    actor: { source: DISCORD_SOURCE, id: actor },
    human: message.author?.bot !== true,
    addressed: 'mention',
    at: message.timestamp ?? new Date().toISOString(),
    text,
    channel: {
      source: DISCORD_SOURCE,
      thread: channel,
      address: { channel, message: message.id },
    },
    meta: { username: message.author?.username ?? '' },
  }
}

/**
 * Poll a fake Discord channel. Token never appears in Triggers.
 * @param options - Token, channel, fetch, base URL.
 */
export async function pollDiscord(options: {
  token: string
  channel: string
  fetch: typeof fetch
  baseUrl: string
  budget?: ProcessBudget
}): Promise<Trigger[]> {
  return withSourceRequest(options.budget, [], async () => {
    const response = await options.fetch(
      `${options.baseUrl.replace(/\/$/u, '')}/channels/${encodeURIComponent(options.channel)}/messages`,
      { headers: { authorization: `Bot ${options.token}` } },
    )
    if (!response.ok) return []
    const body: unknown = await response.json()
    if (!Array.isArray(body)) return []
    const out: Trigger[] = []
    for (const item of body) {
      if (item === null || typeof item !== 'object') continue
      const mapped = discordMessageToTrigger(item as DiscordMessage)
      if (mapped !== undefined) out.push(mapped)
    }
    return out
  })
}

/**
 * Reply on the origin Discord channel.
 * @param options - Token, channel, text, fetch.
 */
export async function replyDiscord(options: {
  token: string
  channel: string
  text: string
  fetch: typeof fetch
  baseUrl: string
}): Promise<{ ok: boolean }> {
  const response = await options.fetch(
    `${options.baseUrl.replace(/\/$/u, '')}/channels/${encodeURIComponent(options.channel)}/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bot ${options.token}` },
      body: JSON.stringify({ content: options.text }),
    },
  )
  return { ok: response.ok }
}

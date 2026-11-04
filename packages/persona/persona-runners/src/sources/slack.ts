/**
 * Slack Events API → engine Trigger. Bot token stays in the vault.
 */

import type { Trigger } from '@deepseek-ai/dsh-persona-engine'
import { withSourceRequest, type ProcessBudget } from '../resolve/resource-budget.ts'

export const SLACK_SOURCE = 'slack'

export interface SlackEvent {
  type?: string
  channel?: string
  user?: string
  text?: string
  ts?: string
  thread_ts?: string
  bot_id?: string
}

/**
 * Map one Slack message event onto an immutable Trigger.
 * @param event - Events API payload.
 * @param now - ISO clock fallback.
 */
export function slackEventToTrigger(event: SlackEvent, now: string = new Date().toISOString()): Trigger | undefined {
  const text = event.text?.trim() ?? ''
  const channel = event.channel ?? ''
  if (event.type !== 'message' || text === '' || channel === '') return undefined
  const thread = event.thread_ts ?? event.ts ?? channel
  const actor = event.user ?? 'unknown'
  return {
    id: `slack:${channel}:${event.ts ?? thread}`,
    source: SLACK_SOURCE,
    threads: [{ source: SLACK_SOURCE, id: thread }],
    actor: { source: SLACK_SOURCE, id: actor },
    human: event.bot_id === undefined,
    addressed: 'mention',
    at: now,
    text,
    channel: {
      source: SLACK_SOURCE,
      thread,
      address: { channel, ts: event.ts ?? thread },
    },
    meta: {},
  }
}

/**
 * Poll a fake Slack conversations.history. Token never appears in Triggers.
 * @param options - Token, channel, fetch, base URL.
 */
export async function pollSlack(options: {
  token: string
  channel: string
  fetch: typeof fetch
  baseUrl: string
  budget?: ProcessBudget
}): Promise<Trigger[]> {
  return withSourceRequest(options.budget, [], async () => {
    const response = await options.fetch(
      `${options.baseUrl.replace(/\/$/u, '')}/conversations.history?channel=${encodeURIComponent(options.channel)}`,
      { headers: { authorization: `Bearer ${options.token}` } },
    )
    if (!response.ok) return []
    const body: unknown = await response.json()
    const messages = body !== null && typeof body === 'object' && 'messages' in body
      ? (body as { messages?: unknown }).messages
      : undefined
    if (!Array.isArray(messages)) return []
    const out: Trigger[] = []
    for (const item of messages) {
      if (item === null || typeof item !== 'object') continue
      const mapped = slackEventToTrigger({ type: 'message', channel: options.channel, ...(item as SlackEvent) })
      if (mapped !== undefined) out.push(mapped)
    }
    return out
  })
}

/**
 * Reply on the origin Slack channel.
 * @param options - Token, channel, text, fetch.
 */
export async function replySlack(options: {
  token: string
  channel: string
  text: string
  fetch: typeof fetch
  baseUrl: string
}): Promise<{ ok: boolean }> {
  const response = await options.fetch(`${options.baseUrl.replace(/\/$/u, '')}/chat.postMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token}` },
    body: JSON.stringify({ channel: options.channel, text: options.text }),
  })
  return { ok: response.ok }
}

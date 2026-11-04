/**
 * Telegram bot → engine Trigger. Token stays in the vault; tests use a fake API.
 */

import type { Trigger } from '@deepseek-ai/dsh-persona-engine'
import { withSourceRequest, type ProcessBudget } from '../resolve/resource-budget.ts'

export const TELEGRAM_SOURCE = 'telegram'

export interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    date: number
    text?: string
    chat: { id: number; type: string }
    from?: { id: number; is_bot?: boolean; username?: string }
  }
}

/**
 * Map one Telegram update onto an immutable Trigger.
 * @param update - Bot API update.
 * @param now - ISO clock fallback.
 */
export function telegramUpdateToTrigger(update: TelegramUpdate, now: string = new Date().toISOString()): Trigger | undefined {
  const message = update.message
  const text = message?.text?.trim() ?? ''
  if (message === undefined || text === '') return undefined
  const chat = String(message.chat.id)
  const actor = String(message.from?.id ?? message.chat.id)
  const human = message.from?.is_bot !== true
  return {
    id: `tg:${String(update.update_id)}:${String(message.message_id)}`,
    source: TELEGRAM_SOURCE,
    threads: [{ source: TELEGRAM_SOURCE, id: chat }],
    actor: { source: TELEGRAM_SOURCE, id: actor },
    human,
    addressed: message.chat.type === 'private' ? 'direct' : 'mention',
    at: Number.isFinite(message.date) ? new Date(message.date * 1000).toISOString() : now,
    text,
    channel: {
      source: TELEGRAM_SOURCE,
      thread: chat,
      address: { chat, message: String(message.message_id) },
    },
    meta: { username: message.from?.username ?? '' },
  }
}

/**
 * Poll getUpdates on an injected fetch (fake server in tests). Never logs the token.
 * @param options - Vault token reader + fetch.
 */
export async function pollTelegram(options: {
  token: string
  fetch: typeof fetch
  baseUrl: string
  offset?: number
  budget?: ProcessBudget
}): Promise<Trigger[]> {
  return withSourceRequest(options.budget, [], async () => {
    const url = `${options.baseUrl.replace(/\/$/u, '')}/getUpdates?offset=${String(options.offset ?? 0)}`
    const response = await options.fetch(url, {
      headers: { authorization: `Bearer ${options.token}` },
    })
    if (!response.ok) return []
    const body: unknown = await response.json()
    const result = body !== null && typeof body === 'object' && 'result' in body
      ? (body as { result?: unknown }).result
      : undefined
    if (!Array.isArray(result)) return []
    const triggers: Trigger[] = []
    for (const item of result) {
      if (item === null || typeof item !== 'object') continue
      const mapped = telegramUpdateToTrigger(item as TelegramUpdate)
      if (mapped !== undefined) triggers.push(mapped)
    }
    return triggers
  })
}

/**
 * Reply on the origin Telegram chat. Token never appears in the returned text.
 * @param options - Token, chat, text, fetch.
 */
export async function replyTelegram(options: {
  token: string
  chat: string
  text: string
  fetch: typeof fetch
  baseUrl: string
}): Promise<{ ok: boolean }> {
  const response = await options.fetch(`${options.baseUrl.replace(/\/$/u, '')}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token}` },
    body: JSON.stringify({ chat_id: options.chat, text: options.text }),
  })
  return { ok: response.ok }
}

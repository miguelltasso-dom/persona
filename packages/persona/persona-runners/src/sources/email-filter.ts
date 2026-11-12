/**
 * Origin filter for arriving mail (harvest 19b): only a message that matches the person's rule becomes a Trigger, so
 * an irrelevant inbox never wakes a model. Deterministic, case-insensitive, and empty rule = everything matches.
 */

import type { EmailMessage } from './email.ts'

/** What the person asked to hear about. Empty field = any. */
export interface EmailArrivalFilter {
  /** Recipients (`vendas@loja.com.br`, `@loja.com.br`). */
  readonly to?: readonly string[]
  /** Senders (`fornecedor@x.com`, `@fornecedor.com`). */
  readonly from?: readonly string[]
  /** Words or phrases the subject must contain. */
  readonly subject?: readonly string[]
  /** Skip newsletters and bulk mail (default true). */
  readonly skipBulk?: boolean
}

/**
 * Whether one message matches the rule.
 * @param message - Parsed mail.
 * @param filter - The person's rule.
 * @returns Whether the message may wake the team.
 */
export function matchesEmailFilter(message: EmailMessage, filter: EmailArrivalFilter): boolean {
  if (filter.skipBulk !== false && message.bulk === true) return false
  if (!matchesAddress(message.to, filter.to)) return false
  if (!matchesAddress(message.from, filter.from)) return false
  const subject = message.subject.toLowerCase()
  return (filter.subject ?? []).every(term => subject.includes(term.trim().toLowerCase()))
}

/**
 * Keep only the messages the rule accepts, in arrival order.
 * @param messages - Parsed mail.
 * @param filter - The person's rule.
 * @returns The matching messages, in arrival order.
 */
export function filterEmailMessages(
  messages: readonly EmailMessage[],
  filter: EmailArrivalFilter,
): EmailMessage[] {
  return messages.filter(message => matchesEmailFilter(message, filter))
}

function matchesAddress(value: string, patterns: readonly string[] | undefined): boolean {
  if (patterns === undefined || patterns.length === 0) return true
  const address = value.toLowerCase()
  return patterns.some((pattern) => {
    const needle = pattern.trim().toLowerCase()
    return needle !== '' && address.includes(needle)
  })
}

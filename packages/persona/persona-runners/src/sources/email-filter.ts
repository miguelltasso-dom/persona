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

/** The items of an address list: split on commas that are not inside a quoted display name (`"Beltrano, B." <b@c.com>` is ONE item). */
function listItems(value: string): string[] {
  const items: string[] = []
  let current = ''
  let quoted = false
  for (const char of value) {
    if (char === '"') quoted = !quoted
    if (char === ',' && !quoted) {
      items.push(current)
      current = ''
    } else {
      current += char
    }
  }
  items.push(current)
  return items
}

/**
 * The real addresses of a header (`From:`, `To:`): per item of the list, what sits between `<...>` when there is one, else the bare address. A display
 * name is NEVER an address (P0-11: `"cliente@parceiro.com.br" <atacante@externo.com>` is sent by atacante@externo.com).
 * @param value - The raw header value.
 * @returns The addresses, lower case.
 */
function addressesOf(value: string): string[] {
  const found: string[] = []
  for (const item of listItems(value)) {
    const angled = /<([^<>\s]+)>/u.exec(item)?.[1]
    const bare = angled === undefined ? /[^\s<>"',;()]+@[^\s<>"',;()]+/u.exec(item)?.[0] : undefined
    const address = angled ?? bare
    if (address !== undefined) found.push(address.toLowerCase())
  }
  return found
}

/**
 * Whether ONE real address matches a pattern: `@domain` is exactly that domain, `name@` is a local-part prefix, a full address is exactly that
 * address and a bare domain is that domain or one of its subdomains. Never a piece of another domain.
 * @param address - A real address, lower case.
 * @param needle - The pattern, trimmed and lower case.
 */
function addressMatches(address: string, needle: string): boolean {
  const at = needle.indexOf('@')
  if (at < 0) {
    const domain = address.slice(address.lastIndexOf('@') + 1)
    return domain === needle || domain.endsWith(`.${needle}`)
  }
  if (at === 0) return address.endsWith(needle) && address.lastIndexOf('@') === address.length - needle.length
  if (at === needle.length - 1) return address.startsWith(needle)
  return address === needle
}

function matchesAddress(value: string, patterns: readonly string[] | undefined): boolean {
  if (patterns === undefined || patterns.length === 0) return true
  const addresses = addressesOf(value)
  return patterns.some((pattern) => {
    const needle = pattern.trim().toLowerCase()
    return needle !== '' && addresses.some(address => addressMatches(address, needle))
  })
}

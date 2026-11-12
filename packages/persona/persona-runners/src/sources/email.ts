/**
 * IMAP inbox → engine Trigger. SMTP reply. Credentials stay in the vault.
 */

import type { Trigger } from '@deepseek-ai/dsh-persona-engine'
import { withSourceRequest, type ProcessBudget } from '../resolve/resource-budget.ts'
import { filterEmailMessages, type EmailArrivalFilter } from './email-filter.ts'

export const EMAIL_SOURCE = 'email'

export interface EmailMessage {
  id: string
  from: string
  to: string
  subject: string
  text: string
  at?: string
  /** Newsletter / bulk mail (List-Unsubscribe, Precedence: bulk, Auto-Submitted). The origin filter skips it by default. */
  bulk?: boolean
}

/**
 * Map one inbox message onto an immutable Trigger. Subject is the thread.
 * @param message - Parsed mail.
 */
export function emailMessageToTrigger(message: EmailMessage): Trigger {
  const at = message.at ?? new Date().toISOString()
  return {
    id: `mail:${message.id}`,
    source: EMAIL_SOURCE,
    threads: [{ source: EMAIL_SOURCE, id: message.subject }],
    actor: { source: EMAIL_SOURCE, id: message.from },
    human: true,
    addressed: 'direct',
    at,
    text: message.text,
    viaEmail: true,
    channel: {
      source: EMAIL_SOURCE,
      thread: message.subject,
      address: { from: message.from, to: message.to, message: message.id },
    },
    meta: { subject: message.subject },
  }
}

/**
 * Pull messages from an injected IMAP-like list (fake server in tests). The origin filter runs HERE, before any
 * Trigger exists, so a message the person did not ask about never wakes a model.
 * @param options - Fetcher returns parsed messages; never a live mailbox. `filter` keeps only matching mail;
 * `onFiltered` sees each message the filter dropped.
 */
export async function pollEmail(options: {
  list: () => Promise<readonly EmailMessage[]>
  budget?: ProcessBudget
  filter?: EmailArrivalFilter
  onFiltered?: (message: EmailMessage) => void
}): Promise<Trigger[]> {
  return withSourceRequest(options.budget, [], async () => {
    const rows = await options.list()
    if (options.filter === undefined) return rows.map(emailMessageToTrigger)
    const kept = filterEmailMessages(rows, options.filter)
    if (options.onFiltered !== undefined) {
      const keptIds = new Set(kept.map(message => message.id))
      for (const message of rows) if (!keptIds.has(message.id)) options.onFiltered(message)
    }
    return kept.map(emailMessageToTrigger)
  })
}

/**
 * Send a reply through an injected SMTP port. Credentials never logged.
 * @param options - To, subject, body, send hook.
 */
export async function replyEmail(options: {
  to: string
  subject: string
  text: string
  send: (input: { to: string; subject: string; text: string }) => Promise<boolean>
}): Promise<{ ok: boolean }> {
  return { ok: await options.send({ to: options.to, subject: options.subject, text: options.text }) }
}

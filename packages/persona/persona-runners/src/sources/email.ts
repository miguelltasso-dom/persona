/**
 * IMAP inbox → engine Trigger. SMTP reply. Credentials stay in the vault.
 */

import type { Trigger } from '@deepseek-ai/dsh-persona-engine'
import { withSourceRequest, type ProcessBudget } from '../resolve/resource-budget.ts'

export const EMAIL_SOURCE = 'email'

export interface EmailMessage {
  id: string
  from: string
  to: string
  subject: string
  text: string
  at?: string
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
    channel: {
      source: EMAIL_SOURCE,
      thread: message.subject,
      address: { from: message.from, to: message.to, message: message.id },
    },
    meta: { subject: message.subject },
  }
}

/**
 * Pull messages from an injected IMAP-like list (fake server in tests).
 * @param options - Fetcher returns parsed messages; never a live mailbox.
 */
export async function pollEmail(options: {
  list: () => Promise<readonly EmailMessage[]>
  budget?: ProcessBudget
}): Promise<Trigger[]> {
  return withSourceRequest(options.budget, [], async () => {
    const rows = await options.list()
    return rows.map(emailMessageToTrigger)
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

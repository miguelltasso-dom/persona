/**
 * Brazilian mailbox presets (harvest 19b). The person picks the provider once; the host fills host/port/TLS.
 * Every preset is read-only in this product: the reader opens the folder with EXAMINE and fetches with BODY.PEEK[],
 * so a bug can never mark a message as read or delete it.
 */

/** A mailbox provider the person can pick by name. */
export interface EmailPreset {
  readonly id: 'locaweb' | 'hostinger' | 'godaddy' | 'titan' | 'zoho' | 'icloud'
  readonly label: string
  readonly host: string
  readonly port: number
  readonly secure: boolean
}

/** The presets offered in the connection screen. */
export const EMAIL_PRESETS: readonly EmailPreset[] = [
  { id: 'locaweb', label: 'Locaweb', host: 'email-ssl.com.br', port: 993, secure: true },
  { id: 'hostinger', label: 'Hostinger', host: 'imap.hostinger.com', port: 993, secure: true },
  { id: 'godaddy', label: 'GoDaddy', host: 'imap.secureserver.net', port: 993, secure: true },
  { id: 'titan', label: 'Titan', host: 'imap.titan.email', port: 993, secure: true },
  { id: 'zoho', label: 'Zoho', host: 'imap.zoho.com', port: 993, secure: true },
  { id: 'icloud', label: 'iCloud', host: 'imap.mail.me.com', port: 993, secure: true },
]

/**
 * The only IMAP commands the reader may send. No STORE, EXPUNGE, COPY, MOVE, APPEND or DELETE: reading a mailbox
 * never changes it. A future transport that needs another command changes this list on purpose, with a test.
 */
export const READ_ONLY_IMAP_COMMANDS: readonly string[] = [
  'CAPABILITY',
  'LOGIN',
  'EXAMINE',
  'UID SEARCH',
  'UID FETCH (BODY.PEEK[])',
  'LOGOUT',
]

const PROVIDER_DOMAINS: Readonly<Record<string, EmailPreset['id']>> = {
  'hostinger.com': 'hostinger',
  'godaddy.com': 'godaddy',
  'secureserver.net': 'godaddy',
  'titan.email': 'titan',
  'zoho.com': 'zoho',
  'zohomail.com': 'zoho',
  'icloud.com': 'icloud',
  'me.com': 'icloud',
}

/**
 * Preset a known provider domain implies. A custom domain hosted at Locaweb has no hint: the person picks the preset.
 * @param address - The mailbox address (`vendas@loja.com.br`).
 * @returns The preset, or `undefined` for a custom domain.
 */
export function emailPresetFor(address: string): EmailPreset | undefined {
  const domain = address.slice(address.lastIndexOf('@') + 1).trim().toLowerCase()
  if (domain === '') return undefined
  const id = PROVIDER_DOMAINS[domain]
  return id === undefined ? undefined : EMAIL_PRESETS.find(preset => preset.id === id)
}

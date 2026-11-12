/**
 * Item 26, slice 26.8 (host): one health line per connector, in plain Portuguese, with the action that fixes it.
 *
 * The state is DERIVED from what the host already knows — the grants of the team, the connectors the person's CLI actually has, the
 * connection state of each CLI, and whether a token provider has its sealed slot. The provider's own error text never becomes the
 * sentence: it is untrusted and would read as jargon; when there is one it travels separately, under our sentence.
 */

import { VAULT_CALDAV, VAULT_DISCORD, VAULT_IMAP, VAULT_SLACK, VAULT_SMTP, VAULT_TELEGRAM } from '@deepseek-ai/dsh-persona-vault'

/** Where a connector stands. */
export type ConnectorHealthState = 'ok' | 'reconnect' | 'offline' | 'permission' | 'missing'

/** What the person can do about it. */
export type ConnectorHealthAction = 'none' | 'reconnect' | 'retry' | 'remove'

/** One line on the wire. */
export interface ConnectorHealthView {
  readonly id: string
  readonly name: string
  readonly personaId?: string
  readonly state: ConnectorHealthState
  readonly action: ConnectorHealthAction
  /** The sentence the screen shows (plain Portuguese). */
  readonly sentence: string
}

/** A connector the team granted to a persona. */
export interface GrantedConnector {
  readonly personaId: string
  readonly cli: string
  readonly name: string
}

/** A connector the person's CLI lists right now. */
export interface AvailableConnector {
  readonly cli: string
  readonly name: string
}

/** The connection state of one CLI (as `listConnections` shows it). */
export interface CliConnection {
  readonly id: string
  readonly available: boolean
  readonly loggedIn: boolean
  readonly phase: 'checking' | 'ready'
}

/** A provider whose access is a token in the Cofre. */
export interface TokenProvider {
  readonly provider: string
  readonly name: string
  readonly hasSecret: boolean
}

/** What the health lines are built from. */
export interface ConnectorHealthInput {
  readonly grants: readonly GrantedConnector[]
  readonly available: readonly AvailableConnector[]
  readonly connections: readonly CliConnection[]
  readonly tokens: readonly TokenProvider[]
  readonly personaNameOf: (personaId: string) => string | undefined
}

/** The CLI names the screen shows, in plain Portuguese. */
const CLI_NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  dsh: 'Persona',
}

/** The providers whose access is a token in the Cofre, with the name the screen shows. */
export const TOKEN_PROVIDERS: readonly { readonly provider: string; readonly name: string }[] = [
  { provider: VAULT_IMAP, name: 'E-mail da empresa' },
  { provider: VAULT_SMTP, name: 'Envio de e-mail' },
  { provider: VAULT_TELEGRAM, name: 'Telegram' },
  { provider: VAULT_SLACK, name: 'Slack' },
  { provider: VAULT_DISCORD, name: 'Discord' },
  { provider: VAULT_CALDAV, name: 'Agenda (CalDAV)' },
]

/**
 * @param input - Grants, live connectors, CLI connections and token slots.
 * @returns One line per connector that needs attention or is in use; a CLI still being probed says nothing yet.
 */
export function connectorHealth(input: ConnectorHealthInput): ConnectorHealthView[] {
  const lines: ConnectorHealthView[] = []
  for (const grant of input.grants) {
    const connection = input.connections.find(item => item.id === grant.cli)
    // A probe still running must not read as "sem login": the screen would lie.
    if (connection !== undefined && connection.phase === 'checking') continue
    const cli = CLI_NAMES[grant.cli] ?? grant.cli
    const persona = input.personaNameOf(grant.personaId) ?? 'A persona'
    const listed = input.available.some(item => item.cli === grant.cli && sameName(item.name, grant.name))
    const line = (state: ConnectorHealthState, action: ConnectorHealthAction, sentence: string): ConnectorHealthView => ({
      id: `${grant.cli}:${grant.name}:${grant.personaId}`,
      name: grant.name,
      personaId: grant.personaId,
      state,
      action,
      sentence,
    })
    if (connection !== undefined && !connection.available) {
      lines.push(line('offline', 'retry', `${persona} não conseguiu usar ${grant.name}: o ${cli} não está instalado neste computador.`))
      continue
    }
    if (connection !== undefined && !connection.loggedIn) {
      lines.push(line('reconnect', 'reconnect', `${persona} não conseguiu usar ${grant.name}: entre de novo no ${cli}.`))
      continue
    }
    if (!listed) {
      lines.push(line('missing', 'remove', `${persona} não conseguiu usar ${grant.name}: ele não está mais no ${cli}.`))
      continue
    }
    lines.push(line('ok', 'none', `${persona} pode usar ${grant.name}.`))
  }
  for (const token of input.tokens) {
    lines.push({
      id: `token:${token.provider}`,
      name: token.name,
      state: token.hasSecret ? 'ok' : 'reconnect',
      action: token.hasSecret ? 'none' : 'reconnect',
      sentence: token.hasSecret ? `${token.name} está ligado.` : `${token.name} ainda não está ligado: entre com o acesso da empresa.`,
    })
  }
  return lines
}

function sameName(left: string, right: string): boolean {
  const normalize = (value: string): string => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
  const a = normalize(left)
  const b = normalize(right)
  return a === b || a.includes(b) || b.includes(a)
}

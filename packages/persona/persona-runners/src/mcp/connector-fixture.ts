/**
 * A TEST connector for measuring the `needed` mode without touching anyone's account (CTO order, 05/11: "use a local test MCP, a fixture with a tool count like a
 * real connector's; no personal data, not even labels"). It looks like a mail connector: 30 tools with names, descriptions and JSON schemas of the size real
 * ones have (a real mail connector exposes about 30), `readOnly` / `destructive` annotations the way a server declares them, and answers that are 100%
 * SYNTHETIC. It is served to the CLI exactly like the product's own tools (a `TurnToolSet`, OAR `serveMcpTools`), under a server name of its own.
 */

import type { TurnToolSet } from '../contract.ts'

/** The server name the CLI shows: `mcp__fixture_mail__<tool>`. */
export const FIXTURE_SERVER = 'fixture_mail'

/** The labels the fixture "has". Made up. */
export const FIXTURE_LABELS: readonly string[] = ['INBOX', 'SENT', 'DRAFT', 'Contas-teste', 'Clientes-teste', 'Fornecedores-teste']

export interface FixtureDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly annotations: { readonly readOnlyHint?: boolean; readonly destructiveHint?: boolean }
}

/** The head of the list: the names a mail connector really has, so the model finds `list_labels` where it would look for it. */
const HEAD: readonly (readonly [string, string, boolean])[] = [
  ['list_labels', 'labels', true], ['get_message', 'message', true], ['search_threads', 'threads', true], ['get_thread', 'thread', true], ['list_drafts', 'drafts', true], ['get_draft', 'draft', true],
  ['create_label', 'label', false], ['update_label', 'label', false], ['delete_label', 'label', false], ['create_draft', 'draft', false], ['update_draft', 'draft', false], ['delete_draft', 'draft', false],
  ['send_message', 'message', false], ['reply', 'message', false], ['forward', 'message', false], ['label_message', 'message', false], ['unlabel_message', 'message', false],
  ['label_thread', 'thread', false], ['unlabel_thread', 'thread', false], ['trash_message', 'message', false], ['untrash_message', 'message', false], ['trash_thread', 'thread', false],
  ['untrash_thread', 'thread', false], ['mark_message_spam', 'message', false], ['unmark_message_spam', 'message', false], ['mark_thread_spam', 'thread', false], ['unmark_thread_spam', 'thread', false],
  ['update_message_labels', 'message', false], ['apply_sensitive_message_label', 'message', false], ['apply_sensitive_thread_label', 'thread', false],
]

function definitionOf(name: string, noun: string, readOnly: boolean): FixtureDefinition {
  const verb = name.split('_')[0] ?? 'get'
  return {
    name,
    description: `${verb[0]?.toUpperCase() ?? ''}${verb.slice(1)} ${noun} in the connected mailbox. Returns the fields requested, paginated; use the page token from a previous call to continue. Fails with an error object when the item does not exist or the account has no access to it.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Identifier of the item, as returned by a previous list or search call.' },
        query: { type: 'string', description: 'Search expression in the mailbox query language, for example from:ana@example.com is:unread.' },
        pageToken: { type: 'string', description: 'Opaque token of the next page of results.' },
        maxResults: { type: 'integer', minimum: 1, maximum: 100, description: 'How many items to return at most.' },
      },
      required: [],
      additionalProperties: false,
    },
    annotations: readOnly ? { readOnlyHint: true } : { destructiveHint: /^(delete|trash)/u.test(name) },
  }
}

/**
 * The definitions of the fixture connector.
 * @param count - How many tools (default 30, the size of a real mail connector). Beyond the named ones, generated read tools pad the list.
 */
export function connectorFixtureDefinitions(count: number = 30): FixtureDefinition[] {
  const out: FixtureDefinition[] = HEAD.slice(0, Math.max(0, count)).map(([name, noun, readOnly]) => definitionOf(name, noun, readOnly))
  for (let i = out.length; i < count; i += 1) out.push(definitionOf(`get_extra_${String(i)}`, 'item', true))
  return out
}

/** The annotation table of the fixture in the shape of `mcp_status.mcpServers`, for `annotationTable`: the pre-flight reading a real connector would give. */
export function connectorFixtureStatus(count: number = 30): readonly unknown[] {
  return [{
    name: FIXTURE_SERVER, scope: 'user', status: 'connected',
    tools: connectorFixtureDefinitions(count).map(item => ({ name: item.name, annotations: { readOnly: item.annotations.readOnlyHint === true, destructive: item.annotations.destructiveHint === true } })),
  }]
}

export interface FixtureCall {
  readonly tool: string
  /** The fixture ran it (the gate let it through). */
  readonly ran: boolean
}

/**
 * The fixture as the tools a turn is served. Every handler answers with made-up data; `calls` records which tools the model reached (only names).
 * @param options - `count` of tools and the list that records the calls.
 */
export function connectorFixtureToolSet(options: { readonly count?: number; readonly calls?: FixtureCall[] } = {}): TurnToolSet {
  return {
    server: FIXTURE_SERVER,
    tools: connectorFixtureDefinitions(options.count ?? 30).map(item => ({
      name: item.name,
      description: item.description,
      inputSchema: item.inputSchema,
      handler: async (): Promise<{ content: string }> => {
        await Promise.resolve()
        options.calls?.push({ tool: item.name, ran: true })
        return { content: item.name === 'list_labels' ? JSON.stringify({ labels: FIXTURE_LABELS.map(name => ({ name })), total: FIXTURE_LABELS.length }) : JSON.stringify({ ok: true, note: 'fixture' }) }
      },
    })),
  }
}

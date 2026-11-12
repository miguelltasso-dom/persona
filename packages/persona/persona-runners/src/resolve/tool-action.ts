/**
 * HT-8/HT-9 (D-084): what KIND of action an MCP tool is, so the host knows which actions a persona may run on an explicit request,
 * which need a preview, and which are never pre-allowed. Pure and deterministic: no model, no I/O.
 *
 * Classes, strictest last: `read` < `change` < `send` < `pay` < `delete`. `pay` and `delete` are NEVER pre-allowed (the host asks every
 * time unless the person gave an explicit permanent permission for that class).
 *
 * Rule of safety: the strictest of what the ANNOTATION says and what the NAME says wins. A server that claims `readOnlyHint` on a tool
 * called `delete_message` is still a delete. A tool with no annotation and no recognised verb is `send` (fail closed: unknown means
 * "an action that leaves", never "harmless").
 */

export type ActionClass = 'read' | 'change' | 'send' | 'pay' | 'delete'

/** MCP tool annotations as a server reports them (`tools/list`). All optional and untrusted. */
export interface ToolAnnotations {
  readonly readOnlyHint?: boolean
  readonly destructiveHint?: boolean
  readonly idempotentHint?: boolean
  readonly openWorldHint?: boolean
}

export interface ToolAction {
  readonly actionClass: ActionClass
  /** The word that decided the class, for the preview label ("Vai publicar" vs "Vai enviar"). `read` for a read-only annotation. */
  readonly verb: string
}

const RANK: Record<ActionClass, number> = { read: 0, change: 1, send: 2, pay: 3, delete: 4 }

const VERBS: Record<Exclude<ActionClass, 'read'>, readonly string[]> = {
  delete: ['delete', 'remove', 'trash', 'destroy', 'purge', 'erase', 'drop', 'wipe'],
  pay: ['pay', 'payment', 'charge', 'transfer', 'refund', 'purchase', 'buy', 'checkout', 'withdraw', 'payout'],
  send: ['send', 'post', 'publish', 'reply', 'forward', 'share', 'broadcast', 'notify', 'invite', 'dispatch', 'submit', 'tweet'],
  change: [
    'create', 'update', 'edit', 'write', 'add', 'set', 'modify', 'patch', 'rename', 'move', 'copy', 'insert', 'append', 'save', 'put',
    'upsert', 'archive', 'label', 'mark', 'star', 'unstar', 'schedule', 'draft', 'upload', 'import', 'enable', 'disable', 'assign', 'merge',
  ],
}

const READ_VERBS: readonly string[] = [
  'get', 'list', 'read', 'search', 'find', 'fetch', 'query', 'view', 'show', 'describe', 'lookup', 'count', 'check', 'status', 'whoami',
  'download', 'retrieve', 'browse', 'summarize', 'inspect', 'preview', 'export',
]

/** The tool part of `mcp__server__tool`; the whole string when it has no server prefix. */
function toolPart(name: string): string {
  if (!name.startsWith('mcp__')) return name
  const at = name.indexOf('__', 5)
  return at < 0 ? name.slice(5) : name.slice(at + 2)
}

/**
 * The whole words of a tool name, lowercase (`mcp__social__send_tweet` → `send`, `tweet`). A word that is only PART of another (`postgres`, `republish`) is not
 * a match for `post` / `publish`. Used by the host's house rules (HONEST-1) to hold one verb of a class.
 * @param name - `mcp__server__tool` or a bare tool name. Only the tool part is read, never the server part.
 */
export function toolWords(name: string): string[] {
  return tokensOf(name)
}

/** Lowercase words of a tool name: splits on `_ - . : /` and spaces, and between camelCase words. */
function tokensOf(name: string): string[] {
  return toolPart(name)
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .split(/[\s_\-.:/]+/u)
    .map(word => word.toLowerCase())
    .filter(word => word !== '')
}

/**
 * Classify one MCP tool.
 * @param toolName - `mcp__server__tool` or a bare tool name. Only the tool part is read, never the server part.
 * @param annotations - What the server reported (untrusted), when anything.
 * @returns The class and the verb that decided it.
 */
export function classifyTool(toolName: string, annotations?: ToolAnnotations): ToolAction {
  const tokens = tokensOf(toolName)
  const found: ToolAction[] = []
  for (const actionClass of ['delete', 'pay', 'send', 'change'] as const) {
    const verb = tokens.find(token => VERBS[actionClass].includes(token))
    if (verb !== undefined) found.push({ actionClass, verb })
  }
  if (annotations?.destructiveHint === true) found.push({ actionClass: 'delete', verb: 'delete' })
  const strictest = found.reduce<ToolAction | undefined>((top, candidate) => (top === undefined || RANK[candidate.actionClass] > RANK[top.actionClass] ? candidate : top), undefined)
  if (strictest !== undefined) return strictest
  // Nothing in the name asks for more than a read. Only the server's own read-only annotation PROVES a read; a harmless-looking
  // name without it is not trusted (it could do anything), so it is an action that leaves.
  if (annotations?.readOnlyHint === true) return { actionClass: 'read', verb: tokens.find(token => READ_VERBS.includes(token)) ?? 'read' }
  return { actionClass: 'send', verb: 'send' }
}

/**
 * D-103a: true when the NAME alone proves a read: a read verb is there and no write verb (`change`, `send`, `pay`, `delete`) is. Used on the engines whose permission gate is not proven,
 * where nothing else (no annotation, no hook) can vouch for a call: a harmless-looking name with no verb at all is NOT a read (same fail-closed rule as {@link classifyTool}).
 * @param toolName - `mcp__server__tool` or a bare tool name. Only the tool part of a prefixed name is read, never the server part.
 */
export function isReadByName(toolName: string): boolean {
  const tokens = tokensOf(toolName)
  const writes = (['delete', 'pay', 'send', 'change'] as const).some(actionClass => tokens.some(token => VERBS[actionClass].includes(token)))
  return !writes && tokens.some(token => READ_VERBS.includes(token))
}

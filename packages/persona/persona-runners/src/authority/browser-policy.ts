/**
 * COLHEITA item 8 + 17: the authority row of the browser tools. The browser a persona drives is an MCP server of its own (`mcp__browser__*`, the Chrome DevTools MCP attached to the
 * Chrome of a profile the person lent her, only while she holds its turn). Its tools are not connectors of the person: they are judged here, with the verdicts of the one authority
 * table (`authority-table.ts`), never by the class of their names.
 *
 *  - navigate, read, capture = `read`: allowed for everybody. The persona looks, it does not act in the page.
 *  - click, hover, drag, press a key, type, fill a form = `interact`: allowed with a person behind the run, refused for a routine or an unattended run.
 *  - `evaluate_script` and `upload_file` = `never`: refused for everybody by default. The server is also started without script evaluation (`--no-javascriptEvaluation`), so this is
 *    the second, independent layer; a file leaving the machine through a page is not something a page may ask a model for.
 *  - a value that has the shape of a credential in a typing tool = `secret`: refused. The persona does not hold passwords (the vault types them blind, item 15); this catches the
 *    one that reached her anyway.
 *  - a tool this table does not list = `never`: a new version of the server adds tools; none runs until someone classifies it.
 * Pure: no I/O, no model.
 */

import type { ActionKind } from './authority-table.ts'

/** The name the browser server is attached under; the tools appear as `mcp__browser__<tool>`. Must equal `BROWSER_SERVER_NAME` of the host (`persona-host/src/browser/server.ts`). */
export const BROWSER_SERVER = 'browser'

const READ_TOOLS: ReadonlySet<string> = new Set([
  'list_pages', 'select_page', 'new_page', 'close_page', 'navigate_page', 'navigate_page_history', 'wait_for', 'resize_page', 'emulate',
  'take_snapshot', 'take_screenshot', 'take_memory_snapshot', 'list_console_messages', 'get_console_message', 'list_network_requests', 'get_network_request',
  'performance_start_trace', 'performance_stop_trace', 'performance_analyze_insight', 'lighthouse_audit',
])

const INTERACT_TOOLS: ReadonlySet<string> = new Set(['click', 'hover', 'drag', 'press_key', 'handle_dialog'])
const TYPING_TOOLS: ReadonlySet<string> = new Set(['fill', 'fill_form', 'type_text'])
const NEVER_TOOLS: ReadonlySet<string> = new Set(['evaluate_script', 'upload_file'])

/** Shapes of values that are credentials whatever the field they are typed into (API keys, tokens, private keys). */
const CREDENTIAL_SHAPES: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}/u,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u,
]

/** What one browser tool call is. */
export interface BrowserJudgment {
  readonly kind: ActionKind
  /** The tool name, for the refusal book. */
  readonly verb: string
}

function stringsIn(value: unknown, depth = 0): string[] {
  if (typeof value === 'string') return [value]
  if (depth > 4 || value === null || typeof value !== 'object') return []
  return Object.values(value as Record<string, unknown>).flatMap(item => stringsIn(item, depth + 1))
}

/**
 * The tool name without the server prefix, or `undefined` when the name is not a tool of the browser server.
 * @param tool - The name as the CLI posts it (`mcp__browser__click`).
 */
export function browserToolOf(tool: string): string | undefined {
  const prefix = `mcp__${BROWSER_SERVER}__`
  return tool.startsWith(prefix) ? tool.slice(prefix.length) : undefined
}

/**
 * What one call of a browser tool is.
 * @param name - The tool without the server prefix (`click`, `fill`, `upload_file`...).
 * @param input - The call's arguments (read only to look for a credential in what is typed).
 */
export function judgeBrowserTool(name: string, input?: unknown): BrowserJudgment {
  const tool = name.trim().toLowerCase()
  if (NEVER_TOOLS.has(tool)) return { kind: 'never', verb: tool }
  if (READ_TOOLS.has(tool)) return { kind: 'read', verb: tool }
  if (INTERACT_TOOLS.has(tool)) return { kind: 'interact', verb: tool }
  if (TYPING_TOOLS.has(tool)) {
    const typed = stringsIn(input)
    return typed.some(text => CREDENTIAL_SHAPES.some(shape => shape.test(text))) ? { kind: 'secret', verb: tool } : { kind: 'interact', verb: tool }
  }
  return { kind: 'never', verb: tool === '' ? 'unnamed' : tool }
}

/** Enforce persona tool levels (`none` | `read` | `write`) on a live runner. */

import { eventTime, type RunEvent, type RunHandle, type Runner, type StartTurnInput } from '../contract.ts'
import { PRECISA_DE_VOCE } from './cli-policy.ts'
import { serverNameOf } from '../oar/tool-binding.ts'

export type ToolLevel = 'none' | 'read' | 'write'

const RANK: Record<ToolLevel, number> = { none: 0, read: 1, write: 2 }

const WRITE = /^(?:bash|powershell|shell|write|edit|str_replace|apply_patch|rm|delete|notebook_edit|persona_report|persona_browser_act|persona_computer_click|persona_computer_type|persona_telegram_send|persona_email_send|brain_propose|gestor_hire|gestor_allocate|gestor_reorganize|gestor_assemble)$/iu
const READ = /^(?:read|glob|grep|list|ls|search|web_fetch|persona_recall|persona_ask|persona_browser_open|persona_browser_read|persona_computer_screenshot|brain_search|brain_read|board_list|sprint_list|routine_list|review_verdict|ask_colleague|pass_forward|ask_team_opinion|ask_vault_code|browser_login|toolsearch)$/iu
// D-097: asking a colleague, passing work on and asking the team's opinion are COORDINATION, not acts on the person's files or the world: they work for a persona with
// no file/shell grant too (the host holds their ACL: the persona's own switch, the caps, the circle, and the colleague's Task runs with the COLLEAGUE's grant).
// `ToolSearch` is the CLI's own lookup of a tool's schema (it only loads a definition into the context; no side effect). The CLI defers the schemas of an MCP
// server with many tools, so a persona that is to use such a connector MUST be able to call it first: left unclassified it counted as a write and a `read`
// persona was stopped ("Ferramenta ToolSearch recusada no nível read") before the connector was ever reached (OPT-10b, found at zero cost).

/**
 * Classify a vendor or Persona tool name.
 * @param name - Tool id from a run event.
 */
export function classifyToolAccess(name: string): ToolLevel {
  const id = name.trim()
  if (id === '') return 'none'
  if (WRITE.test(id)) return 'write'
  if (READ.test(id)) return 'read'
  return 'write'
}

/**
 * True when `level` may run `name`.
 * @param level - Persona grant.
 * @param name - Tool id.
 */
export function allowsTool(level: ToolLevel, name: string): boolean {
  return RANK[level] >= RANK[classifyToolAccess(name)]
}

/** The CLIs' own tool names the two classifiers above do not spell out (other vendors, other casing), normalized without `_`, `-` and spaces. */
const NATIVE_ALIASES: ReadonlySet<string> = new Set(['multiedit', 'applypatch', 'strreplace', 'strreplaceeditor', 'webfetch', 'websearch', 'notebookedit', 'todowrite', 'todoread', 'task', 'shell', 'terminal'])

/**
 * D-103a: true for a tool the CLI itself ships (Bash, Edit, Read, ApplyPatch...): the persona's own tool level governs it. A server-qualified name (`mcp__server__tool`, `server.tool`,
 * `server__tool`, `server/tool`) never is: that is a connector of the person's, and an unknown bare name is not trusted as native either.
 * @param name - Tool id from a run event.
 */
export function isNativeToolName(name: string): boolean {
  const id = name.trim()
  if (id === '' || /^mcp[_.:/-]/iu.test(id) || /[./:]|__/u.test(id)) return false
  if (WRITE.test(id) || READ.test(id)) return true
  return NATIVE_ALIASES.has(id.toLowerCase().replace(/[_\-\s]/gu, ''))
}

/** The persona `tools` keys that mean NATIVE file writing (`grantsOf` aliases): they steer the CLI's own Edit/Write, never the Persona's harness tools. */
const NATIVE_FILE_KEYS: ReadonlySet<string> = new Set(['files', 'write', 'edit'])

/**
 * The level of the Persona's OWN tools (the harness gateway: board, routines, e-mail, browser, computer…) for a persona `tools` map: the highest grant EXCEPT the native-file keys.
 * P0-1: saving files in the draft (`files: write`) must not raise this level, or a persona that only got to save a poster would also be offered the WRITE-class harness tools
 * (send e-mail, drive the browser or the computer, post to Telegram…): more access than the person granted (D-081/D-083). `effectiveToolLevel` stays the level of the NATIVE tools.
 * @param tools - Per-tool grants from the persona spec.
 */
export function gatewayToolLevel(tools: Readonly<Record<string, ToolLevel>>): ToolLevel {
  return effectiveToolLevel(Object.fromEntries(Object.entries(tools).filter(([key]) => !NATIVE_FILE_KEYS.has(key))))
}

/**
 * Highest grant in a persona `tools` map. Empty map is `none`.
 * @param tools - Per-tool grants from the persona spec.
 */
export function effectiveToolLevel(tools: Readonly<Record<string, ToolLevel>>): ToolLevel {
  let max: ToolLevel = 'none'
  for (const level of Object.values(tools)) {
    if (RANK[level] > RANK[max]) max = level
  }
  return max
}

/**
 * Pull a tool name out of a run event (`tool:name` or DSH background summary).
 * @param event - Streamed event.
 */
export function toolNameFromEvent(event: RunEvent): string | undefined {
  if (event.type !== 'report') return undefined
  const summary = event.report.summary
  if (summary.startsWith('tool:')) return summary.slice(5).trim()
  const background = /background job after \d+ms \(([^)]+)\)/u.exec(summary)
  return background?.[1]
}

/**
 * Every spelling a CLI event may use for a served product tool (Claude `mcp__server__tool`, others `server.tool` / `server__tool`).
 * @param set - Tools the turn was offered.
 */
export function offeredNames(set: NonNullable<StartTurnInput['mcpTools']>): ReadonlySet<string> {
  const server = serverNameOf(set)
  const names = new Set<string>()
  for (const tool of set.tools) {
    for (const name of [`mcp__${server}__${tool.name}`, `${server}__${tool.name}`, `${server}.${tool.name}`, `${server}/${tool.name}`]) names.add(name)
  }
  return names
}

/**
 * Cancel a turn that calls a tool above the persona grant.
 * @param inner - Resolved runner.
 * @param level - Grant for this run.
 */
export function withToolLevel(inner: Runner, level: ToolLevel): Runner {
  if (level === 'write') return inner
  // HT-0: the product tools THIS turn was offered answer to the gateway lease (grant + ACL + approval), not to the native grant
  // above: they are exempt here, by exact name, and only for the run that was offered them.
  const offered = new Map<string, ReadonlySet<string>>()
  const track = async (opened: Promise<RunHandle>, input: StartTurnInput): Promise<RunHandle> => {
    const handle = await opened
    if (input.mcpTools !== undefined && input.mcpTools.tools.length > 0) offered.set(handle.runId, offeredNames(input.mcpTools))
    return handle
  }
  const play = async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    for await (const event of inner.stream(handle)) {
      const name = toolNameFromEvent(event)
      if (name !== undefined && !offered.get(handle.runId)?.has(name) && !allowsTool(level, name)) {
        try {
          await inner.cancel(handle)
        } catch (error) {
          void error
        }
        yield {
          type: 'ended',
          at: eventTime(),
          report: {
            state: 'blocked',
            summary: `Ferramenta ${name} recusada no nível ${level}.`,
            question: `${PRECISA_DE_VOCE} Ferramenta: ${name}.`,
          },
        }
        return
      }
      yield event
    }
  }
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: input => track(inner.start(input), input),
    startTurn: input => track(inner.startTurn(input), input),
    stream: play,
    events: play,
    cancel: handle => inner.cancel(handle),
    resume: input => track(inner.resume(input), input),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

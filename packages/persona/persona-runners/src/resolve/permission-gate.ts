/**
 * HT-8/HT-9 (D-084): the permission gate for MCP tools. The CLI's `PreToolUse` HTTP hook calls it BEFORE every MCP tool call with the
 * tool and its COMPLETE arguments; it answers allow or deny. Proven dry on the real CLI (reports/ht89-permission-dry.md): the CLI never
 * asks the host on its own, and the OAR has no way to answer, so this is the one place where a tool + its arguments can be judged.
 *
 *  - classes: `read` < `change` < `send` < `pay` < `delete` (`classifyTool`); the classes in `preAllow` pass without asking, EXCEPT `pay`
 *    and `delete`, which are never pre-allowed (the host asks every time unless the person gave an explicit permanent permission);
 *  - "approve = run again": an approved `{ tool, argsHash }` lets exactly that call through ONCE; the same tool with other arguments is
 *    denied ("I approved A, it sent B" cannot happen);
 *  - everything else is denied and recorded as a {@link PermissionRequest} (bounded, secrets masked) for the host to turn into a card; the
 *    reason handed back to the model tells it to stop and say it is waiting for the person.
 *
 * SAFETY RULES (measured, not assumed):
 *  1. This hook must be the ONLY thing that enables a controlled tool. The CLI treats a hook that fails (server down, 403) as non-blocking:
 *     with the tool in an `allow` rule it would RUN. So no controlled tool is ever put in `--allowedTools` / `permissions.allow`; the base is
 *     `dontAsk`, which denies when the gate does not say allow (fail-closed).
 *  2. Bound to 127.0.0.1 on an ephemeral port, every request must carry the per-run token (constant-time compare) or it gets a 403.
 *     It also decides only while ARMED for a turn (`arm` ... `disarm`): outside a turn (before the first turn, between turns, after the
 *     host closed it) every MCP call is denied, so a background task or a stray call can never ride on a previous approval.
 *  3. The full arguments are never logged, stored or returned: only their hash and the bounded preview leave this object.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { classifyTool, type ActionClass, type ToolAnnotations } from './tool-action.ts'
import type { RunEvent, Runner, StartTurnInput } from '../contract.ts'
import { argsHash, boundedInput, type FlatValue } from './tool-input.ts'
import { FILE_WRITE_TOOLS, insideRoot, targetOfFileTool } from './draft-path.ts'

/** Classes that never pass without asking, whatever the host lists in `preAllow`. */
export const NEVER_PRE_ALLOWED: readonly ActionClass[] = ['pay', 'delete']

/** The request header that carries the per-run token. */
export const GATE_TOKEN_HEADER = 'X-Persona-Run'

const BODY_LIMIT_BYTES = 1024 * 1024

export interface ApprovedAction {
  readonly tool: string
  /** `argsHash` of the REAL, COMPLETE arguments the person approved. */
  readonly argsHash: string
}

/** What the host turns into a card: what the model wanted to do, bounded and with secrets masked. */
export interface PermissionRequest {
  readonly tool: string
  readonly toolUseId?: string
  readonly server?: string
  readonly actionClass: ActionClass
  /** The word that decided the class ("send", "post", "pay", "delete"...), for the card's label. */
  readonly verb: string
  readonly requestedInput: Readonly<Record<string, FlatValue>>
  /** True when the preview left something out: the host does not approve send/pay/delete blind. */
  readonly truncated: boolean
  /** True when a value was replaced by a mask: the preview is not what would be sent. */
  readonly masked: boolean
  /** Hash of the COMPLETE arguments: what an approval is checked against. */
  readonly argsHash: string
}

/** The state for the next turn. */
export interface GateArming {
  /** Classes allowed without asking (`pay` and `delete` are ignored). Default: none. */
  readonly preAllow?: readonly ActionClass[]
  /** Calls the person approved; each lets one matching call through, once. */
  readonly approved?: readonly ApprovedAction[]
  /**
   * The MCP servers this task was GIVEN (names as the CLI uses them in `mcp__<server>__<tool>`, already sanitized). When present — even empty — a connector tool
   * of ANY OTHER server is denied outright: no card, no request, whatever the class (a read included), and an `approved` call of such a server does not save it
   * (an approval for something outside the mandate is no approval). The product's own servers (`ownServers`) are not affected. Absent = every connector is
   * judged by class alone (the old behaviour). "A persona never has more access than the person granted" (D-081/D-083): a native task loads every connector
   * of the account, so the class alone cannot say which ones this persona may touch.
   */
  readonly allowedServers?: readonly string[]
  /**
   * P0-1: the DRAFT of this task (an absolute directory). A built-in file-writing tool (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`) is denied when its target lies outside it (realpath,
   * `..`, another drive and a symlink that leaves it all count as outside). Absent = the turn's own working directory is the root (the CLI's `acceptEdits` rule, now checked here too).
   */
  readonly draftRoot?: string
}

export interface PermissionGateOptions {
  /** Annotations the pre-flight read for a tool (`mcp_status`), keyed by the full `mcp__server__tool` name. */
  readonly annotations?: (tool: string) => ToolAnnotations | undefined
  /** Extra secret detector for the preview (the host's own). */
  readonly isSecret?: (value: string) => boolean
  /** Fixed token (tests). Default: 32 random bytes. */
  readonly token?: string
  /**
   * MCP servers the PRODUCT itself serves to the session (the harness tools: quadros, rotinas...). They are behind the host gateway's own
   * ACL and are enabled by their own allow rule, so the gate gives no opinion on them. Named by the host, never guessed: a connector of
   * the person that happens to carry the same name is NOT exempt unless the host says so.
   */
  readonly ownServers?: readonly string[]
}

interface HookEvent {
  readonly tool_name?: unknown
  readonly tool_input?: unknown
  readonly tool_use_id?: unknown
  readonly mcp_server?: unknown
  /** The CLI's working directory when it called the hook (where a relative path is read from). */
  readonly cwd?: unknown
}

function decision(kind: 'allow' | 'deny', reason: string): Record<string, unknown> {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: kind, permissionDecisionReason: reason } }
}

const OUT_OF_MANDATE_REASON = 'This tool is outside what this persona was given for this task. Do not try it again and do not work around it: it is not available to you; say so if it was needed.'
const OUTSIDE_DRAFT_REASON = 'Files can only be saved inside the draft of this task. This path is outside it. Do not try it again and do not work around it: save the file inside the draft folder instead.'
const DENY_REASON = 'This action needs the person\'s approval before it can run. Do not try it again and do not work around it: stop, tell the person you are waiting for their approval, and wait.'

/**
 * Pre-flight table: the annotations of every tool of every server, keyed by the name the CLI uses (`mcp__<server>__<tool>`).
 * @param servers - `mcp_status.mcpServers`.
 * @returns A lookup for {@link PermissionGateOptions.annotations}. The CLI reports `readOnly` / `destructive`; they become the hints.
 */
export function annotationTable(servers: readonly unknown[]): (tool: string) => ToolAnnotations | undefined {
  const table = new Map<string, ToolAnnotations>()
  for (const server of servers) {
    if (server === null || typeof server !== 'object') continue
    const row = server as { name?: unknown; tools?: unknown }
    if (typeof row.name !== 'string' || !Array.isArray(row.tools)) continue
    const prefix = `mcp__${row.name.replace(/[^a-zA-Z0-9_-]/gu, '_')}__`
    for (const tool of row.tools) {
      if (tool === null || typeof tool !== 'object') continue
      const entry = tool as { name?: unknown; annotations?: { readOnly?: unknown; destructive?: unknown } }
      if (typeof entry.name !== 'string') continue
      const hints: { readOnlyHint?: boolean; destructiveHint?: boolean } = {}
      if (entry.annotations?.readOnly === true) hints.readOnlyHint = true
      if (entry.annotations?.destructive === true) hints.destructiveHint = true
      table.set(`${prefix}${entry.name}`, hints)
    }
  }
  return tool => table.get(tool)
}

export class PermissionGate {
  private readonly server: Server
  private readonly tokenValue: string
  private readonly port: number
  private readonly options: PermissionGateOptions
  private preAllow = new Set<ActionClass>()
  private approved: ApprovedAction[] = []
  private requests: PermissionRequest[] = []
  /** The approved calls this turn REALLY let through (the host marks a card "sent" only for these). */
  private released: ApprovedAction[] = []
  /** The servers this task was given (`undefined` = not restricted). */
  private allowedServers: ReadonlySet<string> | undefined
  /** P0-1: the draft of this task; a file-writing tool outside it is denied (`undefined` = the turn's working directory). */
  private draftRoot: string | undefined
  /** Tools the model reached for outside the mandate this turn (names only: no argument, no result, no card). */
  private outOfMandate: { readonly tool: string }[] = []
  private armed = false
  private closed = false

  private constructor(server: Server, port: number, token: string, options: PermissionGateOptions) {
    this.server = server
    this.port = port
    this.tokenValue = token
    this.options = options
  }

  /**
   * Start the gate on 127.0.0.1 (ephemeral port).
   * @param options - Annotation lookup, extra secret detector, fixed token for tests.
   */
  static async start(options: PermissionGateOptions = {}): Promise<PermissionGate> {
    const token = options.token ?? randomBytes(32).toString('hex')
    let gate: PermissionGate | undefined
    const server = createServer((req, res) => { gate?.handle(req, res) })
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { resolve((server.address() as AddressInfo).port) })
    })
    gate = new PermissionGate(server, port, token, options)
    return gate
  }

  /** The URL the CLI posts to. */
  get url(): string {
    return `http://127.0.0.1:${String(this.port)}/hook`
  }

  /** The `--settings` fragment that installs the hook (merge it into the session's flag settings). */
  settings(): Record<string, unknown> {
    return {
      hooks: { PreToolUse: [{ matcher: `mcp__.*|${[...FILE_WRITE_TOOLS].join('|')}`, hooks: [{ type: 'http', url: this.url, headers: { [GATE_TOKEN_HEADER]: this.tokenValue } }] }] },
      allowedHttpHookUrls: [this.url],
    }
  }

  /**
   * Set what the next turn may do. Clears the requests of the previous turn.
   * @param arming - Classes allowed without asking and the approved calls.
   */
  arm(arming: GateArming = {}): void {
    this.preAllow = new Set((arming.preAllow ?? []).filter(cls => !NEVER_PRE_ALLOWED.includes(cls)))
    this.approved = [...(arming.approved ?? [])]
    this.requests = []
    this.released = []
    this.outOfMandate = []
    this.allowedServers = arming.allowedServers === undefined ? undefined : new Set(arming.allowedServers)
    this.draftRoot = arming.draftRoot
    this.armed = true
  }

  /**
   * End the turn: from now on every MCP call is denied until the next `arm`. Unused approvals are dropped (they were for THIS turn).
   * The requests recorded stay available to {@link takeRequests}.
   */
  disarm(): void {
    this.armed = false
    this.preAllow = new Set()
    this.approved = []
    this.allowedServers = undefined
    this.draftRoot = undefined
  }

  /** The calls this turn asked for that were not allowed (drained: the next call returns only newer ones). */
  takeRequests(): PermissionRequest[] {
    const out = this.requests
    this.requests = []
    return out
  }

  /**
   * The approved calls this turn actually let through, `{ tool, argsHash }` each, in the order they passed (drained: the next call returns only newer
   * ones; `arm` clears them). Only an approved call that matched is listed — never a pre-allowed class, never a refusal. The host marks a card "sent" only
   * for what is listed here: the gate consumes `approved`, so without this the host could not tell an approval that ran from one that did not.
   */
  takeReleased(): ApprovedAction[] {
    const out = this.released
    this.released = []
    return out
  }

  /**
   * The connector tools the model reached for OUTSIDE the mandate this turn (a server not in `allowedServers`), names only, in order (drained; `arm` clears them).
   * They were denied without a card: this is only for diagnosis ("Nina tried the Drive; she was only given the Gmail").
   */
  takeOutOfMandate(): { readonly tool: string }[] {
    const out = this.outOfMandate
    this.outOfMandate = []
    return out
  }

  /** How many calls this turn asked for that were not allowed (does not drain). */
  pending(): number {
    return this.requests.length
  }

  /** Stop listening. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await new Promise<void>((resolve) => { this.server.close(() => { resolve() }); this.server.closeAllConnections() })
  }

  private authorized(req: IncomingMessage): boolean {
    const given = req.headers[GATE_TOKEN_HEADER.toLowerCase()]
    if (typeof given !== 'string') return false
    const a = Buffer.from(given)
    const b = Buffer.from(this.tokenValue)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const refuse = (status: number): void => { res.writeHead(status, { 'content-type': 'application/json' }); res.end('{}') }
    if (req.method !== 'POST' || req.url !== '/hook') { refuse(404); return }
    if (!this.authorized(req)) { refuse(403); return }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > BODY_LIMIT_BYTES) { refuse(413); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (res.writableEnded) return
      let event: HookEvent = {}
      try { event = JSON.parse(Buffer.concat(chunks).toString('utf8')) as HookEvent } catch (error) { void error; refuse(400); return }
      const answer = this.decide(event)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(answer))
    })
  }

  private decide(event: HookEvent): Record<string, unknown> {
    const tool = typeof event.tool_name === 'string' ? event.tool_name : ''
    // P0-1: a built-in tool that WRITES A FILE may only reach the draft of this task. The gate gives no opinion on a call inside it (the CLI's own permission mode decides, as before);
    // outside it, or with no path to judge, or outside an armed turn: denied. Never widens what the persona's tool policy already allows; only narrows it.
    if (FILE_WRITE_TOOLS.has(tool)) {
      if (!this.armed) return decision('deny', DENY_REASON)
      const cwd = typeof event.cwd === 'string' && event.cwd !== '' ? event.cwd : undefined
      const root = this.draftRoot ?? cwd
      const target = targetOfFileTool(event.tool_input)
      if (root === undefined || target === undefined || !insideRoot(root, target, cwd ?? root)) return decision('deny', OUTSIDE_DRAFT_REASON)
      return {}
    }
    // Every other built-in tool is not this gate's business: it follows the persona's own tool policy.
    if (!tool.startsWith('mcp__')) return {}
    if ((this.options.ownServers ?? []).some(name => tool.startsWith(`mcp__${name}__`))) return {}
    // Outside an armed turn nothing is decided: deny, and record nothing (there is no turn to ask the person for).
    if (!this.armed) return decision('deny', DENY_REASON)
    // The mandate comes before everything else: a server this task was not given is denied outright — no class, no preAllow, no `approved`, no card.
    if (this.allowedServers !== undefined && ![...this.allowedServers].some(name => tool.startsWith(`mcp__${name}__`))) {
      if (this.outOfMandate.length < 100) this.outOfMandate.push({ tool })
      return decision('deny', OUT_OF_MANDATE_REASON)
    }
    const input: unknown = event.tool_input ?? {}
    const action = classifyTool(tool, this.options.annotations?.(tool))
    const hash = argsHash(input)
    if (this.preAllow.has(action.actionClass)) return decision('allow', `class ${action.actionClass} is allowed`)
    const at = this.approved.findIndex(item => item.tool === tool && item.argsHash === hash)
    if (at >= 0) {
      this.approved.splice(at, 1)
      this.released.push({ tool, argsHash: hash })
      return decision('allow', 'approved by the person for exactly these arguments')
    }
    if (!this.requests.some(item => item.tool === tool && item.argsHash === hash)) {
      const preview = boundedInput(input, this.options.isSecret === undefined ? {} : { isSecret: this.options.isSecret })
      this.requests.push({
        tool,
        ...(typeof event.tool_use_id === 'string' ? { toolUseId: event.tool_use_id } : {}),
        ...(typeof event.mcp_server === 'string' ? { server: event.mcp_server } : {}),
        actionClass: action.actionClass,
        verb: action.verb,
        requestedInput: preview.fields,
        truncated: preview.truncated,
        masked: preview.masked,
        argsHash: hash,
      })
    }
    return decision('deny', DENY_REASON)
  }
}

/** Fallback text when a turn ends waiting for the person (the host renders its own card from {@link PermissionGate.takeRequests}). */
export const NEEDS_APPROVAL_TEXT = 'Precisa de você: aprove ou recuse esta ação antes de eu continuar.'

/**
 * A turn that asked for something the gate did not allow ends `blocked`, not `ready`: the work is waiting for the person. The detail
 * (tool, class, verb, bounded preview, hash) stays on the gate for the host's card; the turn is also DISARMED here, so the window closes
 * even if the host forgets (a call after the turn ended is denied).
 * @param inner - The runner whose turns the gate guards.
 * @param gate - The gate its CLI session was started with.
 */
export function withPermissionReport(inner: Runner, gate: PermissionGate): Runner {
  const guard = async function *(events: AsyncIterable<RunEvent>): AsyncIterable<RunEvent> {
    for await (const event of events) {
      if (event.type !== 'ended') { yield event; continue }
      const waiting = gate.pending() > 0
      gate.disarm()
      yield waiting && event.report.state === 'ready'
        ? { ...event, report: { ...event.report, state: 'blocked', summary: NEEDS_APPROVAL_TEXT, question: NEEDS_APPROVAL_TEXT } }
        : event
    }
  }
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: input => inner.start(input),
    startTurn: input => inner.startTurn(input),
    stream: handle => guard(inner.stream(handle)),
    events: handle => guard(inner.events(handle)),
    cancel: handle => inner.cancel(handle),
    resume: input => inner.resume(input),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

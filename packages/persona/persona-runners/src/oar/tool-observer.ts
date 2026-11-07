/**
 * OPT-10b: a side tap on an OAR runtime that sees the tool calls of a turn WITHOUT touching the adapter or the runner: it wraps `runtime.session()` and
 * the `events()` of the session it returns, forwards every event unchanged, and keeps for each tool call its server, tool, outcome and — in memory only —
 * the text the tool returned. A measurement round uses it to know that a connector really answered; it is never part of the product's path.
 *
 * Privacy: the result text lives in this object for the length of the round so the entry script can ask ONE question of it
 * (`sharesWordWith(answer)` — a boolean). {@link ToolObserver.report} returns server, tool, class and ok/failed, never an argument or a result.
 */

import type { Runtime } from '@botiverse/oar'
import { classifyTool, type ActionClass, type ToolAnnotations } from '../resolve/tool-action.ts'

/**
 * The CLI's own plumbing that is not a tool the task USES: `ToolSearch` loads the schema of a tool whose definition the CLI deferred (an MCP server with many tools).
 * It is neither "another server" nor a write; it is only a request more in the turn. Anything else built-in (Bash, Read, Edit…) stays a call like any other.
 */
export const CLI_PLUMBING_TOOLS: ReadonlySet<string> = new Set(['ToolSearch'])

export interface ObservedCall {
  readonly callId: string
  /** `mcp__<server>__<tool>` as the CLI names it; a built-in tool has no `mcp__` prefix. */
  readonly tool: string
  /** The server part, or `builtin`. */
  readonly server: string
  readonly name: string
  readonly actionClass: ActionClass
  /** The runtime's own outcome; absent while the call is open or when the runtime says none. */
  ok?: boolean
  ended: boolean
  /** In memory only. Never kept for a tool the observer was told is sensitive. */
  resultText: string
  /** The tool reads content the person keeps: its result was NOT retained. */
  readonly sensitive: boolean
}

/** What the observer may hand out: no argument, no result. */
export interface ObservedCallReport {
  readonly tool: string
  readonly server: string
  readonly name: string
  readonly actionClass: ActionClass
  readonly ok: boolean | undefined
  readonly ended: boolean
  readonly sensitive: boolean
}

/**
 * What the criterion of a round reads from the calls of a turn: the calls WITHOUT the CLI's plumbing, with the ones the gate refused marked, and how many requests
 * the turn made (every call of the turn, plumbing included, is followed by one more request).
 * @param report - {@link ToolObserver.report}.
 * @param refused - The tools the permission gate refused this turn (full `mcp__server__tool` names).
 */
export function callsForCriterion(report: readonly ObservedCallReport[], refused: ReadonlySet<string>): { readonly calls: readonly (ObservedCallReport & { readonly denied: boolean })[]; readonly requests: number } {
  return {
    calls: report.filter(call => !(call.server === 'builtin' && CLI_PLUMBING_TOOLS.has(call.name))).map(call => ({ ...call, denied: refused.has(call.tool) })),
    requests: report.length + 1,
  }
}

function split(tool: string): { readonly server: string; readonly name: string } {
  if (!tool.startsWith('mcp__')) return { server: 'builtin', name: tool }
  const at = tool.indexOf('__', 5)
  return at < 0 ? { server: tool.slice(5), name: '' } : { server: tool.slice(5, at), name: tool.slice(at + 2) }
}

interface FlatEvent {
  readonly kind?: unknown
  readonly callId?: unknown
  readonly tool?: unknown
  readonly result?: unknown
  readonly content?: unknown
}

export class ToolObserver {
  private readonly open = new Map<string, ObservedCall>()
  private readonly annotations: ((tool: string) => ToolAnnotations | undefined) | undefined
  private readonly sensitive: ((tool: string) => boolean) | undefined

  /**
   * @param annotations - The pre-flight's reading of the tools (`annotationTable`): what proves a read.
   * @param sensitive - Tools whose RESULT must not even pass through memory (they read the content of what the person keeps): the call is still seen,
   *   its result text is dropped on arrival.
   */
  constructor(annotations?: (tool: string) => ToolAnnotations | undefined, sensitive?: (tool: string) => boolean) {
    this.annotations = annotations
    this.sensitive = sensitive
  }

  /** Feed one flat OAR event. Anything that is not a tool call event is ignored. */
  tap(raw: unknown): void {
    if (raw === null || typeof raw !== 'object') return
    const event = raw as FlatEvent
    if (typeof event.callId !== 'string') return
    if (event.kind === 'tool_call_started' && typeof event.tool === 'string') {
      const { server, name } = split(event.tool)
      this.open.set(event.callId, { callId: event.callId, tool: event.tool, server, name, actionClass: classifyTool(event.tool, this.annotations?.(event.tool)).actionClass, ended: false, resultText: '', sensitive: this.sensitive?.(event.tool) === true })
      return
    }
    if (event.kind !== 'tool_call_ended') return
    const call = this.open.get(event.callId)
    if (call === undefined) return
    call.ended = true
    if (event.result === 'ok') call.ok = true
    else if (event.result === 'failed') call.ok = false
    if (!call.sensitive && Array.isArray(event.content)) {
      call.resultText = event.content
        .map((part: unknown) => (part !== null && typeof part === 'object' && (part as { type?: unknown }).type === 'text' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
        .filter(text => text !== '')
        .join('\n')
    }
  }

  /** The calls seen, without any argument or result. */
  report(): readonly ObservedCallReport[] {
    return [...this.open.values()].map(call => ({ tool: call.tool, server: call.server, name: call.name, actionClass: call.actionClass, ok: call.ok, ended: call.ended, sensitive: call.sensitive }))
  }

  /**
   * Ask the one question of the results that a round needs, in memory: does `compare(resultText)` hold for ANY result of the calls to `server`?
   * @param server - The granted server.
   * @param compare - Gets a result text, returns a boolean; the text does not leave.
   */
  anyResult(server: string, compare: (resultText: string) => boolean): boolean {
    for (const call of this.open.values()) if (call.server === server && call.resultText !== '' && compare(call.resultText)) return true
    return false
  }

  /** Forget everything (between attempts). */
  reset(): void {
    this.open.clear()
  }
}

/**
 * The runtime, observed: same behaviour, plus every session event is also handed to `observer.tap`.
 * @param runtime - The OAR runtime the runner would use.
 * @param observer - Where the tool events go.
 */
export function observeRuntime(runtime: Runtime, observer: ToolObserver): Runtime {
  const wrapSession = <S extends object>(session: S): S => new Proxy(session, {
    get(target, key) {
      if (key === 'events') {
        return (listener: (event: unknown) => void, options?: unknown) => {
          const events = (target as unknown as { events: (listener: (event: unknown) => void, options?: unknown) => unknown }).events
          return events.call(target, (event: unknown) => { observer.tap(event); listener(event) }, options)
        }
      }
      const value: unknown = Reflect.get(target, key)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
  return new Proxy(runtime, {
    get(target, key) {
      if (key === 'session') {
        return async (...args: unknown[]) => wrapSession(await (target.session as (...args: unknown[]) => Promise<object>).apply(target, args))
      }
      const value: unknown = Reflect.get(target, key)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
}

/**
 * A tiny client for Claude's stream-json CONTROL requests (`initialize`, `mcp_status`, `get_context_usage`, `get_settings`).
 * It never sends a user message, so it never reaches a model: zero spend. Used by the isolation probes (ISO-1, D-085) that prove,
 * per CLI version, that the isolated launch still comes up isolated, with the login intact and the same model and effort.
 *
 * The CLI's stderr is DISCARDED on purpose: with an MCP policy it prints the NAMES of the connectors it blocked (personal data).
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export interface ControlSession {
  request(subtype: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>
  close(): Promise<void>
}

export interface ControlLaunch {
  /** Vendor argv AFTER the fixed stream-json flags. */
  readonly args: readonly string[]
  /** Env overlay on `process.env` (`null` removes a variable). */
  readonly env: Readonly<Record<string, string | null>>
  readonly cwd: string
}

/** Opens a control session. Injected in tests; {@link openClaudeControl} is the real one. */
export type OpenControl = (launch: ControlLaunch) => ControlSession

const STREAM = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--no-session-persistence']
/** Markers of a parent Claude session: a claude launched from inside one believes it is a child of it. */
const PARENT_MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION']
const REQUEST_TIMEOUT_MS = 60_000

/**
 * The real control client: spawns `claude` in print mode over stream-json.
 * @param bin - The `claude` executable (default `claude` on PATH).
 */
export function openClaudeControl(bin: string = 'claude'): OpenControl {
  return (launch) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env }
    for (const name of PARENT_MARKERS) delete childEnv[name]
    for (const [key, value] of Object.entries(launch.env)) {
      if (value === null) delete childEnv[key]
      else childEnv[key] = value
    }
    const child = spawn(bin, [...STREAM, ...launch.args], { cwd: launch.cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false })
    let buffer = ''
    let pending: { id: string; resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void } | null = null
    child.stderr.on('data', () => undefined)
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += String(chunk)
      let at = buffer.indexOf('\n')
      while (at >= 0) {
        const line = buffer.slice(0, at)
        buffer = buffer.slice(at + 1)
        at = buffer.indexOf('\n')
        let message: { type?: string; response?: { request_id?: string; subtype?: string; response?: Record<string, unknown> } }
        try { message = JSON.parse(line) as typeof message } catch { continue }
        const response = message.response
        if (message.type === 'control_response' && response !== undefined && pending !== null && response.request_id === pending.id) {
          const waiter = pending
          pending = null
          if (response.subtype === 'success') waiter.resolve(response.response ?? {})
          else waiter.reject(new Error('control request failed'))
        }
      }
    })
    const exited = new Promise<void>((done) => { child.on('exit', () => { done() }) })
    return {
      request: (subtype, params = {}) => new Promise((resolve, reject) => {
        const id = randomUUID()
        const timer = setTimeout(() => { pending = null; reject(new Error(`timeout ${subtype}`)) }, REQUEST_TIMEOUT_MS)
        pending = {
          id,
          resolve: (value) => { clearTimeout(timer); resolve(value) },
          reject: (error) => { clearTimeout(timer); reject(error) },
        }
        child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: id, request: { subtype, ...params } })}\n`)
      }),
      async close() {
        try {
          if (child.pid !== undefined && process.platform === 'win32') {
            // v1.1.1 (Cobalt): async taskkill; the sync execFileSync blocked the Host event loop for ~520 ms at boot (host CPU profile).
            const { promise, resolve } = Promise.withResolvers<void>()
            const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
            killer.once('close', resolve)
            killer.once('error', resolve)
            await promise
          } else child.kill()
        } catch (error) {
          void error
          child.kill()
        }
        await Promise.race([exited, new Promise<void>((done) => { setTimeout(done, 4000) })])
      },
    }
  }
}

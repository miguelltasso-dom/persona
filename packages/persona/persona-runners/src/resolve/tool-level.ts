/** Enforce persona tool levels (`none` | `read` | `write`) on a live runner. */

import { eventTime, type RunEvent, type RunHandle, type Runner, type StartTurnInput } from '../contract.ts'
import { PRECISA_DE_VOCE } from './cli-policy.ts'

export type ToolLevel = 'none' | 'read' | 'write'

const RANK: Record<ToolLevel, number> = { none: 0, read: 1, write: 2 }

const WRITE = /^(?:bash|shell|write|edit|str_replace|apply_patch|rm|delete|notebook_edit|persona_report|persona_ask|persona_browser_act|persona_computer_click|persona_computer_type|persona_telegram_send|persona_email_send|brain_propose|gestor_hire|gestor_allocate|gestor_reorganize|gestor_assemble)$/iu
const READ = /^(?:read|glob|grep|list|ls|search|web_fetch|persona_recall|persona_browser_open|persona_browser_read|persona_computer_screenshot|brain_search|brain_read)$/iu

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
 * Cancel a turn that calls a tool above the persona grant.
 * @param inner - Resolved runner.
 * @param level - Grant for this run.
 */
export function withToolLevel(inner: Runner, level: ToolLevel): Runner {
  if (level === 'write') return inner
  const play = async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    for await (const event of inner.stream(handle)) {
      const name = toolNameFromEvent(event)
      if (name !== undefined && !allowsTool(level, name)) {
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
    start: input => inner.start(input),
    startTurn: input => inner.startTurn(input),
    stream: play,
    events: play,
    cancel: handle => inner.cancel(handle),
    resume: input => inner.resume(input),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

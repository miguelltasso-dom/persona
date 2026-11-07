/**
 * ISO-4 (D-081 a): what one CLI session spent in its MAIN LOOP versus everything it spent in total, and what environment it
 * loaded (counts only). Pure: no I/O, no clock, no model.
 *
 * Why: the adapter reports OAR's `total`, which for Claude is `result.modelUsage`, that is EVERY model call of the pipeline
 * (main loop, subagents, sidechains, compaction, internal calls). The main loop is `result.usage`, kept by OAR as the root
 * agent's entry in `byAgent`. Without the split the ledger cannot say how much of a call was the agent's own work.
 *
 * Honesty rules: a figure is read from what the runtime reported, never estimated; when the root agent's share is not known
 * the field is ABSENT (never 0, never a guess); names of servers, tools and skills are personal data and never leave this
 * file (only counts and the model id).
 */

import type { RawEvent, SessionUsage } from '@botiverse/oar'
import type { RunnerEnvironment, RunnerUsage } from '../contract.ts'

/** The counters of a usage reading that grow with the session (the rest of `RunnerUsage` is not a count of tokens). */
const COUNTERS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'mainLoopInputTokens', 'mainLoopOutputTokens'] as const

/**
 * The usage of ONE TURN of a warm session: the session's total now minus its total when the turn began.
 * OAR's `session.usage()` is cumulative since the session opened, and the persona's session is warm (reused across Tasks): read as it comes, the second turn
 * of a session reports the first turn's tokens again, the third both, and everything that sums the ledger counts a warm session twice, three times… (TEAM-10 attempt 3: the
 * ledger said 329 293 input tokens, the four CLI sessions had spent 176 494). A counter that went DOWN means another session (a reconnection or a replaced session): then the
 * reading is the turn's own and nothing is subtracted, so the result is never negative. A field the reading does not carry stays absent (never a made-up 0).
 * @param reading - The session's cumulative usage now.
 * @param base - The session's cumulative usage when the turn began (absent: nothing came before).
 * @returns The turn's own usage; everything that is not a counter (environment, effort dropped…) is the reading's.
 */
export function usageSince(reading: RunnerUsage, base: RunnerUsage | undefined): RunnerUsage {
  if (base === undefined) return reading
  for (const key of COUNTERS) {
    const value = reading[key]
    if (value !== undefined && value < (base[key] ?? 0)) return reading
  }
  const turn: RunnerUsage = { ...reading }
  for (const key of COUNTERS) {
    const value = reading[key]
    if (value !== undefined) turn[key] = value - (base[key] ?? 0)
  }
  return turn
}

/** The root agent's own spend. */
export interface MainLoopUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

/**
 * The main loop of a session, from OAR's usage reading.
 * - the root agent's entry in `byAgent` when there is one;
 * - no `byAgent` and nothing `unattributed`: the total IS the root agent's (OAR only breaks it down when more than the root
 *   reported tokens, or part of the total belongs to no agent);
 * - anything else (a breakdown without a root entry, or an unattributed part with no root entry) is unknown ⇒ `undefined`.
 * @param usage - `session.usage().value`.
 * @returns The main loop, or undefined when it cannot be told apart from the rest.
 */
export function mainLoopOf(usage: SessionUsage): MainLoopUsage | undefined {
  const root = usage.byAgent?.find(row => row.agentPath.length === 0)
  if (root !== undefined) return { inputTokens: root.tokens.input, outputTokens: root.tokens.output }
  if (usage.total === null) return undefined
  if (usage.byAgent !== undefined || usage.unattributed !== undefined) return undefined
  return { inputTokens: usage.total.input, outputTokens: usage.total.output }
}

function countOf(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined
}

/**
 * The environment a Claude session loaded, from its `system/init` frame: how many tools, MCP servers, skills, slash commands
 * and plugins it started with, and the model. Counts only.
 * @param records - `session.records()`.
 * @returns The summary, or undefined when the stream has no root `system/init` frame (other CLIs, or before the first turn).
 */
export function environmentOf(records: readonly RawEvent[]): RunnerEnvironment | undefined {
  for (const record of records) {
    if (record.kind !== 'frame' || record.agentPath.length !== 0 || record.body.type !== 'system/init') continue
    const native = record.body.native
    if (native === null || typeof native !== 'object') return undefined
    const frame = native as Record<string, unknown>
    const tools = countOf(frame.tools)
    const mcpServers = countOf(frame.mcp_servers)
    const skills = countOf(frame.skills)
    const slashCommands = countOf(frame.slash_commands)
    const plugins = countOf(frame.plugins)
    const model = typeof frame.model === 'string' && frame.model !== '' ? frame.model : undefined
    const summary: RunnerEnvironment = {
      ...(tools === undefined ? {} : { tools }),
      ...(mcpServers === undefined ? {} : { mcpServers }),
      ...(skills === undefined ? {} : { skills }),
      ...(slashCommands === undefined ? {} : { slashCommands }),
      ...(plugins === undefined ? {} : { plugins }),
      ...(model === undefined ? {} : { model }),
    }
    return Object.keys(summary).length === 0 ? undefined : summary
  }
  return undefined
}

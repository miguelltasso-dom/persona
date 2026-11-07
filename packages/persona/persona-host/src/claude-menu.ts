/**
 * EFF-1 (D-088; Atlas 06:21: it does NOT leave the cut off): the model and the "Capricho" a person picks for each persona come from the ENGINE's own menu.
 * The host's connection probe (`detectConnections`) returned that menu for Codex and NOTHING for Claude — yet Claude's own `initialize` control request (no
 * user message, so no model and no spend) lists every model with the effort levels it accepts. This reads it, once per CLI version, and when the CLI does
 * not answer (missing, slow, a version that does not say) falls back to a STATIC table of what Claude is known to offer, marking where the menu came from
 * (`cli` | `static`) so a test and the diagnostics can tell — the screen does not show it. There is no "recommended" anywhere and no model fixed by us.
 */

import { openClaudeControl, probeCwd, type OpenControl } from '@deepseek-ai/dsh-persona-runners'
import { EFFORT_LEVELS, ENGINE_DEFAULT_MODEL, type EngineMenuEntry } from './engine-menu.ts'

/** Where a menu came from. */
export type MenuSource = 'cli' | 'static'

/** A model menu and its origin. */
export interface EngineMenu {
  readonly entries: readonly EngineMenuEntry[]
  readonly source: MenuSource
}

const KNOWN = new Set<string>(EFFORT_LEVELS)

/** The levels Claude itself takes (`--effort`, read from its own `initialize`): the static table below offers these and nothing else (`ultra` is Codex's). */
const CLAUDE_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
const levelsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && KNOWN.has(item)) : [])

/**
 * What Claude is known to offer (the aliases the CLI itself accepts), used ONLY when the CLI did not say. Every level the host stores, for every model:
 * a level a model refuses falls back to the engine's default inside the runner, and says so.
 */
export const STATIC_CLAUDE_MENU: readonly EngineMenuEntry[] = [
  { id: ENGINE_DEFAULT_MODEL, label: 'Padrão do motor', efforts: [...CLAUDE_LEVELS] },
  { id: 'opus', label: 'Opus', efforts: [...CLAUDE_LEVELS] },
  { id: 'sonnet', label: 'Sonnet', efforts: [...CLAUDE_LEVELS] },
  { id: 'fable', label: 'Fable', efforts: [...CLAUDE_LEVELS] },
  { id: 'haiku', label: 'Haiku', efforts: [...CLAUDE_LEVELS] },
]

/**
 * The menu from the CLI's `initialize` answer. Pure; reads only `models[].value / displayName / supportedEffortLevels`.
 * @param init - The control response of `initialize`.
 * @returns The entries in the CLI's order; a model that lists no level has no choice of effort. Empty when the answer has no models.
 */
export function menuFromInitialize(init: Record<string, unknown>): EngineMenuEntry[] {
  const models = Array.isArray(init.models) ? init.models : []
  const entries: EngineMenuEntry[] = []
  for (const model of models) {
    if (model === null || typeof model !== 'object') continue
    const row = model as { value?: unknown; displayName?: unknown; supportedEffortLevels?: unknown }
    if (typeof row.value !== 'string' || row.value === '') continue
    const efforts = levelsOf(row.supportedEffortLevels)
    entries.push({
      id: row.value,
      ...(typeof row.displayName === 'string' && row.displayName.trim() !== '' ? { label: row.displayName } : {}),
      ...(efforts.length === 0 ? {} : { efforts }),
    })
  }
  return entries
}

const TIMEOUT_MS = 15_000

/**
 * Ask the installed Claude for its menu (control request only). Never throws: no answer is the static table.
 * @param options - `open` the control client (tests inject), `timeoutMs`.
 */
export async function readClaudeMenu(options: { readonly open?: OpenControl; readonly timeoutMs?: number } = {}): Promise<EngineMenu> {
  const workspace = probeCwd()
  let session: ReturnType<OpenControl> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const open = options.open ?? openClaudeControl(process.env.CLAUDE_BIN ?? 'claude')
    session = open({ args: [], env: {}, cwd: workspace.dir })
    const asked = session.request('initialize')
    const expired = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(new Error('menu-timeout')) }, options.timeoutMs ?? TIMEOUT_MS) })
    const entries = menuFromInitialize(await Promise.race([asked, expired]))
    return entries.length === 0 ? { entries: STATIC_CLAUDE_MENU, source: 'static' } : { entries, source: 'cli' }
  } catch (error: unknown) {
    void error // the CLI is missing, not logged in or slow: the static table, marked as such
    return { entries: STATIC_CLAUDE_MENU, source: 'static' }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    await session?.close().catch((error: unknown) => { void error })
    workspace.dispose()
  }
}

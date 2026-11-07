/** Deterministic persona `tools` → vendor CLI flags. CLIs never use `prompt`. */

import type { CliKind } from '../contract.ts'
import type { ToolLevel } from './tool-level.ts'

/** Attention copy when a CLI asks for something outside the grant. */
export const PRECISA_DE_VOCE = 'Precisa de você: esta ação está fora da política da persona.'

export type CliPermissionMode = 'deny' | 'allow-once'

export interface CliSessionPolicy {
  permissionMode: CliPermissionMode
  toolLevel: ToolLevel
  /** Extra argv. Empty for Cursor (refuses `launchArgs`) and OpenCode. */
  launchArgs: readonly string[]
  /** Native deny list. Empty for OpenCode (ACP refuses `disallowedTools`). */
  disallowedTools: readonly string[]
  /** Codex only. Pinned via `OAR_CODEX_SANDBOX` at `session()`. */
  sandbox?: 'read-only' | 'workspace-write'
}

const CLAUDE_WRITE = ['Bash', 'PowerShell', 'Edit', 'Write', 'NotebookEdit', 'MultiEdit'] as const
/** The CLI's command-running tools (Windows has PowerShell next to Bash): a persona without a shell grant gets neither. */
const CLAUDE_SHELL = ['Bash', 'PowerShell'] as const
const CLAUDE_NET = ['WebFetch', 'WebSearch'] as const
const CURSOR_WRITE = ['Bash', 'Shell', 'Write', 'Edit', 'Delete', 'ApplyPatch'] as const
const CURSOR_NET = ['WebFetch', 'WebSearch'] as const

export interface ToolGrants {
  files: ToolLevel
  shell: ToolLevel
  web: ToolLevel
}

/**
 * Read the persona `tools` map (`files` / `shell` / `web`, with aliases).
 * @param tools - Persona spec map. Empty ⇒ all `none`.
 */
export function grantsOf(tools: Readonly<Record<string, ToolLevel>> = {}): ToolGrants {
  const pick = (...names: string[]): ToolLevel => {
    for (const name of names) {
      const level = tools[name]
      if (level !== undefined) return level
    }
    return 'none'
  }
  return {
    files: pick('files', 'write', 'edit'),
    shell: pick('shell', 'bash'),
    web: pick('web', 'web_fetch', 'search'),
  }
}

/**
 * CLI permission from purpose + grants. Never `prompt`.
 * @param purpose - Talk/coordination vs ticket in a worktree.
 * @param tools - Persona `tools` map.
 */
export function cliPermissionOf(
  purpose: 'talk' | 'task',
  tools: Readonly<Record<string, ToolLevel>> = {},
): CliPermissionMode {
  if (purpose === 'talk') return 'deny'
  const grants = grantsOf(tools)
  if (grants.files === 'write' || grants.shell === 'write' || grants.shell === 'read') return 'allow-once'
  return 'deny'
}

/**
 * Fail loud when a caller still asks for interactive CLI approval (D-013).
 * @param mode - Requested mode.
 */
export function assertCliNeverPrompt(mode: string): void {
  if (mode === 'prompt') {
    throw new Error(
      'CLI não aceita modo prompt — a aprovação interativa não existe. Use deny (resposta) ou allow-once (tarefa no worktree).',
    )
  }
}

/**
 * True when an OAR event is a runtime→app permission/approval ask.
 * @param event - Flat OAR event.
 */
export function isPermissionAsk(event: { kind: string; type?: string }): boolean {
  const kind = event.kind.toLowerCase()
  const type = (event.type ?? '').toLowerCase()
  return kind === 'app_request'
    || kind.includes('permission')
    || kind.includes('approval')
    || type.includes('permission')
    || type.includes('approval')
    || type === 'can_use_tool'
    || type.includes('requestapproval')
}

/**
 * Vendor session flags for one CLI + grant.
 * @param cli - Vendor.
 * @param tools - Persona `tools` map.
 * @param permissionMode - Host mode (`deny` | `allow-once`). `prompt` throws.
 */
export function cliPolicyOf(
  cli: CliKind,
  tools: Readonly<Record<string, ToolLevel>> = {},
  permissionMode: CliPermissionMode | 'prompt' | 'deny' | 'allow-once' = 'deny',
): CliSessionPolicy {
  assertCliNeverPrompt(permissionMode)
  const mode: CliPermissionMode = permissionMode === 'allow-once' ? 'allow-once' : 'deny'
  const grants = grantsOf(tools)
  const level: ToolLevel = mode === 'deny'
    ? 'none'
    : grants.files === 'write' || grants.shell === 'write'
      ? 'write'
      : grants.files === 'read' || grants.shell === 'read' || grants.web !== 'none'
        ? 'read'
        : 'none'
  if (cli === 'claude') return claudePolicy(mode, grants, level)
  if (cli === 'codex') return codexPolicy(mode, grants, level)
  if (cli === 'cursor') return cursorPolicy(mode, grants, level)
  return { permissionMode: mode, toolLevel: level, launchArgs: [], disallowedTools: [] }
}

function claudePolicy(mode: CliPermissionMode, grants: ToolGrants, toolLevel: ToolLevel): CliSessionPolicy {
  const denied: string[] = []
  if (mode === 'deny' || grants.files !== 'write') denied.push(...CLAUDE_WRITE.filter(name => !(CLAUDE_SHELL as readonly string[]).includes(name)))
  if (mode === 'deny' || grants.shell === 'none') denied.push(...CLAUDE_SHELL)
  if (grants.web === 'none') denied.push(...CLAUDE_NET)
  const acceptEdits = mode === 'allow-once' && grants.files === 'write'
  // P0-1: a persona that may only SAVE FILES (no shell) gets exactly the built-in tools of that grant, not the CLI's whole default set (which also carries sub-agents, skills, workflows, scheduled wake-ups…):
  // "never more access than the person granted" (D-081/D-083). `ToolSearch` stays: it only loads the schema of a deferred tool, and connectors need it.
  const filesOnly = acceptEdits && grants.shell === 'none'
  const nativeList = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'ToolSearch', ...(grants.web === 'none' ? [] : CLAUDE_NET)].join(',')
  return {
    permissionMode: mode,
    toolLevel,
    launchArgs: mode === 'deny'
      ? ['--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--tools', '']
      : ['--permission-mode', acceptEdits ? 'acceptEdits' : 'dontAsk', ...(filesOnly ? ['--tools', nativeList] : [])],
    disallowedTools: [...new Set(denied)],
  }
}

function codexPolicy(mode: CliPermissionMode, grants: ToolGrants, toolLevel: ToolLevel): CliSessionPolicy {
  const write = mode === 'allow-once' && (grants.files === 'write' || grants.shell !== 'none')
  return {
    permissionMode: mode,
    toolLevel,
    launchArgs: [],
    disallowedTools: [],
    sandbox: write ? 'workspace-write' : 'read-only',
  }
}

function cursorPolicy(mode: CliPermissionMode, grants: ToolGrants, toolLevel: ToolLevel): CliSessionPolicy {
  const denied: string[] = []
  if (mode === 'deny' || grants.files !== 'write') denied.push(...CURSOR_WRITE.filter(name => name !== 'Bash' && name !== 'Shell'))
  if (mode === 'deny' || grants.shell === 'none') denied.push('Bash', 'Shell')
  if (grants.web === 'none') denied.push(...CURSOR_NET)
  return {
    permissionMode: mode,
    toolLevel,
    launchArgs: [],
    disallowedTools: [...new Set(denied)],
  }
}

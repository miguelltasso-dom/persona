/**
 * COLHEITA item 8: the hook gate for EVERY Claude task that may save a file or run a command, not only the tasks that carry connectors.
 *
 * Until now the host opened a `PermissionGate` only for a task with connectors, so the draft confinement of the built-in file writers and the command judge existed only
 * there; a task that just saves a poster ran on the CLI's `acceptEdits` alone. The runner now opens a gate of its own when the host brought none and the persona may save files, run commands or carry the browser:
 *  - it is armed at the start of every turn with the turn's working directory as the draft (a placeholder `.` or an empty directory means "no draft": nothing can be changed);
 *  - it carries an EMPTY mandate (`allowedServers: []`): a connector tool of the person is refused outright (nobody granted it to a task that has no host gate);
 *  - it cannot show a card (`askable: false`): what would wait for the person is refused with a fixed text, and the turn is never reported "blocked, waiting for approval";
 *  - it dies with the runner (`dispose`).
 * A gate the host opened (tasks with connectors) is only told the persona's shell grant; the host keeps arming it.
 *
 * Claude only: it is the one CLI whose hook is proven on the real binary (`CLI_GATES`). Pure wiring: no policy of its own (the judges are `authority-table.ts` and `command-policy.ts`).
 */

import type { Runner, StartTurnInput } from '../contract.ts'
import { DEFAULT_TOOL_SERVER } from '../oar/tool-binding.ts'
import { grantsOf } from '../resolve/cli-policy.ts'
import { PermissionGate } from '../resolve/permission-gate.ts'
import type { ToolLevel } from '../resolve/tool-level.ts'
import type { AuthorityKind } from './authority-table.ts'

type Tools = Readonly<Record<string, ToolLevel>>

/**
 * Whether a call needs the runner's own gate: a Claude task (not a plain answer) whose persona may save files or run commands, or that carries the product's browser server (item 17:
 * attached per turn, after the session opened; under `dontAsk` only the gate's explicit `allow` lets its tools run).
 * @param cli - CLI id.
 * @param permissionMode - The turn's permission mode (`deny` is a plain answer: no tool runs).
 * @param tools - The persona's `tools` map.
 * @param carriesBrowser - The host attaches the browser server to this runner's turns.
 */
export function needsNativeGate(cli: string, permissionMode: string | undefined, tools: Tools | undefined, carriesBrowser = false): boolean {
  if (cli !== 'claude' || permissionMode !== 'allow-once') return false
  const grants = grantsOf(tools ?? {})
  return carriesBrowser || grants.files === 'write' || grants.shell !== 'none'
}

/** The gate to use for one call and the one the runner opened itself (to arm and close). */
export interface NativeGate {
  /** The gate that guards this call, the host's or the runner's own; `undefined` when none applies. */
  readonly gate: PermissionGate | undefined
  /** Set only when the runner opened the gate itself. */
  readonly own: PermissionGate | undefined
}

/**
 * Pick (or open) the gate of one call and tell it the persona's shell grant.
 * @param input - The CLI, the permission mode, the persona's tools and the gate the host brought (if any).
 */
export async function nativeGateFor(input: {
  readonly cli: string
  readonly permissionMode: string | undefined
  readonly tools: Tools | undefined
  readonly hostGate: PermissionGate | undefined
  readonly carriesBrowser?: boolean
}): Promise<NativeGate> {
  if (input.cli !== 'claude') return { gate: input.hostGate, own: undefined }
  const shell = grantsOf(input.tools ?? {}).shell
  if (input.hostGate !== undefined) {
    input.hostGate.configure({ shell, browser: true })
    return { gate: input.hostGate, own: undefined }
  }
  if (!needsNativeGate(input.cli, input.permissionMode, input.tools, input.carriesBrowser === true)) return { gate: undefined, own: undefined }
  const own = await PermissionGate.start({ ownServers: [DEFAULT_TOOL_SERVER], askable: false })
  own.configure({ shell, browser: true })
  return { gate: own, own }
}

/**
 * Arm the runner's own gate at the start of every turn and close it with the runner. Returns `inner` untouched when the runner opened no gate.
 * The report wrapper that disarms the gate at the end of the turn is the one `resolveRunner` already puts around a gated Claude runner.
 * @param inner - The runner.
 * @param own - What {@link nativeGateFor} opened (`undefined` = nothing to do).
 * @param authority - Who the run acts for (default `person`).
 */
export function withNativeGate(inner: Runner, own: PermissionGate | undefined, authority: AuthorityKind = 'person'): Runner {
  if (own === undefined) return inner
  const arm = (input: StartTurnInput): void => {
    const draft = input.cwd !== '' && input.cwd !== '.' ? { draftRoot: input.cwd } : { noDraft: true }
    // Carbon P0-03a: the turn says who it acts for (the host derives it from the Task's real origin); the argument is only the default.
    own.arm({ ...draft, allowedServers: [], authority: input.authority ?? authority })
  }
  return {
    ...inner,
    start: async (input) => { arm(input); return inner.start(input) },
    startTurn: async (input) => { arm(input); return inner.startTurn(input) },
    resume: async (input) => { arm(input); return inner.resume(input) },
    dispose: async () => {
      try {
        if (inner.dispose !== undefined) await inner.dispose()
      } finally {
        await own.close()
      }
    },
  }
}

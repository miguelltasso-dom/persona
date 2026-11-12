/**
 * COLHEITA item 8: which deterministic gate each CLI really has, in one table. A product promise ("a persona only saves into the draft", "a command is judged before it runs")
 * is made only where this table says a gate exists; where it says `none` the native tool is refused (fail closed) and the screen says so in plain words.
 *
 *  - `hook`: the CLI asks the product before every tool call (Claude `PreToolUse`), with the complete arguments. Judged by {@link judgeCommand} and the draft confinement.
 *  - `sandbox`: the operating system confines the CLI (Codex `workspace-write`/`read-only`, no network). Writes stay in the working directory; commands are not read.
 *  - `static`: the CLI enforces a permission block the product writes into its configuration (OpenCode). Not per call: all-or-nothing per tool class.
 *  - `none`: nothing proven (Cursor). Native writes and commands are refused outright.
 *
 * Pure: no I/O. The table is a statement about what the PRODUCT enforces today, not about what the vendors ship.
 */

import type { CliKind } from '../contract.ts'

/** How a capability is held back on a CLI. */
export type GateKind = 'hook' | 'sandbox' | 'static' | 'none'

/** The gates of one CLI. */
export interface CliGate {
  /** Shell commands (`Bash`, `PowerShell`, the CLI's own shell tool). */
  readonly commands: GateKind
  /** Saving files: only inside the draft of the task. */
  readonly draftWrites: GateKind
  /** Reading credentials, keys and the product's vault. */
  readonly secretReads: GateKind
  /** The product's browser server (`mcp__browser__*`, item 17): every tool call judged by the browser row of the authority table. */
  readonly browser: GateKind
}

/** The table. Keep it honest: a `hook`/`sandbox`/`static` entry needs a test that fails when the mechanism is removed. */
export const CLI_GATES: Readonly<Record<CliKind, CliGate>> = {
  claude: { commands: 'hook', draftWrites: 'hook', secretReads: 'hook', browser: 'hook' },
  codex: { commands: 'sandbox', draftWrites: 'sandbox', secretReads: 'none', browser: 'none' },
  opencode: { commands: 'static', draftWrites: 'static', secretReads: 'none', browser: 'none' },
  cursor: { commands: 'none', draftWrites: 'none', secretReads: 'none', browser: 'none' },
}

/**
 * The gates of a CLI. An id the table does not know has none (fail closed).
 * @param cli - CLI id.
 */
export function gateOf(cli: string): CliGate {
  return (CLI_GATES as Readonly<Record<string, CliGate | undefined>>)[cli] ?? { commands: 'none', draftWrites: 'none', secretReads: 'none', browser: 'none' }
}

/**
 * Whether the product has a proven gate for saving files on this CLI (without one the native file tools are refused).
 * @param cli - CLI id.
 */
export function hasDraftWriteGate(cli: string): boolean {
  return gateOf(cli).draftWrites !== 'none'
}

/**
 * Whether the product has a proven gate for the browser tools of a persona on this CLI. Without one the browser is not offered: it would run click, type and navigate with no card and
 * no authority check (the server only drops script evaluation at the origin).
 * @param cli - CLI id.
 */
export function hasBrowserGate(cli: string): boolean {
  return gateOf(cli).browser !== 'none'
}

/**
 * Whether the product has a proven gate for shell commands on this CLI (without one the native shell is refused).
 * @param cli - CLI id.
 */
export function hasCommandGate(cli: string): boolean {
  return gateOf(cli).commands !== 'none'
}

/** What the product can truthfully say about one CLI (the screen shows `line`; `undefined` = nothing to warn about). */
export interface CliAuthorityReport extends CliGate {
  readonly line: string | undefined
}

const LABELS: Readonly<Record<string, string>> = { claude: 'Claude', codex: 'Codex', cursor: 'Cursor', opencode: 'OpenCode' }

/**
 * The line for the screen: what this engine cannot hold back, in the person's words. `undefined` on an engine whose gates are all proven (nothing to warn about).
 * @param cli - CLI id.
 */
export function cliAuthorityReport(cli: string): CliAuthorityReport {
  const gate = gateOf(cli)
  const label = LABELS[cli] ?? cli
  let line: string | undefined
  if (gate.draftWrites === 'none' || gate.commands === 'none') {
    line = `${label} ainda não tem a trava de arquivos e comandos: aqui só leio; salvar arquivos no rascunho e rodar comandos ficam para o Claude.`
  } else if (gate.commands === 'sandbox') {
    line = `${label} salva arquivos só dentro do rascunho e roda comandos sem acesso à internet; ele não separa arquivos secretos do seu computador, então não guardo senhas ao alcance dele.`
  } else if (gate.commands === 'static') {
    line = `${label} salva arquivos só no rascunho e não roda comandos; ele não separa arquivos secretos do seu computador.`
  }
  // Said once, whatever else the engine lacks: the browser of the personas needs the hook.
  if (gate.browser === 'none') line = `${line ?? `${label} ainda não tem a trava para o navegador das personas.`} O navegador das personas fica só no Claude.`
  return { ...gate, line }
}

/**
 * ISO-1 / ISO-5 (D-081, D-083): did a CLI launch, with the product's isolation arguments, really come up isolated?
 * Pure verdict over what the DRY probe read (control requests only, zero model): `scripts/iso-dry.ts`.
 *
 * Why it exists: the effect of the flags is observed behaviour of a CLI version, not a documented guarantee. The probe runs when
 * the installed CLI version changes; if the verdict is not `ok` the runner goes back to the strict launch (fail-closed) and the
 * screen says the connector is unavailable (ISO-5 condition 1). Counts only: never a name, never the account.
 */

export interface IsolationProbeReading {
  /** `initialize` answered with the person's account (the login survived the isolation). */
  readonly loggedIn: boolean
  /** Servers `mcp_status` lists once the account connectors have had time to arrive. */
  readonly mcpServers: number
  /** Slash commands and skills the session knows (`initialize.commands`). */
  readonly commands: number
  /** Tokens of the vendor's built-in tools in the opening context (`get_context_usage`); omitted when not read. */
  readonly builtinToolTokens?: number
}

export interface IsolationProbeExpectation {
  /** Talk/answer-only launches pass `--tools ''`: the opening context must carry no built-in tool. */
  readonly noBuiltinTools: boolean
  /** Servers that are meant to be visible (the granted ones; 0 for the default launch). */
  readonly expectedMcpServers?: number
}

export interface IsolationProbeVerdict {
  readonly ok: boolean
  readonly failures: readonly string[]
}

/**
 * @param reading - What the probe read.
 * @param expectation - What this launch is meant to show.
 * @returns `ok` only when the login survived, exactly the meant servers are visible, no personal command is, and the built-in
 *   tools are absent when they were turned off. `failures` are stable codes (no names).
 */
export function evaluateIsolationProbe(reading: IsolationProbeReading, expectation: IsolationProbeExpectation): IsolationProbeVerdict {
  const failures: string[] = []
  if (!reading.loggedIn) failures.push('not-logged-in')
  const expected = expectation.expectedMcpServers ?? 0
  if (reading.mcpServers !== expected) failures.push(`mcp-servers:${String(reading.mcpServers)}!=${String(expected)}`)
  if (reading.commands !== 0) failures.push(`commands-visible:${String(reading.commands)}`)
  if (expectation.noBuiltinTools && reading.builtinToolTokens !== undefined && reading.builtinToolTokens > 0) {
    failures.push(`builtin-tools-present:${String(reading.builtinToolTokens)}`)
  }
  return { ok: failures.length === 0, failures }
}

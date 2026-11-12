/**
 * COLHEITA item 8: the OpenCode gate. `opencode acp` has no per-session tool deny list and never asks the product for a decision, so the only deterministic gate is the
 * `permission` block of its configuration, which the CLI itself enforces. The product writes it into `OPENCODE_CONFIG_CONTENT` (a session environment variable: nothing is
 * written to the person's own configuration files).
 *
 * Proven dry against the real CLI (zero model): the resolved `build` agent of `opencode debug agent build` lists these rules AFTER the defaults and after the person's own
 * rules, and the last matching rule wins. The same block is set for the `build` and `plan` agents so an agent block of the person's configuration cannot loosen it, and
 * `default_agent` is pinned to `build`.
 *
 * What it holds, and what it does not (said on the screen through `cliAuthorityReport`):
 *  - `bash` is always `deny`: the product has no command judge on OpenCode, so no command runs;
 *  - `edit` is `allow` only with a file grant and a draft; `external_directory` is always `deny`, so a tool never reaches outside the project directory of the session
 *    (the draft). OpenCode defines the project directory as the Git root of the working directory: a draft that sits inside a larger repository reaches that whole repository;
 *  - `webfetch` follows the web grant;
 *  - reading files is not held back: OpenCode reads anything the person's user can read.
 * Pure: builds a JSON string.
 */

import type { ToolLevel } from '../resolve/tool-level.ts'

/** The environment variable OpenCode reads its inline configuration from. */
export const OPENCODE_CONFIG_ENV = 'OPENCODE_CONFIG_CONTENT'

/** What the persona is granted that OpenCode can hold back. */
export interface OpenCodeGrants {
  /** The persona may save files (into the draft). */
  readonly files: ToolLevel
  /** The persona may fetch the web. */
  readonly web: ToolLevel
}

type Action = 'allow' | 'deny'

/** The permission block (exported for tests). */
export function opencodePermission(grants: OpenCodeGrants, writing: boolean): Record<string, Action> {
  return {
    edit: writing && grants.files === 'write' ? 'allow' : 'deny',
    bash: 'deny',
    webfetch: grants.web === 'none' ? 'deny' : 'allow',
    external_directory: 'deny',
    doom_loop: 'deny',
  }
}

/**
 * The inline configuration that holds OpenCode to the gate.
 * @param grants - The persona's file and web grants.
 * @param writing - Whether this call may write at all (a task with a draft; never a plain answer).
 * @returns The JSON text for {@link OPENCODE_CONFIG_ENV}.
 */
export function opencodeConfigContent(grants: OpenCodeGrants, writing: boolean): string {
  const permission = opencodePermission(grants, writing)
  return JSON.stringify({
    default_agent: 'build',
    permission,
    agent: { build: { permission }, plan: { permission } },
  })
}

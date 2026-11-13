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
 *  - everything else is `deny` by default (`"*": "deny"`), and the reading tools (`read`, `glob`, `grep`, `list`) are allowed explicitly;
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

/** Every upper/lower-case spelling of `word` (`.git` → `.git`, `.giT`, … `.GIT`). */
function caseSpellings(word: string): string[] {
  let out = ['']
  for (const char of word) {
    const forms = char.toLowerCase() === char.toUpperCase() ? [char] : [char.toLowerCase(), char.toUpperCase()]
    out = out.flatMap(prefix => forms.map(form => `${prefix}${form}`))
  }
  return out
}

/**
 * P0-B (S4, Mend): the edit rules that keep OpenCode out of the `.git` of a repository (folder or file), its 8.3 names and the spelling Windows opens the same (`.git.`). OpenCode
 * matches a rule's pattern with `*` = any text (separators too) and the LAST matching rule wins, so these come after `"*": "allow"`. Only git writes there: a `.git/config` or a `.git`
 * FILE of the persona's runs her programs on the next `git add` (`filter.*.clean`), in any engine and in the host. Proven on the real CLI 1.19.3: without them, `edit` of
 * `<draft>/.git/config` was applied.
 */
function gitEditRules(): Record<string, Action> {
  const rules: Record<string, Action> = {}
  for (const dotGit of caseSpellings('.git')) {
    for (const pattern of [`*${dotGit}`, `*${dotGit}/*`, `*${dotGit}\\*`, `*${dotGit}.`, `*${dotGit}./*`, `*${dotGit}.\\*`]) rules[pattern] = 'deny'
  }
  for (const short of caseSpellings('git~')) for (const pattern of [`${short}*`, `*/${short}*`, `*\\${short}*`]) rules[pattern] = 'deny'
  for (const hashed of caseSpellings('gi')) for (const pattern of [`${hashed}????~*`, `*/${hashed}????~*`, `*\\${hashed}????~*`]) rules[pattern] = 'deny'
  return rules
}

/** The permission block (exported for tests). */
export function opencodePermission(grants: OpenCodeGrants, writing: boolean): Record<string, Action | Record<string, Action>> {
  return {
    // Carbon P0-04: deny by default (a tool this file does not know is closed), then the rules below, which win because they come after.
    '*': 'deny',
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    edit: writing && grants.files === 'write' ? { '*': 'allow', ...gitEditRules() } : 'deny',
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

/**
 * ISO-1 reoriented by D-084 (Miguel): the person's connectors ARE available to the personas; what the product controls is what a
 * CALL loads. "Isolation" is the mechanism of "load only what this call needs", not a prohibition.
 * Contract: persona-spec/contracts/cli-isolation.md. Pure plan: no fs write, no model, no clock; it reads `os.tmpdir()` only to
 * name a default directory.
 *
 * Why it is urgent (measured DRY with the product's own launch arguments, reports/iso-dry-product.json): a no-tools call
 * (`--tools ''`: conversation, triage, first delivery) under the person's native config opens with ~377 000 tokens of MCP tool
 * definitions on this machine (21 servers, 397 tools, none of which the call can ever use: `dontAsk` denies them), against ~1 600
 * with nothing loaded. That one request is what the paired real run counted as "7 requests" (305 652 tokens).
 *
 * What each CLI allows was proven DRY (zero model call, real login; reports/iso-dry-claude.json, reports/iso5-dry.md):
 * - Claude   `full`: `--strict-mcp-config` (no MCP of any scope: user, dynamic AND the claude.ai account connectors),
 *            `--setting-sources project` (no user settings, hooks, plugins, permissions, user CLAUDE.md),
 *            `--disable-slash-commands` (no personal skills/commands). The native config dir is untouched, so the LOGIN is the
 *            person's own and no credential is ever copied. A call that NEEDS a connector gets it by URL allow-list (ISO-5),
 *            decided by the router (HT-10), not here.
 * - OpenCode `full`: `XDG_CONFIG_HOME` at an empty product directory: 0 MCP/plugins, login untouched (it lives in the DATA
 *            directory). OpenCode refuses `launchArgs`, so env is the only way. CAUTION: a provider defined only in the person's
 *            `opencode.json` would not resolve, so it is `needed`-mode only until that is proven.
 * - Codex    `partial`: a user MCP server cannot be removed from the command line (`-c mcp_servers={}` does not clear it,
 *            `enabled=false` is rejected, `app-server` has no `--ignore-user-config`), and copying `auth.json` would risk the
 *            person's login. Nothing is changed and the screen says what is NOT loaded-on-demand (HT-12).
 * - Cursor   `none`: in-process SDK, nothing to pass; unproven until a real install is tested.
 *
 * The mode (`PERSONA_CLI_ENV`) decides WHICH calls get the plan; the default is `needed` (D-096, 05/11; it was `answer-only` since D-085). A mode is only applied to a call
 * once PROVEN for the installed CLI version (`isolation-gate.ts`); until then, and whenever the proof fails, the call runs `native`. The second fallback of D-096: a task whose
 * GRANTED connector the isolated launch could not reach runs `native` ONCE (that task only; see `connector-reach.ts`):
 * - `native`      the old launch for every call (development/support; also what an unproven call falls back to);
 * - `answer-only` Claude only, calls WITHOUT tools: they can never use a connector, so loading none loses nothing;
 * - `needed`      every call loads only what it needs (the D-084 end state; task calls get their connectors from the router, HT-10).
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type IsolationLevel = 'full' | 'partial' | 'none'

/** What the host registers per CLI and the screen shows: the level and the CODES of what is not isolated (the UI words them). */
export interface IsolationReport {
  readonly level: IsolationLevel
  readonly notIsolated: readonly string[]
}

/** How the session is launched. */
export interface IsolationPlan extends IsolationReport {
  /** Extra vendor argv (Claude only: OpenCode and Cursor refuse `launchArgs`). */
  readonly launchArgs: readonly string[]
  /** Session env overlay (`null` removes a variable), applied AFTER the native-login overlay. */
  readonly env: Readonly<Record<string, string | null>>
  /** A directory the plan needs to exist before the session opens (OpenCode's empty product config root). */
  readonly ensureDir?: string
  /**
   * ISO-5: settings the plan wants in the CLI's single `--settings` (the connector allow-list). Merged with the other contributors
   * (the permission gate's hook) by `mergeFlagSettings`.
   */
  readonly settings?: Readonly<Record<string, unknown>>
  /** ISO-5: how many connectors of the person's account this plan loads (absent = none: the floor). */
  readonly accountConnectors?: number
  /** HT-11: the person's own skills are loaded, by their option (the level stays `full`: it is a choice, not a leak). */
  readonly personalSkills?: boolean
}

/** Which calls get the plan. */
export type CliEnvMode = 'native' | 'answer-only' | 'needed'

/** The switch. Unset = {@link DEFAULT_CLI_ENV_MODE}. */
export const CLI_ENV_SWITCH = 'PERSONA_CLI_ENV'

/** D-096 (the owner's OK, 05/11): `needed` is the default: every call loads only what it needs (a task gets only the connectors it was granted). `answer-only` (D-085) stays a switch. One constant, one test. */
export const DEFAULT_CLI_ENV_MODE: CliEnvMode = 'needed'

/** A call WITHOUT tools (talk, triage, first delivery) or one that runs a task with tools. */
export type CallKind = 'answer' | 'task'

/** Codes for `notIsolated` (stable; the screen maps them to words). */
export const NOT_ISOLATED = {
  mcp: 'personal-mcp',
  plugins: 'personal-plugins',
  hooks: 'personal-hooks',
  skills: 'personal-skills',
  instructions: 'personal-instructions',
  settings: 'personal-settings',
} as const

/** Arguments that take Claude out of the person's environment, keeping the native login (proven dry on 2.1.318). */
export const CLAUDE_ISOLATION_ARGS: readonly string[] = ['--strict-mcp-config', '--setting-sources', 'project', '--disable-slash-commands']

/**
 * ISO-5 (D-083): load the connector of the person's ACCOUNT that a request needs, and only that one. `--setting-sources local` brings the
 * account connectors and nothing else of the person's environment; `allowedMcpServers` by URL (by name does not match the claude.ai
 * connectors) lets exactly the listed ones through; the rest are not even registered. No `--strict-mcp-config` here: strict wins over the
 * allow-list and would block them all. Proven dry on the real CLI (reports/iso5-dry.md): 1 server, stable, fail-closed.
 *
 * `project` stays in the list, like in the floor: `local` ALONE drops the project's own CLAUDE.md (measured on a test project: 419 memory
 * tokens in the floor, 0 with `local`, 419 again with `local,project`), so the persona would lose the project's instructions on exactly the
 * calls that use a connector. With `project` added the connector is still the only server (a project `.mcp.json` server does not load) and,
 * unlike `local` alone, the skills folder of HT-11 loads too (reports/ht11-skills-dry3.json).
 */
export const CLAUDE_CONNECTOR_ARGS: readonly string[] = ['--setting-sources', 'local,project', '--disable-slash-commands']

/**
 * Background features of the CLI that spend or remember on the person's behalf. Each was proven dry to change neither the
 * model list, the login nor the MCP set. NOT here: `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` (shrinks the model catalog 13 → 5,
 * can break an alias) and `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` (could affect a task that backgrounds a shell): both wait for
 * the OPT-10b real experiment.
 */
export const CLAUDE_ISOLATION_ENV: Readonly<Record<string, string>> = {
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
  CLAUDE_CODE_DISABLE_AGENT_PROGRESS_SUMMARIES: '1',
  CLAUDE_CODE_DISABLE_ORG_MEMORY: '1',
}

const NOTHING: IsolationPlan = { level: 'none', notIsolated: [], launchArgs: [], env: {} }

/**
 * The mode in force.
 * @param env - Where `PERSONA_CLI_ENV` is read (default `process.env`).
 */
export function cliEnvMode(env: NodeJS.ProcessEnv = process.env): CliEnvMode {
  const value = env[CLI_ENV_SWITCH]
  return value === 'native' || value === 'answer-only' || value === 'needed' ? value : DEFAULT_CLI_ENV_MODE
}

/**
 * The isolation plan of one CLI for one kind of call.
 * @param cli - `claude` | `codex` | `opencode` | `cursor` (anything else is `none`).
 * @param options - `env`: where the switch is read (default `process.env`); `call`: with or without tools (default `task`, the
 *   widest); `productConfigRoot`: where the product keeps its empty CLI config directories (default under the OS temp dir).
 * @returns Level, what is not isolated, and how to launch.
 */
export function isolationPlan(
  cli: string,
  options: {
    readonly env?: NodeJS.ProcessEnv
    readonly call?: CallKind
    readonly productConfigRoot?: string
    /** ISO-5: proxy URLs of the account connectors this call needs (from the router, HT-10). Claude only, and only a call with tools that applies the plan. */
    readonly accountConnectors?: readonly string[]
    /**
     * HT-11: the product's folder of pointers to the person's skills (see `personal-skills.ts`), present only when the person turned the
     * option on AND it was proven for this CLI version. Claude only; `needed` mode; a call with tools.
     */
    readonly personalSkills?: string
  } = {},
): IsolationPlan {
  const mode = cliEnvMode(options.env ?? process.env)
  const call = options.call ?? 'task'
  // `answer-only` touches Claude's no-tools calls and nothing else; `needed` is every call of every supported CLI.
  const applies = mode === 'needed' || (mode === 'answer-only' && call === 'answer' && cli === 'claude')
  if (cli === 'codex') {
    // Codex is never changed (nothing safe to pass); it is `partial` only once the end state is on, and says what is not isolated.
    return mode === 'needed'
      ? {
        level: 'partial',
        notIsolated: [NOT_ISOLATED.mcp, NOT_ISOLATED.plugins, NOT_ISOLATED.hooks, NOT_ISOLATED.skills, NOT_ISOLATED.instructions],
        launchArgs: [],
        env: {},
      }
      : { ...NOTHING, notIsolated: [NOT_ISOLATED.mcp, NOT_ISOLATED.plugins, NOT_ISOLATED.hooks, NOT_ISOLATED.skills, NOT_ISOLATED.instructions] }
  }
  if (!applies) return { ...NOTHING, notIsolated: [NOT_ISOLATED.mcp, NOT_ISOLATED.skills, NOT_ISOLATED.settings] }
  if (cli === 'claude') {
    const urls = [...new Set((options.accountConnectors ?? []).filter(url => url !== ''))]
    // HT-11: the person's own skills, by the person's option, and only for a call that can use them (with tools, end-state mode).
    const skills = options.personalSkills !== undefined && options.personalSkills !== '' && mode === 'needed' && call === 'task' ? options.personalSkills : undefined
    const withSkills = (args: readonly string[]): readonly string[] => skills === undefined ? args : [...args.filter(arg => arg !== '--disable-slash-commands'), '--add-dir', skills]
    const optIn = skills === undefined ? {} : { personalSkills: true }
    if (urls.length > 0 && call === 'task') {
      return {
        level: 'full', notIsolated: [], launchArgs: withSkills(CLAUDE_CONNECTOR_ARGS), env: { ...CLAUDE_ISOLATION_ENV },
        settings: { allowedMcpServers: urls.map(serverUrl => ({ serverUrl })) }, accountConnectors: urls.length, ...optIn,
      }
    }
    return { level: 'full', notIsolated: [], launchArgs: withSkills(CLAUDE_ISOLATION_ARGS), env: { ...CLAUDE_ISOLATION_ENV }, ...optIn }
  }
  if (cli === 'opencode') {
    const dir = join(options.productConfigRoot ?? join(tmpdir(), 'persona-cli-env'), 'opencode-config')
    return { level: 'full', notIsolated: [], launchArgs: [], env: { XDG_CONFIG_HOME: dir }, ensureDir: dir }
  }
  return { ...NOTHING, notIsolated: [NOT_ISOLATED.mcp, NOT_ISOLATED.settings] }
}

/**
 * Port for the host (Anvil): the level the product delivers NOW for a CLI, for a call WITH tools (the widest).
 * @param cli - CLI id.
 * @param env - Environment (default `process.env`).
 */
export function cliIsolation(cli: string, env?: NodeJS.ProcessEnv): IsolationLevel {
  return isolationPlan(cli, env === undefined ? {} : { env }).level
}

/**
 * Port for the host/screen: level plus the codes of what is NOT isolated, so the screen never claims more than exists.
 * @param cli - CLI id.
 * @param env - Environment (default `process.env`).
 */
export function cliIsolationReport(cli: string, env?: NodeJS.ProcessEnv): IsolationReport {
  const { level, notIsolated } = isolationPlan(cli, env === undefined ? {} : { env })
  return { level, notIsolated }
}

/** How a tool the persona is about to use can be stopped for the person's preview card. */
export type PreviewSupport = 'hook' | 'unconfirmed' | 'none'

/**
 * HT-12: what the product can truthfully say about one CLI on the screen. A promise the runner cannot keep is worse than a limit stated:
 * Codex has everything of the person already loaded and no filter for it; its tool-permission interception is not CONFIRMED by a run yet.
 */
export interface CliCapabilityReport extends IsolationReport {
  /**
   * How the person's connectors reach a call: `selected` = only the ones the request needs are loaded (Claude, end-state mode), `all-loaded` =
   * everything the person has is already there and cannot be filtered, `none` = none (the CLI runs with an empty config; only the product's tools).
   */
  readonly connectors: 'selected' | 'all-loaded' | 'none'
  /** The person's own skills: `optional` = loaded only if the person turned the option on (HT-11), `all-loaded`, or `none`. */
  readonly skills: 'optional' | 'all-loaded' | 'none'
  /** Can the product hold a guarded tool until the person decides (HT-8/9)? `hook` = proven on the real CLI; `unconfirmed` = not proven yet; `none` = no known way. */
  readonly permissionPreview: PreviewSupport
}

/**
 * Port for the screen (HT-12): isolation level, what is not isolated, and how connectors, skills and the permission preview behave for one CLI.
 * @param cli - CLI id.
 * @param env - Environment (default `process.env`).
 */
export function cliCapabilityReport(cli: string, env?: NodeJS.ProcessEnv): CliCapabilityReport {
  const { level, notIsolated } = isolationPlan(cli, env === undefined ? {} : { env })
  const needed = cliEnvMode(env ?? process.env) === 'needed'
  if (cli === 'claude') {
    return { level, notIsolated, connectors: needed ? 'selected' : 'all-loaded', skills: needed ? 'optional' : 'all-loaded', permissionPreview: 'hook' }
  }
  if (cli === 'opencode') {
    return { level, notIsolated, connectors: level === 'full' ? 'none' : 'all-loaded', skills: level === 'full' ? 'none' : 'all-loaded', permissionPreview: 'unconfirmed' }
  }
  if (cli === 'codex') {
    // Codex has a hook engine (pre_tool_use, permission_request; seen in codex-cli 0.166.0) but no run has proven the interception yet.
    return { level, notIsolated, connectors: 'all-loaded', skills: 'all-loaded', permissionPreview: 'unconfirmed' }
  }
  return { level, notIsolated, connectors: 'all-loaded', skills: 'all-loaded', permissionPreview: 'none' }
}

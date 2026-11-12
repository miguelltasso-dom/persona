import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { PACKAGE_ROOT } from './paths.ts'

const FAKE_CLI_DIR = join(PACKAGE_ROOT, 'fixtures', 'fake-cli')

export interface FakeCliOptions {
  /** Configurable turn latency delay in milliseconds (env `FAKE_CLI_TURN_MS`). */
  readonly turnMs?: number
  /** Configurable turn failure simulation (env `FAKE_CLI_FAIL`). */
  readonly fail?: string | boolean
  /** Configurable assistant reply text (env `FAKE_CLI_REPLY`). */
  readonly reply?: string
  /** The reply of model turn N is element N, the last repeats (env `FAKE_CLI_REPLIES`, a JSON array): script a whole conversation. */
  readonly replies?: readonly string[]
  /** The FIRST rule whose regex matches the text of the user turn decides the reply (env `FAKE_CLI_RULES`): content-based, independent of the turn number. */
  readonly rules?: readonly { readonly match: string; readonly reply: string; /** What the model says BETWEEN its tool calls before the final `reply` (each is emitted as a text block + a tool call + the result). */ readonly narration?: readonly string[] }[]
  /**
   * Content-based writes (env `FAKE_CLI_WRITE_RULES`): the turn whose prompt matches writes `file` (relative, in the working directory). `fillIn: true` plays the model that does not find a file
   * its prompt tells it about and MAKES ONE: it writes only when the file is missing, and the log says `recreated: true` (P0-1: the file was not shared).
   */
  readonly writeRules?: readonly { readonly match: string; readonly file: string; readonly content?: string; readonly fillIn?: boolean }[]
  /**
   * The stub as a SCRIPTED model (env `FAKE_CLI_TOOL_CALLS`): when the prompt matches, call these tools of the product (`pass_forward`, `ask_colleague`…) through the MCP server the CLI was
   * given, in order, after the turn's writes. `once` runs the rule in its first matching turn only. Logged as `toolcall` events (ok + the first words of the answer).
   */
  readonly toolCalls?: readonly { readonly match: string; readonly once?: boolean; readonly calls: readonly { readonly tool: string; readonly args: Readonly<Record<string, unknown>> }[] }[]
  /** Log, once per stub process, the tools the CLI was offered with their descriptions (env `FAKE_CLI_TOOLS_PROBE=1`): the persona-facing text of the product. */
  readonly toolsProbe?: boolean
  /** During a turn, write this RELATIVE text file in the stub's working directory (the task draft): a real revision to review (env `FAKE_CLI_WRITE_FILE`). */
  readonly writeFile?: string
  /** Text of that file (env `FAKE_CLI_WRITE_CONTENT`). */
  readonly writeContent?: string
  /** ALSO write the same relative file in this absolute folder (the person's project) during the turn: a real conflict (env `FAKE_CLI_CONFLICT_DIR`). */
  readonly conflictDir?: string
  /** Text of the person's concurrent edit (env `FAKE_CLI_CONFLICT_CONTENT`). */
  readonly conflictContent?: string
  /**
   * ABSOLUTE path of a switch file (env `FAKE_CLI_FAIL_FILE`): while it EXISTS every turn fails (its text, when not empty, is the error message). The host's environment is fixed when
   * it starts, so this is how a test says "the first turn fails, the next one works": create the file, ask, delete the file, retry.
   */
  readonly failFile?: string
  /** Strings whose presence in the prompt of each turn is logged (env `FAKE_CLI_NEEDLES`, a JSON array): proof the WHOLE request reached the worker, never the prompt itself. */
  readonly needles?: readonly string[]
  /** Input tokens each stub turn REPORTS (env `FAKE_CLI_INPUT_TOKENS`, the stub's floor; default 120): a heavy round for the eval's token gate without a model. */
  readonly inputTokens?: number
  /**
   * Milliseconds between the steps of a turn (env `FAKE_CLI_STEP_MS`; default 0 = nothing changes): the `narration` of a matching rule (text + a tool call each) and the final reply are spread
   * over time, like a model that writes and calls tools DURING the turn, instead of all arriving at the end. It is what lets a test overlap two turns' streams (P1-02(b)).
   */
  readonly stepMs?: number
  /** ABSOLUTE path of a switch file (env `FAKE_CLI_AUTH_OUT_FILE`): WHILE it exists, the tools its text names (`codex`, `claude,codex`) answer the login probe "not logged in" — a CONFIRMED logout. */
  readonly authOutFile?: string
  /** ABSOLUTE path of a switch file (env `FAKE_CLI_AUTH_HANG_FILE`): WHILE it exists, the tools its text names never answer the login probe (it outlasts the probe's timeout): "não consegui conferir", never a logout. */
  readonly authHangFile?: string
}

const WRITE_ENVS = ['FAKE_CLI_RULES', 'FAKE_CLI_STEP_MS', 'FAKE_CLI_REPLIES', 'FAKE_CLI_WRITE_FILE', 'FAKE_CLI_WRITE_CONTENT', 'FAKE_CLI_WRITE_RULES', 'FAKE_CLI_TOOL_CALLS', 'FAKE_CLI_TOOLS_PROBE', 'FAKE_CLI_CONFLICT_DIR', 'FAKE_CLI_CONFLICT_CONTENT', 'FAKE_CLI_FAIL_FILE', 'FAKE_CLI_NEEDLES', 'FAKE_CLI_INPUT_TOKENS', 'FAKE_CLI_AUTH_OUT_FILE', 'FAKE_CLI_AUTH_HANG_FILE'] as const

/** One line of the stub's invocation log (`FAKE_CLI_LOG`). */
export interface FakeCliInvocation {
  readonly at: number
  /**
   * `invoke` = process started (probes, `--version`, sessions); `turn` = a user turn was answered; `write` = a file the stub wrote in its working directory; `toolcall` = a tool of the
   * product the scripted model called; `tools` = the tools the CLI was offered. (`string & {}` keeps the literals readable while a new event name never breaks a reader.)
   */
  readonly event: 'invoke' | 'turn' | 'write' | 'toolcall' | 'tools' | (string & {})
  /** `turn`/`write`/`toolcall`: which stub process (a warm session answers several turns) and which turn of it. */
  readonly proc?: number
  readonly seq?: number
  /** `turn` only: what the working directory held when the turn STARTED (path with `/`, size, SHA-256) and, for the files its prompt promises ("Anexos do pedido", "Arquivos:"), whether each was there. */
  readonly cwdFiles?: ReadonlyArray<{ readonly p: string; readonly s: number; readonly h: string | null }>
  readonly promptPaths?: ReadonlyArray<{ readonly p: string; readonly present: boolean }>
  /** `write`: the relative file, the SHA-256 of its content, and `recreated` when the stub wrote it because the file was missing (it was not shared). */
  readonly file?: string
  readonly sha?: string
  readonly recreated?: boolean
  /** `toolcall`: which tool, whether the product accepted the call, and the first words of its answer. */
  readonly toolName?: string
  readonly ok?: boolean
  readonly text?: string
  /** `tools`: the tools the CLI was offered, with the description the product wrote for the persona. */
  readonly tools?: ReadonlyArray<{ readonly name: string; readonly description: string }>
  readonly tool: string
  readonly argv: readonly string[]
  readonly pid: number
  readonly ppid: number
  /** `turn` only: number of image content blocks the CLI received (the stub never logs bytes). */
  readonly images?: number
  readonly imageTypes?: readonly string[]
  readonly imageSources?: readonly string[]
  /** `turn` only: an image file name that appeared in the prompt TEXT (the runner may hand the path instead of a block). */
  readonly imagePathInText?: string
  /** `turn` only (Claude stream-json): length of the text the CLI received as the user turn. */
  /** `turn` only (Claude stream-json): the working directory the CLI ran in (the Task's draft directory for a persona with a project folder). */
  readonly cwd?: string
  readonly promptChars?: number
  /** `turn` only: per configured needle (`FakeCliOptions.needles`), whether the prompt contained it. */
  readonly needles?: Readonly<Record<string, boolean>>
}

export interface FakeCliPathScope {
  /** Directory prepended to `PATH`. */
  readonly binDir: string
  /** Invocation log the stubs append to (`FAKE_CLI_LOG`); empty for {@link withNoEngineOnPath}. */
  readonly logFile: string
  /** Everything the app (or the test) ran through the stubs so far — proof the engine was really called. */
  invocations(): readonly FakeCliInvocation[]
  /** Restore the previous `PATH` and environment variables. */
  restore(): void
}

function readInvocations(logFile: string): readonly FakeCliInvocation[] {
  if (logFile === '' || !existsSync(logFile)) return []
  const parsed: FakeCliInvocation[] = []
  for (const line of readFileSync(logFile, 'utf8').split(/\r?\n/u)) {
    if (line.trim() === '') continue
    try {
      parsed.push(JSON.parse(line) as FakeCliInvocation)
    } catch {
      // A torn line from a killed process: ignore.
    }
  }
  return parsed
}

/**
 * OAR resolves each CLI from `OAR_<TOOL>_BIN` first and, without it, falls back to the real launcher in
 * `~/.local/bin`. Pinning the variable to the stub makes it impossible for a fake-CLI run to reach a real engine.
 */
const OAR_PINS: readonly (readonly [envVar: string, stub: string])[] = [
  ['OAR_CLAUDE_BIN', 'claude'],
  ['OAR_CODEX_BIN', 'codex'],
  ['OAR_OPENCODE_BIN', 'opencode'],
]

/** Stub path OAR can spawn on this platform (`.cmd` launcher on Windows, `sh` script elsewhere). */
function stubPath(name: string): string {
  return join(FAKE_CLI_DIR, process.platform === 'win32' ? `${name}.cmd` : name)
}

/**
 * Make every engine invisible to child processes spawned after this call: a `PATH` with only Node and the OS
 * directories, OAR pins to a path that does not exist (so the `~/.local/bin` fallback is never tried) and no
 * DeepSeek key. Drives the "Falta uma IA" path deterministically on a machine that has real CLIs installed.
 * @returns Scope handle (`binDir` is empty) with a restore method.
 */
export function withNoEngineOnPath(): FakeCliPathScope {
  const previous = new Map<string, string | undefined>()
  const set = (name: string, value: string | undefined): void => {
    previous.set(name, process.env[name])
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows'
  const minimalPath = process.platform === 'win32'
    ? [dirname(process.execPath), join(systemRoot, 'System32'), systemRoot].join(delimiter)
    : [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter)
  set('PATH', minimalPath) // `process.env` is case-insensitive on Windows, so this also covers `Path`.
  for (const [envVar, stub] of OAR_PINS) set(envVar, join(FAKE_CLI_DIR, 'absent', stub))
  set('DEEPSEEK_API_KEY', undefined)
  set('PERSONA_E2E_EXTRA_PATH', undefined)
  return {
    binDir: '',
    logFile: '',
    invocations: () => [],
    restore: () => {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    },
  }
}

/**
 * The REAL engine (TEAM-10, tree host): touches nothing — the host finds the person's own logged-in `claude` the way the app does. It REFUSES to hand out a
 * "real" scope while any fake pin is still in the environment (`OAR_*_BIN`, the stub directory on `PATH`, `FAKE_CLI_LOG`, `PERSONA_E2E_EXTRA_PATH`): a real round
 * that silently reached a stub would look green and prove nothing.
 * @returns Inert scope (`binDir`/`logFile` empty, no invocations).
 */
export function withRealEngine(): FakeCliPathScope {
  const leaks = [...OAR_PINS.map(([name]) => name), 'FAKE_CLI_LOG', 'PERSONA_E2E_EXTRA_PATH', 'FAKE_CLI_TURN_MS', 'FAKE_CLI_FAIL', 'FAKE_CLI_FAIL_FILE', 'FAKE_CLI_NEEDLES', 'FAKE_CLI_REPLY'].filter(name => (process.env[name] ?? '') !== '')
  if ((process.env.PATH ?? '').split(delimiter).some(entry => entry === FAKE_CLI_DIR)) leaks.push('PATH (stub directory)')
  if (leaks.length > 0) throw new Error(`a real-engine session cannot start with fake CLI pins in the environment: ${leaks.join(', ')}`)
  return { binDir: '', logFile: '', invocations: () => [], restore: () => {} }
}

/**
 * Prepend fake CLI stubs (`claude`, `codex`, `opencode`, `cursor-agent`) to `PATH` and pin the OAR binaries to them.
 * @param options - Optional latency, failure and reply overrides.
 * @returns Scope handle with restore method.
 */
export function withFakeCliOnPath(options?: FakeCliOptions): FakeCliPathScope {
  const previousPath = process.env.PATH ?? ''
  const previousTurnMs = process.env.FAKE_CLI_TURN_MS
  const previousFail = process.env.FAKE_CLI_FAIL
  const previousReply = process.env.FAKE_CLI_REPLY
  const previousWrites = WRITE_ENVS.map(name => [name, process.env[name]] as const)
  const previousExtraPath = process.env.PERSONA_E2E_EXTRA_PATH
  const previousPins = OAR_PINS.map(([envVar]) => [envVar, process.env[envVar]] as const)
  const previousLog = process.env.FAKE_CLI_LOG
  const logDir = mkdtempSync(join(tmpdir(), 'persona-fake-cli-'))
  const logFile = join(logDir, 'invocations.jsonl')
  appendFileSync(logFile, '')
  process.env.FAKE_CLI_LOG = logFile

  for (const [envVar, stub] of OAR_PINS) process.env[envVar] = stubPath(stub)
  process.env.PATH = `${FAKE_CLI_DIR}${delimiter}${previousPath}`
  // The installed desktop prefixes this after its login-shell merge, which would otherwise replace `PATH`.
  process.env.PERSONA_E2E_EXTRA_PATH = previousExtraPath === undefined || previousExtraPath === ''
    ? FAKE_CLI_DIR
    : `${FAKE_CLI_DIR}${delimiter}${previousExtraPath}`

  if (options?.turnMs !== undefined) {
    process.env.FAKE_CLI_TURN_MS = String(options.turnMs)
  }
  if (options?.fail !== undefined) {
    process.env.FAKE_CLI_FAIL = typeof options.fail === 'boolean' ? (options.fail ? '1' : '0') : options.fail
  }
  if (options?.replies !== undefined) process.env.FAKE_CLI_REPLIES = JSON.stringify(options.replies)
  if (options?.rules !== undefined) process.env.FAKE_CLI_RULES = JSON.stringify(options.rules)
  if (options?.writeRules !== undefined) process.env.FAKE_CLI_WRITE_RULES = JSON.stringify(options.writeRules)
  if (options?.toolCalls !== undefined) process.env.FAKE_CLI_TOOL_CALLS = JSON.stringify(options.toolCalls)
  if (options?.toolsProbe === true) process.env.FAKE_CLI_TOOLS_PROBE = '1'
  if (options?.writeFile !== undefined) process.env.FAKE_CLI_WRITE_FILE = options.writeFile
  if (options?.writeContent !== undefined) process.env.FAKE_CLI_WRITE_CONTENT = options.writeContent
  if (options?.conflictDir !== undefined) process.env.FAKE_CLI_CONFLICT_DIR = options.conflictDir
  if (options?.conflictContent !== undefined) process.env.FAKE_CLI_CONFLICT_CONTENT = options.conflictContent
  if (options?.failFile !== undefined) process.env.FAKE_CLI_FAIL_FILE = options.failFile
  if (options?.needles !== undefined) process.env.FAKE_CLI_NEEDLES = JSON.stringify(options.needles)
  if (options?.inputTokens !== undefined) process.env.FAKE_CLI_INPUT_TOKENS = String(options.inputTokens)
  if (options?.stepMs !== undefined) process.env.FAKE_CLI_STEP_MS = String(options.stepMs)
  if (options?.authOutFile !== undefined) process.env.FAKE_CLI_AUTH_OUT_FILE = options.authOutFile
  if (options?.authHangFile !== undefined) process.env.FAKE_CLI_AUTH_HANG_FILE = options.authHangFile
  if (options?.reply !== undefined) {
    process.env.FAKE_CLI_REPLY = options.reply
  }

  return {
    binDir: FAKE_CLI_DIR,
    logFile,
    invocations: () => readInvocations(logFile),
    restore: () => {
      if (previousLog !== undefined) process.env.FAKE_CLI_LOG = previousLog
      else delete process.env.FAKE_CLI_LOG
      if (process.env.FAKE_CLI_KEEP_LOG !== '1') rmSync(logDir, { recursive: true, force: true })
      process.env.PATH = previousPath
      if (previousTurnMs !== undefined) process.env.FAKE_CLI_TURN_MS = previousTurnMs
      else delete process.env.FAKE_CLI_TURN_MS
      if (previousFail !== undefined) process.env.FAKE_CLI_FAIL = previousFail
      else delete process.env.FAKE_CLI_FAIL
      if (previousReply !== undefined) process.env.FAKE_CLI_REPLY = previousReply
      else delete process.env.FAKE_CLI_REPLY
      for (const [name, value] of previousWrites) {
        if (value !== undefined) process.env[name] = value
        else delete process.env[name]
      }
      if (previousExtraPath !== undefined) process.env.PERSONA_E2E_EXTRA_PATH = previousExtraPath
      else delete process.env.PERSONA_E2E_EXTRA_PATH
      for (const [envVar, previous] of previousPins) {
        if (previous !== undefined) process.env[envVar] = previous
        else delete process.env[envVar]
      }
    },
  }
}

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
}

/** One line of the stub's invocation log (`FAKE_CLI_LOG`). */
export interface FakeCliInvocation {
  readonly at: number
  /** `invoke` = process started (probes, `--version`, sessions); `turn` = a user turn was answered. */
  readonly event: 'invoke' | 'turn'
  readonly tool: string
  readonly argv: readonly string[]
  readonly pid: number
  readonly ppid: number
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
 * Prepend fake CLI stubs (`claude`, `codex`, `opencode`, `cursor-agent`) to `PATH` and pin the OAR binaries to them.
 * @param options - Optional latency, failure and reply overrides.
 * @returns Scope handle with restore method.
 */
export function withFakeCliOnPath(options?: FakeCliOptions): FakeCliPathScope {
  const previousPath = process.env.PATH ?? ''
  const previousTurnMs = process.env.FAKE_CLI_TURN_MS
  const previousFail = process.env.FAKE_CLI_FAIL
  const previousReply = process.env.FAKE_CLI_REPLY
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
      if (previousExtraPath !== undefined) process.env.PERSONA_E2E_EXTRA_PATH = previousExtraPath
      else delete process.env.PERSONA_E2E_EXTRA_PATH
      for (const [envVar, previous] of previousPins) {
        if (previous !== undefined) process.env[envVar] = previous
        else delete process.env[envVar]
      }
    },
  }
}

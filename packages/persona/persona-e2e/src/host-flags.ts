/**
 * The four v1.1 switches of the host as the INSTALLED app reports them at boot (TEAM-15, Anvil 05/11): outside Vitest the host writes to its stderr/log
 * `[persona-host] flags teamwork=1 fanout=1 startOnBoardMove=1 productTools=1 defaults=production`. Reading that line from an exe launched WITHOUT any flag variable is
 * the proof that the app came up with the team functions ON (`contracts/flags-defaults.md`). Pure parsing plus a small reader of the run's log files.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface HostFlags {
  readonly teamwork: boolean
  readonly fanout: boolean
  readonly startOnBoardMove: boolean
  readonly productTools: boolean
  /** `production` (the app's own defaults) or `test` (a host that inherited Vitest). */
  readonly defaults: string
}

const FLAGS_LINE = /\[persona-host\] flags teamwork=([01]) fanout=([01]) startOnBoardMove=([01]) productTools=([01]) defaults=(\w+)/u

/** @returns The flags of the LAST boot line in `text`, or `undefined` when there is none (an exe older than TEAM-15 never prints it). */
export function parseHostFlags(text: string): HostFlags | undefined {
  let found: RegExpExecArray | null = null
  for (const match of text.matchAll(new RegExp(FLAGS_LINE.source, 'gu'))) found = match
  if (found === null) return undefined
  return {
    teamwork: found[1] === '1',
    fanout: found[2] === '1',
    startOnBoardMove: found[3] === '1',
    productTools: found[4] === '1',
    defaults: found[5] ?? 'unknown',
  }
}

/** All four team functions ON with the app's own (production) defaults. */
export function v11FlagsOn(flags: HostFlags | undefined): boolean {
  return flags !== undefined && flags.teamwork && flags.fanout && flags.startOnBoardMove && flags.productTools && flags.defaults === 'production'
}

/**
 * @param processOutput - stdout/stderr the exe printed (the harness keeps it).
 * @param home - `PERSONA_HOME` of the run: its `logs/` folder is read too (the host may log there instead).
 * @returns The flags, or `undefined` when no boot line was found anywhere.
 */
export function readHostFlags(processOutput: string, home: string): HostFlags | undefined {
  const fromOutput = parseHostFlags(processOutput)
  if (fromOutput !== undefined) return fromOutput
  const logs = join(home, 'logs')
  if (!existsSync(logs)) return undefined
  for (const name of readdirSync(logs).sort().reverse()) {
    try {
      const flags = parseHostFlags(readFileSync(join(logs, name), 'utf8'))
      if (flags !== undefined) return flags
    } catch { /* unreadable log: try the next */ }
  }
  return undefined
}

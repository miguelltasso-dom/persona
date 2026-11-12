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

/** D-113: the five surfaces under construction as the host resolved them at boot (`[persona-host] surfaces invite=0 station=0 channels=0 skillImport=0 sharedBrowser=1 defaults=production`). */
export interface HostSurfaces {
  readonly invite: boolean
  readonly station: boolean
  readonly channels: boolean
  readonly skillImport: boolean
  readonly sharedBrowser: boolean
  readonly defaults: string
}

const SURFACES_LINE = /\[persona-host\] surfaces invite=([01]) station=([01]) channels=([01]) skillImport=([01]) sharedBrowser=([01]) defaults=(\w+)/u

/** @returns The surfaces of the LAST boot line in `text`, or `undefined` when there is none (a host older than D-113 never prints it). */
export function parseHostSurfaces(text: string): HostSurfaces | undefined {
  let found: RegExpExecArray | null = null
  for (const match of text.matchAll(new RegExp(SURFACES_LINE.source, 'gu'))) found = match
  if (found === null) return undefined
  return {
    invite: found[1] === '1', station: found[2] === '1', channels: found[3] === '1', skillImport: found[4] === '1', sharedBrowser: found[5] === '1', defaults: found[6] ?? 'unknown',
  }
}

/**
 * @param processOutput - stdout/stderr the host printed (the harness keeps it).
 * @param home - `PERSONA_HOME` of the run: its `logs/` folder is read too.
 * @returns The surfaces, or `undefined` when no boot line was found anywhere.
 */
export function readHostSurfaces(processOutput: string, home: string): HostSurfaces | undefined {
  const fromOutput = parseHostSurfaces(processOutput)
  if (fromOutput !== undefined) return fromOutput
  const logs = join(home, 'logs')
  if (!existsSync(logs)) return undefined
  for (const name of readdirSync(logs).sort().reverse()) {
    try {
      const surfaces = parseHostSurfaces(readFileSync(join(logs, name), 'utf8'))
      if (surfaces !== undefined) return surfaces
    } catch { /* unreadable log: try the next */ }
  }
  return undefined
}

/**
 * The product's default (D-113, Keel 12/11): the team has to work with the surfaces under construction OFF (invite, station, channels, skillImport) and the shared browser as the product ships it. Pure.
 * @param surfaces - What the boot line said (`undefined` = no line).
 * @param sharedBrowser - `on`/`off` demand that state; `any` only records it (until the product's default for it is decided).
 * @returns Why the run does NOT prove the product's default (empty = it does).
 */
export function surfacesProblems(surfaces: HostSurfaces | undefined, sharedBrowser: 'on' | 'off' | 'any' = 'any'): string[] {
  if (surfaces === undefined) return ['the host boot line `[persona-host] surfaces …` was not found: the run does not say which surfaces were on']
  const out: string[] = []
  if (surfaces.defaults !== 'production') out.push(`the surfaces resolved with defaults=${surfaces.defaults}, not the product's (production): a host that inherited Vitest has them all ON`)
  for (const name of ['invite', 'station', 'channels', 'skillImport'] as const) {
    if (surfaces[name]) out.push(`${name} is ON: the product ships it OFF (D-113), so the run does not prove the team works without it`)
  }
  if (sharedBrowser === 'on' && !surfaces.sharedBrowser) out.push('sharedBrowser is OFF but the run was asked to prove it ON')
  if (sharedBrowser === 'off' && surfaces.sharedBrowser) out.push('sharedBrowser is ON but the run was asked to prove it OFF')
  return out
}

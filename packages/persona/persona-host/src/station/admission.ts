/**
 * COLHEITA 24 (Carbon §1.3): a dedicated station admits work by RAM, never by hope. Before it accepts one more simultaneous
 * turn it measures what is free, keeps a safe floor and the cost of one CLI, and closes idle warm CLIs (least recently used
 * first) before refusing. A refusal is a calm queue ("sem vaga"), never an error in the person's face.
 *
 * Pure: the caller measures the machine and kills what this returns.
 */

/** What the station never lets go: the operating system and the app itself. */
export const RAM_FLOOR_BYTES = 1.5 * 1024 ** 3
/** What one live CLI costs, measured on the station (Node + the CLI + its tools). */
export const RAM_PER_CLI_BYTES = 600 * 1024 ** 2

/** One live CLI the station could close. */
export interface WarmCli {
  readonly id: string
  /** When it last did anything; the oldest idle one goes first. */
  readonly idleSince: number
}

/** What the station knows when a turn asks for a slot. */
export interface AdmissionInput {
  /** Free memory right now (`os.freemem()`). */
  readonly freeBytes: number
  /** The warm CLIs alive right now. */
  readonly running: readonly WarmCli[]
  /** Clock. */
  readonly now: number
  /** How many turns are asking at once; default 1. */
  readonly asking?: number
}

/** The answer: go (closing these first), or wait. */
export type Admission =
  | { readonly ok: true; readonly evict: readonly string[] }
  | { readonly ok: false; readonly reason: 'sem-vaga'; readonly evict: readonly string[] }

/**
 * Decide whether one more turn fits.
 * @param input - Free memory, the warm CLIs and how many turns ask.
 * @returns Whether it fits, and which idle CLIs to close first (oldest idle first).
 */
export function admit(input: AdmissionInput): Admission {
  const asking = Math.max(1, input.asking ?? 1)
  const needed = RAM_FLOOR_BYTES + RAM_PER_CLI_BYTES * (input.running.length + asking)
  if (input.freeBytes >= needed) return { ok: true, evict: [] }
  // Close idle warm CLIs, least recently used first, until the new turn fits.
  const idle = [...input.running].sort((left, right) => left.idleSince - right.idleSince)
  const evict: string[] = []
  let free = input.freeBytes
  for (const cli of idle) {
    if (free >= needed) break
    evict.push(cli.id)
    free += RAM_PER_CLI_BYTES
  }
  if (free >= needed) return { ok: true, evict }
  // Closing everything still does not fit: do not kill anything for nothing, just wait.
  return { ok: false, reason: 'sem-vaga', evict: [] }
}

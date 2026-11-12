/**
 * boot-estatico (persona-spec/contracts/boot-estatico.md §6a): a TEST-ONLY delay of the Host child's `ready`.
 * The acceptance of the static shell is "the shell is visible in under 2.5 s while the Host is still starting",
 * and that needs a Host that is slow on purpose. `PERSONA_TEST_HOST_DELAY_MS=<ms>` holds the `ready` message
 * back by that long and does NOTHING else (no other phase of the boot moves, no request is answered
 * differently). Anything that is not a plain non-negative integer is ignored (so is a variable nobody set),
 * and the delay is capped, so a stray value in a real installation can neither stall the app for long nor
 * crash it.
 */

/** The environment variable a test sets to slow the Host's `ready`. */
export const TEST_HOST_DELAY_ENV = 'PERSONA_TEST_HOST_DELAY_MS'

/** The longest delay honored (the shell gives up on a Host that does not answer in 90 s). */
export const TEST_HOST_DELAY_MAX_MS = 120_000

/**
 * How long the `ready` must be held back.
 * @param env - The process environment.
 * @returns Milliseconds; 0 when the variable is absent or is not a plain integer (never negative, never above the cap).
 */
export function testHostDelayMs(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env[TEST_HOST_DELAY_ENV]?.trim()
  if (raw === undefined || !/^\d{1,7}$/u.test(raw)) return 0
  return Math.min(Number(raw), TEST_HOST_DELAY_MAX_MS)
}

/**
 * Hold the `ready` back when a test asked for it.
 * @param env - The process environment.
 * @param sleep - The wait (injectable: a test owns the clock).
 * @param note - Where the one line that says it is happening goes (default: stderr, the Host's diagnostic).
 * @returns The delay applied, in milliseconds (0 = none).
 */
export async function delayHostReadyForTest(
  env: Readonly<Record<string, string | undefined>>,
  sleep: (ms: number) => Promise<void> = ms => new Promise((resolve) => { setTimeout(resolve, ms) }),
  note: (line: string) => void = (line) => { process.stderr.write(`${line}\n`) },
): Promise<number> {
  const ms = testHostDelayMs(env)
  if (ms === 0) return 0
  note(`desktop host: ${TEST_HOST_DELAY_ENV}=${String(ms)} holds the ready back (test only)`)
  await sleep(ms)
  return ms
}

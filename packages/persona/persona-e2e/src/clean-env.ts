/**
 * The environment an INSTALLED `Persona.exe` is launched with (Forge/Keel, 04/11 21:11). Vitest puts `VITEST=true` (and `VITEST_*`,
 * `NODE_ENV=test`) in the environment of every test process; a child `Persona.exe` inherits it, and the product reads `VITEST` to stay FAKE:
 * `apps/desktop/src/product.ts` and `persona-host/src/runner.ts` choose the scripted fake runner (readiness forced "ready", a delivery
 * with 0 turns and the ledger signature engine `dsh`, 1 input / 1 output token), `index.ts` uses an in-memory database, and the connection
 * probe returns nothing. A harness that lets that through measures a different program — and a "real" run would NOT be real.
 */

/** Names the child must never inherit from a test process: they switch the product into its fake/scripted modes. */
const TEST_MODE_NAMES: readonly RegExp[] = [/^VITEST/iu, /^PERSONA_SCRIPTED/iu, /SCRIPTED_STREAM/iu]

/**
 * @param env - The test process environment (`process.env`).
 * @returns The same variables without anything that makes the product run its scripted fake; `NODE_ENV=test` is dropped too.
 */
export function cleanChildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(env)) {
    if (TEST_MODE_NAMES.some(pattern => pattern.test(name))) continue
    if (name.toUpperCase() === 'NODE_ENV' && value === 'test') continue
    clean[name] = value
  }
  return clean
}

/**
 * Fail-closed guard on the FINAL environment of the child (after the caller's own overrides).
 * @param env - What the child will really get.
 * @returns The offending names, empty when the environment is clean.
 */
export function testModeVariablesIn(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([name, value]) => TEST_MODE_NAMES.some(pattern => pattern.test(name)) || (name.toUpperCase() === 'NODE_ENV' && value === 'test'))
    .map(([name]) => name)
}

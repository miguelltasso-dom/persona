/**
 * Can every runner runtime LOAD in this process? (ENG-1)
 *
 * The installed H2 #3 app could detect its engines ("Pronta para usar") and still run none: `await import('@botiverse/oar')` threw
 * `does not provide an export named PI_ATTRIBUTION` (a dependency of the packaged runtime had drifted from the workspace lockfile),
 * which only the first real turn did, and the host turned it into a generic `engine_unavailable` with no spawn. The package
 * verifier runs this inside the packaged app's own node, so a runtime that cannot load fails the pack instead of the person.
 *
 * Same imports `loadRuntime` (resolve-runner.ts) does; nothing is started, no CLI is spawned, no network is touched.
 */

export type RuntimeImportName = 'oar' | 'claude' | 'codex' | 'opencode' | 'cursor-sdk'

export interface RuntimeImportCheck {
  runtime: RuntimeImportName
  ok: boolean
  /** `Name: message` of the first failure, clipped; never a path to the person's data. */
  error?: string
}

function describe(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return text.replace(/\s+/gu, ' ').slice(0, 300)
}

/** Runtimes `loadRuntime` resolves through `defaultRuntimes`. */
const OAR_RUNTIMES = ['claude', 'codex', 'opencode'] as const

/**
 * Load OAR and every runner runtime the product can use.
 * @returns one row per runtime, in a stable order; `oar` failing makes the others `not loaded`.
 */
export async function checkRuntimeImports(): Promise<RuntimeImportCheck[]> {
  const rows: RuntimeImportCheck[] = []
  let oar: typeof import('@botiverse/oar')
  try {
    oar = await import('@botiverse/oar')
    rows.push({ runtime: 'oar', ok: true })
  } catch (error) {
    rows.push({ runtime: 'oar', ok: false, error: describe(error) })
    for (const runtime of [...OAR_RUNTIMES, 'cursor-sdk'] as const) rows.push({ runtime, ok: false, error: 'not loaded: @botiverse/oar failed to import' })
    return rows
  }
  for (const runtime of OAR_RUNTIMES) {
    try {
      const found = oar.defaultRuntimes.get(runtime)
      if (found === undefined || typeof found.session !== 'function') throw new Error('runtime not registered')
      rows.push({ runtime, ok: true })
    } catch (error) {
      rows.push({ runtime, ok: false, error: describe(error) })
    }
  }
  try {
    await import('@cursor/sdk')
    oar.createCursorRuntime({ sdk: () => import('@cursor/sdk') })
    rows.push({ runtime: 'cursor-sdk', ok: true })
  } catch (error) {
    rows.push({ runtime: 'cursor-sdk', ok: false, error: describe(error) })
  }
  return rows
}

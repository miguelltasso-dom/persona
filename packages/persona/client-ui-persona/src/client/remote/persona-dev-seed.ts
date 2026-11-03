const DEV_SEED_STORAGE_KEY = 'persona.devSeed.v1'

/**
 * Dev-only roster seed (Probe/gates). Never enabled in shipped UI; set via harness
 * `PERSONA_DEV_SEED=1` → initScript writes {@link DEV_SEED_STORAGE_KEY}.
 */
export function readClientDevSeedEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(DEV_SEED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

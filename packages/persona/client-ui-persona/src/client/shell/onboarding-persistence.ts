const STORAGE_KEY = 'persona.onboarding.complete.v1'

/** Whether the first-run onboarding overlay should show (RCD: value before config). */
export function readOnboardingOpen(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1'
  } catch {
    return true
  }
}

/** Persist onboarding completion until host owns this flag. */
export function persistOnboardingComplete(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* private mode */
  }
}

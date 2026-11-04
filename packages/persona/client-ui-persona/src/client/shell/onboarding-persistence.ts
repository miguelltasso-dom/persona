const STORAGE_KEY = 'persona.onboarding.complete.v1'
const STEP_DRAFT_KEY = 'persona.onboarding.step.v1'

/** Optimistic cache: user finished step 5 in this browser (not authoritative vs host). */
export function readOnboardingCacheComplete(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Mark overlay complete locally until next `getOnboarding` refresh (optimistic). */
export function writeOnboardingCacheComplete(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* private mode */
  }
}

/** Resume onboarding at this step (1–5) until host marks complete. */
export function readOnboardingStepDraft(): 1 | 2 | 3 | 4 | 5 | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STEP_DRAFT_KEY)
    if (raw === null) return null
    const n = Number.parseInt(raw, 10)
    if (n >= 1 && n <= 5) return n as 1 | 2 | 3 | 4 | 5
    return null
  } catch {
    return null
  }
}

export function writeOnboardingStepDraft(step: 1 | 2 | 3 | 4 | 5): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STEP_DRAFT_KEY, String(step))
  } catch {
    /* private mode */
  }
}

export function clearOnboardingStepDraft(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STEP_DRAFT_KEY)
  } catch {
    /* private mode */
  }
}

/** @deprecated Use {@link readOnboardingCacheComplete} — host `getOnboarding` is authoritative. */
export function readOnboardingOpen(): boolean {
  return !readOnboardingCacheComplete()
}

/** @deprecated Use {@link writeOnboardingCacheComplete}. */
export function persistOnboardingComplete(): void {
  writeOnboardingCacheComplete()
}

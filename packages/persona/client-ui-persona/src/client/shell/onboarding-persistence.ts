const STORAGE_KEY = 'persona.onboarding.complete.v1'
const STEP_DRAFT_KEY = 'persona.onboarding.step.v1'
const DISPLAY_NAME_KEY = 'persona.onboarding.displayName.v1'

/**
 * The name the person typed in step 1 ("Como podemos te chamar?"). The member the app creates before the onboarding is called "Você" and the host keeps the first member it
 * sees, so the typed name is remembered here and the greeting uses it while the member still has the placeholder (Muse L8: "Olá, Miguel!").
 */
export function writeOnboardingDisplayName(name: string): void {
  if (typeof localStorage === 'undefined') return
  const trimmed = name.trim()
  if (trimmed === '') return
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, trimmed)
  } catch {
    /* private mode */
  }
}

/** @returns The name typed in step 1, or `undefined` when none was remembered. */
export function readOnboardingDisplayName(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const value = localStorage.getItem(DISPLAY_NAME_KEY)?.trim() ?? ''
    return value === '' ? undefined : value
  } catch {
    return undefined
  }
}

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

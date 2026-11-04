import type { BringProvider } from './bring-context-ui.ts'

const KEY = 'persona.onboarding.byc-draft.v1'

export interface OnboardingBycDraft {
  readonly bringPaste: string
  readonly bringProvider: BringProvider
  readonly vaultFolderPath: string | null
  readonly pasted: readonly { readonly id: string; readonly source: BringProvider; readonly text: string }[]
}

export function readOnboardingBycDraft(): OnboardingBycDraft | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null || raw === '') return null
    const parsed = JSON.parse(raw) as OnboardingBycDraft
    if (typeof parsed.bringPaste !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writeOnboardingBycDraft(draft: OnboardingBycDraft): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    /* quota or private mode */
  }
}

export function clearOnboardingBycDraft(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

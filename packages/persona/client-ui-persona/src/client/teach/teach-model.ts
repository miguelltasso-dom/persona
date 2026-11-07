/**
 * "Ensinar a persona" (W2-10) — pure model of the review that follows a recording.
 * The host builds a draft (numbered steps); the person edits it here and saves it as a CANDIDATE skill.
 * Nothing in this file enables a skill or widens tools: activation and sharing are separate, explicit calls.
 */
import type { TeachStepView } from '@deepseek-ai/dsh-persona-host/types'

/** A step while it is being edited (stable key so reordering keeps focus and text). */
export interface EditableStep {
  readonly key: string
  readonly instruction: string
  readonly verifyHint: string
  /** `file:` reference of the key frame, when the desktop kept one. */
  readonly thumbnailRef: string
}

/** Most steps a draft can hold; a longer one is a sign the recording is too long to review. */
export const TEACH_MAX_STEPS = 40
export const TEACH_MAX_INSTRUCTION = 600

let counter = 0
function nextKey(): string {
  counter += 1
  return `step-${counter}`
}

/** Host draft → editable rows, in the host's order. */
export function stepsFromDraft(steps: readonly TeachStepView[]): readonly EditableStep[] {
  return [...steps]
    .sort((a, b) => a.order - b.order)
    .slice(0, TEACH_MAX_STEPS)
    .map(step => ({
      key: nextKey(),
      instruction: step.instruction,
      verifyHint: step.verifyHint ?? '',
      thumbnailRef: step.thumbnailAssetId ?? '',
    }))
}

/** Editable rows → what the host saves: trimmed, empty steps dropped, renumbered 1..n. */
export function stepsToWire(steps: readonly EditableStep[]): readonly TeachStepView[] {
  return steps
    .map(step => ({ ...step, instruction: step.instruction.trim(), verifyHint: step.verifyHint.trim() }))
    .filter(step => step.instruction.length > 0)
    .map((step, index) => ({
      order: index + 1,
      instruction: step.instruction.slice(0, TEACH_MAX_INSTRUCTION),
      ...(step.verifyHint === '' ? {} : { verifyHint: step.verifyHint }),
      ...(step.thumbnailRef === '' ? {} : { thumbnailAssetId: step.thumbnailRef }),
    }))
}

export function addStep(steps: readonly EditableStep[]): readonly EditableStep[] {
  if (steps.length >= TEACH_MAX_STEPS) return steps
  return [...steps, { key: nextKey(), instruction: '', verifyHint: '', thumbnailRef: '' }]
}

export function removeStep(steps: readonly EditableStep[], key: string): readonly EditableStep[] {
  return steps.filter(step => step.key !== key)
}

export function moveStep(steps: readonly EditableStep[], key: string, direction: -1 | 1): readonly EditableStep[] {
  const from = steps.findIndex(step => step.key === key)
  const to = from + direction
  if (from < 0 || to < 0 || to >= steps.length) return steps
  const next = [...steps]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return steps
  next.splice(to, 0, moved)
  return next
}

export function updateStep(
  steps: readonly EditableStep[],
  key: string,
  patch: Partial<Pick<EditableStep, 'instruction' | 'verifyHint' | 'thumbnailRef'>>,
): readonly EditableStep[] {
  return steps.map(step => (step.key === key ? { ...step, ...patch } : step))
}

export const SKILL_NAME_MAX = 80
const SKILL_NAME_SUGGEST_MAX = 60

/** The host names a taught skill "Skill ensinada" until the person names it: that is a placeholder, not a name. */
export function isGenericSkillTitle(title: string): boolean {
  const text = title.trim().toLowerCase()
  return text === '' || text === 'skill ensinada'
}

/**
 * The name the field starts with, taken from what the person said (the narration), else from the first step: the first sentence,
 * without its ending punctuation, cut at a word. The person edits it; a name the host really gave is kept as it is.
 */
export function suggestSkillName(narration: string, steps: readonly { readonly instruction: string }[], hostTitle = ''): string {
  if (!isGenericSkillTitle(hostTitle)) return hostTitle.trim()
  const fromText = (text: string): string => {
    const first = text.trim().split(/(?<=[.!?])\s+|\n+/u)[0] ?? ''
    const clean = first.replace(/\s+/gu, ' ').replace(/[.!?…:;,\s]+$/u, '').trim()
    if (clean === '') return ''
    const cut = clean.length <= SKILL_NAME_SUGGEST_MAX ? clean : clean.slice(0, SKILL_NAME_SUGGEST_MAX).replace(/\s+\S*$/u, '').trim()
    return cut.charAt(0).toLocaleUpperCase('pt-BR') + cut.slice(1)
  }
  return fromText(narration) || fromText(steps.find(step => step.instruction.trim() !== '')?.instruction ?? '')
}

/** At least one step with words. An empty list can still be saved as a thought, but a candidate needs a step. */
export function canSaveCandidate(steps: readonly EditableStep[]): boolean {
  return steps.some(step => step.instruction.trim().length > 0)
}

/** How many rows the person left blank (they are dropped on save; say so instead of silently losing them). */
export function blankStepCount(steps: readonly EditableStep[]): number {
  return steps.filter(step => step.instruction.trim().length === 0).length
}

/**
 * The renderer can only show images the page is allowed to load. A `file:` reference to the private teach folder is
 * shown when the desktop lets it through; anything else (or a redacted frame) means "no thumbnail".
 */
export function thumbnailSrc(ref: string): string | undefined {
  if (ref === '' || ref === 'redacted') return undefined
  return /^(?:file|data|blob|https?):/u.test(ref) ? ref : undefined
}

/** Host error → one of the few things the person can act on (the code stays out of the sentence). */
export type TeachFailure = 'tools' | 'consent' | 'notFound' | 'forbidden' | 'generic'

export function teachFailureKind(error: unknown): TeachFailure {
  const text = `${typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : ''} ${error instanceof Error ? error.message : ''}`.toLowerCase()
  if (text.includes('access_escalation') || text.includes('escalation')) return 'tools'
  if (text.includes('consent')) return 'consent'
  if (text.includes('not-found') || text.includes('not_found')) return 'notFound'
  if (text.includes('forbidden')) return 'forbidden'
  return 'generic'
}

/** Where a taught skill can be used. `persona` is where it is born; the others need an explicit confirmation. */
export type TeachShareScope = 'persona' | 'project' | 'team'

/** The person's choice at the end of the flow. */
export type TeachOutcome = 'candidate' | 'active'

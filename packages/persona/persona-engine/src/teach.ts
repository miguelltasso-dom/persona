/**
 * Demonstration → candidate skill (WAVE2 §2). Vision is a port; fake is the default.
 * Never enables the skill. Never expands tools beyond the caller's allow-list.
 */

import { DomainError, publishSkill, type SkillRecord, type SkillScope } from '@deepseek-ai/dsh-persona-core'

export interface TeachFrame {
  readonly atMs: number
  readonly imageRef: string
  readonly changeScore: number
}

export interface TeachTranscriptSlice {
  readonly atMs: number
  readonly untilMs: number
  readonly text: string
}

export interface TeachStepDraft {
  readonly order: number
  readonly title: string
  readonly instruction: string
  readonly verify: string
  readonly thumbnailRef: string
  readonly tools: readonly string[]
}

export interface VisionDescribe {
  readonly title: string
  readonly instruction: string
  readonly verify: string
  readonly tools: readonly string[]
}

export interface VisionPort {
  /**
   * @param frame - Key frame (local image ref).
   * @param narration - Transcript slice around the frame.
   */
  describe(frame: TeachFrame, narration: string): Promise<VisionDescribe>
}

export interface TaughtSkillDraft {
  readonly skill: SkillRecord
  readonly steps: readonly TeachStepDraft[]
  readonly local: true
}

/** Overlay copy id. Host/UI must show this version before capture. */
export const TEACH_CONSENT_VERSION = 'teach-v1'

/** Local artifact lifetime (Anvil/Rivet apply the delete). */
export const TEACH_RETENTION_DAYS = 30

/**
 * Start requires the same consent id the overlay showed.
 * @param version - `consentVersion` from startTeachSession.
 */
export function assertTeachConsent(version: string): void {
  if (version.trim() !== TEACH_CONSENT_VERSION) {
    throw new DomainError('INVALID_TEACH', 'CONSENT')
  }
}

/**
 * @param startedAt - ISO start of the recording.
 * @param days - Retention window.
 * @returns Expiry instant.
 */
export function teachRetentionExpiresAt(
  startedAt: string,
  days: number = TEACH_RETENTION_DAYS,
): string {
  const ms = Date.parse(startedAt)
  if (!Number.isFinite(ms) || days < 1) throw new DomainError('INVALID_TEACH', 'RETENTION')
  return new Date(ms + days * 86_400_000).toISOString()
}

/**
 * Anvil/Rivet delete the local artifact when this is true.
 * @param startedAt - ISO start.
 * @param now - Clock.
 * @param days - Retention window.
 * @returns True on or after the expiry instant.
 */
export function teachShouldPurge(
  startedAt: string,
  now: string,
  days: number = TEACH_RETENTION_DAYS,
): boolean {
  const start = Date.parse(startedAt)
  const at = Date.parse(now)
  if (!Number.isFinite(start) || !Number.isFinite(at) || days < 1) {
    throw new DomainError('INVALID_TEACH', 'RETENTION')
  }
  return at >= start + days * 86_400_000
}

export interface TeachArtifactStamp {
  readonly id: string
  readonly startedAt: string
}

/**
 * @param artifacts - Local teach sessions.
 * @param now - Clock.
 * @param days - Retention window.
 * @returns Ids Anvil/Rivet may delete.
 */
export function listTeachArtifactsToPurge(
  artifacts: readonly TeachArtifactStamp[],
  now: string,
  days: number = TEACH_RETENTION_DAYS,
): readonly string[] {
  return artifacts.filter(row => teachShouldPurge(row.startedAt, now, days)).map(row => row.id)
}

/**
 * Strip password / token material from typed narration (W2-10).
 * @param text - Transcript slice.
 * @returns Same text with secrets replaced.
 */
export function redactTeachNarration(text: string): string {
  return text
    .replace(/\b(senha|password|token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1: ••••')
    .replace(/\b(?:sk-|ghp_|xox[baprs]-)\S+/g, '••••')
}

/**
 * Drop frames the person marked to blur.
 * @param frames - Capture samples.
 * @param blurredRefs - imageRef values to omit.
 * @returns Frames that may enter the draft.
 */
export function omitBlurredTeachFrames(
  frames: readonly TeachFrame[],
  blurredRefs: readonly string[],
): TeachFrame[] {
  if (blurredRefs.length === 0) return [...frames]
  const skip = new Set(blurredRefs)
  return frames.filter(frame => !skip.has(frame.imageRef))
}

/**
 * Deterministic fake vision: titles from narration, no extra tools.
 * @returns Port that never asks for tools.
 */
export function fakeVisionPort(): VisionPort {
  return {
    async describe(frame, narration) {
      const line = narration.trim().split(/\n/).map(row => row.trim()).find(row => row !== '') ?? ''
      return {
        title: line.slice(0, 48) || `Passo em ${String(frame.atMs)}ms`,
        instruction: line || 'Observe a tela e repita a ação mostrada.',
        verify: 'Confira o resultado na tela antes do próximo passo.',
        tools: [],
      }
    },
  }
}

/**
 * Keep frames whose screen changed, plus the last frame.
 * @param frames - Ordered capture samples.
 * @param threshold - Inclusive change score (0..1).
 * @returns Frames that represent a screen change.
 */
export function sampleKeyFrames(
  frames: readonly TeachFrame[],
  threshold: number = 0.35,
): TeachFrame[] {
  if (frames.length === 0) return []
  const sampled: TeachFrame[] = []
  for (const frame of frames) {
    if (sampled.length === 0 || frame.changeScore >= threshold) sampled.push(frame)
  }
  const last = frames[frames.length - 1]
  if (last !== undefined && sampled[sampled.length - 1]?.imageRef !== last.imageRef) sampled.push(last)
  return sampled
}

function narrationAround(transcript: readonly TeachTranscriptSlice[], atMs: number): string {
  const hit = transcript.find(slice => slice.atMs <= atMs && atMs <= slice.untilMs)
  if (hit !== undefined) return hit.text
  let nearest: TeachTranscriptSlice | undefined
  let best = Infinity
  for (const slice of transcript) {
    const distance = Math.min(Math.abs(slice.atMs - atMs), Math.abs(slice.untilMs - atMs))
    if (distance < best) {
      best = distance
      nearest = slice
    }
  }
  return nearest?.text ?? ''
}

function intersectTools(requested: readonly string[], allowed: readonly string[]): string[] {
  const permit = new Set(allowed)
  return requested.filter(tool => permit.has(tool))
}

/**
 * Key frames + transcript → candidate skill. Stays local; `enabled: false`.
 * @param input - Trusted persona, frames, narration, allow-list, vision port.
 * @returns Candidate skill and numbered steps with thumbnails.
 */
export async function draftTaughtSkill(input: {
  readonly personaId: string
  readonly title: string
  readonly frames: readonly TeachFrame[]
  readonly transcript: readonly TeachTranscriptSlice[]
  readonly allowedTools: readonly string[]
  readonly vision: VisionPort
  readonly readyCriteria?: string
  readonly consentVersion?: string
  readonly blurredRefs?: readonly string[]
}): Promise<TaughtSkillDraft> {
  if (input.consentVersion !== undefined) assertTeachConsent(input.consentVersion)
  const title = input.title.trim()
  if (title === '') throw new DomainError('INVALID_TEACH', 'TITLE')
  if (input.frames.length === 0 && input.transcript.length === 0) {
    throw new DomainError('INVALID_TEACH', 'EMPTY')
  }
  const transcript = input.transcript.map(slice => ({
    ...slice,
    text: redactTeachNarration(slice.text),
  }))
  const frames = sampleKeyFrames(omitBlurredTeachFrames(input.frames, input.blurredRefs ?? []))
  const steps: TeachStepDraft[] = []
  if (frames.length === 0) {
    const text = transcript.map(slice => slice.text.trim()).filter(row => row !== '').join('\n')
    steps.push({
      order: 1,
      title,
      instruction: text || 'Siga a narração gravada.',
      verify: input.readyCriteria ?? 'Confira o resultado na tela.',
      thumbnailRef: '',
      tools: [],
    })
  } else {
    for (const [index, frame] of frames.entries()) {
      const described = await input.vision.describe(frame, narrationAround(transcript, frame.atMs))
      steps.push({
        order: index + 1,
        title: described.title.trim() || `Passo ${String(index + 1)}`,
        instruction: described.instruction.trim() || 'Observe a tela.',
        verify: described.verify.trim() || 'Confira o resultado.',
        thumbnailRef: frame.imageRef,
        tools: intersectTools(described.tools, input.allowedTools),
      })
    }
  }
  const ready = input.readyCriteria ?? 'Todos os passos conferidos na tela.'
  const body = [
    `# ${title}`,
    '',
    ...steps.map(step => [
      `## ${String(step.order)}. ${step.title}`,
      step.instruction,
      `Verificar: ${step.verify}`,
      step.thumbnailRef === '' ? undefined : `Miniatura: ${step.thumbnailRef}`,
      step.tools.length === 0 ? undefined : `Ferramentas: ${step.tools.join(', ')}`,
    ].filter((line): line is string => line !== undefined).join('\n')),
    '',
    `Pronto quando: ${ready}`,
  ].join('\n')
  return {
    local: true,
    steps,
    skill: {
      id: `taught-${input.personaId}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`,
      name: title.slice(0, 64),
      version: 1,
      scope: 'persona',
      origin: 'taught',
      body,
      enabled: false,
      personaId: input.personaId,
    },
  }
}

/**
 * Accept the draft into the library as a candidate. Never enables it.
 * @param draft - Output of {@link draftTaughtSkill}.
 */
export function acceptTaughtCandidate(draft: TaughtSkillDraft): SkillRecord {
  if (draft.skill.enabled) throw new DomainError('INVALID_TEACH', 'AUTO')
  if (draft.skill.scope !== 'persona') throw new DomainError('ACCESS_ESCALATION', 'TAUGHT_SCOPE')
  return { ...draft.skill, enabled: false, origin: 'taught' }
}

/**
 * Explicit activate after review. Tools in the steps cannot exceed `allowed`.
 * @param skill - Candidate.
 * @param allowedTools - Persona mandate.
 * @param stepTools - Union of draft step tools.
 */
export function activateTaughtSkill(
  skill: SkillRecord,
  allowedTools: readonly string[],
  stepTools: readonly string[],
): SkillRecord {
  if (skill.origin !== 'taught') throw new DomainError('INVALID_TEACH', 'ORIGIN')
  for (const name of stepTools) {
    if (!allowedTools.includes(name)) throw new DomainError('ACCESS_ESCALATION', 'TOOL')
  }
  return { ...skill, enabled: true }
}

/**
 * Taught skills stay persona-scoped unless the user explicitly promotes.
 * @param skill - Candidate or live taught skill.
 * @param scope - Requested scope.
 * @param explicit - Human confirmed promotion.
 */
export function publishTaughtSkill(
  skill: SkillRecord,
  scope: SkillScope,
  explicit: boolean,
): SkillRecord {
  if (skill.origin === 'taught' && scope !== 'persona' && !explicit) {
    throw new DomainError('ACCESS_ESCALATION', 'TAUGHT_NOT_PUBLIC')
  }
  return publishSkill({ ...skill, enabled: skill.enabled }, scope)
}

export interface TaughtStepEdit {
  readonly order: number
  readonly title?: string
  readonly instruction?: string
  readonly verify?: string
}

/**
 * Human edits the step list before accept. Skill stays disabled.
 * @param draft - Candidate draft.
 * @param edits - Fields to replace by `order`.
 * @returns New draft; tools never grow.
 */
export function editTaughtSteps(
  draft: TaughtSkillDraft,
  edits: readonly TaughtStepEdit[],
): TaughtSkillDraft {
  if (draft.skill.enabled) throw new DomainError('INVALID_TEACH', 'AUTO')
  const byOrder = new Map(edits.map(row => [row.order, row]))
  const steps = draft.steps.map((step) => {
    const edit = byOrder.get(step.order)
    if (edit === undefined) return step
    return {
      ...step,
      title: edit.title?.trim() || step.title,
      instruction: edit.instruction?.trim() || step.instruction,
      verify: edit.verify?.trim() || step.verify,
      tools: step.tools,
    }
  })
  const body = [
    `# ${draft.skill.name}`,
    '',
    ...steps.map(step => [
      `## ${String(step.order)}. ${step.title}`,
      step.instruction,
      `Verificar: ${step.verify}`,
      step.thumbnailRef === '' ? undefined : `Miniatura: ${step.thumbnailRef}`,
      step.tools.length === 0 ? undefined : `Ferramentas: ${step.tools.join(', ')}`,
    ].filter((line): line is string => line !== undefined).join('\n')),
    '',
    draft.skill.body.includes('Pronto quando:')
      ? draft.skill.body.slice(draft.skill.body.lastIndexOf('Pronto quando:'))
      : 'Pronto quando: Todos os passos conferidos na tela.',
  ].join('\n')
  return {
    local: true,
    steps,
    skill: { ...draft.skill, body, enabled: false, origin: 'taught' },
  }
}

/**
 * Turn an activated taught skill back off. Version still increases.
 * @param skill - Live taught skill.
 * @returns Disabled taught skill.
 */
export function rollbackTaughtSkill(skill: SkillRecord): SkillRecord {
  if (skill.origin !== 'taught') throw new DomainError('INVALID_TEACH', 'ORIGIN')
  return { ...skill, enabled: false, version: skill.version + 1 }
}

import { expect, it } from 'vitest'
import { publishSkill } from '@deepseek-ai/dsh-persona-core'
import {
  TEACH_CONSENT_VERSION,
  TEACH_RETENTION_DAYS,
  acceptTaughtCandidate,
  activateTaughtSkill,
  assertTeachConsent,
  draftTaughtSkill,
  fakeVisionPort,
  omitBlurredTeachFrames,
  publishTaughtSkill,
  redactTeachNarration,
  sampleKeyFrames,
  subjectThreadRef,
  teachRetentionExpiresAt,
} from '../src/index.ts'
import type { TeachFrame, VisionPort } from '../src/index.ts'

const frames: TeachFrame[] = [
  { atMs: 0, imageRef: 'file://local/frame-0.webp', changeScore: 1 },
  { atMs: 400, imageRef: 'file://local/frame-1.webp', changeScore: 0.05 },
  { atMs: 1200, imageRef: 'file://local/frame-2.webp', changeScore: 0.8 },
]

it('samples key frames by screen change and keeps the last', () => {
  expect(sampleKeyFrames(frames).map(row => row.imageRef)).toEqual([
    'file://local/frame-0.webp',
    'file://local/frame-2.webp',
  ])
})

it('drafts a disabled taught skill with steps and thumbnails; fake vision adds no tools', async () => {
  const draft = await draftTaughtSkill({
    personaId: 'nina',
    title: 'Publicar produto',
    frames,
    transcript: [
      { atMs: 0, untilMs: 500, text: 'Abra o catálogo.' },
      { atMs: 1000, untilMs: 1500, text: 'Clique em publicar.' },
    ],
    allowedTools: ['browser'],
    vision: fakeVisionPort(),
    readyCriteria: 'O produto aparece na loja.',
  })
  expect(draft.local).toBe(true)
  expect(draft.skill.origin).toBe('taught')
  expect(draft.skill.enabled).toBe(false)
  expect(draft.skill.scope).toBe('persona')
  expect(draft.steps).toHaveLength(2)
  expect(draft.steps[0]).toMatchObject({
    order: 1,
    title: 'Abra o catálogo.',
    thumbnailRef: 'file://local/frame-0.webp',
    tools: [],
  })
  expect(draft.steps[1]?.instruction).toContain('publicar')
  expect(draft.skill.body).toContain('Miniatura:')
  expect(draft.skill.body).toContain('Pronto quando: O produto aparece na loja.')
})

it('never expands tools beyond the allow-list and never auto-enables', async () => {
  const greedy: VisionPort = {
    async describe() {
      return {
        title: 'Abrir terminal',
        instruction: 'Rode um comando amplo.',
        verify: 'Saiu output.',
        tools: ['bash', 'browser'],
      }
    },
  }
  const draft = await draftTaughtSkill({
    personaId: 'nina',
    title: 'Só browser',
    frames: [frames[0]!],
    transcript: [{ atMs: 0, untilMs: 100, text: 'Clique.' }],
    allowedTools: ['browser'],
    vision: greedy,
  })
  expect(draft.steps[0]?.tools).toEqual(['browser'])
  expect(draft.skill.enabled).toBe(false)
  expect(publishSkill(draft.skill, 'persona').enabled).toBe(false)
  const candidate = acceptTaughtCandidate(draft)
  expect(candidate.enabled).toBe(false)
  expect(() => publishTaughtSkill(candidate, 'team', false)).toThrow('ACCESS_ESCALATION')
  expect(publishTaughtSkill(candidate, 'team', true).scope).toBe('team')
  expect(() => activateTaughtSkill(candidate, ['browser'], ['bash'])).toThrow('ACCESS_ESCALATION')
  expect(activateTaughtSkill(candidate, ['browser'], ['browser']).enabled).toBe(true)
})

it('requires teach-v1 consent, redacts secrets, and drops blurred frames (W2-10)', async () => {
  expect(TEACH_RETENTION_DAYS).toBe(30)
  assertTeachConsent(TEACH_CONSENT_VERSION)
  expect(() => assertTeachConsent('teach-v0')).toThrow('INVALID_TEACH')
  expect(teachRetentionExpiresAt('2026-11-04T00:00:00.000Z')).toBe('2026-12-04T00:00:00.000Z')
  expect(redactTeachNarration('senha: supersecret e token: abc')).toContain('••••')
  expect(omitBlurredTeachFrames(frames, ['file://local/frame-0.webp']).map(row => row.imageRef))
    .toEqual(['file://local/frame-1.webp', 'file://local/frame-2.webp'])
  const draft = await draftTaughtSkill({
    personaId: 'nina',
    title: 'Login',
    frames: [frames[0]!],
    transcript: [{ atMs: 0, untilMs: 100, text: 'password: hunter2' }],
    allowedTools: [],
    vision: fakeVisionPort(),
    consentVersion: TEACH_CONSENT_VERSION,
    blurredRefs: [frames[0]!.imageRef],
  })
  expect(draft.skill.body).toContain('••••')
  expect(draft.skill.body).not.toContain('hunter2')
  await expect(draftTaughtSkill({
    personaId: 'nina',
    title: 'Login',
    frames: [frames[0]!],
    transcript: [{ atMs: 0, untilMs: 100, text: 'ok' }],
    allowedTools: [],
    vision: fakeVisionPort(),
    consentVersion: 'other',
  })).rejects.toMatchObject({ code: 'INVALID_TEACH' })
})

it('refuses an empty demonstration', async () => {
  await expect(draftTaughtSkill({
    personaId: 'nina',
    title: 'Vazio',
    frames: [],
    transcript: [],
    allowedTools: [],
    vision: fakeVisionPort(),
  })).rejects.toMatchObject({ code: 'INVALID_TEACH' })
})

it('maps a conversation subject onto a Super-agent Thread', () => {
  expect(subjectThreadRef({ kind: 'dm', id: 'nina' }, 'subject-ui'))
    .toEqual({ source: 'dm', id: 'nina:subject:subject-ui' })
})

import { describe, expect, it } from 'vitest'
import {
  DRAFT_PERSONA_PROMPT,
  aiMemoryEnabled,
  memoryNamespace,
  shouldCaptureAiMemory,
  createAiMemory,
  createDisabledAiMemory,
  createDraftDriver,
  createFakeAiMemory,
  createScriptedRunner,
  fallbackDraft,
} from '../src/index.ts'

describe('S4 conversational drafts', () => {
  it('keeps tools empty, no coordination, and accepts a scripted JSON turn', async () => {
    const runner = createScriptedRunner({
      turns: [{
        events: [{
          type: 'delta',
          at: 't',
          text: '{"name":"Bento","title":"Engenharia","description":"Implementa com prova.","personality":"Foco","instructions":"Prove.","avatarKind":"gallery","avatarRef":"bento","runnerKind":"dsh","runnerCli":"","runnerModel":"mock"}',
        }],
      }],
    })
    const draft = await createDraftDriver({ runner }).draftPersona('Bento\nImplementa com prova.')
    expect(draft.name).toBe('Bento')
    expect(draft.systemRoles).toEqual([])
    expect(draft.canRecruit).toBe(false)
    expect(draft.runnerKind).toBe('dsh')
    expect(DRAFT_PERSONA_PROMPT).toMatch(/nunca mais acesso/u)
  })

  it('falls back without a coordinator when the runner is silent', async () => {
    const runner = createScriptedRunner({ turns: [{ events: [] }] })
    const team = await createDraftDriver({ runner }).draftTeam('Nina\n\nSol')
    expect(team.map(item => item.name)).toEqual(['Nina', 'Sol'])
    expect(team.every(item => item.systemRoles.length === 0)).toBe(true)
    expect(fallbackDraft('codex reviewer').runnerCli).toBe('codex')
  })
})

describe('optional ai-memory', () => {
  it('stays off by default and records nothing', async () => {
    expect(aiMemoryEnabled({ })).toBe(false)
    const off = createDisabledAiMemory()
    await off.capture({ kind: 'note', text: 'secret' })
    expect(await off.handoff('claude', 'codex')).toEqual({ claimed: false, summary: 'ai-memory disabled' })
    expect(createAiMemory({ enabled: false })).toBeTypeOf('object')
    expect(shouldCaptureAiMemory({ enabled: true, source: 'dm' })).toBe(false)
    expect(shouldCaptureAiMemory({ enabled: true, source: 'task' })).toBe(true)
    expect(shouldCaptureAiMemory({ source: 'task' })).toBe(false)
    expect(memoryNamespace('ws', 'proj')).toBe('ws/proj')
  })

  it('fake client captures and hands off when the flag is on', async () => {
    const fake = createFakeAiMemory({ now: () => new Date('2026-11-03T18:00:00.000Z') })
    const mem = createAiMemory({ enabled: true, client: fake })
    await mem.capture({ kind: 'turn', text: 'listed files' })
    expect(fake.captures).toHaveLength(1)
    expect(await mem.handoff('claude', 'codex')).toEqual({ claimed: true, summary: 'listed files' })
  })
})

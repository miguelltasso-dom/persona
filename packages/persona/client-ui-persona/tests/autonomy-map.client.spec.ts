import { describe, expect, it } from 'vitest'
import {
  autonomyLevelToHostMode,
  hostModeToAutonomyLevel,
  patchAutonomyMode,
} from '../src/client/persona-editor/autonomy-map.ts'

describe('autonomy-map', () => {
  it('round-trips editor tiers and host modes', () => {
    expect(autonomyLevelToHostMode('on-request')).toBe('asked')
    expect(autonomyLevelToHostMode('propose')).toBe('propose')
    expect(autonomyLevelToHostMode('act-within-limits')).toBe('act')
    expect(hostModeToAutonomyLevel('asked')).toBe('on-request')
    expect(hostModeToAutonomyLevel('propose')).toBe('propose')
    expect(hostModeToAutonomyLevel('act')).toBe('act-within-limits')
  })

  it('patchAutonomyMode preserves host budgets', () => {
    const row = {
      workspaceId: 'w',
      projectId: 'p',
      personaId: 'atlas',
      mode: 'propose' as const,
      proposalBudget: 3,
      tokenBudget: 100,
      executionBudget: 2,
      silenceStart: '',
      silenceEnd: '',
    }
    const next = patchAutonomyMode(row, 'act-within-limits')
    expect(next.mode).toBe('act')
    expect(next.proposalBudget).toBe(3)
    expect(next).not.toBe(row)
  })
})

import { describe, expect, it } from 'vitest'
import { engineLabel, humanizeEngineLabel } from '../src/client/team/engine-label.ts'

describe('engine labels (Atlas: no jargon)', () => {
  it('maps runner/model ids to human names', () => {
    expect(engineLabel('dsh', 'default')).toBe('DeepSeek · modelo padrão')
    expect(engineLabel('claude', 'claude-haiku-4-5')).toBe('Claude · Haiku')
    expect(engineLabel('oar:codex', 'gpt-5.5')).toBe('Codex · GPT-5.5')
    expect(engineLabel('cursor')).toBe('Cursor')
  })

  it('humanizes joined host labels but keeps labels that are already human', () => {
    expect(humanizeEngineLabel('dsh · default')).toBe('DeepSeek · modelo padrão')
    expect(humanizeEngineLabel('Plano do Claude · Sonnet')).toBe('Plano do Claude · Sonnet')
  })
})

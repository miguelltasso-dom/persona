import { describe, expect, it } from 'vitest'
import {
  composeStablePrefix,
  foldClaudeJsonl,
  prefixCacheHit,
  volatilePrefixHits,
} from '../src/index.ts'

describe('OPT-3 stable prefix and native history', () => {
  it('fingerprints the stable layers and keeps clocks out of the prefix', () => {
    const first = composeStablePrefix({
      system: 'Você é a Nina.',
      persona: 'Tom direto.',
      tools: 'persona_recall',
      required: 'Regra: citar o Cofre.',
      variable: 'Assunto UI — 2026-11-04T12:00:00Z',
    })
    const again = composeStablePrefix({
      system: 'Você é a Nina.',
      persona: 'Tom direto.',
      tools: 'persona_recall',
      required: 'Regra: citar o Cofre.',
      variable: 'Assunto UI — outra hora',
    })
    expect(prefixCacheHit(first.fingerprint, again.fingerprint)).toBe(true)
    expect(volatilePrefixHits(first.stable)).toEqual([])
    expect(volatilePrefixHits(first.variable).length).toBeGreaterThan(0)
  })

  it('folds Claude JSONL without estimating text-only lines', () => {
    const totals = foldClaudeJsonl([
      '{"timestamp":"t1","usage":{"input_tokens":12,"output_tokens":3}}',
      '{"timestamp":"t2","message":{"text":"olá sem usage"}}',
      'not-json',
    ].join('\n'))
    expect(totals).toMatchObject({
      inputTokens: 12, outputTokens: 3, turnsCounted: 1, turnsSkipped: 1, origin: 'measured',
    })
  })
})

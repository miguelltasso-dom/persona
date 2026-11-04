import { describe, expect, it } from 'vitest'
import {
  RunnerResolveError,
  providerLabel,
  resolveCaughtError,
} from '../src/resolve/errors.ts'

const JARGON = /CLI|runner|host|executor|DSH|janela resetar/iu

describe('RUN-ERRORS reserve copy', () => {
  it('emits code, human provider, command and resetAt without jargon', () => {
    const login = new RunnerResolveError('not_logged_in', 'claude')
    expect(login.toPayload()).toEqual({
      code: 'not_logged_in',
      provider: 'Claude',
      command: 'claude login',
    })
    expect(login.message).toBe('O Claude não está conectado neste computador.')
    expect(login.message).not.toMatch(JARGON)

    const missing = new RunnerResolveError('cli_not_found', 'codex')
    expect(missing.provider).toBe('Codex')
    expect(missing.message).toBe('O Codex não está instalado neste computador.')
    expect(missing.message).not.toMatch(JARGON)

    const model = new RunnerResolveError('model_unavailable', 'claude', { model: 'opus-x' })
    expect(model.message).toBe('O modelo opus-x não está disponível no Claude.')
    expect(model.toPayload().model).toBe('opus-x')

    const quota = new RunnerResolveError('quota_exhausted', 'claude:trabalho', {
      resetAt: '2026-11-04T21:30:00.000Z',
    })
    expect(quota.toPayload()).toMatchObject({
      code: 'quota_exhausted',
      provider: 'Claude',
      account: 'trabalho',
      resetAt: '2026-11-04T21:30:00.000Z',
    })
    expect(quota.message).not.toMatch(JARGON)
    expect(providerLabel('dsh')).toBe('Persona')
  })

  it('maps network failures to provider_unreachable', () => {
    const mapped = resolveCaughtError(new Error('fetch failed: ECONNRESET'), 'codex')
    expect(mapped.code).toBe('provider_unreachable')
    expect(mapped.provider).toBe('Codex')
    expect(mapped.message).toBe('Não consegui falar com o Codex agora.')
    expect(mapped.message).not.toMatch(JARGON)
  })
})

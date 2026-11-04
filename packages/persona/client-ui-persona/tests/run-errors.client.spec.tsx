// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeResetTime, describeRunError, runErrorText, type RunErrorCode } from '../src/client/primitives/run-errors.ts'
import { RunErrorCard } from '../src/client/primitives/RunErrorCard.tsx'
import { en, pt } from '../src/client/locale/chat/locales.ts'

afterEach(cleanup)
const tFor = (dict: Record<string, string>) => (key: string, params?: Readonly<Record<string, string>>): string =>
  (dict[key] ?? `MISSING:${key}`).replace(/\{(\w+)\}/gu, (_, k: string) => params?.[k] ?? `{${k}}`)
const CODES: RunErrorCode[] = ['not_logged_in', 'cli_not_found', 'model_unavailable', 'quota_exhausted', 'budget_exhausted', 'provider_unreachable', 'engine_unavailable', 'app_offline']
const JARGON = /\b(CLI|runner|host|executor|DSH|resetar|token)\b/iu

describe('describeRunError (RUN-ERRORS-SPEC)', () => {
  for (const [lang, dict] of [['pt', pt], ['en', en]] as const) {
    it(`${lang}: every code has title, body and action, params filled, no jargon`, () => {
      const t = tFor(dict)
      for (const code of CODES) {
        for (const otherAccount of [false, true]) {
          const text = runErrorText(describeRunError({ code, provider: 'Claude', model: 'Opus', account: 'Trabalho', persona: 'Nina', resetAt: new Date(Date.now() + 3_600_000).toISOString(), otherAccount }), t)
          const all = Object.values(text).join(' | ')
          expect(all, code).not.toMatch(/MISSING:|\{\w+\}/u)
          expect(all, code).not.toMatch(JARGON)
        }
      }
    })
  }

  it('quota picks the useful action: swap when another account exists, otherwise resume on its own', () => {
    expect(describeRunError({ code: 'quota_exhausted', otherAccount: true }).primary).toBe('swapAccount')
    expect(describeRunError({ code: 'quota_exhausted' }).primary).toBe('waitAndResume')
    expect(describeRunError({ code: 'quota_exhausted' }).tone).toBe('warning')
  })

  it('reset time reads today / tomorrow in local time', () => {
    const now = new Date(2026, 10, 4, 10, 0)
    expect(describeResetTime(new Date(2026, 10, 4, 18, 30).toISOString(), now)).toEqual({ whenKey: 'runError.when.today', time: '18:30' })
    expect(describeResetTime(new Date(2026, 10, 5, 9, 0).toISOString(), now)).toEqual({ whenKey: 'runError.when.tomorrow', time: '9:00' })
    expect(describeResetTime(undefined, now).whenKey).toBe('runError.when.unknown')
  })
})

describe('RunErrorCard', () => {
  it('shows the persona, the three parts and wires the actions', () => {
    const onPrimary = vi.fn()
    render(<RunErrorCard tone="warning" persona={{ name: 'Nina' }} title="O Claude não está conectado neste computador." body="Faça login uma vez." command="claude login" primary={{ label: 'Tentar de novo', onClick: onPrimary }} secondary={{ label: 'Como conectar', onClick: () => {} }} labels={{ copy: 'Copiar comando', copied: 'Copiado', commandLabel: 'Comando para o terminal' }} />)
    expect(screen.getByRole('status', { name: /Nina: O Claude não está conectado/u })).toBeTruthy()
    expect(screen.getByText('claude login')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onPrimary).toHaveBeenCalled()
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})

describe('legacyRunErrorFromText (bridge until every sender ships `code`)', () => {
  it('maps every current runner/host raw text to a code', async () => {
    const { legacyRunErrorFromText } = await import('../src/client/primitives/run-errors.ts')
    expect(legacyRunErrorFromText('CLI codex não está logada. Abra o terminal e rode codex login')).toEqual({ code: 'not_logged_in', provider: 'Codex', command: 'codex login' })
    expect(legacyRunErrorFromText('CLI claude não encontrada neste computador.')).toEqual({ code: 'cli_not_found', provider: 'Claude' })
    expect(legacyRunErrorFromText('Modelo opus indisponível neste runner.')).toEqual({ code: 'model_unavailable', model: 'opus' })
    expect(legacyRunErrorFromText('Cota de claude esgotada. Espere a janela resetar.')).toEqual({ code: 'quota_exhausted', provider: 'Claude' })
    expect(legacyRunErrorFromText('O executor DSH não está montado neste host.', 'Bento')).toEqual({ code: 'engine_unavailable', persona: 'Bento' })
    expect(legacyRunErrorFromText('orçamento de tokens do mês esgotado', 'Luna')).toEqual({ code: 'budget_exhausted', persona: 'Luna' })
    expect(legacyRunErrorFromText('O Codex não está conectado — abra o terminal e rode `codex login`')).toEqual({ code: 'not_logged_in', provider: 'Codex', command: 'codex login' })
  })

  it('never matches ordinary conversation (anchored, whole message)', async () => {
    const { legacyRunErrorFromText } = await import('../src/client/primitives/run-errors.ts')
    for (const text of ['Acho que a CLI codex não está logada, pode ver?', 'Bati no rate limit ontem', 'O Codex não está conectado ao repositório certo', 'Pronto! Revisei a proposta.']) {
      expect(legacyRunErrorFromText(text), text).toBeNull()
    }
  })
})

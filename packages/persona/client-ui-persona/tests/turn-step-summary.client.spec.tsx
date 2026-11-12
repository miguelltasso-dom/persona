// @vitest-environment jsdom
// COLHEITA §6 (Quill): o resumo recolhido "6 passos · 2 min" e a lista dos passos. Falha não conta como feito; em andamento = sem resumo.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { TurnStepSummary } from '../src/client/chat/work-step/TurnStepSummary.tsx'
import { formatStepDuration, stepClock, summarizeTurnSteps, turnSummaryLabel, type StepItem, type TurnSummaryLabels } from '../src/client/chat/work-step/turn-step-summary-model.ts'

afterEach(() => { cleanup() })

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

const LABELS: TurnSummaryLabels = {
  count: n => (n === 1 ? t('workStep.count.one') : t('workStep.count', { count: n })),
  failed: n => (n === 1 ? t('workStep.failed.one') : t('workStep.failed', { count: n })),
  minutes: n => t('workStep.minutes', { n }),
  seconds: n => t('workStep.seconds', { n }),
}

const T0 = '2026-11-11T14:30:00.000Z'
const at = (seconds: number): string => new Date(Date.parse(T0) + seconds * 1000).toISOString()

const STEPS: StepItem[] = [
  { id: '1', kind: 'read', title: 'leu contratos/proposta.md', status: 'done', at: at(0) },
  { id: '2', kind: 'command', title: 'npm test', status: 'done', at: at(30) },
  { id: '3', kind: 'command', title: 'npm run build', status: 'failed', at: at(60) },
  { id: '4', kind: 'message', title: 'para Sol', status: 'done', at: at(90) },
  { id: '5', kind: 'file', title: 'proposta.md', status: 'done', at: at(100) },
  { id: '6', kind: 'check', title: 'conferiu o prazo', status: 'done', at: at(120) },
]

describe('resumo recolhido · modelo', () => {
  it('sem passos não há resumo', () => {
    expect(summarizeTurnSteps([])).toBeNull()
  })

  it('passo ainda rodando ou esperando: o turno não acabou, sem resumo', () => {
    expect(summarizeTurnSteps([{ id: 'a', kind: 'command', title: 'npm test', status: 'running' }])).toBeNull()
    expect(summarizeTurnSteps([{ id: 'a', kind: 'hire', title: 'x', status: 'waiting' }])).toBeNull()
  })

  it('conta todos os passos (incluindo os que o host não listou) e os que falharam', () => {
    const summary = summarizeTurnSteps(STEPS, 2)
    expect(summary).toEqual({ count: 8, failed: 1, durationMs: 120_000 })
  })

  it('sem horário em algum passo: sem duração', () => {
    expect(summarizeTurnSteps([{ id: 'a', kind: 'read', title: 'x', status: 'done' }, { id: 'b', kind: 'read', title: 'y', status: 'done', at: at(5) }])?.durationMs).toBeNull()
  })

  it('"6 passos · 2 min" e "· 1 não deu certo" entram na linha', () => {
    expect(turnSummaryLabel({ count: 6, failed: 0, durationMs: 120_000 }, LABELS)).toBe('6 passos · 2 min')
    expect(turnSummaryLabel({ count: 6, failed: 1, durationMs: 120_000 }, LABELS)).toBe('6 passos · 1 não deu certo · 2 min')
  })

  it('um passo só, sem horário: "1 passo"', () => {
    expect(turnSummaryLabel({ count: 1, failed: 0, durationMs: null }, LABELS)).toBe('1 passo')
  })

  it('abaixo de um minuto mostra segundos; minutos inteiros depois', () => {
    expect(formatStepDuration(45_000, LABELS)).toBe('45 s')
    expect(formatStepDuration(500, LABELS)).toBe('1 s')
    expect(formatStepDuration(119_000, LABELS)).toBe('1 min')
  })

  it('a hora do passo é HH:mm', () => {
    expect(stepClock(undefined)).toBeUndefined()
    expect(stepClock('não é data')).toBeUndefined()
    expect(stepClock(at(0))).toMatch(/^\d{2}:\d{2}$/u)
  })
})

describe('resumo recolhido · tela', () => {
  it('recolhido: uma linha com "6 passos · 1 não deu certo · 2 min" e o controle fechado', () => {
    render(<TurnStepSummary t={t as never} items={STEPS} />)
    const head = screen.getByRole('button', { name: '6 passos · 1 não deu certo · 2 min' })
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-turn-summary]')?.getAttribute('data-failed')).toBe('')
  })

  it('ao clicar abre a lista: uma linha por passo, com a frase, a hora e os detalhes técnicos', () => {
    render(<TurnStepSummary t={t as never} items={STEPS} />)
    fireEvent.click(screen.getByRole('button', { name: /passos/u }))
    expect(screen.getByRole('button', { name: /passos/u }).getAttribute('aria-expanded')).toBe('true')
    const rows = Array.from(document.querySelectorAll('li[data-status]'))
    expect(rows).toHaveLength(6)
    expect(rows[2]?.textContent).toContain('Rodou um comando')
    expect(rows[2]?.textContent).toContain('não deu certo')
    expect(rows[2]?.textContent).toContain('npm run build')
  })

  it('o caminho e o comando ficam dentro de "Detalhes técnicos", fora da frase', () => {
    render(<TurnStepSummary t={t as never} items={STEPS} />)
    const details = Array.from(document.querySelectorAll('details'))
    expect(details).toHaveLength(6)
    expect(details[0]?.querySelector('summary')?.textContent).toBe('Detalhes técnicos')
    expect(details[0]?.querySelector('code')?.textContent).toBe('leu contratos/proposta.md')
  })

  it('sem passos ou com passo em andamento, não renderiza nada', () => {
    const { container, rerender } = render(<TurnStepSummary t={t as never} items={[]} />)
    expect(container.querySelector('[data-turn-summary]')).toBeNull()
    rerender(<TurnStepSummary t={t as never} items={[{ id: 'x', kind: 'command', title: 'npm test', status: 'running' }]} />)
    expect(container.querySelector('[data-turn-summary]')).toBeNull()
  })
})

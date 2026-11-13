// DESTINO (após "candidato validado"): packages/persona/persona-host/tests/station-recovery.spec.ts
// Contrato: persona-spec/contracts/marco-dogfood-estacao.md §2. VERMELHO: ../src/station/recovery.ts ainda não existe.
import { describe, expect, it } from 'vitest'
import { decideRecovery, planLaunch, RECOVERY_WINDOW_MS, MAX_CRASHES_IN_WINDOW, STABLE_MS } from '../src/station/recovery.ts'

describe('M4: a subida lê a memória da execução anterior (planLaunch)', () => {
  const T = Date.parse('2026-11-12T03:00:00.000Z')
  it('primeira subida: não é queda e começa a contar', () => {
    expect(planLaunch({}, T)).toEqual({ wasCrash: false, crashesBefore: 0, next: { crashes: 0, lastStartAt: T } })
  })
  it('saída limpa (Sair, atualização) nunca conta como queda e zera a sequência', () => {
    const plan = planLaunch({ lastStartAt: T - 30_000, crashes: 3, lastExit: 'clean' }, T)
    expect(plan).toMatchObject({ wasCrash: false, crashesBefore: 0, next: { crashes: 0, lastStartAt: T } })
  })
  it('sem saída limpa e execução curta: é queda e soma à sequência', () => {
    const plan = planLaunch({ lastStartAt: T - 60_000, crashes: 2 }, T)
    expect(plan).toMatchObject({ wasCrash: true, previousRunMs: 60_000, crashesBefore: 2, next: { crashes: 3, lastStartAt: T } })
  })
  it('execução estável antes da queda: o orçamento reenche e esta é a 1ª da nova sequência', () => {
    const plan = planLaunch({ lastStartAt: T - STABLE_MS, crashes: 4 }, T)
    expect(plan).toMatchObject({ wasCrash: true, crashesBefore: 0, next: { crashes: 1 } })
  })
  it('alimenta o decideRecovery: a 6ª queda seguida pausa a Estação', () => {
    const plan = planLaunch({ lastStartAt: T - 1_000, crashes: 5 }, T)
    expect(decideRecovery({ reason: 'crash', crashesInWindow: plan.crashesBefore, ...(plan.previousRunMs === undefined ? {} : { previousRunMs: plan.previousRunMs }), now: T, paired: true })).toMatchObject({ action: 'giveup', pauseStation: true })
  })
  it('relógio que voltou para trás não gera execução negativa', () => {
    expect(planLaunch({ lastStartAt: T + 10_000, crashes: 1 }, T).previousRunMs).toBe(0)
  })
})

const NOW = Date.parse('2026-11-12T03:00:00.000Z')
const base = { now: NOW, paired: true } as const

describe('M4: a estação decide sozinha se volta de uma queda', () => {
  it('a pessoa que fechou de propósito nunca é relançada', () => {
    const answer = decideRecovery({ ...base, reason: 'user-quit', crashesInWindow: 0 })
    expect(answer.action).toBe('giveup')
    expect(answer.note).toMatch(/de propósito/u)
  })

  it('atualização relança na hora e não conta como queda', () => {
    const answer = decideRecovery({ ...base, reason: 'update', crashesInWindow: 4 })
    expect(answer).toMatchObject({ action: 'relaunch', delayMs: 0 })
  })

  it('queda em estação pareada relança com espera crescente 2 s, 4 s, 8 s e teto de 60 s', () => {
    const delays = [0, 1, 2, 3, 4].map(crashesInWindow => decideRecovery({ ...base, reason: 'crash', crashesInWindow }).delayMs)
    expect(delays).toEqual([2_000, 4_000, 8_000, 16_000, 32_000])
    const capped = decideRecovery({ ...base, reason: 'crash', crashesInWindow: 4, maxCrashes: 99 })
    expect(capped.delayMs).toBeLessThanOrEqual(60_000)
    expect(RECOVERY_WINDOW_MS).toBe(600_000)
    const far = decideRecovery({ ...base, reason: 'crash', crashesInWindow: 20, maxCrashes: 99 })
    expect(far.delayMs).toBe(60_000)
  })

  it('renderer morto e host falho seguem a mesma regra da queda', () => {
    for (const reason of ['renderer-gone', 'host-failed'] as const) {
      expect(decideRecovery({ ...base, reason, crashesInWindow: 1 })).toMatchObject({ action: 'relaunch', delayMs: 4_000 })
    }
  })

  it('depois do teto de quedas na janela desiste, para não virar laço de reinício', () => {
    const answer = decideRecovery({ ...base, reason: 'crash', crashesInWindow: MAX_CRASHES_IN_WINDOW })
    expect(answer.action).toBe('giveup')
    expect(answer.note).toMatch(/quedas/u)
  })

  it('estourar o orçamento pausa a Estação e avisa (a pessoa religa com 1 clique); sair de propósito não pausa nada', () => {
    const over = decideRecovery({ ...base, reason: 'crash', crashesInWindow: MAX_CRASHES_IN_WINDOW })
    expect(over).toMatchObject({ action: 'giveup', pauseStation: true })
    expect(over.note).toMatch(/caiu 5 vezes/u)
    expect(decideRecovery({ ...base, reason: 'user-quit', crashesInWindow: 0 }).pauseStation).toBe(false)
  })

  it('o orçamento reenche depois de 10 min estável: a 3ª queda da semana não herda as de ontem', () => {
    const answer = decideRecovery({ ...base, reason: 'crash', crashesInWindow: 4, previousRunMs: STABLE_MS })
    expect(answer).toMatchObject({ action: 'relaunch', delayMs: 2_000 }) // contou como a 1ª
    const short = decideRecovery({ ...base, reason: 'crash', crashesInWindow: 4, previousRunMs: STABLE_MS - 1 })
    expect(short.delayMs).toBe(32_000) // ainda não estabilizou: segue a escada
    expect(decideRecovery({ ...base, reason: 'crash', crashesInWindow: 4, previousRunMs: 60_000, stableMs: 30_000 }).delayMs).toBe(2_000) // parâmetro do soak
  })

  it('o teto é configurável por parâmetro (o soak usa outro)', () => {
    expect(decideRecovery({ ...base, reason: 'crash', crashesInWindow: 2, maxCrashes: 2 }).action).toBe('giveup')
    expect(decideRecovery({ ...base, reason: 'crash', crashesInWindow: 2, maxCrashes: 3 }).action).toBe('relaunch')
  })

  it('computador comum (não pareado) não relança sozinho em queda, mas atualização continua relançando', () => {
    expect(decideRecovery({ ...base, paired: false, reason: 'crash', crashesInWindow: 0 }).action).toBe('giveup')
    expect(decideRecovery({ ...base, paired: false, reason: 'update', crashesInWindow: 0 }).action).toBe('relaunch')
  })

  it('é pura: mesma entrada, mesma resposta, sem ler relógio nem disco', () => {
    const input = { ...base, reason: 'crash', crashesInWindow: 2 } as const
    expect(decideRecovery(input)).toEqual(decideRecovery(input))
  })
})

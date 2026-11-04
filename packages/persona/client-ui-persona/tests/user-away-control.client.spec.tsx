// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  UserAwayControl,
  awayUntilAt,
  formatAwayUntilWhen,
  isAwayExpired,
  type UserAwayState,
} from '../src/client/shell/UserAwayControl.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { en as shellEn, pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const tPt = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never
const tEn = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellEn, key, params)) as never
const OFF: UserAwayState = { isAway: false, untilChoice: 'today18' }

describe('"Estou fora" (UX-PHASE §8): controle', () => {
  it('o Switch é um botão focável (Tab) e liga/desliga com ativação por teclado', () => {
    const onChange = vi.fn()
    render(<UserAwayControl t={tPt} awayState={OFF} onChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: 'Estou fora' })
    toggle.focus()
    expect(document.activeElement).toBe(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(toggle.tabIndex).toBeGreaterThanOrEqual(0)
    fireEvent.click(toggle) // Enter/Espaço ativam um <button>
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0]![0] as UserAwayState
    expect(next.isAway).toBe(true)
    expect(typeof next.untilAt).toBe('number')
  })

  it('ligado: "Até quando?" com as 3 opções, a 1ª marcada; escolher outra recalcula o prazo', () => {
    const onChange = vi.fn()
    render(<UserAwayControl t={tPt} awayState={{ isAway: true, untilChoice: 'today18' }} onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'Até quando?' })).toBeTruthy()
    expect((screen.getByRole('radio', { name: /Hoje às 18h/u }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Amanhã de manhã/u }))
    const next = onChange.mock.calls[0]![0] as UserAwayState
    expect(next.untilChoice).toBe('tomorrow')
    expect(next.untilAt).toBe(awayUntilAt({ untilChoice: 'tomorrow' }, Date.now()))
  })

  it('sem substituto: avisa que as decisões vão esperar e oferece "Definir substituto"', () => {
    const onDefine = vi.fn()
    render(<UserAwayControl t={tPt} awayState={{ isAway: true, untilChoice: 'today18' }} onChange={() => undefined} onDefineSubstitute={onDefine} />)
    expect(screen.getByText('Ninguém foi definido para aprovar por você. As decisões vão esperar.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Definir substituto' }))
    expect(onDefine).toHaveBeenCalledTimes(1)
  })

  it('com substituto: diz para quem vão as aprovações (não promete o que não existe)', () => {
    render(
      <UserAwayControl
        t={tPt}
        awayState={{ isAway: true, untilChoice: 'today18' }}
        substitute={{ id: 'p-nina', name: 'Nina' }}
        onChange={() => undefined}
      />,
    )
    expect(screen.getByText('As aprovações vão para Nina enquanto você estiver fora.')).toBeTruthy()
    expect(screen.queryByText(/Ninguém foi definido/u)).toBeNull()
  })

  it('desligado: nada de opções nem aviso', () => {
    render(<UserAwayControl t={tPt} awayState={OFF} onChange={() => undefined} />)
    expect(screen.queryByRole('group', { name: 'Até quando?' })).toBeNull()
    expect(screen.queryByText(/Ninguém foi definido/u)).toBeNull()
  })
})

describe('"Estou fora": prazo e texto da pílula', () => {
  const at = (y: number, m: number, d: number, h: number, min = 0): number => new Date(y, m - 1, d, h, min).getTime()

  it('"Hoje às 18h" é o PRÓXIMO 18h (depois das 18h, amanhã)', () => {
    expect(awayUntilAt({ untilChoice: 'today18' }, at(2026, 11, 4, 10))).toBe(at(2026, 11, 4, 18))
    expect(awayUntilAt({ untilChoice: 'today18' }, at(2026, 11, 4, 19))).toBe(at(2026, 11, 5, 18))
  })

  it('"Amanhã de manhã" termina às 8h do dia seguinte; "Escolher dia" termina no fim do dia escolhido', () => {
    expect(awayUntilAt({ untilChoice: 'tomorrow' }, at(2026, 11, 4, 22))).toBe(at(2026, 11, 5, 8))
    expect(awayUntilAt({ untilChoice: 'custom', untilDate: '2026-11-10' }, at(2026, 11, 4, 22)))
      .toBe(new Date(2026, 10, 10, 23, 59, 59, 999).getTime())
    expect(awayUntilAt({ untilChoice: 'custom', untilDate: '' }, 0)).toBeUndefined()
    expect(awayUntilAt({ untilChoice: 'custom', untilDate: 'amanhã' }, 0)).toBeUndefined()
  })

  it('expira só com prazo conhecido; estados antigos (sem untilAt) não expiram', () => {
    const now = at(2026, 11, 4, 18, 1)
    expect(isAwayExpired({ isAway: true, untilChoice: 'today18', untilAt: at(2026, 11, 4, 18) }, now)).toBe(true)
    expect(isAwayExpired({ isAway: true, untilChoice: 'today18', untilAt: at(2026, 11, 4, 19) }, now)).toBe(false)
    expect(isAwayExpired({ isAway: true, untilChoice: 'today18' }, now)).toBe(false)
    expect(isAwayExpired({ isAway: false, untilChoice: 'today18', untilAt: 1 }, now)).toBe(false)
  })

  it('"Fora até {quando}" sai no idioma da pessoa (antes era sempre "amanhã"/"18h" em português)', () => {
    expect(formatAwayUntilWhen(tPt, { isAway: true, untilChoice: 'today18' })).toBe('18h')
    expect(formatAwayUntilWhen(tPt, { isAway: true, untilChoice: 'tomorrow' })).toBe('amanhã')
    expect(formatAwayUntilWhen(tEn, { isAway: true, untilChoice: 'today18' })).toBe('6pm')
    expect(formatAwayUntilWhen(tEn, { isAway: true, untilChoice: 'tomorrow' })).toBe('tomorrow')
    expect(formatAwayUntilWhen(tEn, { isAway: true, untilChoice: 'custom', untilDate: '2026-11-10' })).toBe('2026-11-10')
  })
})

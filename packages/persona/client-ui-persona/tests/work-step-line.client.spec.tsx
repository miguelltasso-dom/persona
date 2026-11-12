// @vitest-environment jsdom
// COLHEITA §6 (Quill): a linha do passo embaixo do "digitando". 5 s para aparecer; no máximo uma troca a cada 2 s; some quando desmonta.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkStepLine } from '../src/client/chat/work-step/WorkStepLine.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

const BIA: ChannelPersonaMember = { id: 'bia' as never, name: 'Bia', role: 'x', state: 'working' }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function advance(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms) })
}

describe('COLHEITA §6 · linha do passo', () => {
  it('não aparece antes de 5 s de trabalho; aparece em 5 s com "Nome · Trabalhando"', () => {
    render(<WorkStepLine t={t as never} member={BIA} />)
    advance(4999)
    expect(screen.queryByText('Bia · Trabalhando')).toBeNull()
    advance(1)
    expect(screen.getByText('Bia · Trabalhando')).toBeTruthy()
  })

  it('mostra a frase simples do passo quando o host manda', () => {
    render(<WorkStepLine t={t as never} member={BIA} step="Procurando fotos da padaria" />)
    advance(5000)
    expect(screen.getByText('Bia · Procurando fotos da padaria')).toBeTruthy()
  })

  it('frase com caminho não vai para a tela: fica "Trabalhando"', () => {
    render(<WorkStepLine t={t as never} member={BIA} step="lendo src/contratos.ts" />)
    advance(5000)
    expect(screen.getByText('Bia · Trabalhando')).toBeTruthy()
    expect(screen.queryByText(/contratos/u)).toBeNull()
  })

  it('no máximo uma troca a cada 2 s: a 2ª frase espera a janela', () => {
    const { rerender } = render(<WorkStepLine t={t as never} member={BIA} />)
    advance(5000) // primeira exibição em t=5000 (troca registrada)
    rerender(<WorkStepLine t={t as never} member={BIA} step="Lendo a proposta" />)
    advance(1500) // t=6500: ainda dentro da janela de 2 s
    expect(screen.getByText('Bia · Trabalhando')).toBeTruthy()
    advance(499) // t=6999
    expect(screen.getByText('Bia · Trabalhando')).toBeTruthy()
    advance(1) // t=7000: pode trocar
    expect(screen.getByText('Bia · Lendo a proposta')).toBeTruthy()
  })

  it('sem o turno (desmontada), nada fica na tela', () => {
    const { container, unmount } = render(<WorkStepLine t={t as never} member={BIA} />)
    advance(5000)
    expect(container.querySelector('[data-work-step]')).not.toBeNull()
    unmount()
    expect(document.querySelector('[data-work-step]')).toBeNull()
  })

  it('não é região ao vivo: o aviso de tela fica na faixa da equipe, não no fio', () => {
    const { container } = render(<WorkStepLine t={t as never} member={BIA} />)
    advance(5000)
    expect(container.querySelector('[aria-live]')).toBeNull()
  })
})

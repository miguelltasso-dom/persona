// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActivityGroup, PooledQuotaBar, summarizeActivity, type ActivityItem } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

const POOL_LABELS = {
  left: (p: number) => `${p}% sobrando`,
  nextRefill: (p: number, at: string, a: string) => `Volta ${p}% às ${at} (${a})`,
  noWindow: 'não informa esta janela',
  segment: (a: { label: string; leftPct?: number | undefined; refillAt?: string | undefined }) => `${a.label}: ${a.leftPct}% sobrando${a.refillAt ? `, volta às ${a.refillAt}` : ''}`,
}

describe('PooledQuotaBar (harvest §7)', () => {
  it('one pooled number, one segment per account, gap for missing window, next refill line', () => {
    render(<PooledQuotaBar window="5 horas" labels={POOL_LABELS} accounts={[
      { id: 'w', label: 'Trabalho', leftPct: 40, refillPct: 18, refillAt: '18:30' },
      { id: 'p', label: 'Pessoal', leftPct: 80 },
      { id: 'x', label: 'Extra' },
    ]} />)
    expect(screen.getByText('60% sobrando')).toBeTruthy()
    expect(screen.getAllByRole('button').length).toBe(3)
    expect(screen.getByRole('button', { name: 'Extra: não informa esta janela' })).toBeTruthy()
    expect(screen.getByText('Volta 18% às 18:30 (Trabalho)')).toBeTruthy()
  })
})

const ACT_LABELS = {
  phrase: { command: (n: number) => `rodou ${n} ${n === 1 ? 'comando' : 'comandos'}`, file: (n: number) => `mudou ${n} arquivo(s)`, hire: (n: number) => `contratou ${n}`, message: (n: number) => `mandou ${n} mensagem(ns)`, read: (n: number) => `leu ${n}`, check: (n: number) => `conferiu ${n}` },
  more: (n: number) => `e mais ${n}`, failed: (n: number) => `${n} falhou`, running: 'ainda trabalhando',
  status: { done: 'feito', failed: 'falhou', running: 'rodando', waiting: 'esperando' }, open: 'Abrir', expand: 'ver detalhes', collapse: 'esconder detalhes',
}

describe('ActivityGroup (harvest §9)', () => {
  const items: ActivityItem[] = [
    { id: '1', kind: 'read', title: 'leu proposta.md', status: 'done' },
    { id: '2', kind: 'command', title: 'npm test', status: 'done' },
    { id: '3', kind: 'command', title: 'npm run build', status: 'failed' },
    { id: '4', kind: 'message', title: 'para Sol', status: 'done' },
    { id: '5', kind: 'file', title: 'proposta.md', status: 'done' },
  ]
  it('changes first, two categories max, failures never counted as done', () => {
    expect(summarizeActivity(items, ACT_LABELS)).toBe('rodou 1 comando e mudou 1 arquivo(s) · e mais 2 · 1 falhou')
  })
  it('expands to the full list with status', () => {
    render(<ActivityGroup persona={{ name: 'Nina' }} items={items} labels={ACT_LABELS} />)
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('npm run build').closest('li')?.getAttribute('data-status')).toBe('failed')
  })
})

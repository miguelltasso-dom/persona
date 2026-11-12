// @vitest-environment jsdom
// DESIGN-01 onda 3 · #15 Saúde (Muse cena 11 + §5.2 #15): frase do veredito em segunda pessoa, rosto de 32 px por linha (nome antes do cargo),
// diagnósticos iguais agrupados com UM botão "Subir os N para “Decide o rotineiro”", botão de verdade nas linhas únicas, e o velocímetro que
// anima em 420 ms até a nota que o host recalculou.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamHealthView } from '../src/client/governance/TeamHealthView.tsx'
import type { TeamHealthView as TeamHealthDto, TwoDayRowView, TwoDayTestView } from '../src/client/governance/governance-contract.ts'
import { pt, en } from '../src/client/locale/governance/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup(); vi.useRealTimers() })

const REASON = 'Espera sua aprovação — ninguém substitui você.'
const waits = (id: string, label: string, extra: Partial<TwoDayRowView> = {}): TwoDayRowView => ({
  id, label, slots: ['runs', 'runs', 'waits', 'waits'], reason: REASON, fixKind: 'raise_autonomy', fixTargetId: id, ...extra,
})

const HEALTH: TeamHealthDto = {
  workspaceId: 'ws',
  level: 'risk',
  title: 'A equipe para se alguém some',
  body: 'Tudo depende de Você para aprovar. Se essa pessoa some, a equipe para.',
  score: 76,
  findings: [{ id: 'single_point_of_failure:h-1', level: 'risk', title: 'Tudo depende de Você para aprovar. Se essa pessoa some, a equipe para.', fixKind: 'set_substitute', fixTargetId: 'h-2' }],
}

const ROWS: readonly TwoDayRowView[] = [
  waits('initiative:sol', 'Engenharia (Sol)'),
  waits('initiative:nina', 'Pesquisa (Nina)'),
  waits('initiative:bento', 'Design (Bento)'),
  waits('initiative:atlas', 'Coordenação (Atlas)'),
]
const TWO_DAY = (rows: readonly TwoDayRowView[]): TwoDayTestView => ({ workspaceId: 'ws', slotLabels: ['Dia 1 · manhã', 'Dia 1 · tarde', 'Dia 2 · manhã', 'Dia 2 · tarde'], rows })

function view(props: Partial<Parameters<typeof TeamHealthView>[0]> = {}) {
  return (
    <PreviewFrame brandLabel="Persona">
      <TeamHealthView dict={pt} health={HEALTH} twoDay={TWO_DAY(ROWS)} surfaceState="ready" onTwoDayFix={() => undefined} {...props} />
    </PreviewFrame>
  )
}

describe('o veredito (frase composta no cliente)', () => {
  it('ponto único de falha: "Se você ficar 2 dias fora, 4 colegas param esperando a sua aprovação." e some a frase do host', () => {
    render(view())
    expect(screen.getByText('Se você ficar 2 dias fora, 4 colegas param esperando a sua aprovação.')).toBeTruthy()
    expect(screen.queryByText(/Se essa pessoa some/u)).toBeNull()
  })

  it('um colega só lê no singular; sem ninguém esperando, a frase geral', () => {
    render(view({ twoDay: TWO_DAY([ROWS[0]!]) }))
    expect(screen.getByText('Se você ficar 2 dias fora, 1 colega para esperando a sua aprovação.')).toBeTruthy()
    cleanup()
    render(view({ twoDay: TWO_DAY([]) }))
    expect(screen.getByText('Tudo espera a sua aprovação. Se você ficar 2 dias fora, a equipe para no primeiro dia.')).toBeTruthy()
  })

  it('sem ponto único de falha o texto do host fica como veio', () => {
    render(view({ health: { ...HEALTH, findings: [], body: 'A equipe se sustenta bem.' } }))
    expect(screen.getByText('A equipe se sustenta bem.')).toBeTruthy()
  })

  it('o texto existe em pt e en', () => {
    for (const dict of [pt, en]) {
      for (const key of ['health.verdict.waiting', 'health.verdict.waiting.one', 'health.verdict.stops', 'twoDay.fixAll.raise_autonomy', 'twoDay.group.count', 'twoDay.group.count.one']) {
        expect((dict as Record<string, string>)[key], key).toBeTruthy()
      }
    }
  })
})

describe('o Teste dos 2 dias', () => {
  it('cada linha de persona leva o rosto de 32 px e o NOME antes do cargo; linha que não é de persona leva o ícone da equipe', () => {
    const rows = [...ROWS, waits('live-approvals-you', 'Aprovações (você)', { reason: 'Outra razão', fixKind: 'set_substitute' })]
    render(view({ twoDay: TWO_DAY(rows), faceOf: row => (row.id.startsWith('initiative:') ? { name: row.id.slice(11), src: `${row.id.slice(11)}.png` } : undefined) }))
    const sol = document.querySelector('[data-two-day-row][data-row-id="initiative:sol"]') as HTMLElement
    expect(sol.querySelector('img')?.getAttribute('src')).toBe('sol.png')
    const avatar = sol.querySelector('[role="img"], [aria-hidden="true"][style*="width: 32px"]') as HTMLElement | null
    expect(avatar?.getAttribute('style')).toContain('32px')
    expect(sol.textContent?.indexOf('Sol')).toBeLessThan(sol.textContent?.indexOf('Engenharia') ?? -1)
    const system = document.querySelector('[data-two-day-row][data-row-id="live-approvals-you"]') as HTMLElement
    expect(system.querySelector('[data-icon]')).not.toBeNull()
    expect(system.querySelector('[data-tone]')).toBeNull()
  })

  it('os 4 diagnósticos iguais viram UM grupo: o texto uma vez e um botão "Subir os 4 para “Decide o rotineiro”"; as linhas não repetem o texto nem o botão', () => {
    const onTwoDayFixAll = vi.fn()
    render(view({ onTwoDayFixAll }))
    const group = document.querySelector('[data-two-day-group]') as HTMLElement
    expect(within(group).getByText(REASON)).toBeTruthy()
    expect(within(group).getByText('4 colegas')).toBeTruthy()
    fireEvent.click(within(group).getByRole('button', { name: 'Subir os 4 para “Decide o rotineiro”' }))
    expect(onTwoDayFixAll).toHaveBeenCalledTimes(1)
    expect(onTwoDayFixAll.mock.calls[0]?.[0].map((row: TwoDayRowView) => row.id)).toEqual(['initiative:sol', 'initiative:nina', 'initiative:bento', 'initiative:atlas'])
    expect(onTwoDayFixAll.mock.calls[0]?.[1]).toBe('raise_autonomy')
    expect(screen.getAllByText(REASON)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: pt['health.fix.raise_autonomy'] })).toBeNull()
  })

  it('linhas DERIVADAS da equipe viva (ids live-*) não são do host: o grupo diz o diagnóstico com os rostos, mas não oferece um botão em lote que o host não saberia aplicar', () => {
    const derived = ['sol', 'nina', 'bento'].map(name => waits(`live-persona-p-${name}`, `Função (${name})`))
    render(view({ twoDay: TWO_DAY(derived), onTwoDayFixAll: vi.fn() }))
    const group = document.querySelector('[data-two-day-group]') as HTMLElement
    expect(within(group).getByText(REASON)).toBeTruthy()
    expect(within(group).queryByRole('button')).toBeNull()
  })

  it('uma linha com diagnóstico único guarda a própria razão e um botão de verdade (secundário, sem a faísca)', () => {
    const onTwoDayFix = vi.fn()
    render(view({ twoDay: TWO_DAY([waits('initiative:sol', 'Engenharia (Sol)')]), onTwoDayFix }))
    const button = screen.getByRole('button', { name: pt['health.fix.raise_autonomy'] })
    expect(button.className).toMatch(/secondary/u)
    expect(button.querySelector('svg')).toBeNull()
    expect(screen.getByText(REASON)).toBeTruthy()
    fireEvent.click(button)
    expect(onTwoDayFix).toHaveBeenCalledWith(expect.objectContaining({ id: 'initiative:sol' }))
    expect(document.querySelector('[data-two-day-group]')).toBeNull()
  })

  it('cada linha leva o índice do escalonamento (45 ms por linha) para as barras trocarem de cor em sequência', () => {
    render(view())
    const rows = [...document.querySelectorAll<HTMLElement>('[data-two-day-row]')]
    expect(rows.map(row => row.style.getPropertyValue('--two-day-index'))).toEqual(['0', '1', '2', '3'])
  })
})

describe('o velocímetro', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] }) })

  it('na primeira vez mostra a nota na hora; quando a nota muda (o host recalculou), o número sobe até ela em 420 ms', () => {
    const { rerender } = render(view())
    const gauge = () => document.querySelector('[role="meter"]') as HTMLElement
    expect(gauge().getAttribute('aria-valuenow')).toBe('76')
    expect(within(gauge()).getByText('76')).toBeTruthy()
    rerender(view({ health: { ...HEALTH, score: 96 } }))
    // the meter's value is the truth at once; the DRAWN number travels there
    expect(gauge().getAttribute('aria-valuenow')).toBe('96')
    act(() => { vi.advanceTimersByTime(120) })
    const mid = Number(within(gauge()).getByText(/^\d+$/u).textContent)
    expect(mid).toBeGreaterThan(76)
    expect(mid).toBeLessThan(96)
    act(() => { vi.advanceTimersByTime(500) })
    expect(within(gauge()).getByText('96')).toBeTruthy()
  })

  it('com movimento reduzido não há viagem: o número troca na hora', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      const { rerender } = render(view())
      rerender(view({ health: { ...HEALTH, score: 96 } }))
      expect(within(document.querySelector('[role="meter"]') as HTMLElement).getByText('96')).toBeTruthy()
    } finally {
      window.matchMedia = original
    }
  })
})

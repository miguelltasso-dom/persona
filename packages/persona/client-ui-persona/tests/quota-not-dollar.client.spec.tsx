// @vitest-environment jsdom
// D-092 (COTA-NAO-DOLAR-SPEC, Muse): quem usa uma ASSINATURA nunca vê dinheiro; vê o impacto na cota (% da janela) e as chamadas. US$ só com chave de API.
// ACEITE da Muse: com `billing: 'subscription'`, nenhum texto renderizado contém "US$", "$" ou "custo" (pt) / "cost" (en), exceto o `action.pay`.
// Sem a informação da conta (o host ainda não manda o par billing + quota), NUNCA dólar: o padrão é seguro.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FanoutChip } from '../src/client/chat/fanout/FanoutChip.tsx'
import { fanoutEstimateFromWire } from '../src/client/chat/fanout/fanout-rules.ts'
import { OpinionBlock } from '../src/client/chat/opinion/OpinionBlock.tsx'
import { buildOpinionBlocks, mapOpinion, type OpinionUi } from '../src/client/chat/opinion/opinion-model.ts'
import { dropMoneySegments, parseUsage, usageNotice, usageSuffix, usageWindowLabel, usedShortText, usedTone } from '../src/client/chat/quota-text.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt, en as chatEn } from '../src/client/locale/chat/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { MessageView } from '../src/client/remote/persona-remote-types.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const make = (dict: Record<string, string>) => (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = dict[key] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}
const t = make(chatPt as unknown as Record<string, string>) as never
const tEn = make(chatEn as unknown as Record<string, string>) as never
const MONEY = /US\$|\$|\bcusto\b|\bcost\b/iu

describe('parseUsage: o par billing + quota do host', () => {
  it('assinatura com a % da janela', () => {
    expect(parseUsage({ billing: 'subscription', quota: { pct: { min: 3, max: 5 }, window: '5h', resetsAt: '2026-11-05T05:00:00Z' } })).toEqual({
      billing: 'subscription', quota: { pct: { min: 3, max: 5 }, window: '5h', resetsAt: '2026-11-05T05:00:00Z' },
    })
  })

  it('chave de API: o custo em micro-US$ vira US$', () => {
    expect(parseUsage({ billing: 'api', custo: { microUsd: { min: 12_360, max: 23_154 } } })?.usd).toEqual({ min: 0.01236, max: 0.023154 })
  })

  it('assinatura NUNCA carrega dólar, mesmo que o host mande o custo por engano', () => {
    const usage = parseUsage({ billing: 'subscription', quota: null, custo: { microUsd: { min: 1, max: 2 } } })
    expect(usage?.usd).toBeUndefined()
  })

  it('sem "billing" conhecido (o host de hoje) o custo em dólar é IGNORADO', () => {
    expect(parseUsage({ custo: { microUsd: { min: 12_360, max: 23_154 } } })).toBeUndefined()
    expect(parseUsage({ billing: 'talvez', custo: { microUsd: { min: 1, max: 2 } } })).toBeUndefined()
  })

  it('lixo vira "sem informação"', () => {
    expect(parseUsage(null)).toBeUndefined()
    expect(parseUsage({ billing: 'subscription', quota: { pct: { min: 5, max: 3 }, window: '5h' } })?.quota).toBeUndefined()
    expect(parseUsage({ billing: 'subscription', quota: { pct: { min: 1, max: 2 }, window: 'mes' } })?.quota).toBeUndefined()
  })
})

describe('usageSuffix: como se fala', () => {
  const sub = (min: number, max: number) => ({ billing: 'subscription' as const, quota: { pct: { min, max }, window: '5h' as const } })

  it('assinatura: "cerca de {pct}% da janela" (faixa quando varia)', () => {
    expect(usageSuffix(t, sub(4, 4))).toBe('cerca de 4% da janela')
    expect(usageSuffix(t, sub(3, 6))).toBe('cerca de 3–6% da janela')
  })

  it('muito pouco (< 1%): "quase nada da sua janela"', () => {
    expect(usageSuffix(t, sub(0.1, 0.6))).toBe('quase nada da sua janela')
  })

  it('janela desconhecida (sem quota): nada (quem chama mantém as chamadas)', () => {
    expect(usageSuffix(t, { billing: 'subscription' })).toBeUndefined()
    expect(usageSuffix(t, undefined)).toBeUndefined()
  })

  it('chave de API: "≈ US$ min–max", um valor só, ou "menos de US$ 0,01"', () => {
    const range = usageSuffix(t, { billing: 'api', usd: { min: 0.012, max: 0.023 } }) as string
    expect(range).toMatch(/^≈ US\$ 0[.,]01–0[.,]02$/u)
    expect(usageSuffix(t, { billing: 'api', usd: { min: 0.5, max: 0.5 } })).toMatch(/^≈ US\$ 0[.,]50$/u)
    expect(usageSuffix(t, { billing: 'api', usd: { min: 0, max: 0.004 } })).toBe('menos de US$ 0,01')
  })

  it('tipo de conta desconhecido: igual à assinatura (nunca dinheiro)', () => {
    expect(usageSuffix(t, { billing: 'unknown', usd: { min: 1, max: 2 } })).toBeUndefined()
  })

  it('em inglês também', () => {
    expect(usageSuffix(tEn, sub(4, 4))).toBe('about 4% of your window')
  })

  it('dropMoneySegments: fora da API, trecho com $, US$, custo ou cost sai; na API fica', () => {
    expect(dropMoneySegments('≈ 3 respostas · ≈ US$ 0,02', 'subscription')).toBe('≈ 3 respostas')
    expect(dropMoneySegments('≈ 3 respostas · custo medido', undefined)).toBe('≈ 3 respostas')
    expect(dropMoneySegments('≈ 3 respostas · ≈ US$ 0,02', 'api')).toBe('≈ 3 respostas · ≈ US$ 0,02')
    expect(dropMoneySegments('≈ 3 respostas', 'subscription')).toBe('≈ 3 respostas')
  })
})

describe('o chip "Toda a equipe" (CV-8)', () => {
  const chip = (estimate: Parameters<typeof FanoutChip>[0]['estimate']) => {
    render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={estimate} />)
    return document.querySelector('[data-fanout-chip]')?.textContent ?? ''
  }

  it('assinatura com a %: as chamadas e "cerca de {pct}% da janela"', () => {
    const usage = parseUsage({ billing: 'subscription', quota: { pct: { min: 4, max: 4 }, window: '5h' } })
    expect(chip({ replies: 4, calls: { min: 4, max: 4 }, ...(usage === undefined ? {} : { usage }) })).toBe('Toda a equipe · 4 respostas · ≈ 4 chamadas da sua IA · cerca de 4% da janela')
  })

  it('assinatura com a janela desconhecida: só as chamadas (sem %), como antes', () => {
    expect(chip({ replies: 4, calls: { min: 4, max: 4 } })).toBe('Toda a equipe · 4 respostas · ≈ 4 chamadas da sua IA')
  })

  it('chave de API: "≈ US$" no lugar das chamadas', () => {
    const usage = parseUsage({ billing: 'api', custo: { microUsd: { min: 12_000, max: 23_000 } } })
    const text = chip({ replies: 4, calls: { min: 4, max: 4 }, ...(usage === undefined ? {} : { usage }) })
    expect(text).toMatch(/^Toda a equipe · 4 respostas · ≈ US\$ 0[.,]01–0[.,]02$/u)
    expect(text).not.toContain('chamadas')
  })

  it('o EstimateAskView de HOJE (custo em micro-US$, sem billing) não vira dólar na tela', () => {
    const estimate = fanoutEstimateFromWire({ fanout: { replies: 4, chamadas: { min: 4, max: 4 } }, custo: { microUsd: { min: 12_000, max: 23_000 } } })
    const text = chip(estimate)
    expect(text).toBe('Toda a equipe · 4 respostas · ≈ 4 chamadas da sua IA')
    expect(text).not.toMatch(MONEY)
  })

  it('fanoutEstimateFromWire lê o par billing + quota do EstimateAskView', () => {
    const estimate = fanoutEstimateFromWire({ fanout: { replies: 3 }, billing: 'subscription', quota: { pct: { min: 2, max: 2 }, window: 'week' } })
    expect(estimate?.usage).toEqual({ billing: 'subscription', quota: { pct: { min: 2, max: 2 }, window: 'week' } })
  })
})

describe('o rodapé do Pedido de opinião', () => {
  const TEAM = { personas: [] } as never
  const request = (opinion: OpinionUi): ChannelMessageUi => ({ id: 'm-req', authorId: 'nina', authorName: 'Nina', body: 'Qual capa?', timeLabel: '10:00', reactions: [], opinion })
  const base: OpinionUi = { kind: 'request', requestId: 'req-1', taskId: 'tk', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [] }
  const footer = (opinion: OpinionUi): string => {
    const block = buildOpinionBlocks([request(opinion)]).get('req-1')
    if (block === undefined) throw new Error('sem bloco')
    render(<OpinionBlock t={t} block={block} team={TEAM} />)
    return document.querySelector('[class*="footnote"]')?.textContent ?? ''
  }
  const wireOf = (opinion: unknown): MessageView => ({ ...hostMessage({ id: 'm1', seq: 1, actorId: 'persona-nina', body: 'Qual capa?', subjectId: 's', occurredAt: '2026-11-04T13:00:00.000Z' }), opinion } as MessageView)

  it('assinatura com a %: "≈ n respostas · cerca de {pct}% da janela"', () => {
    const usage = parseUsage({ billing: 'subscription', quota: { pct: { min: 5, max: 5 }, window: '5h' } })
    expect(footer({ ...base, estimate: { responses: 3 }, ...(usage === undefined ? {} : { usage }) })).toBe('≈ 3 respostas · cerca de 5% da janela')
  })

  it('chave de API: "≈ n respostas · ≈ US$ x–y"', () => {
    const usage = parseUsage({ billing: 'api', custo: { microUsd: { min: 30_000, max: 60_000 } } })
    expect(footer({ ...base, estimate: { responses: 3 }, ...(usage === undefined ? {} : { usage }) })).toMatch(/^≈ 3 respostas · ≈ US\$ 0[.,]03–0[.,]06$/u)
  })

  it('o rodapé PRONTO do Tally com dinheiro, sem ser API: o trecho de dinheiro sai', () => {
    expect(footer({ ...base, footer: '≈ 3 respostas · ≈ US$ 0,05', usage: { billing: 'subscription' } })).toBe('≈ 3 respostas')
    expect(footer({ ...base, footer: '≈ 3 respostas · custo medido: 0,05' })).toBe('≈ 3 respostas')
  })

  it('o mapper lê o par billing + quota da estimativa e do budget', () => {
    expect(mapOpinion(wireOf({ kind: 'request', requestId: 'r', estimate: { responses: 3, billing: 'subscription', quota: { pct: { min: 4, max: 4 }, window: '5h' } } }))?.usage?.quota?.pct).toEqual({ min: 4, max: 4 })
    expect(mapOpinion(wireOf({ kind: 'request', requestId: 'r', budget: { rodape: '≈ 3 respostas', billing: 'subscription', quota: { pct: { min: 2, max: 2 }, window: 'week' } } }))?.usage?.billing).toBe('subscription')
  })

  it('o "cost" em texto que o host mandava continua aparecendo se não tem dinheiro (compatível)', () => {
    expect(footer({ ...base, estimate: { responses: 3, cost: '≈ 4 chamadas da sua IA' } })).toBe('≈ 3 respostas · ≈ 4 chamadas da sua IA')
  })
})

describe('o nome da janela mora no tooltip (Muse 00:35)', () => {
  const sub = (window: '5h' | 'week') => ({ billing: 'subscription' as const, quota: { pct: { min: 4, max: 4 }, window } })

  it('usageWindowLabel: "da sua janela de 5 h" / da semana; na chave de API ou sem a % não há janela a nomear', () => {
    expect(usageWindowLabel(t, sub('5h'))).toBe('da sua janela de 5 h')
    expect(usageWindowLabel(t, sub('week'))).toBe('da sua janela da semana')
    expect(usageWindowLabel(t, { billing: 'api', usd: { min: 1, max: 2 } })).toBeUndefined()
    expect(usageWindowLabel(t, { billing: 'subscription' })).toBeUndefined()
    expect(usageWindowLabel(t, undefined)).toBeUndefined()
  })

  it('no chip: o trecho da % é focável e o tooltip diz o nome da janela; o texto visível não muda', () => {
    vi.useFakeTimers()
    render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 }, usage: sub('5h') }} />)
    expect(document.querySelector('[data-fanout-chip]')?.textContent).toBe('Toda a equipe · 4 respostas · ≈ 4 chamadas da sua IA · cerca de 4% da janela')
    const part = document.querySelector('[data-quota-window]') as HTMLElement
    expect(part.tabIndex).toBe(0)
    fireEvent.focus(part)
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.getByRole('tooltip').textContent).toBe('da sua janela de 5 h')
    vi.useRealTimers()
  })

  it('sem a % não há trecho com tooltip', () => {
    render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 } }} />)
    expect(document.querySelector('[data-quota-window]')).toBeNull()
  })

  it('no rodapé da opinião (composto da estimativa) também', () => {
    const request: ChannelMessageUi = {
      id: 'm-req', authorId: 'nina', authorName: 'Nina', body: 'Qual capa?', timeLabel: '10:00', reactions: [],
      opinion: { kind: 'request', requestId: 'req-1', taskId: 'tk', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [], estimate: { responses: 3 }, usage: sub('week') },
    }
    const block = buildOpinionBlocks([request]).get('req-1')
    if (block === undefined) throw new Error('sem bloco')
    render(<OpinionBlock t={t} block={block} team={{ personas: [] } as never} />)
    expect(document.querySelector('[class*="footnote"]')?.textContent).toBe('≈ 3 respostas · cerca de 4% da janela')
    expect(document.querySelector('[data-quota-window]')).not.toBeNull()
  })
})

describe('o aviso "pode não caber no que resta da sua janela" (Tally: remainingPct)', () => {
  const quota = (extra: Record<string, unknown> = {}) => ({ billing: 'subscription', quota: { pct: { min: 6, max: 9 }, window: '5h', resetsAt: '2026-11-05T17:30:00.000Z', remainingPct: 5, ...extra } })

  it('parseUsage lê o que resta da janela (0–100) e ignora o que está fora da faixa', () => {
    expect(parseUsage(quota())?.quota?.remainingPct).toBe(5)
    expect(parseUsage(quota({ remainingPct: 140 }))?.quota?.remainingPct).toBeUndefined()
    expect(parseUsage(quota({ remainingPct: -1 }))?.quota?.remainingPct).toBeUndefined()
    expect(parseUsage(quota({ remainingPct: 'muito' }))?.quota?.remainingPct).toBeUndefined()
  })

  it('o pedido usa MAIS do que resta: o aviso nomeia a janela e o horário do reinício', () => {
    const text = usageNotice(t, parseUsage(quota())) as string
    expect(text).toMatch(/^pode não caber no que resta da sua janela de 5 h \(até \d{2}:\d{2}\)$/u)
  })

  it('janela da semana: "da sua janela da semana", nunca "5 h"', () => {
    const text = usageNotice(t, parseUsage(quota({ window: 'week' }))) as string
    expect(text).toContain('da sua janela da semana')
    expect(text).not.toContain('5 h')
  })

  it('sem o horário de reinício o aviso vem sem o "(até …)"', () => {
    expect(usageNotice(t, parseUsage(quota({ resetsAt: undefined })))).toBe('pode não caber no que resta da sua janela de 5 h')
    expect(usageNotice(t, parseUsage(quota({ resetsAt: 'ontem' })))).toBe('pode não caber no que resta da sua janela de 5 h')
  })

  it('cabendo (pct.max <= o que resta), sem o que resta, na chave de API ou sem usage: nenhum aviso', () => {
    expect(usageNotice(t, parseUsage(quota({ remainingPct: 9 })))).toBeUndefined()
    expect(usageNotice(t, parseUsage(quota({ remainingPct: 50 })))).toBeUndefined()
    expect(usageNotice(t, parseUsage(quota({ remainingPct: undefined })))).toBeUndefined()
    expect(usageNotice(t, { billing: 'api', usd: { min: 1, max: 2 } })).toBeUndefined()
    expect(usageNotice(t, undefined)).toBeUndefined()
  })

  it('o chip mostra o aviso depois do uso (sem bloquear nada), e sem aviso quando cabe', () => {
    const { unmount } = render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 }, usage: parseUsage(quota()) as never }} />)
    expect(document.querySelector('[data-quota-notice]')?.textContent).toMatch(/^ · pode não caber no que resta da sua janela de 5 h/u)
    expect(document.querySelector('[data-fanout-chip]')?.textContent).toContain('cerca de 6–9% da janela')
    unmount()
    render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 }, usage: parseUsage(quota({ remainingPct: 80 })) as never }} />)
    expect(document.querySelector('[data-quota-notice]')).toBeNull()
  })

  it('o rodapé composto da opinião também; o do Tally pronto não ganha aviso por cima', () => {
    const usage = parseUsage(quota()) as never
    const base = { kind: 'request', requestId: 'req-1', taskId: 'tk', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [] } as const
    const rows = (opinion: OpinionUi): ChannelMessageUi[] => [{ id: 'm', authorId: 'nina', authorName: 'Nina', body: 'Qual?', timeLabel: '10:00', reactions: [], opinion }]
    const compose = buildOpinionBlocks(rows({ ...base, estimate: { responses: 3 }, usage })).get('req-1')
    if (compose === undefined) throw new Error('sem bloco')
    const { unmount } = render(<OpinionBlock t={t} block={compose} team={{ personas: [] } as never} />)
    expect(document.querySelector('[data-quota-notice]')).not.toBeNull()
    unmount()
    const ready = buildOpinionBlocks(rows({ ...base, footer: '≈ 3 respostas · cerca de 7% da sua janela', usage })).get('req-1')
    if (ready === undefined) throw new Error('sem bloco')
    render(<OpinionBlock t={t} block={ready} team={{ personas: [] } as never} />)
    expect(document.querySelector('[data-quota-notice]')).toBeNull()
  })
})

describe('sem % do pedido (pct = null) mas com o uso oficial da janela (Muse 02:30)', () => {
  const official = (usedPct: number, window: '5h' | 'week' = '5h') => parseUsage({ billing: 'subscription', quota: { window, pct: null, usedPct, origin: 'not-measured' } })

  it('parseUsage guarda o uso oficial e NÃO inventa a % do pedido', () => {
    const usage = official(42, 'week')
    expect(usage?.official).toEqual({ usedPct: 42, window: 'week' })
    expect(usage?.quota).toBeUndefined()
  })

  it('a frase curta (chip): janela de 5 h e semana; as chamadas vão dentro dela', () => {
    expect(usedShortText(t, official(42), '4')).toBe('≈ 4 chamadas · 42% da janela já usada')
    expect(usedShortText(t, official(42, 'week'), '1–6')).toBe('≈ 1–6 chamadas · 42% da semana já usada')
    expect(usedShortText(tEn, official(42), '4')).toBe('≈ 4 calls · 42% of the window used')
  })

  it('só quando NÃO há a % do pedido: com ela vale "cerca de {pct}% da janela"; na chave de API e sem o uso oficial: nada', () => {
    const both = parseUsage({ billing: 'subscription', quota: { window: '5h', pct: { min: 4, max: 4 }, usedPct: 42 } })
    expect(usedShortText(t, both, '4')).toBeUndefined()
    expect(usedShortText(t, { billing: 'api', usd: { min: 1, max: 2 } }, '4')).toBeUndefined()
    expect(usedShortText(t, { billing: 'subscription' }, '4')).toBeUndefined()
    expect(usedShortText(t, undefined, '4')).toBeUndefined()
  })

  it('o tom é neutro até 80% e `warning` a partir daí', () => {
    expect(usedTone(official(42))).toBeUndefined()
    expect(usedTone(official(79))).toBeUndefined()
    expect(usedTone(official(80))).toBe('warning')
    expect(usedTone(official(93, 'week'))).toBe('warning')
  })

  it('o nome da janela do tooltip vem do uso oficial também', () => {
    expect(usageWindowLabel(t, official(42))).toBe('da sua janela de 5 h')
    expect(usageWindowLabel(t, official(42, 'week'))).toBe('da sua janela da semana')
  })

  it('o chip diz o uso oficial, sem "cota não medida" e sem tom de alerta abaixo de 80%', () => {
    render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 }, usage: official(42, 'week') as never }} />)
    const chip = document.querySelector('[data-fanout-chip]') as HTMLElement
    expect(chip.textContent).toBe('Toda a equipe · 4 respostas · ≈ 4 chamadas · 42% da semana já usada')
    expect(chip.textContent).not.toMatch(/não medida|nao medida|not measured/iu)
    expect(chip.hasAttribute('data-tone')).toBe(false)
  })

  it('a partir de 80% o chip ganha o tom de alerta', () => {
    render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 }, usage: official(85) as never }} />)
    expect((document.querySelector('[data-fanout-chip]') as HTMLElement).getAttribute('data-tone')).toBe('warning')
  })

  it('sem o uso oficial e sem a %, a frase é a de sempre: "≈ {calls} chamadas da sua IA"', () => {
    render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 }, usage: parseUsage({ billing: 'subscription', quota: null }) as never }} />)
    expect(document.querySelector('[data-fanout-chip]')?.textContent).toBe('Toda a equipe · 4 respostas · ≈ 4 chamadas da sua IA')
  })

  it('as formas curtas do uso oficial existem nos dois idiomas (janela e semana; Muse confirmou 02:46) e o texto de "motor que não informa" NÃO mora aqui (é do Lumen, em Uso e limites)', () => {
    const pt = make(chatPt as unknown as Record<string, string>)
    const en = make(chatEn as unknown as Record<string, string>)
    expect(pt('quota.usedShort', { calls: '4', used: '42' })).toBe('≈ 4 chamadas · 42% da janela já usada')
    expect(pt('quota.usedShortWeek', { calls: '4', used: '42' })).toBe('≈ 4 chamadas · 42% da semana já usada')
    expect(en('quota.usedShort', { calls: '4', used: '42' })).toBe('≈ 4 calls · 42% of the window used')
    expect(en('quota.usedShortWeek', { calls: '4', used: '42' })).toBe('≈ 4 calls · 42% of the week used')
    expect('quota.notReported' in (chatPt as Record<string, unknown>)).toBe(false)
    expect('quota.notReported' in (chatEn as Record<string, unknown>)).toBe(false)
  })
})

describe('ACEITE da Muse: com assinatura, nenhum texto renderizado traz dinheiro', () => {
  it('o chip e o rodapé, com a % e com o texto bruto do host cheio de dólar', () => {
    const usage = parseUsage({ billing: 'subscription', quota: { pct: { min: 4, max: 4 }, window: '5h' }, custo: { microUsd: { min: 30_000, max: 60_000 } } })
    render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 }, ...(usage === undefined ? {} : { usage }) }} />)
    const request: ChannelMessageUi = {
      id: 'm-req', authorId: 'nina', authorName: 'Nina', body: 'Qual capa?', timeLabel: '10:00', reactions: [],
      opinion: { kind: 'request', requestId: 'req-1', taskId: 'tk', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [], footer: '≈ 3 respostas · ≈ US$ 0,05 · custo medido', ...(usage === undefined ? {} : { usage }) },
    }
    const block = buildOpinionBlocks([request]).get('req-1')
    if (block === undefined) throw new Error('sem bloco')
    render(<OpinionBlock t={t} block={block} team={{ personas: [] } as never} />)
    expect(document.body.textContent).not.toMatch(MONEY)
  })
})

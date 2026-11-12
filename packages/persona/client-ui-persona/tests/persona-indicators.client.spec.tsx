// @vitest-environment jsdom
// Colheita item 19a · "Seus números": o corpo dos 6 tipos, o cartão e os estados do rodapé, a seção (esqueleto, vazio, grade), o número na
// conversa com "Fixar na Visão geral" e o modal (o teste é obrigatório, o resultado real aparece, só então "Fixar"), com um host de mentira.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { IndicatorBody } from '../src/client/indicators/IndicatorBody.tsx'
import { IndicatorCard } from '../src/client/indicators/IndicatorCard.tsx'
import { IndicatorOffer } from '../src/client/indicators/IndicatorOffer.tsx'
import { SeusNumeros } from '../src/client/indicators/SeusNumeros.tsx'
import {
  barFractions, footerOf, goalPercentOf, linePoints, staleWordOf, trendToneOf,
  type IndicatorOfferUi, type IndicatorUi, type IndicatorUiData,
} from '../src/client/indicators/indicators-model.ts'
import { indicatorsRemoteFrom } from '../src/client/indicators/indicators-remote.ts'
import { IndicatorsProvider } from '../src/client/indicators/use-indicators.tsx'
import { mapMessage } from '../src/client/remote/map-host-ui.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const TEAM = { personas: [{ id: 'p-nina', name: 'Nina', avatarRef: 'nina', title: 'Vendas' }], members: [] } as unknown as TeamView
const TENANT = { workspaceId: 'ws', projectId: 'pp' }
const NOW = new Date(2026, 10, 12, 9, 0, 0)
const at = (day: number, hour: number): string => new Date(2026, 10, day, hour, 0, 0).toISOString()

const SALES: IndicatorUiData = { kind: 'numero', value: 'R$ 1.240', raw: 1240, trend: { text: '+12% desde ontem', direction: 'up', goodWhen: 'up' } }

function card(extra: Partial<IndicatorUi> = {}): IndicatorUi {
  return {
    id: 'ind:m-1', name: 'Vendas de ontem', data: SALES, schedule: 'daily', status: 'ok', updatedAt: at(12, 8),
    personaName: 'Nina', sourceMessageId: 'm-1', ...extra,
  }
}

describe('as regras puras', () => {
  it('a tendência: cair só é ruim quando o indicador diz que cair é ruim; igual é neutro', () => {
    expect(trendToneOf({ direction: 'up', goodWhen: 'up' })).toBe('good')
    expect(trendToneOf({ direction: 'down', goodWhen: 'up' })).toBe('bad')
    expect(trendToneOf({ direction: 'down', goodWhen: 'down' })).toBe('good')
    expect(trendToneOf({ direction: 'flat', goodWhen: 'up' })).toBe('neutral')
    expect(trendToneOf(undefined)).toBe('neutral')
  })

  it('a meta, as barras e a linha', () => {
    expect(goalPercentOf({ value: 18, goal: 30 })).toBe(60)
    expect(goalPercentOf({ value: 99, goal: 30 })).toBe(100)
    expect(goalPercentOf({ value: 5, goal: 0 })).toBe(0)
    expect(barFractions([{ value: 5 }, { value: 10 }, { value: 0 }])).toEqual([0.5, 1, 0])
    expect(linePoints([{ value: 0 }, { value: 10 }], 100, 50, 0)).toBe('0.0,50.0 100.0,0.0')
    expect(linePoints([{ value: 3 }, { value: 3 }], 100, 50, 0)).toBe('0.0,25.0 100.0,25.0')
    expect(linePoints([], 100, 50)).toBe('')
  })

  it('o rodapé: atualizado hoje (com a hora), em outro dia (com o dia), atualizando, falhou e alerta', () => {
    expect(footerOf({ status: 'ok', updatedAt: at(12, 8) }, NOW)).toEqual({ text: 'Atualizado às 8:00', tone: 'plain' })
    expect(footerOf({ status: 'ok', updatedAt: at(11, 8) }, NOW).text).toMatch(/^Atualizado em 11\/11 às 8:00$/u)
    expect(footerOf({ status: 'updating', updatedAt: at(12, 8) }, NOW)).toEqual({ text: 'Atualizando…', tone: 'updating' })
    expect(footerOf({ status: 'failed', updatedAt: at(12, 8) }, NOW)).toEqual({ text: 'Não consegui atualizar', tone: 'failed' })
    expect(footerOf({ status: 'ok', updatedAt: at(12, 8), alert: { pct: 24, text: 'Caiu 24% desde ontem', at: at(12, 8) } }, NOW)).toEqual({ text: 'Caiu 24% desde ontem', tone: 'alert' })
    expect(staleWordOf(at(11, 8), NOW)).toBe('de ontem')
    expect(staleWordOf(at(12, 8), NOW)).toBe('de hoje 8:00')
    expect(staleWordOf(at(5, 8), NOW)).toBe('de 05/11')
  })

  it('o host só vale com as cinco chamadas', () => {
    const fn = (): undefined => undefined
    const all = { listIndicators: fn, testIndicator: fn, pinIndicator: fn, unpinIndicator: fn, refreshIndicator: fn }
    expect(indicatorsRemoteFrom(all)).toBeDefined()
    expect(indicatorsRemoteFrom({ ...all, refreshIndicator: undefined })).toBeUndefined()
    expect(indicatorsRemoteFrom(undefined)).toBeUndefined()
  })
})

describe('o corpo dos seis tipos', () => {
  it('número: o valor e a tendência SEMPRE com palavras (e o tom)', () => {
    render(<IndicatorBody data={SALES} />)
    expect(screen.getByText('R$ 1.240')).toBeTruthy()
    expect(screen.getByText('+12% desde ontem')).toBeTruthy()
    expect(document.querySelector('[data-tone="good"]')).not.toBeNull()
    cleanup()
    render(<IndicatorBody data={{ kind: 'numero', value: '9', trend: { text: '-31% desde ontem', direction: 'down', goodWhen: 'up' } }} />)
    expect(document.querySelector('[data-tone="bad"]')).not.toBeNull()
    expect(screen.getByText('-31% desde ontem')).toBeTruthy()
  })

  it('meta, barras, linha, lista e resumo', () => {
    const { unmount } = render(<IndicatorBody data={{ kind: 'meta', value: 18, goal: 30, unit: 'pedidos' }} />)
    expect(screen.getByText('18 pedidos de 30')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60')
    unmount()
    const bars = render(<IndicatorBody data={{ kind: 'barras', points: [{ label: 'Seg', value: 12 }, { label: 'Ter', value: 9 }] }} />)
    expect(bars.container.querySelectorAll('li')).toHaveLength(2)
    bars.unmount()
    const line = render(<IndicatorBody data={{ kind: 'linha', points: [{ label: '1', value: 10 }, { label: '2', value: 14 }] }} />)
    expect(line.container.querySelector('polyline')).not.toBeNull()
    expect(screen.getByText('2: 14')).toBeTruthy()
    line.unmount()
    const items = Array.from({ length: 6 }, (_, index) => ({ text: `Item ${String(index)}`, state: index === 1 ? 'atencao' as const : 'ok' as const }))
    const list = render(<IndicatorBody data={{ kind: 'lista', items }} />)
    expect(list.container.querySelectorAll('li')).toHaveLength(5) // 4 visíveis + "+2 itens"
    expect(screen.getByText('+2 itens')).toBeTruthy()
    expect(list.container.querySelector('[data-state="atencao"]')?.textContent).toContain('!')
    list.unmount()
    render(<IndicatorBody data={{ kind: 'resumo', sentences: ['Vendemos mais.', 'Dois clientes sem retorno.'] }} />)
    expect(screen.getByText('Dois clientes sem retorno.')).toBeTruthy()
  })
})

describe('o cartão fixado', () => {
  it('atualizado: nome, valor e "Atualizado às 8:00"', () => {
    render(<ul><IndicatorCard card={card()} now={NOW} /></ul>)
    expect(screen.getByRole('heading', { name: 'Vendas de ontem' })).toBeTruthy()
    expect(screen.getByText('R$ 1.240')).toBeTruthy()
    expect(screen.getByText('Atualizado às 8:00')).toBeTruthy()
    expect(document.querySelector('[data-indicator-alert]')).toBeNull()
  })

  it('atualizando: o valor antigo continua', () => {
    render(<ul><IndicatorCard card={card({ status: 'updating' })} now={NOW} /></ul>)
    expect(screen.getByText('Atualizando…')).toBeTruthy()
    expect(screen.getByText('R$ 1.240')).toBeTruthy()
  })

  it('falhou: o valor antigo continua com "de ontem", o rodapé diz e "Ver por quê" abre o motivo', () => {
    render(<ul><IndicatorCard card={card({ status: 'failed', failure: 'Não consegui falar com a loja.', updatedAt: at(11, 8) })} now={NOW} /></ul>)
    expect(screen.getByText('R$ 1.240')).toBeTruthy()
    expect(screen.getByText('de ontem')).toBeTruthy()
    expect(screen.getByText('Não consegui atualizar')).toBeTruthy()
    expect(screen.queryByText('Não consegui falar com a loja.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver por quê' }))
    expect(screen.getByRole('status').textContent).toBe('Não consegui falar com a loja.')
    expect(screen.getByRole('button', { name: 'Esconder' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('alerta: a borda marca o cartão e o rodapé diz o que caiu', () => {
    render(<ul><IndicatorCard card={card({ alert: { pct: 24, text: 'Caiu 24% desde ontem', at: at(12, 8) } })} now={NOW} /></ul>)
    expect(document.querySelector('[data-indicator-alert="true"]')).not.toBeNull()
    expect(screen.getByText('Caiu 24% desde ontem')).toBeTruthy()
  })

  it('o menu de ações só existe com as ações', () => {
    const { rerender } = render(<ul><IndicatorCard card={card()} now={NOW} /></ul>)
    expect(screen.queryByRole('button', { name: /Mais ações de/u })).toBeNull()
    rerender(<ul><IndicatorCard card={card()} now={NOW} onRefresh={vi.fn()} onUnpin={vi.fn()} /></ul>)
    expect(screen.getByRole('button', { name: 'Mais ações de Vendas de ontem' })).toBeTruthy()
  })
})

describe('a seção "Seus números"', () => {
  it('antes da primeira leitura: esqueleto, e nunca um falso "nada fixado"', () => {
    render(<SeusNumeros items={[]} loaded={false} />)
    expect(screen.getByRole('heading', { name: 'Seus números' })).toBeTruthy()
    expect(screen.queryByText('Nada fixado ainda')).toBeNull()
  })

  it('vazio: ensina a pedir um número', () => {
    render(<SeusNumeros items={[]} loaded />)
    expect(screen.getByText('Nada fixado ainda')).toBeTruthy()
    expect(screen.getByText(/Peça um número a alguém da equipe, como “quanto vendemos ontem\?”, e toque em Fixar\./u)).toBeTruthy()
  })

  it('com números: a grade, um cartão por número', () => {
    render(<SeusNumeros items={[card(), card({ id: 'ind:m-2', name: 'Meta do mês', data: { kind: 'meta', value: 18, goal: 30 }, sourceMessageId: 'm-2' })]} loaded now={NOW} />)
    expect(document.querySelectorAll('[data-indicator]')).toHaveLength(2)
    expect(screen.getByText('Meta do mês')).toBeTruthy()
    expect(screen.queryByText('Nada fixado ainda')).toBeNull()
  })
})

const OFFER: IndicatorOfferUi = { messageId: 'm-1', name: 'Vendas de ontem', data: SALES }

function fakeHost(extra: Record<string, unknown> = {}): Record<string, ReturnType<typeof vi.fn>> {
  const pinned = card({ id: 'ind:m-1', name: 'Vendas de ontem', updatedAt: new Date().toISOString() })
  // The host keeps what was pinned: the list read after the pin must bring it back, as the real one does.
  const kept: IndicatorUi[] = []
  return {
    listIndicators: vi.fn().mockImplementation(() => Promise.resolve([...kept])),
    testIndicator: vi.fn().mockResolvedValue({ testId: 'itest:1', name: 'Vendas de ontem', data: { kind: 'numero', value: 'R$ 1.300', raw: 1300 } }),
    pinIndicator: vi.fn().mockImplementation(() => { kept.push(pinned); return Promise.resolve(pinned) }),
    unpinIndicator: vi.fn().mockResolvedValue(true),
    refreshIndicator: vi.fn().mockResolvedValue(pinned),
    ...extra,
  } as Record<string, ReturnType<typeof vi.fn>>
}

describe('"Fixar na Visão geral" na conversa', () => {
  const renderOffer = (remote: object | undefined) => render(
    <IndicatorsProvider remote={remote} tenant={TENANT}><ul><IndicatorOffer offer={OFFER} personaName="Nina" /></ul></IndicatorsProvider>,
  )

  it('sem o host, o número aparece e não há botão (nenhum controle morto)', () => {
    renderOffer(undefined)
    expect(screen.getByText('R$ 1.240')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fixar na Visão geral' })).toBeNull()
  })

  it('o modal: "Fixar" só depois do teste; o resultado real aparece; depois de fixar o botão vira "Fixado"', async () => {
    const host = fakeHost()
    renderOffer(host)
    fireEvent.click(await screen.findByRole('button', { name: 'Fixar na Visão geral' }))
    const dialog = await screen.findByRole('dialog')
    const fixar = within(dialog).getByRole('button', { name: 'Fixar' })
    expect((fixar as HTMLButtonElement).disabled).toBe(true)
    expect(within(dialog).getByText('Teste antes de fixar: assim você vê o número de verdade.')).toBeTruthy()
    expect((within(dialog).getByRole('radio', { name: 'Todo dia às 8h' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Avisar quando cair mais de 20%' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Testar agora' }))
    await waitFor(() => { expect(within(dialog).getByText('R$ 1.300')).toBeTruthy() })
    expect(host.testIndicator).toHaveBeenCalledWith({ ...TENANT, messageId: 'm-1' })
    expect((within(dialog).getByRole('button', { name: 'Fixar' }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fixar' }))
    await waitFor(() => { expect(host.pinIndicator).toHaveBeenCalledTimes(1) })
    expect(host.pinIndicator).toHaveBeenCalledWith({ ...TENANT, testId: 'itest:1', name: 'Vendas de ontem', schedule: 'daily', alertDropPct: 20 })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(screen.getByText('Fixado na Visão geral')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fixar na Visão geral' })).toBeNull()
  })

  it('o teste que falha mostra a frase do host e "Fixar" continua travado; a frequência "A cada hora" e o nome editado seguem para o host', async () => {
    const host = fakeHost({ testIndicator: vi.fn().mockRejectedValueOnce(new Error('Não consegui testar agora. A conexão com a loja caiu.')).mockResolvedValue({ testId: 'itest:2', name: 'Vendas de ontem', data: { kind: 'numero', value: 'R$ 1.310' } }) })
    renderOffer(host)
    fireEvent.click(await screen.findByRole('button', { name: 'Fixar na Visão geral' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Testar agora' }))
    await waitFor(() => { expect(within(dialog).getByRole('alert').textContent).toContain('A conexão com a loja caiu.') })
    expect((within(dialog).getByRole('button', { name: 'Fixar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('radio', { name: 'A cada hora' }))
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nome do número' }), { target: { value: 'Vendas' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Testar agora' }))
    await waitFor(() => { expect(within(dialog).getByText('R$ 1.310')).toBeTruthy() })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fixar' }))
    await waitFor(() => { expect(host.pinIndicator).toHaveBeenCalledWith({ ...TENANT, testId: 'itest:2', name: 'Vendas', schedule: 'hourly' }) })
  })

  it('só número avisa quando cair: uma meta não oferece o aviso', async () => {
    const host = fakeHost()
    render(<IndicatorsProvider remote={host} tenant={TENANT}><ul><IndicatorOffer offer={{ messageId: 'm-3', name: 'Meta', data: { kind: 'meta', value: 1, goal: 2 } }} personaName="Nina" /></ul></IndicatorsProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Fixar na Visão geral' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
  })
})

describe('no fio', () => {
  const event = (body: string): MessageView => ({
    id: 'm-1', streamId: 'channel:geral', seq: 3, body, actorId: 'p-nina', subjectId: '', occurredAt: '2026-11-12T11:00:00.000Z', type: 'message', source: 'host',
    attachmentIds: [], replyToId: '', editedAt: '', pinned: false, reactions: [], topicId: '', indicatorOffer: OFFER,
  } as MessageView)

  it('o mapa leva o número; a mensagem mostra as palavras e o número logo abaixo, e o nome aparece uma vez', () => {
    const ui = mapMessage(event('Vendemos bem ontem.'), TEAM, 'owner')
    expect(ui.indicatorOffer).toMatchObject({ messageId: 'm-1', name: 'Vendas de ontem' })
    render(<ol><MessageList t={t} team={TEAM} messages={[ui]} /></ol>)
    expect(screen.getByText('Vendemos bem ontem.')).toBeTruthy()
    expect(document.querySelector('[data-indicator-offer="m-1"]')).not.toBeNull()
    expect(screen.getByText('R$ 1.240')).toBeTruthy()
    expect(document.body.textContent).not.toContain('[[')
    expect(screen.getAllByText('Nina')).toHaveLength(1)
  })
})

import { expect, it } from 'vitest'
import {
  INDICATOR_BARS_MAX,
  INDICATOR_SENTENCES_MAX,
  evaluateAlert,
  goalPercent,
  readIndicatorMarker,
  readRefreshAnswer,
  trendTone,
} from '../src/index.ts'

/** "Seus números" (colheita item 19a): the six kinds, the marker a persona writes, the trend and its tone, the alert. */

const marker = (row: Record<string, unknown>): string => `Vendemos bem ontem.\n[[indicador: ${JSON.stringify(row)}]]`

it('a number with a trend: the words stay, the offer has the text, the raw value and the direction', () => {
  const read = readIndicatorMarker(marker({ tipo: 'numero', nome: 'Vendas de ontem', valor: 'R$ 1.240', bruto: 1240, tendencia: '+12% desde ontem', direcao: 'sobe', bomQuando: 'sobe' }))
  expect(read.text).toBe('Vendemos bem ontem.')
  expect(read.offer).toEqual({
    name: 'Vendas de ontem',
    data: { kind: 'numero', value: 'R$ 1.240', raw: 1240, trend: { text: '+12% desde ontem', direction: 'up', goodWhen: 'up' } },
  })
})

it('the other five kinds read, with their caps', () => {
  expect(readIndicatorMarker(marker({ tipo: 'meta', nome: 'Meta do mês', valor: 18, meta: 30, unidade: 'pedidos' })).offer?.data).toEqual({ kind: 'meta', value: 18, goal: 30, unit: 'pedidos' })
  const bars = Array.from({ length: INDICATOR_BARS_MAX }, (_, index) => ({ rotulo: String(index), valor: index }))
  expect(readIndicatorMarker(marker({ tipo: 'barras', nome: 'Pedidos por dia', pontos: bars })).offer?.data.kind).toBe('barras')
  expect(readIndicatorMarker(marker({ tipo: 'barras', nome: 'Muitas', pontos: [...bars, { rotulo: 'x', valor: 1 }] })).refused).toBe('bad_data')
  expect(readIndicatorMarker(marker({ tipo: 'linha', nome: 'Visitas', pontos: [{ rotulo: '1', valor: 10 }, { rotulo: '2', valor: 14 }] })).offer?.data.kind).toBe('linha')
  expect(readIndicatorMarker(marker({ tipo: 'lista', nome: 'Boletos', itens: [{ texto: 'Aluguel pago', estado: 'ok' }, { texto: 'Luz vence amanhã', estado: 'atencao' }] })).offer?.data).toEqual({
    kind: 'lista', items: [{ text: 'Aluguel pago', state: 'ok' }, { text: 'Luz vence amanhã', state: 'atencao' }],
  })
  const six = Array.from({ length: INDICATOR_SENTENCES_MAX }, (_, index) => `Frase ${String(index)}.`)
  expect(readIndicatorMarker(marker({ tipo: 'resumo', nome: 'Semana', frases: six })).offer?.data.kind).toBe('resumo')
  expect(readIndicatorMarker(marker({ tipo: 'resumo', nome: 'Semana', frases: [...six, 'Demais.'] })).refused).toBe('bad_data')
})

it('a marker that is not an indicator is removed and never shows: bad JSON, unknown kind, no name, a goal of zero', () => {
  expect(readIndicatorMarker('Oi.\n[[indicador: {isso não é json}]]')).toEqual({ text: 'Oi.', refused: 'malformed' })
  expect(readIndicatorMarker(marker({ tipo: 'pizza', nome: 'X' })).refused).toBe('unknown_kind')
  expect(readIndicatorMarker(marker({ tipo: 'numero', valor: '1' })).refused).toBe('no_name')
  expect(readIndicatorMarker(marker({ tipo: 'numero', nome: 'n'.repeat(61), valor: '1' })).refused).toBe('name_too_long')
  expect(readIndicatorMarker(marker({ tipo: 'meta', nome: 'Meta', valor: 1, meta: 0 })).refused).toBe('bad_data')
  expect(readIndicatorMarker('Sem marcador.')).toEqual({ text: 'Sem marcador.' })
})

it('a marker still arriving is hidden; the last valid marker wins', () => {
  expect(readIndicatorMarker('Calculando.\n[[indicador: {"tipo":"numero","nome":"Ven').text).toBe('Calculando.')
  const read = readIndicatorMarker(`${marker({ tipo: 'numero', nome: 'Primeiro', valor: '1' })}\n${marker({ tipo: 'numero', nome: 'Segundo', valor: '2' })}`)
  expect(read.offer?.name).toBe('Segundo')
  expect(read.text).not.toContain('[[')
})

it('the answer of a refresh must be ONLY the same kind of indicator', () => {
  const fresh = readRefreshAnswer(marker({ tipo: 'numero', nome: 'Vendas', valor: 'R$ 900', bruto: 900 }), 'numero')
  expect(fresh).toEqual({ data: { kind: 'numero', value: 'R$ 900', raw: 900 } })
  expect(readRefreshAnswer(marker({ tipo: 'meta', nome: 'Meta', valor: 1, meta: 2 }), 'numero')).toEqual({ failure: 'A resposta veio em outro formato que o do indicador.' })
  expect(readRefreshAnswer('Não sei.', 'numero')).toEqual({ failure: 'A resposta não trouxe o número no formato combinado.' })
})

it('the tone of a trend: falling is bad ONLY when the indicator says falling is bad; flat is neutral', () => {
  expect(trendTone({ direction: 'up', goodWhen: 'up' })).toBe('good')
  expect(trendTone({ direction: 'down', goodWhen: 'up' })).toBe('bad')
  expect(trendTone({ direction: 'down', goodWhen: 'down' })).toBe('good') // custo que cai
  expect(trendTone({ direction: 'up', goodWhen: 'down' })).toBe('bad')
  expect(trendTone({ direction: 'flat', goodWhen: 'up' })).toBe('neutral')
  expect(trendTone(undefined)).toBe('neutral')
})

it('the goal percent is clamped to 0..100', () => {
  expect(goalPercent({ value: 18, goal: 30 })).toBe(60)
  expect(goalPercent({ value: 45, goal: 30 })).toBe(100)
  expect(goalPercent({ value: -3, goal: 30 })).toBe(0)
})

it('the alert: only a number with raw values that dropped MORE than the rule; never from nothing, never on a rise', () => {
  const was = { kind: 'numero' as const, value: '100', raw: 100 }
  const rule = { dropPct: 20 }
  expect(evaluateAlert(was, { kind: 'numero', value: '76', raw: 76 }, rule)).toEqual({ pct: 24, text: 'Caiu 24% desde a última atualização' })
  expect(evaluateAlert(was, { kind: 'numero', value: '80', raw: 80 }, rule)).toBeUndefined() // exactly 20% is not "more than"
  expect(evaluateAlert(was, { kind: 'numero', value: '120', raw: 120 }, rule)).toBeUndefined()
  expect(evaluateAlert({ kind: 'numero', value: '0', raw: 0 }, { kind: 'numero', value: '0', raw: 0 }, rule)).toBeUndefined()
  expect(evaluateAlert(undefined, { kind: 'numero', value: '76', raw: 76 }, rule)).toBeUndefined()
  expect(evaluateAlert(was, { kind: 'numero', value: '76' }, rule)).toBeUndefined()
  expect(evaluateAlert(was, { kind: 'numero', value: '76', raw: 76 }, undefined)).toBeUndefined()
})

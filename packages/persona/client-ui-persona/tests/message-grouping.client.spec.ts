// CV-9 (CONVERSAS-SPEC §CV-9): o agrupamento dos balões: mesmo autor, menos de 5 minutos, sem cartão estruturado no meio.
import { describe, expect, it } from 'vitest'
import {
  GROUP_WINDOW_MS,
  bubbleNeedsWidth,
  continuesGroup,
  gapMs,
  groupPositions,
  type GroupableMessage,
} from '../src/client/chat/message-grouping.ts'

const at = (authorId: string, hhmm: string, over: Partial<GroupableMessage> = {}): GroupableMessage => ({ authorId, timeLabel: hhmm, ...over })
const iso = (authorId: string, instant: string, over: Partial<GroupableMessage> = {}): GroupableMessage => ({ authorId, timeLabel: '', occurredAt: instant, ...over })

describe('a janela do grupo', () => {
  it('é de 5 minutos', () => {
    expect(GROUP_WINDOW_MS).toBe(300_000)
  })

  it('mesmo autor com menos de 5 min junta; 5 min ou mais separa', () => {
    expect(continuesGroup(at('nina', '14:05'), at('nina', '14:09'))).toBe(true)
    expect(continuesGroup(at('nina', '14:05'), at('nina', '14:10'))).toBe(false)
    expect(continuesGroup(at('nina', '14:05'), at('nina', '14:05'))).toBe(true)
  })

  it('autor diferente nunca junta', () => {
    expect(continuesGroup(at('nina', '14:05'), at('bento', '14:06'))).toBe(false)
  })

  it('o relógio que anda para trás não junta (nem inventa um grupo)', () => {
    expect(continuesGroup(at('nina', '14:05'), at('nina', '14:00'))).toBe(false)
  })

  it('sem hora legível não dá para medir: não junta', () => {
    expect(continuesGroup(at('nina', 'ontem'), at('nina', '14:06'))).toBe(false)
  })

  it('o instante ISO vale mais que o rótulo e atravessa a meia-noite', () => {
    expect(continuesGroup(iso('nina', '2026-11-04T23:59:30Z'), iso('nina', '2026-11-05T00:01:00Z'))).toBe(true)
    expect(gapMs(iso('nina', '2026-11-04T10:00:00Z'), iso('nina', '2026-11-04T10:07:00Z'))).toBe(7 * 60_000)
    // mesmo rótulo "00:01" mas em dias diferentes: o ISO separa
    expect(continuesGroup(iso('nina', '2026-11-03T00:01:00Z'), iso('nina', '2026-11-04T00:01:30Z'))).toBe(false)
  })

  it('misturado (um com ISO, outro só com rótulo): cai no rótulo das duas', () => {
    expect(continuesGroup(iso('nina', '2026-11-04T14:05:00Z', { timeLabel: '14:05' }), at('nina', '14:08'))).toBe(true)
  })
})

describe('mensagem com cartão estruturado', () => {
  it('fica sozinha e quebra o grupo dos dois lados', () => {
    const list = [at('nina', '14:00'), at('nina', '14:01', { structured: true }), at('nina', '14:02')]
    expect(groupPositions(list)).toEqual(['single', 'single', 'single'])
  })

  it('o grupo continua do outro lado de uma que não é cartão', () => {
    const list = [at('nina', '14:00'), at('nina', '14:01'), at('nina', '14:02', { structured: true }), at('nina', '14:03'), at('nina', '14:04')]
    expect(groupPositions(list)).toEqual(['first', 'last', 'single', 'first', 'last'])
  })
})

describe('groupPositions', () => {
  it('lista vazia e uma só', () => {
    expect(groupPositions([])).toEqual([])
    expect(groupPositions([at('nina', '14:00')])).toEqual(['single'])
  })

  it('uma sequência de três é primeiro, do meio e último', () => {
    expect(groupPositions([at('nina', '14:00'), at('nina', '14:01'), at('nina', '14:02')])).toEqual(['first', 'middle', 'last'])
  })

  it('intercalado com a pessoa: cada bloco da persona é um grupo', () => {
    const list = [at('nina', '14:02'), at('nina', '14:03'), at('user', '14:04'), at('nina', '14:05'), at('nina', '14:06')]
    expect(groupPositions(list)).toEqual(['first', 'last', 'single', 'first', 'last'])
  })

  it('a janela conta de uma mensagem para a seguinte, não do início do grupo', () => {
    // 14:00 → 14:04 → 14:08: cada passo < 5 min, o grupo passa de 5 min no total e continua
    expect(groupPositions([at('nina', '14:00'), at('nina', '14:04'), at('nina', '14:08')])).toEqual(['first', 'middle', 'last'])
  })
})

describe('bubbleNeedsWidth (860 px com tabela ou código)', () => {
  it('bloco de código', () => {
    expect(bubbleNeedsWidth('Para rodar:\n\n```sh\nnpm run x\n```')).toBe(true)
  })

  it('tabela, com ou sem barras nas pontas e com alinhamento', () => {
    expect(bubbleNeedsWidth('| Dia | Meta |\n|---|---|\n| Seg | 24 |')).toBe(true)
    expect(bubbleNeedsWidth('Dia | Meta\n--- | ---\nSeg | 24')).toBe(true)
    expect(bubbleNeedsWidth('| a | b |\n| :--- | ---: |\n| 1 | 2 |')).toBe(true)
  })

  it('texto comum, lista e traços soltos não pedem largura', () => {
    expect(bubbleNeedsWidth('Oi! Tudo certo por aqui.')).toBe(false)
    expect(bubbleNeedsWidth('- um\n- dois')).toBe(false)
    expect(bubbleNeedsWidth('---')).toBe(false)
    expect(bubbleNeedsWidth('uma linha com | uma barra')).toBe(false)
  })
})

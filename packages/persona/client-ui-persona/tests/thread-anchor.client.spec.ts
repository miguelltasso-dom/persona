// @vitest-environment jsdom
// Casa da Equipe, microdetalhe 11: o fio de cada canal lembra a mensagem em que a pessoa parou (só ids), e quem estava no fim não guarda âncora.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THREAD_ANCHORS_KEY,
  THREAD_ANCHORS_MAX,
  clearThreadAnchorSession,
  firstVisibleMessageId,
  readThreadAnchor,
  rememberThreadAnchor,
  restoreThreadAnchor,
} from '../src/client/chat/thread-anchor.ts'

beforeEach(() => { clearThreadAnchorSession(); localStorage.removeItem(THREAD_ANCHORS_KEY) })
afterEach(() => { vi.restoreAllMocks() })

describe('a âncora por canal', () => {
  it('lembra na sessão e no disco, canal por canal', () => {
    rememberThreadAnchor('pedidos', 'm-40')
    rememberThreadAnchor('geral', 'm-7')
    expect(readThreadAnchor('pedidos')).toBe('m-40')
    expect(readThreadAnchor('geral')).toBe('m-7')
    expect(JSON.parse(localStorage.getItem(THREAD_ANCHORS_KEY)!)).toEqual({ pedidos: 'm-40', geral: 'm-7' })
    // Uma sessão nova (a memória da sessão vazia) lê do disco.
    clearThreadAnchorSession()
    expect(readThreadAnchor('pedidos')).toBe('m-40')
  })

  it('quem estava no fim não guarda âncora: o fio abre no fim', () => {
    rememberThreadAnchor('pedidos', 'm-40')
    rememberThreadAnchor('pedidos', undefined)
    expect(readThreadAnchor('pedidos')).toBeUndefined()
    expect(JSON.parse(localStorage.getItem(THREAD_ANCHORS_KEY)!)).toEqual({})
  })

  it('só escreve quando muda', () => {
    const setItem = vi.fn()
    const storage = { getItem: () => null, setItem }
    rememberThreadAnchor('a', 'm-1', storage)
    rememberThreadAnchor('a', 'm-1', storage)
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('guarda no máximo 60 canais: os mais antigos saem primeiro, o mais usado fica', () => {
    for (let index = 0; index < THREAD_ANCHORS_MAX + 5; index += 1) rememberThreadAnchor(`c-${String(index)}`, `m-${String(index)}`)
    rememberThreadAnchor('c-10', 'm-10b') // usado de novo: vai para o fim da fila
    const rows = JSON.parse(localStorage.getItem(THREAD_ANCHORS_KEY)!) as Record<string, string>
    expect(Object.keys(rows)).toHaveLength(THREAD_ANCHORS_MAX)
    expect(rows['c-0']).toBeUndefined()
    expect(rows['c-10']).toBe('m-10b')
    expect(rows[`c-${String(THREAD_ANCHORS_MAX + 4)}`]).toBe(`m-${String(THREAD_ANCHORS_MAX + 4)}`)
  })

  it('storage bloqueado ou estragado não quebra nada: a sessão ainda lembra', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => { rememberThreadAnchor('a', 'm-1', blocked) }).not.toThrow()
    expect(readThreadAnchor('a', blocked)).toBe('m-1')
    localStorage.setItem(THREAD_ANCHORS_KEY, '[1,2,3]')
    clearThreadAnchorSession()
    expect(readThreadAnchor('a')).toBeUndefined()
    localStorage.setItem(THREAD_ANCHORS_KEY, '{ not json')
    expect(readThreadAnchor('a')).toBeUndefined()
  })

  it('canal sem id não guarda nada', () => {
    rememberThreadAnchor('', 'm-1')
    expect(localStorage.getItem(THREAD_ANCHORS_KEY)).toBeNull()
  })
})

describe('achar e voltar à âncora no DOM', () => {
  function thread(): HTMLElement {
    const container = document.createElement('div')
    document.body.append(container)
    const rects: Record<string, { top: number; bottom: number }> = { 'm-1': { top: -120, bottom: -40 }, 'm-2': { top: -10, bottom: 70 }, 'm-3': { top: 80, bottom: 160 } }
    container.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200, x: 0, y: 0, toJSON: () => ({}) })
    for (const id of Object.keys(rects)) {
      const row = document.createElement('div')
      row.dataset.messageId = id
      row.getBoundingClientRect = () => ({ ...rects[id]!, left: 0, right: 300, width: 300, height: 80, x: 0, y: rects[id]!.top, toJSON: () => ({}) })
      container.append(row)
    }
    return container
  }

  it('a âncora é a primeira mensagem que ainda aparece no alto', () => {
    expect(firstVisibleMessageId(thread())).toBe('m-2')
  })

  it('volta rolando até a mensagem, sem animação, e diz se ela existe', () => {
    const container = thread()
    container.scrollTop = 500
    expect(restoreThreadAnchor(container, 'm-3')).toBe(true)
    expect(container.scrollTop).toBe(580) // 500 + (80 − 0)
    expect(restoreThreadAnchor(container, 'm-99')).toBe(false)
    expect(container.scrollTop).toBe(580)
  })

  it('sem linhas, não há âncora', () => {
    expect(firstVisibleMessageId(document.createElement('div'))).toBeUndefined()
  })
})

// @vitest-environment jsdom
// Casa da Equipe, microdetalhe 5: a mensagem que chega não faz o fio pular; quem subiu para ler vê "↓ N mensagens novas".
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NEAR_BOTTOM_PX, countNewBelow, isNearBottom, useNewMessagesBelow } from '../src/client/chat/new-below.ts'

describe('countNewBelow', () => {
  it('conta o que chegou depois da última mensagem vista', () => {
    expect(countNewBelow(['a', 'b', 'c', 'd'], 'b')).toBe(2)
    expect(countNewBelow(['a', 'b', 'c', 'd'], 'd')).toBe(0)
  })

  it('sem referência, ou com um fio que não tem mais a mensagem (outro canal), não há novidade a contar', () => {
    expect(countNewBelow(['a', 'b'], undefined)).toBe(0)
    expect(countNewBelow(['x', 'y'], 'b')).toBe(0)
    expect(countNewBelow([], 'a')).toBe(0)
  })
})

describe('isNearBottom', () => {
  it('é "no fim" a menos de 240 px do fim', () => {
    expect(NEAR_BOTTOM_PX).toBe(240)
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 400 })).toBe(true) // faltam 200
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 300, clientHeight: 400 })).toBe(false) // faltam 300
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 360, clientHeight: 400 })).toBe(false) // faltam 240 (não é "menos de")
  })
})

describe('useNewMessagesBelow', () => {
  function container(metrics: { scrollHeight: number; scrollTop: number; clientHeight: number }): HTMLDivElement {
    const node = document.createElement('div')
    Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => metrics.scrollHeight })
    Object.defineProperty(node, 'scrollTop', { configurable: true, get: () => metrics.scrollTop, set: (value: number) => { metrics.scrollTop = value } })
    Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => metrics.clientHeight })
    node.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
      if (typeof options === 'object' && options.top !== undefined) metrics.scrollTop = options.top
    }) as never
    return node
  }

  it('no fim do fio: nada a avisar mesmo com mensagens chegando', () => {
    const node = container({ scrollHeight: 1000, scrollTop: 560, clientHeight: 400 })
    const { result, rerender } = renderHook(({ ids }) => useNewMessagesBelow({ current: node }, ids), { initialProps: { ids: ['a', 'b'] } })
    expect(result.current.count).toBe(0)
    rerender({ ids: ['a', 'b', 'c'] })
    expect(result.current.count).toBe(0)
  })

  it('quem subiu para ler: a pílula conta o que chegou, e descer zera', () => {
    const metrics = { scrollHeight: 2000, scrollTop: 100, clientHeight: 400 }
    const node = container(metrics)
    const { result, rerender } = renderHook(({ ids }) => useNewMessagesBelow({ current: node }, ids), { initialProps: { ids: ['a', 'b'] } })
    // A pessoa nunca esteve no fim neste fio: começa "vendo" a última; ao subir e chegarem 2 novas, são 2 abaixo.
    rerender({ ids: ['a', 'b', 'c', 'd'] })
    expect(result.current.count).toBe(2)
    act(() => { result.current.jumpToEnd() })
    expect(node.scrollTo).toHaveBeenCalledWith({ top: 2000 })
    expect(result.current.count).toBe(0)
  })

  it('ao voltar ao fim rolando, o aviso some sozinho', () => {
    const metrics = { scrollHeight: 2000, scrollTop: 100, clientHeight: 400 }
    const node = container(metrics)
    const { result, rerender } = renderHook(({ ids }) => useNewMessagesBelow({ current: node }, ids), { initialProps: { ids: ['a'] } })
    rerender({ ids: ['a', 'b', 'c'] })
    expect(result.current.count).toBe(2)
    metrics.scrollTop = 1500 // a pessoa desce lendo
    act(() => { node.dispatchEvent(new Event('scroll')) })
    expect(result.current.count).toBe(0)
  })
})

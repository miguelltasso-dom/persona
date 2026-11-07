// @vitest-environment jsdom
// CV-8: the composer's "Toda a equipe ({n})" exists only when the HOST says it does (estimateAsk with audience 'everyone' comes back with
// `fanout` and 2+ personas). The UI never invents the flag; with no answer the composer is the usual one.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useConnectedFanout } from '../src/client/remote/use-connected-fanout.ts'

afterEach(() => { cleanup() })

const TENANT = { workspaceId: 'ws', projectId: 'proj' }
const view = (replies: number, calls?: { min: number; max: number }) => ({
  tipo: 'conversa',
  rotulo: '',
  fanout: { source: 'everyone', replies, asked: replies, limited: 0, paused: 0, ...(calls === undefined ? {} : { chamadas: calls }) },
})

describe('useConnectedFanout', () => {
  it('asks the host once per channel with audience everyone, and offers the choice with the team size', async () => {
    const estimateAsk = vi.fn(async () => view(7, { min: 7, max: 7 }))
    const { result } = renderHook(() => useConnectedFanout({ remote: { estimateAsk }, tenant: TENANT, ownerId: 'canal' }))
    await waitFor(() => { expect(result.current.fanoutChoices).toEqual({ teamCount: 7 }) })
    expect(estimateAsk).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', texto: '', streamKind: 'channel', ownerId: 'canal', audience: 'everyone' })
    // no estimate until the person picks "Toda a equipe"
    expect(result.current.fanoutEstimate).toBeUndefined()
    expect(typeof result.current.onFanoutChoiceChange).toBe('function')
  })

  it('picking "Toda a equipe" reads the numbers again and hands them to the chip; "Quem tiver algo a dizer" shows none', async () => {
    const estimateAsk = vi.fn()
      .mockResolvedValueOnce(view(7))
      .mockResolvedValue(view(7, { min: 5, max: 5 }))
    const { result } = renderHook(() => useConnectedFanout({ remote: { estimateAsk }, tenant: TENANT, ownerId: 'canal' }))
    await waitFor(() => { expect(result.current.fanoutChoices).toBeDefined() })
    act(() => { result.current.onFanoutChoiceChange?.('everyone') })
    await waitFor(() => { expect(result.current.fanoutEstimate).toEqual({ replies: 7, calls: { min: 5, max: 5 } }) })
    act(() => { result.current.onFanoutChoiceChange?.('relevant') })
    expect(result.current.fanoutEstimate).toBeUndefined()
    act(() => { result.current.onFanoutChoiceChange?.(undefined) })
    expect(result.current.fanoutEstimate).toBeUndefined()
  })

  it('without the answer the composer stays the usual one: no fanout in the view, one persona alone, an error, or no estimateAsk', async () => {
    const none = renderHook(() => useConnectedFanout({ remote: { estimateAsk: vi.fn(async () => ({ tipo: 'conversa', rotulo: '' })) }, tenant: TENANT, ownerId: 'canal' }))
    const one = renderHook(() => useConnectedFanout({ remote: { estimateAsk: vi.fn(async () => view(1)) }, tenant: TENANT, ownerId: 'canal' }))
    const broken = renderHook(() => useConnectedFanout({ remote: { estimateAsk: vi.fn(async () => { throw new Error('host down') }) }, tenant: TENANT, ownerId: 'canal' }))
    const missing = renderHook(() => useConnectedFanout({ remote: {}, tenant: TENANT, ownerId: 'canal' }))
    const noChannel = renderHook(() => useConnectedFanout({ remote: { estimateAsk: vi.fn(async () => view(5)) }, tenant: TENANT, ownerId: null }))
    await act(async () => { await Promise.resolve() })
    for (const hook of [none, one, broken, missing, noChannel]) expect(hook.result.current).toEqual({})
  })
})

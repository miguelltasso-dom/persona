import { describe, expect, it, vi } from 'vitest'
import { runRunErrorAction } from '../src/client/chat/run-error-handlers.ts'
import type { RunErrorHandlerContext } from '../src/client/chat/run-error-handlers.ts'

describe('runRunErrorAction', () => {
  it('routes help, panel, engine and retry actions', () => {
    const openHelpConnections = vi.fn()
    const openEngineForPersona = vi.fn()
    const selectPanel = vi.fn()
    const swapAccount = vi.fn()
    const retryRun = vi.fn()
    const ctx: RunErrorHandlerContext = {
      openHelpConnections,
      openEngineForPersona,
      selectPanel,
      swapAccount,
      retryRun,
      resumeWhenQuotaBack: vi.fn(),
    }
    runRunErrorAction('howToConnect', ctx, 'p-1')
    runRunErrorAction('pickEngine', ctx, 'p-1')
    runRunErrorAction('adjustLimit', ctx, undefined)
    runRunErrorAction('retryNow', ctx, undefined)
    expect(openHelpConnections).toHaveBeenCalledOnce()
    expect(openEngineForPersona).toHaveBeenCalledWith('p-1')
    expect(selectPanel).toHaveBeenCalledWith('rules')
    expect(retryRun).toHaveBeenCalledOnce()
  })
})

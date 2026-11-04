import { describe, expect, it } from 'vitest'
import {
  BuildLockContentionError,
  WebHostBootTimeoutError,
  isBuildLockBootFailure,
  lockHolderFromOutput,
  outputIndicatesLockQueueOnly,
  webHostBootFailure,
} from '../src/web-host-boot.ts'

describe('web host boot errors', () => {
  it('detects lock queue vs host boot timeout', () => {
    const lockLog = '[with-lock] waiting for "Rivet D8 Setup.exe" (since 2026): node package-win.mjs\n'
    expect(outputIndicatesLockQueueOnly(lockLog)).toBe(true)
    const err = webHostBootFailure(lockLog, null)
    expect(err).toBeInstanceOf(BuildLockContentionError)
    expect(isBuildLockBootFailure(err)).toBe(true)
    expect(lockHolderFromOutput(lockLog)).toBe('Rivet D8 Setup.exe')
  })

  it('classifies host boot after lock released', () => {
    const log = '[with-lock] ready line seen; releasing\n(node) starting...\n'
    expect(outputIndicatesLockQueueOnly(log)).toBe(false)
    const err = webHostBootFailure(log, null)
    expect(err).toBeInstanceOf(WebHostBootTimeoutError)
    expect(isBuildLockBootFailure(err)).toBe(false)
  })

  it('maps with-lock exit 75 to contention', () => {
    const err = webHostBootFailure('[with-lock] timed out waiting for "build"\n', 75)
    expect(err).toBeInstanceOf(BuildLockContentionError)
  })
})

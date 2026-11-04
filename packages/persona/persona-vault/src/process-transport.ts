/** Correlated, bounded requests over the private Electron main/host channel. */
import type { IpcVaultTransport } from './cipher.ts'
import { VaultUnavailableError } from './errors.ts'

/**
 * Create a transport whose listener and pending requests belong to the caller.
 * @param timeoutMs - Deadline for a main-process response.
 * @returns Transport and disposer; disposal rejects pending requests.
 */
export function createProcessVaultTransport(timeoutMs: number): IpcVaultTransport & { dispose(): void } {
  let seq = 0
  let closed = false
  const pending = new Map<number, { resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()
  const listener = (message: unknown): void => {
    if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'persona-vault'
      || !('requestId' in message) || typeof message.requestId !== 'number') return
    const row = pending.get(message.requestId)
    if (row === undefined) return
    pending.delete(message.requestId)
    clearTimeout(row.timer)
    if ('payload' in message && typeof message.payload === 'string' && !('error' in message)) row.resolve(message.payload)
    else row.reject(new VaultUnavailableError())
  }
  process.on('message', listener)
  return {
    request: (op: 'seal' | 'open', payload: string): Promise<string> => new Promise((resolve, reject) => {
      if (closed || !process.connected || process.send === undefined) { reject(new VaultUnavailableError()); return }
      const requestId = ++seq
      const fail = (): void => {
        const row = pending.get(requestId)
        if (row === undefined) return
        pending.delete(requestId); clearTimeout(row.timer); row.reject(new VaultUnavailableError())
      }
      const timer = setTimeout(fail, timeoutMs)
      pending.set(requestId, { resolve, reject, timer })
      try { process.send({ type: 'persona-vault', requestId, op, payload }, (error) => { if (error !== null) fail() }) }
      catch (_error) { fail() }
    }),
    dispose: (): void => {
      closed = true
      process.off('message', listener)
      for (const row of pending.values()) { clearTimeout(row.timer); row.reject(new VaultUnavailableError()) }
      pending.clear()
    },
  }
}

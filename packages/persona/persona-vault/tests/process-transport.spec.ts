import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { VAULT_REQUEST_TIMEOUT_MS, createProcessVaultTransport } from '../src/process-transport.ts'
import PersonaVaultProvider from '../src/plugin.ts'
import { VaultUnavailableError } from '../src/errors.ts'

const sendDescriptor = Object.getOwnPropertyDescriptor(process, 'send')
const connectedDescriptor = Object.getOwnPropertyDescriptor(process, 'connected')
const transports: ReturnType<typeof createProcessVaultTransport>[] = []
const sent: Array<{ type: string; requestId: number; op: string; payload: string }> = []
const send = vi.fn((message: unknown, callback: (error: Error | null) => void) => {
  if (typeof message !== 'object' || message === null
    || !('type' in message) || typeof message.type !== 'string'
    || !('requestId' in message) || typeof message.requestId !== 'number'
    || !('op' in message) || typeof message.op !== 'string'
    || !('payload' in message) || typeof message.payload !== 'string') throw new Error('Invalid request')
  sent.push({ type: message.type, requestId: message.requestId, op: message.op, payload: message.payload })
  callback(null)
  return true
})
beforeEach(() => {
  vi.useFakeTimers()
  sent.length = 0
  Object.defineProperty(process, 'send', { configurable: true, value: send })
  Object.defineProperty(process, 'connected', { configurable: true, value: true })
})
afterEach(() => {
  for (const transport of transports.splice(0)) transport.dispose()
  if (sendDescriptor) Object.defineProperty(process, 'send', sendDescriptor)
  else Reflect.deleteProperty(process, 'send')
  if (connectedDescriptor) Object.defineProperty(process, 'connected', connectedDescriptor)
  else Reflect.deleteProperty(process, 'connected')
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function transport() {
  const result = createProcessVaultTransport(100)
  transports.push(result)
  return result
}
function reply(message: unknown): void { EventEmitter.prototype.emit.call(process, 'message', message) }

it('correlates reordered replies and ignores unrelated IPC without exposing response metadata', async () => {
  const client = transport()
  const seal = client.request('seal', 'synthetic-input')
  const open = client.request('open', 'synthetic-sealed')
  reply({ type: 'other', requestId: sent[0]!.requestId, payload: 'wrong' })
  reply({ type: 'persona-vault', requestId: 999, payload: 'wrong' })
  reply({ type: 'persona-vault', requestId: sent[1]!.requestId, payload: 'synthetic-open' })
  reply({ type: 'persona-vault', requestId: sent[0]!.requestId, payload: 'synthetic-ciphertext' })
  expect(await open).toBe('synthetic-open')
  expect(await seal).toBe('synthetic-ciphertext')
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds a missing reply and returns a typed error without request contents', async () => {
  const promise = transport().request('seal', 'synthetic-input')
  const rejected = expect(promise).rejects.toBeInstanceOf(VaultUnavailableError)
  await vi.advanceTimersByTimeAsync(100)
  await rejected
  expect(vi.getTimerCount()).toBe(0)
})

it('waits for the slow FIRST answer of a booting app (INST-2) but still gives up eventually', async () => {
  // Installed app, idle machine: the first request is answered after 2–7 s; under load, after more than the old 10 s deadline.
  expect(VAULT_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000)
  const late = createProcessVaultTransport(VAULT_REQUEST_TIMEOUT_MS)
  transports.push(late)
  const first = late.request('seal', 'synthetic-input')
  await vi.advanceTimersByTimeAsync(20_000)
  reply({ type: 'persona-vault', requestId: sent[0]!.requestId, payload: 'synthetic-ciphertext' })
  expect(await first).toBe('synthetic-ciphertext')

  const never = late.request('seal', 'synthetic-input')
  const rejected = expect(never).rejects.toBeInstanceOf(VaultUnavailableError)
  await vi.advanceTimersByTimeAsync(VAULT_REQUEST_TIMEOUT_MS)
  await rejected
  expect(vi.getTimerCount()).toBe(0)
})

it('uses that deadline by default in the plugin configuration', () => {
  expect(PersonaVaultProvider.Config({ path: '' }).timeoutMs).toBe(VAULT_REQUEST_TIMEOUT_MS)
  expect(PersonaVaultProvider.Config({ path: '', timeoutMs: 5000 }).timeoutMs).toBe(5000)
})

it('contains native errors and releases its listener and pending requests on disposal', async () => {
  const before = process.listenerCount('message')
  const client = transport()
  const first = client.request('seal', 'synthetic-input')
  const rejected = expect(first).rejects.toMatchObject({ code: 'vault_unavailable' })
  reply({ type: 'persona-vault', requestId: sent[0]!.requestId, error: 'synthetic-secret-in-native-error' })
  await rejected
  const pending = client.request('open', 'synthetic-ciphertext')
  const disposed = expect(pending).rejects.toBeInstanceOf(VaultUnavailableError)
  client.dispose()
  await disposed
  expect(process.listenerCount('message')).toBe(before)
  expect(vi.getTimerCount()).toBe(0)
  await expect(client.request('seal', 'synthetic-input')).rejects.toBeInstanceOf(VaultUnavailableError)
})

it('rejects disconnected IPC and asynchronous send failure without retaining timers', async () => {
  const client = transport()
  Object.defineProperty(process, 'connected', { configurable: true, value: false })
  await expect(client.request('seal', 'synthetic-input')).rejects.toBeInstanceOf(VaultUnavailableError)
  Object.defineProperty(process, 'connected', { configurable: true, value: true })
  send.mockImplementationOnce((_message, callback) => { callback(new Error('synthetic-secret')); return false })
  await expect(client.request('seal', 'synthetic-input')).rejects.toBeInstanceOf(VaultUnavailableError)
  expect(vi.getTimerCount()).toBe(0)
})

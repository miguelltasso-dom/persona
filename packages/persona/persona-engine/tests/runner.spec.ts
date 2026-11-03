import { expect, it } from 'vitest'
import {
  FakeClock,
  FakeRunner,
  Later,
  PrepareFailed,
  TRANSIENT_BACKOFF_MS,
  TRANSIENT_TRIES,
  WorkerSlots,
  nextTransientBackoff,
  ticketOfSession,
  toolsForRole,
  transient,
  workerSessionId,
} from '../src/index.ts'

it('forbids bash on the coordinator session (D-041)', () => {
  expect(toolsForRole('coordinator', ['files', 'bash', 'recall'])).toEqual(['files', 'recall'])
  expect(toolsForRole('worker', ['files', 'bash'])).toEqual(['files', 'bash'])
})

it('reserves an extra slot for a person wake and throws Later when full', () => {
  const running: string[] = ['t1']
  const slots = new WorkerSlots(() => running, () => 1)
  expect(() => { slots.reserve('t2', 'launch') }).toThrow(Later)
  slots.reserve('t3', 'person')
  expect(slots.used()).toBe(2)
  slots.free('t3')
  running.pop()
  slots.reserve('t2', 'launch')
  expect(slots.launches()).toBe(0)
})

it('delivers idempotently and records runner events', async () => {
  const clock = new FakeClock(1_000)
  const runner = new FakeRunner(clock)
  await runner.ensureSession('worker-t1', '/tmp/t1', 'Fix', 'worker')
  expect(runner.status('worker-t1')).toBe('idle')
  await runner.deliver('worker-t1', 'req-1', 'hello', 'steer')
  await runner.deliver('worker-t1', 'req-1', 'hello again', 'steer')
  expect(runner.deliveries).toHaveLength(1)
  expect(runner.events.map(item => item.type)).toEqual(['running', 'inputTaken'])
  await runner.cancel('worker-t1', { keepInbox: true })
  expect(runner.status('worker-t1')).toBe('idle')
  expect(runner.capabilities().steer).toBe(true)
})

it('strips bash from a coordinator session created by the fake runner', async () => {
  const runner = new FakeRunner()
  await runner.ensureSession('coord', '/tmp', 'Direção', 'coordinator')
  expect(runner.sessions.get('coord')?.tools).not.toContain('bash')
})

it('classifies transient errors and uses 15/30/60 s backoff for 3 tries', () => {
  expect(transient(new Error('ECONNRESET'))).toBe(true)
  expect(transient(new Error('PrepareFailed boom'))).toBe(false)
  expect(nextTransientBackoff(0)).toBe(15_000)
  expect(nextTransientBackoff(1)).toBe(30_000)
  expect(nextTransientBackoff(2)).toBe(60_000)
  expect(nextTransientBackoff(TRANSIENT_TRIES)).toBeUndefined()
  expect(TRANSIENT_BACKOFF_MS).toEqual([15_000, 30_000, 60_000])
  expect(new PrepareFailed('nope').name).toBe('PrepareFailed')
})

it('names the worker session from the ticket id', () => {
  expect(workerSessionId('t9')).toBe('worker-t9')
})

it('recovers the ticket id from a worker session', () => {
  expect(ticketOfSession('worker-t9')).toBe('t9')
  expect(ticketOfSession('coordinator')).toBeUndefined()
})

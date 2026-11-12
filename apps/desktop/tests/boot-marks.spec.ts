import { expect, it, vi } from 'vitest'
import { createBootMarks } from '../src/boot-marks.ts'

it('writes one line per phase with the time since the process started and since the previous phase', () => {
  const write = vi.fn(async () => {})
  let clock = 100
  const boot = createBootMarks(write, () => clock)
  boot.mark('main:start')
  clock = 450.4
  boot.mark('host:answered')
  clock = 1000
  boot.mark('window:loaded')
  expect(boot.marks).toEqual([
    { phase: 'main:start', at: 100, since: 0 },
    { phase: 'host:answered', at: 450, since: 350 },
    { phase: 'window:loaded', at: 1000, since: 550 },
  ])
  expect(write.mock.calls).toEqual([
    ['boot', 'main:start +100ms (+0ms)'],
    ['boot', 'host:answered +450ms (+350ms)'],
    ['boot', 'window:loaded +1000ms (+550ms)'],
  ])
})

it('records a phase once: a reload does not rewrite the story of the first boot', () => {
  const write = vi.fn(async () => {})
  const boot = createBootMarks(write, () => 5)
  boot.mark('window:loaded')
  boot.mark('window:loaded')
  expect(boot.marks).toHaveLength(1)
  expect(write).toHaveBeenCalledTimes(1)
})

it('never throws and never waits when the log cannot be written', async () => {
  const rejected = createBootMarks(async () => { throw new Error('disk full') }, () => 1)
  expect(() => { rejected.mark('a') }).not.toThrow()
  const thrown = createBootMarks(() => { throw new Error('no logger') }, () => 1)
  expect(() => { thrown.mark('a') }).not.toThrow()
  await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
  expect(rejected.marks).toHaveLength(1)
  expect(thrown.marks).toHaveLength(1)
})

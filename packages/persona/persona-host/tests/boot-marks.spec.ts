import { expect, it } from 'vitest'
import { BootMarks } from '../src/boot-marks.ts'

/** Boot diet: the host's own marks are numbers a person can read from the app's log, made once and never rewritten. */
const clock = (...ticks: number[]): (() => number) => {
  let at = 0
  return () => ticks[Math.min(at++, ticks.length - 1)]!
}
const parse = (line: string): { marks: Record<string, number>; sums?: Record<string, { ms: number; n: number }> } => JSON.parse(line.slice(line.indexOf('{'))) as never

it('a mark is made ONCE: the first pass wins, a second pass never moves it', () => {
  const marks = new BootMarks(clock(10, 20, 30))
  marks.mark('ctor-start')
  marks.mark('ctor-start')
  marks.mark('projects-done')
  expect(parse(marks.line()).marks).toEqual({ 'ctor-start': 10, 'projects-done': 20 })
})

it('time(): sums the durations of a bucket with the count, returns the work\'s result and still counts a throw', () => {
  const marks = new BootMarks(clock(0, 4, 10, 17, 20, 26))
  expect(marks.time('reconcile', () => 'ok')).toBe('ok') // 0 -> 4
  expect(marks.time('reconcile', () => 7)).toBe(7) // 10 -> 17
  expect(() => marks.time('reconcile', () => { throw new Error('boom') })).toThrow('boom') // 20 -> 26
  expect(parse(marks.line()).sums).toEqual({ reconcile: { ms: 17, n: 3 } })
})

it('the line is one greppable line (the same prefix as the flags/surfaces lines) with numbers rounded to 0.1 ms', () => {
  const marks = new BootMarks(clock(12.3456))
  marks.mark('store-open')
  const line = marks.line()
  expect(line.startsWith('[persona-host] bootMarks {')).toBe(true)
  expect(line.includes('\n')).toBe(false)
  expect(parse(line).marks).toEqual({ 'store-open': 12.3 })
})

it('first-call: one line for the first screen call, nothing after', () => {
  const marks = new BootMarks(clock(250.04))
  expect(parse(marks.firstCallLine()!).marks).toEqual({ 'first-call': 250 })
  expect(marks.firstCallLine()).toBeUndefined()
})

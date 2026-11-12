/**
 * Carbon P0-12 (sprint de correção): the process that keeps Windows awake (`powershell.exe`) can fail to start or die; an 'error' event with nobody listening is an uncaught exception that
 * takes the host down. The keeper treats it as "no longer holding" and may hold again.
 */
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { expect, it } from 'vitest'
import { PowerKeeper } from '../src/station/power.ts'

function fakeChild(): ChildProcess & EventEmitter {
  const child = new EventEmitter() as ChildProcess & EventEmitter
  Object.assign(child, { exitCode: null, kill: () => true })
  return child
}

it('an error of the awake process (ENOENT, EPERM) is handled: the keeper says "livre" and can hold again', () => {
  const children: Array<ChildProcess & EventEmitter> = []
  const keeper = new PowerKeeper({ platform: 'win32', spawn: () => { const child = fakeChild(); children.push(child); return child } })
  keeper.hold()
  expect(keeper.state()).toBe('segurando')
  expect(() => children[0]?.emit('error', new Error('spawn powershell.exe ENOENT'))).not.toThrow() // before: an unhandled error event
  expect(keeper.state()).toBe('livre')
  keeper.hold()
  expect(children).toHaveLength(2)
  expect(keeper.state()).toBe('segurando')
})

it('an error of a process the keeper already let go does not touch the new one', () => {
  const children: Array<ChildProcess & EventEmitter> = []
  const keeper = new PowerKeeper({ platform: 'win32', spawn: () => { const child = fakeChild(); children.push(child); return child } })
  keeper.hold()
  keeper.release()
  keeper.hold()
  expect(() => children[0]?.emit('error', new Error('late'))).not.toThrow()
  expect(keeper.state()).toBe('segurando') // the second process is still the one held
})

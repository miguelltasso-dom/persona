/**
 * P0-05 (Carbon, colheita-s1): the process-wide warm pool reused a runner whose PermissionGate (a per-Task HTTP hook on its own port) was already CLOSED when the next Task of the same persona
 * asked for one: the CLI then talked to a dead port (`ECONNREFUSED` is a non-blocking hook error), the command gate was off in practice and the cards of the new gate never arrived. Same for
 * `carriesBrowser`: a runner opened without the browser server was handed to a Task that carries it, and the other way round. The key of the pool must tell those runners apart.
 * No real CLI, no model.
 */
import type { Runtime } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import type { Runner } from '../src/contract.ts'
import { PermissionGate } from '../src/resolve/permission-gate.ts'
import { resolveRunner } from '../src/resolve/resolve-runner.ts'
import { createSessionPool } from '../src/resolve/session-pool.ts'

function executableRuntime(): Runtime {
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  return Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'executable', command: 'claude', version: '2.1.318' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }] }),
  }) as unknown as Runtime
}

const resolveWith = (pool: ReturnType<typeof createSessionPool<Runner>>, runtime: Runtime, extra: { permissionGate?: PermissionGate; carriesBrowser?: boolean } = {}): Promise<Runner> => resolveRunner({
  spec: { kind: 'cli', cli: 'claude', model: 'haiku' }, permissionMode: 'allow-once', runtime, personId: 'nina', projectId: 'p1', cwd: 'C:/tmp/c',
  pool, infra: { wait: async () => undefined }, env: { PERSONA_CLI_ENV: 'native' }, ...extra,
})

describe('the warm pool never hands a runner opened for another Task\'s gate or browser', () => {
  it('two Tasks of the same persona with different permission gates get DIFFERENT runners (the first gate is closed by then)', async () => {
    const runtime = executableRuntime()
    const pool = createSessionPool<Runner>()
    const first = await PermissionGate.start({ token: 'tok-1' })
    const second = await PermissionGate.start({ token: 'tok-2' })
    try {
      expect(first.url).not.toBe(second.url)
      const one = await resolveWith(pool, runtime, { permissionGate: first })
      const two = await resolveWith(pool, runtime, { permissionGate: second })
      expect(two).not.toBe(one)
      // the same gate again (the same Task, the next turn) is still a hit: the pool keeps working
      expect(await resolveWith(pool, runtime, { permissionGate: second })).toBe(two)
      await one.dispose?.()
      await two.dispose?.()
    } finally {
      await first.close()
      await second.close()
    }
  })

  it('a runner opened without the browser server is not handed to a Task that carries it (and the other way round)', async () => {
    const runtime = executableRuntime()
    const pool = createSessionPool<Runner>()
    const gate = await PermissionGate.start({ token: 'tok-3' })
    try {
      const plain = await resolveWith(pool, runtime, { permissionGate: gate })
      const withBrowser = await resolveWith(pool, runtime, { permissionGate: gate, carriesBrowser: true })
      expect(withBrowser).not.toBe(plain)
      expect(await resolveWith(pool, runtime, { permissionGate: gate })).toBe(plain)
      expect(await resolveWith(pool, runtime, { permissionGate: gate, carriesBrowser: true })).toBe(withBrowser)
      await plain.dispose?.()
      await withBrowser.dispose?.()
    } finally {
      await gate.close()
    }
  })

  it('without a gate and without a browser the old key is untouched (two plain resolves share one runner)', async () => {
    const runtime = executableRuntime()
    const pool = createSessionPool<Runner>()
    const one = await resolveWith(pool, runtime)
    expect(await resolveWith(pool, runtime)).toBe(one)
    await one.dispose?.()
  })
})

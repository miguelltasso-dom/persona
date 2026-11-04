import { EventEmitter } from 'node:events'
import { expect, it } from 'vitest'
import {
  CoordRealTimeoutError,
  finishSession,
  installProcessGuards,
  killProcessTree,
  runSessionTurn,
  shutdownCoordRunner,
  treeKillArgs,
  withTimeout,
  type CoordRealHandle,
  type CoordRealRunner,
} from '../src/bench/coord-real-lifecycle.ts'

function fakeRunner(options: {
  text?: string
  hang?: boolean
  throwOnCollect?: boolean
} = {}): CoordRealRunner & { cancelled: string[]; disposed: number } {
  const cancelled: string[] = []
  let disposed = 0
  const runner: CoordRealRunner & { cancelled: string[]; disposed: number } = {
    cancelled,
    get disposed() {
      return disposed
    },
    start: async () => ({ runId: 'run-1' }),
    stream: async function* () {
      if (options.hang === true) {
        await new Promise(() => undefined)
      }
      if (options.throwOnCollect === true) throw new Error('stream failed')
      yield { type: 'delta', text: options.text ?? 'ok' }
      yield { type: 'ended' }
    },
    cancel: async (handle) => {
      cancelled.push(handle.runId)
    },
    dispose: async () => {
      disposed += 1
    },
  }
  return runner
}

async function collectText(events: AsyncIterable<unknown>): Promise<string> {
  let text = ''
  for await (const event of events) {
    const row = event as { type?: string; text?: string }
    if (row.type === 'delta' && row.text !== undefined) text += row.text
  }
  return text
}

it('cancela a sessão ao terminar o turno', async () => {
  const runner = fakeRunner({ text: '{"decision":"ignore"}' })
  const raw = await runSessionTurn(runner, { prompt: 'x' }, collectText, 1_000)
  expect(raw).toBe('{"decision":"ignore"}')
  expect(runner.cancelled).toEqual(['run-1'])
})

it('cancela a sessão quando o stream falha', async () => {
  const runner = fakeRunner({ throwOnCollect: true })
  await expect(runSessionTurn(runner, {}, collectText, 1_000)).rejects.toThrow('stream failed')
  expect(runner.cancelled).toEqual(['run-1'])
})

it('cancela a sessão no timeout do turno', async () => {
  const runner = fakeRunner({ hang: true })
  await expect(runSessionTurn(runner, {}, collectText, 20)).rejects.toBeInstanceOf(CoordRealTimeoutError)
  expect(runner.cancelled.length).toBeGreaterThanOrEqual(1)
  expect(runner.cancelled.every(id => id === 'run-1')).toBe(true)
})

it('finishSession engole erro de cancel', async () => {
  await finishSession(
    {
      cancel: async () => {
        throw new Error('already gone')
      },
    },
    { runId: 'gone' },
  )
})

it('shutdown chama dispose do runner e o pool', async () => {
  const order: string[] = []
  await shutdownCoordRunner(
    {
      dispose: async () => {
        order.push('dispose')
      },
    },
    async () => {
      order.push('pool')
    },
  )
  expect(order).toEqual(['dispose', 'pool'])
})

it('withTimeout dispara onTimeout e lança', async () => {
  const hits: string[] = []
  await expect(withTimeout(
    15,
    new Promise<void>(() => undefined),
    async () => {
      hits.push('cleanup')
    },
  )).rejects.toBeInstanceOf(CoordRealTimeoutError)
  expect(hits).toEqual(['cleanup'])
})

it('árvore Windows usa taskkill /T /F', () => {
  expect(treeKillArgs(8080, 'win32')).toEqual({
    command: 'taskkill',
    args: ['/PID', '8080', '/T', '/F'],
  })
  const calls: Array<[string, readonly string[]]> = []
  const result = killProcessTree(
    18096,
    (command, args) => {
      calls.push([command, args])
      return { status: 0 }
    },
    'win32',
  )
  expect(result).toEqual({ status: 0 })
  expect(calls).toEqual([['taskkill', ['/PID', '18096', '/T', '/F']]])
})

it('SIGINT encerra dispose e depois a árvore', async () => {
  const fake = new EventEmitter()
  const order: string[] = []
  let resolveShutdown: () => void = () => undefined
  const shutdownDone = new Promise<void>((resolve) => {
    resolveShutdown = resolve
  })
  const unguard = installProcessGuards({
    shutdown: async () => {
      order.push('shutdown')
      resolveShutdown()
    },
    killTree: () => {
      order.push('kill')
    },
    exit: (code) => {
      order.push(`exit:${String(code)}`)
    },
    on: fake,
  })
  fake.emit('SIGINT')
  await shutdownDone
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  expect(order).toEqual(['shutdown', 'kill', 'exit:1'])
  unguard()
})

it('uncaughtException também mata a árvore (uma vez só)', async () => {
  const fake = new EventEmitter()
  let kills = 0
  let exits = 0
  let resolveShutdown: () => void = () => undefined
  const shutdownDone = new Promise<void>((resolve) => {
    resolveShutdown = resolve
  })
  installProcessGuards({
    shutdown: async () => {
      resolveShutdown()
    },
    killTree: () => {
      kills += 1
    },
    exit: () => {
      exits += 1
    },
    on: fake,
  })
  fake.emit('uncaughtException')
  fake.emit('SIGTERM')
  await shutdownDone
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  expect(kills).toBe(1)
  expect(exits).toBe(1)
})

it('handle sem dispose ainda esvazia o pool', async () => {
  let pool = 0
  await shutdownCoordRunner({} satisfies Pick<CoordRealRunner, 'dispose'>, async () => {
    pool += 1
  })
  const unused: CoordRealHandle = { runId: 'n' }
  expect(unused.runId).toBe('n')
  expect(pool).toBe(1)
})

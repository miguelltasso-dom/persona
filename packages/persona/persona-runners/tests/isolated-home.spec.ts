import { describe, expect, it } from 'vitest'
import type { AvailableInstallation, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { prepareIsolatedHome, resolveRunner } from '../src/index.ts'

describe('prepareIsolatedHome', () => {
  it('uses the real HOME when no isolated path is given', () => {
    expect(prepareIsolatedHome('claude', undefined)).toEqual({ kind: 'native' })
    expect(prepareIsolatedHome('claude', '  ')).toEqual({ kind: 'native' })
    expect(prepareIsolatedHome('cursor', 'C:/runners/p1')).toEqual({ kind: 'native' })
  })

  it('copies only allowlisted auth files into the isolated dir', () => {
    const copied: Array<[string, string]> = []
    const plan = prepareIsolatedHome('claude', 'C:/persona/runners/p1', {
      userHome: 'C:/Users/dev',
      env: {},
      exists: path => path.replaceAll('\\', '/').endsWith('.claude/.credentials.json'),
      mkdir: () => undefined,
      copyFile: (from, to) => { copied.push([from.replaceAll('\\', '/'), to.replaceAll('\\', '/')]) },
    })
    expect(plan).toEqual({ kind: 'isolated', dir: expect.stringMatching(/runners[\\/]p1$/u) })
    expect(copied).toHaveLength(1)
    expect(copied[0]?.[0]).toMatch(/\.claude\/\.credentials\.json$/u)
    expect(copied[0]?.[1]).toMatch(/runners\/p1\/\.credentials\.json$/u)
  })

  it('points at native login when the isolated dir has nothing to copy', () => {
    expect(prepareIsolatedHome('claude', 'C:/persona/runners/empty', {
      userHome: 'C:/Users/dev',
      env: {},
      exists: () => false,
      mkdir: () => undefined,
      copyFile: () => {
        throw new Error('must not copy')
      },
    })).toEqual({ kind: 'native' })
  })

  it('keeps an explicit isolate flag without copying', () => {
    expect(prepareIsolatedHome('codex', 'C:/iso', {
      env: { PERSONA_ISOLATE_CLI_CONFIG: '1' },
      exists: () => false,
      copyFile: () => {
        throw new Error('must not copy')
      },
    })).toEqual({ kind: 'isolated', dir: expect.stringMatching(/iso$/u) })
  })
})

function runtimeWithEnvCapture(onEnv: (env: Record<string, string | null> | undefined) => void) {
  const inner = scriptedRuntime({ turn: (turn) => { turn.say('OK') } })
  const open = inner.session.bind(inner)
  return Object.assign(inner, {
    installation: async () => ({ kind: 'available' as const, via: 'bundled' as const }),
    authStatus: async () => ({ kind: 'logged_in' as const }),
    listModels: async () => ({ kind: 'ok' as const, models: [{ id: 'haiku' }] }),
    session: async (installation: AvailableInstallation, options: SessionOptions) => {
      onEnv(options.env === undefined ? undefined : { ...options.env })
      return open(installation, options)
    },
  })
}

describe('resolveRunner isolated home', () => {
  it('does not set CLAUDE_CONFIG_DIR when an empty isolated home would drop login', async () => {
    let env: Record<string, string | null> | undefined
    const runtime = runtimeWithEnvCapture((value) => { env = value })
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime,
      home: 'C:/persona/runners/proj',
      homeIo: {
        userHome: 'C:/Users/dev',
        env: {},
        exists: () => false,
        mkdir: () => undefined,
        copyFile: () => {
          throw new Error('must not copy')
        },
      },
      infra: { wait: async () => undefined },
    })
    await runner.start({
      ticketId: 't', assignmentId: 'a', personaId: 'n', cwd: 'C:/tmp',
      prompt: 'hi', model: 'haiku', permissionMode: 'deny',
    })
    expect(env?.CLAUDE_CONFIG_DIR).toBeNull()
  })

  it('uses the seeded isolated dir after a safe auth copy', async () => {
    let env: Record<string, string | null> | undefined
    const runtime = runtimeWithEnvCapture((value) => { env = value })
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime,
      home: 'C:/persona/runners/proj',
      homeIo: {
        userHome: 'C:/Users/dev',
        env: {},
        exists: path => path.replaceAll('\\', '/').includes('.claude/.credentials.json'),
        mkdir: () => undefined,
        copyFile: () => undefined,
      },
      infra: { wait: async () => undefined },
    })
    await runner.start({
      ticketId: 't', assignmentId: 'a', personaId: 'n', cwd: 'C:/tmp',
      prompt: 'hi', model: 'haiku', permissionMode: 'deny',
    })
    expect(env?.CLAUDE_CONFIG_DIR?.replaceAll('\\', '/')).toMatch(/runners\/proj$/u)
  })
})

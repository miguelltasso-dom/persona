/**
 * WAVE2 §3 — multi-account policy gate (Probe subprocess; keep in one file to avoid vitest -t repo-wide bleed).
 */
import { describe, expect, it } from 'vitest'
import { resolveRunner } from '../src/index.ts'
import { scriptedRuntime } from '@botiverse/oar/testing'

function sayingRuntime() {
  const base = scriptedRuntime({
    id: 'fake-cli',
    turn: (turn) => { turn.say('OK') },
  })
  return Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'bundled', version: '2.1.317 (fake-persona-e2e)' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }] }),
    accountUsage: async () => ({ windows: [] }),
  })
}

describe('WAVE2 multi-account (resolve-runner)', () => {
  it('executes WAVE2 account policy at the limit and isolates config dirs', async () => {
    const work = {
      id: 'work', provider: 'claude', label: 'Trabalho', configDir: 'C:/p/accounts/m/claude/work',
    }
    const personal = {
      id: 'personal', provider: 'claude', label: 'Pessoal', configDir: 'C:/p/accounts/m/claude/personal',
    }
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      accounts: [work, personal],
      accountPolicy: { kind: 'fixed', scope: 'persona', accountIds: ['work'] },
      accountQuotas: [{ accountId: 'work', exhausted: true }],
      accountId: 'work',
      infra: { wait: async () => undefined },
    })).rejects.toMatchObject({ code: 'quota_exhausted' })
    await expect(resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime: sayingRuntime(),
      accounts: [work, personal],
      accountPolicy: { kind: 'ask_before_swap', scope: 'workspace', accountIds: ['work', 'personal'] },
      accountQuotas: [{ accountId: 'work', exhausted: true }],
      accountId: 'work',
      infra: { wait: async () => undefined },
    })).rejects.toMatchObject({ code: 'quota_exhausted' })

    let env: Record<string, string | null> | undefined
    const inner = sayingRuntime()
    const open = inner.session.bind(inner)
    const runtime = Object.assign(inner, {
      session: async (installation: Parameters<typeof open>[0], options: Parameters<typeof open>[1]) => {
        env = options.env === undefined ? undefined : { ...options.env }
        return open(installation, options)
      },
    })
    const runner = await resolveRunner({
      spec: { kind: 'cli', cli: 'claude', model: 'haiku' },
      permissionMode: 'deny',
      runtime,
      accounts: [work, personal],
      accountPolicy: { kind: 'next_on_limit', scope: 'workspace', accountIds: ['work', 'personal'] },
      accountQuotas: [
        { accountId: 'work', exhausted: true },
        { accountId: 'personal', exhausted: false, remainingPercent: 70 },
      ],
      accountId: 'work',
      homeIo: { mkdir: () => undefined },
      infra: { wait: async () => undefined },
    })
    await runner.start({
      ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp',
      prompt: 'hi', model: 'haiku', permissionMode: 'deny',
    })
    expect(env?.CLAUDE_CONFIG_DIR?.replaceAll('\\', '/')).toMatch(/accounts\/m\/claude\/personal$/u)
    expect(env?.CODEX_HOME).toBeNull()
  })
})

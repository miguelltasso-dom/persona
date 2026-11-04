import { describe, expect, it } from 'vitest'
import {
  accountAskNotice,
  accountHomeDir,
  accountIsolationEnv,
  accountLoginStatus,
  accountsShareHome,
  formatAccountSwitch,
  pickProviderAccount,
  prepareAccountHome,
  type ProviderAccount,
} from '../src/index.ts'

const work: ProviderAccount = {
  id: 'work', provider: 'claude', label: 'Trabalho', configDir: 'C:/p/accounts/m/claude/work',
}
const personal: ProviderAccount = {
  id: 'personal', provider: 'claude', label: 'Pessoal', configDir: 'C:/p/accounts/m/claude/personal',
}

describe('pickProviderAccount', () => {
  it('keeps the current account when it is not exhausted', () => {
    expect(pickProviderAccount({
      accounts: [work, personal],
      policy: { kind: 'next_on_limit', scope: 'persona', accountIds: ['work', 'personal'] },
      quotas: [{ accountId: 'work', exhausted: false, remainingPercent: 40 }],
      currentId: 'work',
    })).toEqual({ action: 'use', accountId: 'work' })
  })

  it('switches to the next same-engine account and writes an activity line', () => {
    const pick = pickProviderAccount({
      accounts: [work, personal],
      policy: { kind: 'next_on_limit', scope: 'workspace', accountIds: ['work', 'personal'] },
      quotas: [
        { accountId: 'work', exhausted: true, resetsAt: '2026-11-04T21:30:00.000Z' },
        { accountId: 'personal', exhausted: false, remainingPercent: 80, resetsAt: '2026-11-04T21:30:00.000Z' },
      ],
      currentId: 'work',
      personaName: 'Nina',
    })
    expect(pick.action).toBe('switch')
    if (pick.action !== 'switch') return
    expect(pick.to).toBe('personal')
    expect(pick.activity).toContain('Nina passou para Claude · Pessoal')
    expect(pick.activity).toContain('até')
  })

  it('stops on fixed and asks before swap', () => {
    expect(pickProviderAccount({
      accounts: [work, personal],
      policy: { kind: 'fixed', scope: 'persona', accountIds: ['work'] },
      quotas: [{ accountId: 'work', exhausted: true }],
      currentId: 'work',
    })).toMatchObject({ action: 'stop', accountId: 'work' })
    expect(pickProviderAccount({
      accounts: [work, personal],
      policy: { kind: 'ask_before_swap', scope: 'workspace', accountIds: ['work', 'personal'] },
      quotas: [{ accountId: 'work', exhausted: true }],
      currentId: 'work',
    })).toEqual({ action: 'ask', accountId: 'work' })
    expect(accountAskNotice(work)).toContain('Precisa')
    expect(accountAskNotice(work)).toContain('Trabalho')
  })

  it('round-robin balances remaining official quota and never mixes providers', () => {
    const pick = pickProviderAccount({
      accounts: [work, personal],
      policy: { kind: 'round_robin', scope: 'workspace', accountIds: ['work', 'personal'] },
      quotas: [
        { accountId: 'work', exhausted: true },
        { accountId: 'personal', exhausted: false, remainingPercent: 55 },
      ],
      currentId: 'work',
    })
    expect(pick).toMatchObject({ action: 'switch', to: 'personal' })
  })
})

describe('account home isolation', () => {
  it('builds a unique dir and env per account without sharing', () => {
    const workDir = accountHomeDir('C:/persona', 'miguel', 'claude', 'work')
    const personalDir = accountHomeDir('C:/persona', 'miguel', 'claude', 'personal')
    expect(accountsShareHome(workDir, personalDir)).toBe(false)
    const env = accountIsolationEnv('claude', workDir)
    expect(env.CLAUDE_CONFIG_DIR).toBe(workDir)
    expect(env.CODEX_HOME).toBeNull()
    expect(env.CURSOR_CONFIG_DIR).toBeNull()
    const cursor = accountIsolationEnv('cursor', 'C:/acc/cursor/a')
    expect(cursor.CURSOR_CONFIG_DIR).toBe('C:/acc/cursor/a')
    const oc = accountIsolationEnv('opencode-go', 'C:/acc/oc/a')
    expect(oc.OPENCODE_CONFIG_DIR).toBe('C:/acc/oc/a')
    expect(oc.XDG_CONFIG_HOME).toBe('C:/acc/oc/a')
    const grok = accountIsolationEnv('grok', 'C:/acc/grok/a')
    expect(grok.GROK_HOME).toBe('C:/acc/grok/a')
    expect(grok.XAI_CONFIG_DIR).toBe('C:/acc/grok/a')
    expect(grok.CLAUDE_CONFIG_DIR).toBeNull()
    const made: string[] = []
    const prepared = prepareAccountHome('C:/acc/gemini/job', 'gemini', { mkdir: (path) => { made.push(path) } })
    expect(made.length).toBe(1)
    expect(prepared.env.GEMINI_CONFIG_DIR).toMatch(/gemini/u)
    expect(formatAccountSwitch({
      personaName: 'Nina', provider: 'claude', label: 'Trabalho', until: '2026-11-04T21:30:00.000Z',
    })).toMatch(/Nina passou para Claude · Trabalho até /u)
    expect(accountLoginStatus('C:/acc/claude/work', path => path.endsWith('auth.json'))).toBe('logged_in')
    expect(accountLoginStatus('C:/acc/claude/empty', () => false)).toBe('logged_out')
  })
})

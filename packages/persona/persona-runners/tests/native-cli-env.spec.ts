import { afterEach, describe, expect, it } from 'vitest'
import { nativeSessionEnv, restoreNativeCliLogin } from '../src/oar/native-cli-env.ts'

describe('native CLI login env', () => {
  const saved: Record<string, string | undefined> = {
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: process.env.CODEX_HOME,
    HOME: process.env.HOME,
    PERSONA_ISOLATE_CLI_CONFIG: process.env.PERSONA_ISOLATE_CLI_CONFIG,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('unsets isolation by default and keeps an explicit config dir', () => {
    expect(nativeSessionEnv().CLAUDE_CONFIG_DIR).toBeNull()
    expect(nativeSessionEnv().CODEX_HOME).toBeNull()
    expect(nativeSessionEnv().GROK_HOME).toBeNull()
    expect(nativeSessionEnv({ CLAUDE_CONFIG_DIR: 'C:/iso' }).CLAUDE_CONFIG_DIR).toBe('C:/iso')
  })

  it('drops leftover isolation from process.env unless opted in', () => {
    const env: NodeJS.ProcessEnv = {
      CLAUDE_CONFIG_DIR: 'C:/spike',
      CODEX_HOME: 'C:/spike-codex',
      GROK_HOME: 'C:/spike-grok',
      HOME: '',
    }
    restoreNativeCliLogin(env)
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined()
    expect(env.CODEX_HOME).toBeUndefined()
    expect(env.GROK_HOME).toBeUndefined()
    expect(env.HOME).toBeUndefined()

    const isolated: NodeJS.ProcessEnv = {
      PERSONA_ISOLATE_CLI_CONFIG: '1',
      CLAUDE_CONFIG_DIR: 'C:/spike',
    }
    restoreNativeCliLogin(isolated)
    expect(isolated.CLAUDE_CONFIG_DIR).toBe('C:/spike')
  })
})

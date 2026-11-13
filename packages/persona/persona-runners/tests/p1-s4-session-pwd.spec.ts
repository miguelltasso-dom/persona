/**
 * S4 (Mend, P1 pelo Keel 20:12): o OpenCode 1.19 tira o "diretório do projeto" do `PWD` HERDADO do ambiente, não do cwd do spawn (provado com o CLI real e um modelo falso local,
 * `.maestri/tmp/mend/s4/prove-opencode-git.mjs`): com `PWD` = onde o host foi lançado, TODA escrita no rascunho é `external_directory` (o grant de arquivos não funciona) e um caminho
 * RELATIVO cai na pasta do host, com `edit` permitido (escapou do rascunho e escreveu no `.git/config` do repositório de onde o teste rodou). Esperado: toda sessão de CLI
 * (Claude, Codex, OpenCode, Cursor) abre com `cwd` = rascunho E `PWD` = o mesmo rascunho no env, seja qual for o `PWD` do processo do host.
 */
import { resolve } from 'node:path'
import type { AvailableInstallation, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClaudeRunner, createCodexRunner, createCursorRunner, createOpencodeRunner, type StartTurnInput } from '../src/index.ts'

type CliRunner = ReturnType<typeof createClaudeRunner>

const draft = 'C:/tmp/persona-s4-pwd/rascunho'
const input: StartTurnInput = { ticketId: 't-pwd', assignmentId: 'a-pwd', personaId: 'nina', cwd: draft, prompt: 'oi', model: 'scripted-1', permissionMode: 'deny' }

let seen: { cwd: string | undefined; env: Record<string, string | null> | undefined }[] = []
const runtime = (() => {
  const inner = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  return {
    ...inner,
    session: async (installation: AvailableInstallation, options: SessionOptions) => {
      seen.push({ cwd: options.cwd, env: options.env === undefined ? undefined : { ...options.env } })
      return inner.session(installation, options)
    },
  }
})()

let hostPwd: string | undefined
beforeEach(() => { seen = []; hostPwd = process.env.PWD; process.env.PWD = 'C:/Users/host/onde-o-host-foi-lancado' })
afterEach(() => { if (hostPwd === undefined) delete process.env.PWD; else process.env.PWD = hostPwd })

async function open(runner: CliRunner): Promise<void> {
  const handle = await runner.start(input)
  for await (const event of runner.stream(handle)) void event
  await runner.dispose?.()
}

describe('P1 (S4): a sessão do CLI abre com PWD = rascunho, não o PWD do host', () => {
  it.each([
    ['claude', () => createClaudeRunner({ runtime })],
    ['codex', () => createCodexRunner({ runtime })],
    ['opencode', () => createOpencodeRunner({ runtime })],
    ['cursor', () => createCursorRunner({ runtime })],
  ] as const)('%s', async (_name, make) => {
    await open(make())
    expect(seen.length).toBeGreaterThan(0)
    const last = seen.at(-1)
    expect(last?.cwd).toBe(draft)
    expect(last?.env?.PWD).toBe(resolve(draft))
  })
})

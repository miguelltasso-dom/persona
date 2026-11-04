/** Keyless recorded runner input/output for all supported CLI providers. */
import { scriptedRuntime } from '@botiverse/oar/testing'
import { expect, it } from 'vitest'
import {
  cliPolicyOf, createClaudeRunner, createCodexRunner, createCursorRunner, createOpencodeRunner,
} from '../src/index.ts'

it.each([
  { cli: 'claude' as const, create: createClaudeRunner },
  { cli: 'codex' as const, create: createCodexRunner },
  { cli: 'opencode' as const, create: createOpencodeRunner },
  { cli: 'cursor' as const, create: createCursorRunner },
])('$cli answers from inline context under deny without an approval', async ({ cli, create }) => {
  let received = ''
  const runtime = scriptedRuntime({ turn: (turn) => { received = turn.input; turn.say('A empresa é a Padaria Lua.') } })
  const policy = cliPolicyOf(cli, {}, 'deny')
  const runner = create({ runtime, policy })
  const handle = await runner.start({
    ticketId: 'answer', assignmentId: 'assignment', personaId: 'guia', cwd: '.',
    prompt: 'Contexto fornecido: Empresa = Padaria Lua. Resuma em uma frase.',
    model: 'default', permissionMode: 'deny',
  })
  try {
    let text = ''
    let state: string | undefined
    for await (const event of runner.stream(handle)) {
      if (event.type === 'delta') text += event.text
      if (event.type === 'ended') { state = event.report.state; break }
    }
    expect({ received, text, state }).toMatchInlineSnapshot(`
      {
        "received": "Responda somente em texto usando o contexto já fornecido. Não use ferramentas, não leia arquivos nem peça permissões. Se faltar informação, diga qual.

      Contexto fornecido: Empresa = Padaria Lua. Resuma em uma frase.",
        "state": "ready",
        "text": "A empresa é a Padaria Lua.",
      }
    `)
    expect(policy.permissionMode).toBe('deny')
    expect(policy.toolLevel).toBe('none')
  } finally {
    await runner.cancel(handle)
    await runner.dispose?.()
  }
})

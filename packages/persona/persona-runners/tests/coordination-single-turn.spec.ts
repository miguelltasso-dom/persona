/** Recorded OAR regression: coordination initialization must not spend a separate model turn. */
import { scriptedRuntime } from '@botiverse/oar/testing'
import { expect, it } from 'vitest'
import {
  cliPolicyOf, createClaudeRunner, createCoordinationDriver, createOarSessionRunner, withUsageMeter,
} from '../src/index.ts'

it('delivers persona context and input in one model call with one measured ledger entry', async () => {
  const requests: string[] = []
  const kinds: string[] = []
  const runtime = scriptedRuntime({ turn: (turn) => {
    requests.push(turn.input)
    turn.say('A empresa é a Padaria Lua.')
  } })
  const turn = createClaudeRunner({ runtime, policy: cliPolicyOf('claude', {}, 'deny') })
  const runner = createOarSessionRunner({
    turn: withUsageMeter(turn, { record: (entry) => { kinds.push(entry.kind) } }, 'claude', { kind: 'triage' }),
    personaId: 'coord', purpose: 'talk', model: 'default', permissionMode: 'deny',
  })
  const driver = createCoordinationDriver({ runner, persona: { id: 'coord', name: 'Guia' }, cwd: '.',
    prompt: 'Você é Guia. Use somente o contexto fornecido.' })
  try {
    await driver.start()
    expect(requests).toEqual([])
    expect(kinds).toEqual([])
    await driver.deliver('input-1', 'Contexto: empresa = Padaria Lua. Resuma em uma frase.')
    await driver.deliver('input-1', 'Contexto: empresa = Padaria Lua. Resuma em uma frase.')
    expect({ requests, kinds }).toMatchInlineSnapshot(`
      {
        "kinds": [
          "triage",
        ],
        "requests": [
          "Responda somente em texto usando o contexto já fornecido. Não use ferramentas, não leia arquivos nem peça permissões. Se faltar informação, diga qual.

      Você é Guia. Use somente o contexto fornecido.

      Contexto: empresa = Padaria Lua. Resuma em uma frase.",
        ],
      }
    `)
  } finally {
    await driver.cancel()
    await turn.dispose?.()
  }
})

/**
 * Carbon P0-05a (snapshot 2): what the model says and what a failed run keeps never carry a typed secret. `tapTurn` fills the reply the host persists and posts; `redactRunDetail` shapes the cause of a failed
 * run that is kept. Both now go through the host's mask (the one registered with `registerSecretWindow`). RED first.
 */
import { registerSecretWindow, type TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, describe, expect, it } from 'vitest'
import { SecretMask } from '../src/browser/blind-typing.ts'
import { redactRunDetail } from '../src/orchestration.ts'
import { tapTurn, type TextCapture } from '../src/runner.ts'

const PASSWORD = 'Padaria#Lua-2026'

afterEach(() => { registerSecretWindow(undefined) })

function armed(): void {
  const mask = new SecretMask()
  mask.add(PASSWORD, 0)
  registerSecretWindow(() => true, text => mask.redact(text, 1_000))
}

async function run(events: readonly unknown[], capture: TextCapture): Promise<void> {
  const source = async function *(): AsyncGenerator<never> { for (const event of events) yield event as never }
  const turn = { stream: () => source(), events: () => source() } as unknown as TurnRunner
  for await (const event of tapTurn(turn, capture).stream({} as never)) void event
}

describe('tapTurn masks what the model wrote, even when the secret is split between two deltas', () => {
  it('the reply, every partial and the report keep the value out', async () => {
    armed()
    const partials: string[] = []
    const capture: TextCapture = { last: '', onPartial: (text) => { partials.push(text) } }
    await run([
      { type: 'started', at: 't' },
      { type: 'delta', text: 'A senha é Padaria#', at: 't' },
      { type: 'delta', text: 'Lua-2026, anotada.', at: 't' },
      { type: 'ended', at: 't', report: { state: 'ready', summary: `Entrei com ${PASSWORD}`, question: `Posso usar ${PASSWORD}?` } },
    ], capture)
    expect(capture.last).not.toContain(PASSWORD)
    expect(partials.join('\n')).not.toContain(PASSWORD)
    expect(JSON.stringify(capture.report ?? {})).not.toContain(PASSWORD)
    expect(capture.question ?? '').not.toContain(PASSWORD)
    expect(capture.last).toContain('••••••')
  })

  it('with nothing registered (a runner outside the host) the words are as the model wrote them', async () => {
    const capture: TextCapture = { last: '' }
    await run([{ type: 'started', at: 't' }, { type: 'delta', text: 'oi', at: 't' }, { type: 'ended', at: 't', report: { state: 'ready', summary: 'oi' } }], capture)
    expect(capture.last).toBe('oi')
  })
})

describe('redactRunDetail masks a typed secret on top of tokens and passwords with a label', () => {
  it('a provider error that echoes the value is kept without it', () => {
    armed()
    expect(redactRunDetail(`O portal recusou a senha ${PASSWORD} do login`)).not.toContain(PASSWORD)
    expect(redactRunDetail('Falhou com api_key=abc123def456')).toContain('[removido]') // what it already did
  })
})

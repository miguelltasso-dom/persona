/**
 * A paid measurement round proves the environment mode FIRST (zero model): without it the first call of an unverified CLI version runs native
 * (the person's whole environment) and the round is invalid. A fake control client reproduces what the real CLI was measured to do
 * (reports/iso-dry-product.json); no real CLI, no model.
 */
import { describe, expect, it } from 'vitest'
import type { ControlSession, OpenControl } from '../src/oar/claude-control.ts'
import { IsolationGate, IsolationRuntime, type GateIo } from '../src/oar/isolation-gate.ts'
import { proveCliIsolation } from '../src/oar/isolation-prove.ts'

function memoryIo(): GateIo { let text: string | undefined; return { read: () => text, write: (next) => { text = next } } }

interface World { loggedIn: boolean; broken: boolean }

function fakeOpen(state: World): OpenControl {
  return (launch): ControlSession => {
    const args = launch.args
    const after = (flag: string): string | undefined => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined }
    const strict = args.includes('--strict-mcp-config') && !state.broken
    const noCommands = args.includes('--disable-slash-commands') && !state.broken
    return {
      request: async (subtype) => {
        if (subtype === 'initialize') return { account: state.loggedIn ? { subscriptionType: 'x' } : null, commands: noCommands ? [] : ['a'] }
        if (subtype === 'mcp_status') return { mcpServers: strict ? [] : [{ status: 'connected' }] }
        if (subtype === 'get_context_usage') return { totalTokens: strict ? 1608 : 377_321, categories: [{ name: 'System tools', tokens: args.includes('--tools') ? 0 : 29_665 }] }
        if (subtype === 'get_settings') return { applied: { model: after('--model') ?? 'claude-opus-5-5', effort: after('--effort') ?? 'medium' } }
        return {}
      },
      close: async () => undefined,
    }
  }
}

const installed = { installation: async () => ({ kind: 'available', via: 'executable', command: 'claude', version: '2.1.318' }) } as never
const runtimeOf = (state: World) => (): IsolationRuntime => new IsolationRuntime({ gate: new IsolationGate(memoryIo()), open: fakeOpen(state), fingerprint: () => 'fp', timing: { arriveMs: 30, pauseMs: 1 } })
const ENV = { PERSONA_CLI_ENV: 'answer-only' }

describe('proveCliIsolation', () => {
  it('ok when the mode is proven for the installed version: the effective mode of a call is the requested one', async () => {
    const proof = await proveCliIsolation({ mode: 'answer-only', modelArg: 'haiku', env: ENV, runtime: installed, isolation: runtimeOf({ loggedIn: true, broken: false }) })
    expect(proof).toMatchObject({ ok: true, version: '2.1.318' })
    expect(proof.reason).toContain('answer-only provado')
  })

  it('NOT ok when the CLI stopped honouring the flags: the round stops before any model call', async () => {
    const proof = await proveCliIsolation({ mode: 'answer-only', modelArg: 'haiku', env: ENV, runtime: installed, isolation: runtimeOf({ loggedIn: true, broken: true }) })
    expect(proof.ok).toBe(false)
    expect(proof.reason).toContain('NÃO está provado')
    expect(proof.reason).toContain('antes de qualquer chamada de modelo')
  })

  it('NOT ok when the person is logged out (a logged-out account never proves a version)', async () => {
    const proof = await proveCliIsolation({ mode: 'answer-only', modelArg: 'haiku', env: ENV, runtime: installed, isolation: runtimeOf({ loggedIn: false, broken: false }) })
    expect(proof.ok).toBe(false)
  })

  it('NOT ok without an executable (nothing is spent)', async () => {
    const missing = { installation: async () => ({ kind: 'missing' }) } as never
    const proof = await proveCliIsolation({ mode: 'answer-only', modelArg: 'haiku', env: ENV, runtime: missing, isolation: runtimeOf({ loggedIn: true, broken: false }) })
    expect(proof).toEqual({ ok: false, reason: 'o executável do claude não está disponível; nada foi gasto' })
  })

  it('native is never "proven": a request for it is only ok if the requested mode is what a call gets', async () => {
    const proof = await proveCliIsolation({ mode: 'needed', modelArg: 'haiku', env: { PERSONA_CLI_ENV: 'needed' }, call: 'task', runtime: installed, isolation: runtimeOf({ loggedIn: true, broken: false }) })
    expect(proof.ok).toBe(true)
  })
})

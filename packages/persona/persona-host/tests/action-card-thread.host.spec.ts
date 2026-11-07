/**
 * HT-9 (contracts/team-real.md §14): the preview of an external action IN the thread of #geral. ONE message of the persona, `action-card:<id>`, with a
 * fixed sentence (no argument), UPDATED IN PLACE as the person decides: the client reads `MessageView.actionPreview` (the real content). No second line
 * says the same thing. Runs the whole chain with the real gate and the fake Claude, like ht9-host-bridge.spec.
 */
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import type { PermissionGate } from '@deepseek-ai/dsh-persona-runners'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { ConnectorPorts } from '../src/connector-grants-host.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const GMAIL = { cli: 'claude', id: `https://proxy.example.test/v1/mcp/${'0f'.repeat(24)}`, name: 'Gmail' }
const SEND = 'mcp__gmail__send_email'
const MAIL = { to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.' }
const PORTS: ConnectorPorts = {
  cliIsolation: () => 'full', connectorDefinitionOf: () => 'account', permissionRequests: () => 'blocked-report', mcpServerNameOf: () => 'gmail',
  availableConnectors: () => [GMAIL], connectorsNeededBy: (text, available) => (/e-?mail/iu.test(text) ? available : []),
  mcpStatusOf: () => [{ name: 'gmail', tools: [] }],
}

async function hookOf(gate: PermissionGate, tool: string, input: Record<string, unknown>): Promise<'allow' | 'deny'> {
  const settings = gate.settings() as { hooks: { PreToolUse: Array<{ hooks: Array<{ url: string; headers: Record<string, string> }> }> } }
  const hook = settings.hooks.PreToolUse[0]!.hooks[0]!
  const response = await fetch(hook.url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...hook.headers },
    body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'tu', mcp_server: 'gmail' }),
  })
  const body = await response.json() as { hookSpecificOutput?: { permissionDecision?: string } }
  return body.hookSpecificOutput?.permissionDecision === 'allow' ? 'allow' : 'deny'
}

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }])
  h.product.updatePersona({ ...h.product.getPersona('nina')!, runner: { kind: 'cli', cli: 'claude', model: 'default' } }, 'pp')
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = scripted })
  h.connectorPorts = PORTS
  let said: string | undefined
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const text = said; said = undefined; return text }, set: () => undefined })
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const listeners = new Set<(event: RunnerEvent) => void>()
    const runner: Runner = {
      ensureSession: () => Promise.resolve(),
      deliver: async (sessionId) => {
        const sent = request?.permissionGate !== undefined && await hookOf(request.permissionGate, SEND, MAIL) === 'allow'
        said = sent ? 'Pronto, enviei.' : 'Preciso da sua aprovação antes de enviar.'
        for (const listener of listeners) listener({ type: 'idle', sessionId, at: new Date().toISOString() })
      },
      cancel: () => Promise.resolve(),
      status: () => 'idle',
      whenIdle: () => Promise.resolve(),
      onEvent: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      capabilities: () => ({ steer: false, removeQueued: false, reportsInputTaken: false, background: false, tools: 'mcp', resume: false }),
    }
    return Promise.resolve(runner)
  }
  onTestFinished(async () => { await h.actionBridge.closeAll() })
  return h
}

const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const cardLines = (h: PersonaHost) => thread(h).filter(row => row.id.startsWith('action-card:'))
const ask = async (h: PersonaHost): Promise<void> => {
  say(h, 'u1', '@Nina envie um email para a Ana com a confirmação dos bolos')
  await h.orchestration.flush('pp')
}

it('a new pending action puts ONE card in the thread: the persona\'s message, a fixed sentence with no argument, and the real content in actionPreview', async () => {
  const h = open()
  await ask(h)
  const [line, ...more] = cardLines(h)
  expect(more).toEqual([])
  expect(line).toMatchObject({ actorId: 'nina', body: 'Nina quer enviar pelo Gmail. Confira antes.' })
  expect(line?.body).not.toContain('Seus bolos') // LEAK-1: the sentence carries no argument; the content is in the card
  expect(line?.actionPreview).toMatchObject({
    status: 'pending', actionClass: 'send', connectorName: 'Gmail', to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.', personaId: 'nina',
  })
  expect(line?.actionPreview?.approvalId).toBe(h.listApprovals(SCOPE).find(row => row.kind === 'action')?.id) // the id decideApproval expects
})

it('the card is UPDATED IN PLACE when the person approves: the same message, now "sent", and no other line repeats it', async () => {
  const h = open()
  await ask(h)
  const before = cardLines(h)[0]
  const linesBefore = thread(h).length
  h.decideApproval({ ...SCOPE, id: before!.actionPreview!.approvalId, kind: 'action', choice: 'send' })
  await h.orchestration.flush('pp')
  const after = cardLines(h)
  expect(after).toHaveLength(1)
  expect(after[0]?.id).toBe(before?.id)
  expect(after[0]?.actionPreview).toMatchObject({ status: 'sent', sentTo: 'ana@exemplo.com' })
  expect(after[0]?.seq).toBeGreaterThanOrEqual(before?.seq ?? 0) // an upsert of the same id (the stream resends it)
  expect(thread(h).filter(row => /enviou/iu.test(row.body) && row.id !== before?.id)).toEqual([]) // nobody says it again
  expect(thread(h).length - linesBefore).toBeLessThanOrEqual(1) // at most the persona's own words after sending
})

it('cancelled: the card says so in place, with no buttons to give; an action that waited 24 h is "cancelled" with the reason "expirou"', async () => {
  const h = open()
  await ask(h)
  const approvalId = cardLines(h)[0]!.actionPreview!.approvalId
  h.decideApproval({ ...SCOPE, id: approvalId, kind: 'action', choice: 'cancel' })
  expect(cardLines(h)[0]?.actionPreview).toMatchObject({ status: 'cancelled' })
  const expired = open()
  await ask(expired)
  expired.orchestration.now = () => '2026-11-05T00:00:00.000Z' // a day and more later
  expired.listApprovals(SCOPE) // reading closes what waited too long
  expect(cardLines(expired)[0]?.actionPreview).toMatchObject({ status: 'cancelled', failureReason: 'expirou' })
})

it('every line of the thread still has an author that is a person or a persona, the card included; no argument or hash reaches the thread text', async () => {
  const h = open()
  await ask(h)
  const known = new Set<string>([...h.product.listMembers('ws').map(row => row.id), ...h.product.listPersonas('pp').map(row => row.id)])
  for (const line of thread(h)) expect(known.has(line.actorId), `author ${line.actorId}`).toBe(true)
  expect(JSON.stringify(thread(h).map(row => row.body))).not.toMatch(/[0-9a-f]{64}/u)
})

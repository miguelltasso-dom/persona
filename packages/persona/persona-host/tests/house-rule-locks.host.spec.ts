/**
 * HONEST-1 (Atlas 11/11), block 3: the "Regras da casa" that are LOCKS are obeyed by the host, deterministically, in the permission gate — not as a
 * sentence in a prompt. Same rig as HT-9 (`ht9-host-bridge.spec.ts`): the real orchestration + the real gate (the HTTP hook the CLI posts to) + the
 * host's card, against a FAKE Claude that asks the hook before every connector call and "runs" the call only when the hook says allow.
 *
 *  - a fake turn that VIOLATES a saved lock (autonomy that would let it send, a grant that waives the send box) is BARRED: nothing leaves, ONE card
 *    holds the real content, the Task waits for the person, and the rule's book counts it ("Barrou 1 envio");
 *  - the lock stops the persona, never the person: her approval still lets EXACTLY that call through, once;
 *  - a lock holds ONE verb (`never-publish` holds a publish and leaves a plain send alone);
 *  - a rule that is only text (no `kind`) locks nothing and says so (`enforced: false`); deleting a rule lifts its lock on the next turn.
 */
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import type { PermissionGate } from '@deepseek-ai/dsh-persona-runners'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { ConnectorPorts } from '../src/connector-grants-host.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
import type { ApprovalView, HouseRuleKind } from '../src/types.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const GMAIL = { cli: 'claude', id: `https://proxy.example.test/v1/mcp/${'0f'.repeat(24)}`, name: 'Gmail' }
const LIST = 'mcp__gmail__list_emails'
const SEND = 'mcp__gmail__send_email'
const PAY = 'mcp__gmail__pay_invoice'
const DELETE = 'mcp__gmail__delete_messages'
const PUBLISH = 'mcp__gmail__publish_page'
const MAIL = { to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.' }
const PAGE = { title: 'Promoção de sexta', body: 'Pão de queijo 2 por R$ 9' }
const PORTS: ConnectorPorts = {
  cliIsolation: () => 'full',
  connectorDefinitionOf: () => 'account',
  permissionRequests: () => 'blocked-report',
  mcpServerNameOf: () => 'gmail',
  availableConnectors: () => [GMAIL],
  connectorsNeededBy: (text, available) => (/e-?mail|página|pagar|apagar/iu.test(text) ? available : []),
  mcpStatusOf: () => [{ name: 'gmail', tools: [{ name: 'list_emails', annotations: { readOnly: true } }] }],
}

interface Call { readonly tool: string; readonly input: Record<string, unknown> }
interface Rig {
  readonly h: PersonaHost
  readonly executed: Call[]
  readonly plan: (...turns: Call[][]) => void
}

async function hookOf(gate: PermissionGate, call: Call): Promise<'allow' | 'deny' | 'none'> {
  const settings = gate.settings() as { hooks: { PreToolUse: Array<{ hooks: Array<{ url: string; headers: Record<string, string> }> }> } }
  const hook = settings.hooks.PreToolUse[0]!.hooks[0]!
  const response = await fetch(hook.url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...hook.headers },
    body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: call.tool, tool_input: call.input, tool_use_id: 'tu', mcp_server: call.tool.split('__')[1] }),
  })
  const body = await response.json() as { hookSpecificOutput?: { permissionDecision?: string } }
  const decision = body.hookSpecificOutput?.permissionDecision
  return decision === 'allow' ? 'allow' : decision === 'deny' ? 'deny' : 'none'
}

/** Nina has the broadest permission the product allows for a send: autonomy `act` and a grant that waives the send box. Only a house rule can stop her. */
function open(): Rig {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Atendimento' },
  ])
  h.product.updatePersona({ ...h.product.getPersona('nina')!, runner: { kind: 'cli', cli: 'claude', model: 'default' } }, 'pp')
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = scripted })
  h.connectorPorts = PORTS
  h.setAutonomy({ ...SCOPE, personaId: 'nina', mode: 'act', proposalBudget: 3, tokenBudget: 1_000_000, executionBudget: 50, silenceStart: '', silenceEnd: '' })
  h.connectorGrants.grant({
    workspaceId: 'ws', projectId: 'pp', personaId: 'nina', connector: GMAIL, access: 'write', confirm: { send: 'never', pay: 'ask', delete: 'ask' },
  }, 'ana')
  const executed: Call[] = []
  const turns: Call[][] = []
  let said: string | undefined
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const text = said; said = undefined; return text }, set: () => undefined })
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const gate = request?.permissionGate
    const listeners = new Set<(event: RunnerEvent) => void>()
    const runner: Runner = {
      ensureSession: () => Promise.resolve(),
      deliver: async (sessionId) => {
        let sent = false
        let waited = false
        for (const call of turns.shift() ?? []) {
          const decision = gate === undefined ? (call.tool === LIST ? 'allow' : 'deny') : await hookOf(gate, call)
          if (decision === 'allow') { executed.push(call); sent ||= call.tool !== LIST } else waited = true
        }
        said = waited ? 'Preciso da sua aprovação antes de seguir.' : sent ? 'Pronto, enviei.' : 'Li os e-mails.'
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
  return { h, executed, plan: (...next) => { turns.push(...next) } }
}

const lock = (h: PersonaHost, id: string, kind?: HouseRuleKind) => h.putTriageRule({
  ...SCOPE, id, gateText: 'Regra da casa.', assessmentText: '', logOnly: false, speculativeEnabled: false, ...(kind === undefined ? {} : { kind }),
})
const book = (h: PersonaHost, id: string) => h.listTriageRules(SCOPE).find(rule => rule.id === id)!.applied!
const cards = (h: PersonaHost): ApprovalView[] => h.listApprovals(SCOPE).filter(row => row.kind === 'action')
const ticketOf = (h: PersonaHost) => h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Nina')
const waitingFor = (h: PersonaHost): boolean => ticketOf(h)?.assignments.at(-1)?.report?.state === 'waiting'
const ask = async (rig: Rig, body = '@Nina envie um email para a Ana com a confirmação dos bolos'): Promise<void> => {
  say(rig.h, 'u1', body)
  await rig.h.orchestration.flush('pp')
}

it('control: with act + a send waiver and NO rule, the e-mail leaves (so what follows is the rule, not the rig)', async () => {
  const rig = open()
  rig.plan([{ tool: SEND, input: MAIL }])
  await ask(rig)
  expect(rig.executed).toEqual([{ tool: SEND, input: MAIL }])
  expect(cards(rig.h)).toEqual([])
})

it('never-send: the same turn is BARRED — nothing leaves, ONE card holds the real content, the Task waits, and the rule counts it', async () => {
  const rig = open()
  lock(rig.h, 'r-send', 'never-send')
  rig.plan([{ tool: LIST, input: {} }, { tool: SEND, input: MAIL }])
  await ask(rig)
  expect(rig.executed.map(call => call.tool)).toEqual([LIST]) // the read was proven read-only by the pre-flight and is not touched by a lock; the send never left
  const [card, ...more] = cards(rig.h)
  expect(more).toEqual([])
  expect(card).toMatchObject({ status: 'pending', actionPreview: { actionClass: 'send', to: 'ana@exemplo.com', body: MAIL.body } })
  expect(waitingFor(rig.h)).toBe(true)
  expect(book(rig.h, 'r-send')).toMatchObject({ total: 1, thisWeek: 1, lastWhat: 'enviar pelo Gmail' })
})

it('the lock stops the persona, never the person: her approval lets EXACTLY that call through, once, and the book does not count it again', async () => {
  const rig = open()
  lock(rig.h, 'r-send', 'never-send')
  rig.plan([{ tool: SEND, input: MAIL }], [{ tool: SEND, input: MAIL }])
  await ask(rig)
  expect(rig.executed).toEqual([])
  const [pending] = cards(rig.h)
  rig.h.decideApproval({ ...SCOPE, id: pending!.id, kind: 'action', choice: 'send' })
  await rig.h.orchestration.flush('pp')
  expect(rig.executed).toEqual([{ tool: SEND, input: MAIL }])
  expect(book(rig.h, 'r-send').total).toBe(1)
})

it('never-publish holds ONE verb: the publish is barred, a plain send in the same turn still goes', async () => {
  const rig = open()
  lock(rig.h, 'r-pub', 'never-publish')
  rig.plan([{ tool: SEND, input: MAIL }, { tool: PUBLISH, input: PAGE }])
  await ask(rig, '@Nina envie um email para a Ana e publique a página da promoção')
  expect(rig.executed).toEqual([{ tool: SEND, input: MAIL }])
  const [card, ...more] = cards(rig.h)
  expect(more).toEqual([])
  expect(card).toMatchObject({ status: 'pending', actionPreview: { actionClass: 'send' } })
  expect(book(rig.h, 'r-pub')).toMatchObject({ total: 1, lastWhat: 'publicar pelo Gmail' })
})

it('never-spend and never-delete: pay and delete are asked (as ever) AND the rule counts what it held', async () => {
  const rig = open()
  lock(rig.h, 'r-pay', 'never-spend')
  lock(rig.h, 'r-del', 'never-delete')
  rig.plan([{ tool: PAY, input: { payee: 'Padaria Sol', amount: '120,00', reference: 'Fatura 33' } }, { tool: DELETE, input: { ids: ['m1', 'm2'] } }])
  await ask(rig, '@Nina envie um email para a Ana, pague a fatura 33 e apague os emails velhos')
  expect(rig.executed).toEqual([])
  expect(cards(rig.h).map(card => card.actionPreview?.actionClass).sort()).toEqual(['delete', 'pay'])
  expect(book(rig.h, 'r-pay')).toMatchObject({ total: 1, lastWhat: 'pagar pelo Gmail' })
  expect(book(rig.h, 'r-del')).toMatchObject({ total: 1, lastWhat: 'apagar pelo Gmail' })
})

it('a rule that is only text locks NOTHING and says so: the e-mail leaves, enforced is false', async () => {
  const rig = open()
  const text = lock(rig.h, 'r-text')
  expect(text.enforced).toBe(false)
  rig.plan([{ tool: SEND, input: MAIL }])
  await ask(rig)
  expect(rig.executed).toEqual([{ tool: SEND, input: MAIL }])
  expect(book(rig.h, 'r-text')).toEqual({ total: 0, thisWeek: 0 })
})

it('deleting the rule lifts the lock on the very next turn (the gate is armed again every turn)', async () => {
  const rig = open()
  lock(rig.h, 'r-send', 'never-send')
  rig.plan([{ tool: SEND, input: MAIL }], [{ tool: SEND, input: MAIL }])
  await ask(rig)
  expect(rig.executed).toEqual([])
  rig.h.deleteTriageRule({ ...SCOPE, id: 'r-send' })
  rig.h.orchestration.wakeTicket('pp', ticketOf(rig.h)!.id, 'de novo')
  await rig.h.orchestration.flush('pp')
  expect(rig.executed).toEqual([{ tool: SEND, input: MAIL }])
})

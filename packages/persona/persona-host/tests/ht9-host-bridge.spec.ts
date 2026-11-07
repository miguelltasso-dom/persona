/**
 * HT-9 (D-084), END TO END IN THE HOST with NO model: the real orchestration + the real permission gate (the HTTP PreToolUse hook the CLI posts
 * to) + the host's own card of an external action + the connector grants, against a FAKE Claude that does what the CLI does — it asks the hook
 * before every connector call and "runs" the call (on a FAKE connector) only when the hook says allow. Keel's four points (05/11 02:22):
 *   (1) a `send` with no approval → NOTHING leaves and the card appears;
 *   (2) approve → exactly THAT action leaves (same hash), once;
 *   (3) arguments rewritten by the model after the approval → denied (and it comes back as another card);
 *   (4) pay / delete ALWAYS ask for a preview, even with the broadest "Sempre permitir".
 * The gate alone is proven in persona-runners and on the real CLI by scripts/ht89-dry.ts; the gate + the card + the policy by
 * ht9-gate-contract.spec.ts; this is the host's SEAM (`action-bridge.ts`): gate per runner, arm, refused call → card, Task waits, approval →
 * reopened Task carrying the approval → one call let through → card "sent".
 */
import type { Runner, RunnerEvent } from '@deepseek-ai/dsh-persona-engine'
import { McpStatusCache, type PermissionGate } from '@deepseek-ai/dsh-persona-runners'
import { expect, onTestFinished } from 'vitest'
import { ConnectorBridge } from '../src/connector-bridge.ts'
import type PersonaHost from '../src/index.ts'
import type { ConnectorPorts } from '../src/connector-grants-host.ts'
import type { HostRunnerRequest } from '../src/runner.ts'
import type { ApprovalView } from '../src/types.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const GMAIL = { cli: 'claude', id: `https://proxy.example.test/v1/mcp/${'0f'.repeat(24)}`, name: 'Gmail' }
const LIST = 'mcp__gmail__list_emails'
const SEND = 'mcp__gmail__send_email'
const PAY = 'mcp__gmail__pay_invoice'
const DELETE = 'mcp__gmail__delete_messages'
const MAIL_A = { to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.' }
const MAIL_B = { to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 30 bolos para sexta.' }
const PORTS: ConnectorPorts = {
  cliIsolation: () => 'full',
  connectorDefinitionOf: () => 'account',
  permissionRequests: () => 'blocked-report',
  mcpServerNameOf: () => 'gmail', // the mandate: the server this Task was given
  availableConnectors: () => [GMAIL],
  connectorsNeededBy: (text, available) => (/e-?mail/iu.test(text) ? available : []),
  // The pre-flight: the server proves ONLY that it can list e-mails (read-only). Nothing else is proven.
  mcpStatusOf: () => [{ name: 'gmail', tools: [{ name: 'list_emails', annotations: { readOnly: true } }] }],
}

interface Call { readonly tool: string; readonly input: Record<string, unknown> }

interface Rig {
  readonly h: PersonaHost
  /** What the FAKE connector really ran: only calls the hook allowed. */
  readonly executed: Call[]
  /** The calls the fake model makes in the NEXT turn (one list per turn). */
  readonly plan: (...turns: Call[][]) => void
  readonly turnsRun: () => number
}

/** The hook as the CLI calls it: POST the tool and the complete arguments, run the tool only on `allow`. */
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

function open(grant?: { readonly send?: 'never'; readonly pay?: 'never'; readonly delete?: 'never' }): Rig {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Atendimento' },
  ])
  h.product.updatePersona({ ...h.product.getPersona('nina')!, runner: { kind: 'cli', cli: 'claude', model: 'default' } }, 'pp')
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false // the real runner path: the scripted replies never open a runner
  onTestFinished(() => { h.orchestration.scripted = scripted })
  h.connectorPorts = PORTS
  if (grant !== undefined) {
    h.connectorGrants.grant({
      workspaceId: 'ws', projectId: 'pp', personaId: 'nina', connector: GMAIL, access: 'write',
      confirm: { send: grant.send ?? 'ask', pay: grant.pay ?? 'ask', delete: grant.delete ?? 'ask' },
    }, 'ana')
  }
  const executed: Call[] = []
  const turns: Call[][] = []
  let run = 0
  let said: string | undefined
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => { const text = said; said = undefined; return text }, set: () => undefined })
  h.orchestration.runnerFactory = (request?: HostRunnerRequest) => {
    const gate = request?.permissionGate
    const listeners = new Set<(event: RunnerEvent) => void>()
    const runner: Runner = {
      ensureSession: () => Promise.resolve(),
      deliver: async (sessionId) => {
        run += 1
        let sent = false
        let waited = false
        for (const call of turns.shift() ?? []) {
          // No gate = the CLI has no hook: the host loads the connector read-only, so nothing but reading may run.
          const decision = gate === undefined ? (call.tool === LIST ? 'allow' : 'deny') : await hookOf(gate, call)
          if (decision === 'allow') { executed.push(call); sent ||= call.tool !== LIST } else waited = true
        }
        said = waited ? 'Preciso da sua aprovação antes de enviar.' : sent ? 'Pronto, enviei.' : 'Li os e-mails.'
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
  return { h, executed, plan: (...next) => { turns.push(...next) }, turnsRun: () => run }
}

const cards = (h: PersonaHost): ApprovalView[] => h.listApprovals(SCOPE).filter(row => row.kind === 'action')
const ticketOf = (h: PersonaHost) => h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Nina')
const waitingFor = (h: PersonaHost): boolean => {
  const ticket = ticketOf(h)
  const latest = ticket?.assignments.at(-1)
  return latest?.report?.state === 'waiting'
}
const ask = async (rig: Rig, body = '@Nina envie um email para a Ana com a confirmação dos bolos'): Promise<void> => {
  say(rig.h, 'u1', body)
  await rig.h.orchestration.flush('pp')
}
const answer = async (rig: Rig, id: string, choice: 'send' | 'edit' | 'cancel', remember = false): Promise<ApprovalView> => {
  const decided = rig.h.decideApproval({ ...SCOPE, id, kind: 'action', choice, ...(remember ? { remember: true } : {}) })
  await rig.h.orchestration.flush('pp')
  return decided
}

it('(1) a send with no approval: reading goes through, the e-mail does NOT, ONE card holds the real content and the Task waits for the person', async () => {
  const rig = open()
  rig.plan([{ tool: LIST, input: { query: 'cliente' } }, { tool: SEND, input: MAIL_A }])
  await ask(rig)
  expect(rig.executed.map(call => call.tool)).toEqual([LIST]) // the read was proven read-only by the pre-flight; the send never left
  const [card, ...more] = cards(rig.h)
  expect(more).toEqual([])
  expect(card).toMatchObject({
    kind: 'action', status: 'pending', personaId: 'nina', title: 'Nina quer enviar pelo Gmail',
    actionPreview: { actionClass: 'send', connectorName: 'Gmail', to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.', requestedByPerson: true, status: 'pending' },
  })
  expect(waitingFor(rig.h)).toBe(true) // not ready, not failed: waiting for the person
  expect(rig.h.actionBridge.listening).toBe(1) // one gate, for this Task's runner
  expect(JSON.stringify(rig.h.listApprovals(SCOPE))).not.toMatch(/[0-9a-f]{64}/u) // the hash of the arguments never reaches a screen
})

it('(2) approve: the reopened Task lets through exactly THAT call (same hash), once, and the card says sent', async () => {
  const rig = open()
  rig.plan([{ tool: SEND, input: MAIL_A }], [{ tool: SEND, input: MAIL_A }])
  await ask(rig)
  expect(rig.executed).toEqual([])
  const [pending] = cards(rig.h)
  const decided = await answer(rig, pending!.id, 'send')
  expect(decided.status).toBe('approved')
  expect(rig.executed).toEqual([{ tool: SEND, input: MAIL_A }]) // exactly what the person saw, once
  const [sent] = cards(rig.h)
  expect(sent).toMatchObject({ status: 'approved', actionPreview: { status: 'sent', sentTo: 'ana@exemplo.com' } })
  expect(waitingFor(rig.h)).toBe(false)
  // The approval was spent: the same call in a later turn asks again instead of riding on it.
  rig.plan([{ tool: SEND, input: MAIL_A }])
  const ticket = ticketOf(rig.h)!
  rig.h.orchestration.wakeTicket('pp', ticket.id, 'de novo')
  await rig.h.orchestration.flush('pp')
  expect(rig.executed).toHaveLength(1)
})

it('(3) arguments rewritten by the model after the approval: NOT sent, the approved card is closed as changed, and the new arguments come back as another card', async () => {
  const rig = open()
  rig.plan([{ tool: SEND, input: MAIL_A }], [{ tool: SEND, input: MAIL_B }])
  await ask(rig)
  const [first] = cards(rig.h)
  await answer(rig, first!.id, 'send')
  expect(rig.executed).toEqual([]) // "aprovei A, enviou B" does not happen
  const all = cards(rig.h)
  expect(all).toHaveLength(2)
  expect(all[0]).toMatchObject({ id: first!.id, status: 'rejected', actionPreview: { status: 'failed', failureReason: 'o pedido mudou antes de enviar; veja o novo cartão' } })
  expect(all[1]).toMatchObject({ status: 'pending', actionPreview: { body: 'Oi, Ana! Confirmo os 30 bolos para sexta.' } })
  expect(waitingFor(rig.h)).toBe(true)
})

it('(4) pay and delete ALWAYS come with a preview, even with the broadest "Sempre permitir"; the send waiver is the only one that lets a call through', async () => {
  const rig = open({ send: 'never', pay: 'never', delete: 'never' })
  rig.plan([
    { tool: SEND, input: MAIL_A },
    { tool: PAY, input: { payee: 'Padaria Sol', amount: '120,00', reference: 'Fatura 33' } },
    { tool: DELETE, input: { ids: ['m1', 'm2', 'm3'] } },
  ])
  await ask(rig)
  expect(rig.executed.map(call => call.tool)).toEqual([SEND]) // the waiver of the send box is honoured
  const shown = cards(rig.h)
  expect(shown.map(card => card.actionPreview?.actionClass).sort()).toEqual(['delete', 'pay'])
  expect(shown.every(card => card.status === 'pending' && card.actionPreview?.canRemember === false)).toBe(true) // no "não perguntar de novo" on pay or delete
  expect(shown.find(card => card.actionPreview?.actionClass === 'delete')?.actionPreview).toMatchObject({ items: ['m1', 'm2', 'm3'], count: 3 }) // the preview lists WHAT is deleted
  expect(waitingFor(rig.h)).toBe(true)
})

it('a Task on a CLI that cannot stop a call has NO gate: its connector loads read-only and nothing is asked in the name of a hook that does not exist', async () => {
  const rig = open()
  rig.h.connectorPorts = { ...PORTS, permissionRequests: () => 'none' }
  rig.plan([{ tool: LIST, input: {} }, { tool: SEND, input: MAIL_A }])
  await ask(rig)
  expect(rig.executed.map(call => call.tool)).toEqual([LIST])
  expect(cards(rig.h)).toEqual([]) // no hook, so no refused call to turn into a card
  expect(rig.h.actionBridge.listening).toBe(0)
})

it('with the REAL bridge instead of hand-made ports: the account\'s Gmail is found, reading the mail needs no card, sending asks (the whole chain from the person\'s sentence)', async () => {
  const rig = open()
  const gmail = {
    name: 'claude.ai Gmail', scope: 'claudeai', status: 'connected', config: { url: GMAIL.id },
    tools: [{ name: 'search_threads', annotations: { readOnly: true } }, { name: 'send_message', annotations: {} }],
  }
  rig.h.connectorPorts = {} // nothing hand-made: the bridge answers
  rig.h.connectorBridge = new ConnectorBridge({
    cache: new McpStatusCache({
      open: () => () => ({ request: subtype => Promise.resolve(subtype === 'mcp_status' ? { mcpServers: [gmail] } : { account: {} }), close: () => Promise.resolve() }),
      arriveMs: 20, pauseMs: 1,
    }),
  })
  await rig.h.connectorBridge.refresh()
  const SEARCH = 'mcp__claude_ai_Gmail__search_threads'
  const SEND_MESSAGE = 'mcp__claude_ai_Gmail__send_message'
  rig.plan([{ tool: SEARCH, input: { query: 'cliente' } }, { tool: SEND_MESSAGE, input: MAIL_A }], [{ tool: SEND_MESSAGE, input: MAIL_A }])
  await ask(rig, '@Nina leia meus emails e responda a Ana com a confirmação dos bolos')
  expect(rig.executed.map(call => call.tool)).toEqual([SEARCH]) // read: no card; the person's words alone authorized the Gmail
  const [card] = cards(rig.h)
  expect(card).toMatchObject({ status: 'pending', title: 'Nina quer enviar pelo Gmail', actionPreview: { connectorName: 'Gmail', actionClass: 'send' } })
  await answer(rig, card!.id, 'send')
  expect(rig.executed).toEqual([{ tool: SEARCH, input: { query: 'cliente' } }, { tool: SEND_MESSAGE, input: MAIL_A }])
})

it('D-081/D-083: a persona NEVER has more access than the person granted — Gmail is hers, the Drive is loaded in the account but NOT granted: reading or sending through it is denied, with NO card (it is not for the person to approve)', async () => {
  const rig = open()
  const server = (name: string, url: string, tools: Array<{ name: string; annotations: { readOnly?: true } }>) => ({ name, scope: 'claudeai', status: 'connected', config: { url }, tools })
  const DRIVE_URL = 'https://proxy.example.test/v1/mcp/dddddddddddddddd'
  rig.h.connectorPorts = {} // the real bridge answers, with TWO connectors of the account loaded
  rig.h.connectorBridge = new ConnectorBridge({
    cache: new McpStatusCache({
      open: () => () => ({
        request: subtype => Promise.resolve(subtype === 'mcp_status' ? {
          mcpServers: [
            server('claude.ai Gmail', GMAIL.id, [{ name: 'search_threads', annotations: { readOnly: true } }, { name: 'send_message', annotations: {} }]),
            server('claude.ai Google Drive', DRIVE_URL, [{ name: 'search_files', annotations: { readOnly: true } }, { name: 'share_file', annotations: {} }]),
          ],
        } : { account: {} }),
        close: () => Promise.resolve(),
      }),
      arriveMs: 20, pauseMs: 1,
    }),
  })
  await rig.h.connectorBridge.refresh()
  const MAIL_SEARCH = 'mcp__claude_ai_Gmail__search_threads'
  const DRIVE_SEARCH = 'mcp__claude_ai_Google_Drive__search_files' // proven read-only by its own server — and still not hers
  const DRIVE_SHARE = 'mcp__claude_ai_Google_Drive__share_file'
  const DRIVE_APPROVED_BEFORE = { tool: DRIVE_SHARE, input: { file: 'orcamento.xlsx', to: 'rival@exemplo.com' } }
  rig.plan([{ tool: MAIL_SEARCH, input: { query: 'cliente' } }, { tool: DRIVE_SEARCH, input: { query: 'contratos' } }, DRIVE_APPROVED_BEFORE])
  await ask(rig, '@Nina leia meus emails de hoje') // the person's words need ONLY the mail
  expect(rig.executed.map(call => call.tool)).toEqual([MAIL_SEARCH]) // hers goes through; the Drive's read and share do not
  expect(cards(rig.h)).toEqual([]) // no card to approve: outside the mandate there is nobody to ask
  expect(waitingFor(rig.h)).toBe(false) // and the turn is not "blocked" waiting for the person because of it
  const carried = rig.h.connectorGrants.forRunner(rig.h.product.getPersona('nina')!, 'claude', ticketOf(rig.h)!.id)
  expect(carried?.map(item => item.id)).toEqual([GMAIL.id]) // the Task was given the Gmail and nothing else
})

it('closing the host closes the gates of the runners it had open', async () => {
  const rig = open()
  rig.plan([{ tool: SEND, input: MAIL_A }])
  await ask(rig)
  expect(rig.h.actionBridge.listening).toBe(1)
  await rig.h.orchestration.disposeRunners()
  expect(rig.h.actionBridge.listening).toBe(0)
})

/**
 * HT-9 (D-084) CONTRACT, with NO model: the real permission gate (the HTTP PreToolUse hook the CLI posts to) + the host's card of an external action +
 * the permission policy, composed as the host composes them, against a FAKE connector that only "executes" a tool when the hook says allow — which is
 * exactly what the CLI does. It pins the four properties Keel asked for (05/11):
 *   (1) a `send` with no approval → NOTHING leaves and the card appears;
 *   (2) approve → exactly that action leaves (same hash), once;
 *   (3) arguments rewritten by the model after the approval → denied;
 *   (4) pay / delete ALWAYS ask for a preview, even with the most permissive "Sempre permitir".
 * The gate alone is proven in persona-runners (permission-gate.spec, permission-gate-wire.spec, tool-gate.spec) and on the real CLI by
 * scripts/ht89-dry.ts; the card alone in external-actions.host.spec. This is the seam between them.
 */
import { PermissionGate, GATE_TOKEN_HEADER, annotationTable, type PermissionRequest } from '@deepseek-ai/dsh-persona-runners'
import { ScreenRepos, openTempStore, type StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { afterEach, describe, expect, it } from 'vitest'
import { unflattenPreview } from '../src/action-input.ts'
import { preAllowFor, type ConnectorAutonomy, type PermanentGrant } from '../src/connector-policy.ts'
import { ACTION_MAX_ATTEMPTS, ExternalActions, type ActionRequestInput } from '../src/external-actions.ts'

const NOW = '2026-11-05T10:00:00.000Z'
const TOKEN = 'ht9-contract-token'
const GMAIL = { cli: 'claude', id: 'https://proxy.example.test/v1/mcp/0f0f0f0f', name: 'Gmail' }
const SEND = 'mcp__gmail__send_email'
const PAY = 'mcp__bank__pay'
const DELETE = 'mcp__drive__delete_files'
const LIST = 'mcp__gmail__list_emails'

const closers: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const close of closers.splice(0)) await close() })

/** A connector of the person's: it records what it was actually asked to do. Nothing runs unless the hook allowed it. */
interface Rig {
  readonly gate: PermissionGate
  readonly actions: ExternalActions
  readonly executed: Array<{ readonly tool: string; readonly input: Record<string, unknown> }>
  readonly grants: Array<{ readonly confirm: Record<string, string> }>
  readonly woken: string[]
  /** What the CLI does for one tool call: asks the hook, and runs the tool ONLY on `allow`. Returns the hook's decision. */
  readonly call: (tool: string, input: Record<string, unknown>) => Promise<'allow' | 'deny' | 'no-opinion'>
  /** One turn, as the host starts it: policy → pre-allowed classes, the card's approved calls → `approved`. */
  readonly startTurn: (policy: { origin?: 'request' | 'once' | 'initiative'; autonomy?: ConnectorAutonomy; grant?: PermanentGrant }) => void
  /** The turn ended: what the gate refused becomes cards, as the host does with `takeRequests()`. */
  readonly endTurn: (requestedByPerson?: boolean) => Array<ReturnType<ExternalActions['record']>>
}

async function rig(): Promise<Rig> {
  const handle = await openTempStore()
  closers.push(() => { handle.store.close() })
  const screens = new ScreenRepos(handle.store, () => NOW)
  const nina = { id: 'nina', name: 'Nina', title: 'Atendimento', workspaceId: 'ws', projectId: 'pp' } as unknown as StoredPersona
  const grants: Rig['grants'] = []
  const woken: string[] = []
  const actions = new ExternalActions({
    screens,
    product: { getPersona: id => (id === 'nina' ? nina : undefined) },
    grants: { grant: (input) => { grants.push({ confirm: { ...input.confirm } }); return undefined as never }, list: () => [] },
    wake: (_project, _ticket, note) => { woken.push(note); return true },
    now: () => NOW,
  })
  // The pre-flight (`mcp_status`) of the person's connector: the server proves ONLY that it can list e-mails (readOnly). Nothing else is proven.
  const annotations = annotationTable([{ name: 'gmail', tools: [{ name: 'list_emails', annotations: { readOnly: true } }] }])
  const gate = await PermissionGate.start({ token: TOKEN, annotations })
  closers.push(() => gate.close())
  const executed: Rig['executed'] = []
  const call: Rig['call'] = async (tool, input) => {
    const response = await fetch(gate.url, {
      method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: TOKEN },
      body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: `tu-${String(executed.length)}`, mcp_server: tool.split('__')[1] }),
    })
    const body = await response.json() as { hookSpecificOutput?: { permissionDecision?: string } }
    const decision = body.hookSpecificOutput?.permissionDecision
    if (decision === 'allow') { executed.push({ tool, input }); return 'allow' }
    return decision === 'deny' ? 'deny' : 'no-opinion'
  }
  const startTurn: Rig['startTurn'] = (policy) => {
    const preAllow = preAllowFor({ origin: policy.origin ?? 'request', autonomy: policy.autonomy ?? 'propose', ...(policy.grant === undefined ? {} : { grant: policy.grant }), gate: 'blocked-report' })
    gate.arm({ preAllow, approved: actions.approvedFor('pp', 't1') })
  }
  const endTurn: Rig['endTurn'] = (requestedByPerson = true) => {
    const asked: PermissionRequest[] = gate.takeRequests()
    gate.disarm()
    return asked.map(item => actions.record({
      projectId: 'pp', personaId: 'nina', ticketId: 't1', connector: GMAIL, tool: item.tool,
      actionClass: item.actionClass as ActionRequestInput['actionClass'], verb: item.verb, requestedInput: unflattenPreview(item.requestedInput),
      truncated: item.truncated, masked: item.masked, argsHash: item.argsHash, requestedByPerson,
    }))
  }
  return { gate, actions, executed, grants, woken, call, startTurn, endTurn }
}

const MAIL_A = { to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.' }
const MAIL_B = { to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 30 bolos para sexta.' }
const answer = (rig: Rig, id: string, choice: 'send' | 'edit' | 'cancel', extra: { remember?: boolean } = {}) => rig.actions.decide({ workspaceId: 'ws', projectId: 'pp', id, choice, ...extra }, 'ana')

describe('(1) a send with no approval: NOTHING leaves, and the card appears', () => {
  it('in "Sugere e espera" the e-mail is refused by the hook, the connector is never asked, and ONE card holds the real content', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    expect(await r.call(LIST, { query: 'cliente' })).toBe('allow') // reading goes through
    expect(await r.call(SEND, MAIL_A)).toBe('deny')
    expect(await r.call(SEND, MAIL_A)).toBe('deny') // asking again changes nothing
    expect(r.executed.map(row => row.tool)).toEqual([LIST])
    const [card] = r.endTurn()
    expect(card).toMatchObject({ status: 'pending', actionClass: 'send', tool: SEND, requestedInput: { to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.' } })
    expect(r.actions.approvals('pp')).toHaveLength(1)
    expect(r.actions.approvedFor('pp', 't1')).toEqual([])
  })

  it('outside an armed turn every connector call is refused and no card is made (a stray call cannot ride on anything)', async () => {
    const r = await rig()
    expect(await r.call(SEND, MAIL_A)).toBe('deny') // before the first turn
    r.startTurn({ autonomy: 'propose' })
    r.endTurn()
    expect(await r.call(SEND, MAIL_A)).toBe('deny') // after the turn ended
    expect(r.executed).toEqual([])
    expect(r.actions.approvals('pp')).toEqual([])
  })

  it('a call with no token, or the persona\'s own built-in tools, are not decided by the card path at all', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    const bare = await fetch(r.gate.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool_name: SEND, tool_input: MAIL_A }) })
    expect(bare.status).toBe(403)
    expect(await r.call('Bash', { command: 'ls' })).toBe('no-opinion')
    expect(r.executed).toEqual([])
    expect(r.endTurn()).toEqual([])
  })
})

describe('(2) approve: exactly THAT action leaves, once', () => {
  it('Enviar → the next turn lets through one call with the same arguments (same hash) and the connector gets exactly them', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    await r.call(SEND, MAIL_A)
    const [card] = r.endTurn()
    const decided = answer(r, card!.id, 'send')
    expect(decided.approved?.argsHash).toBe(card!.argsHash)
    expect(r.actions.approvedFor('pp', 't1')).toEqual([{ tool: SEND, argsHash: card!.argsHash }])

    r.startTurn({ autonomy: 'propose' }) // the Task is reopened
    expect(await r.call(SEND, MAIL_A)).toBe('allow')
    expect(r.executed).toEqual([{ tool: SEND, input: MAIL_A }]) // exactly what the person saw
    expect(await r.call(SEND, MAIL_A)).toBe('deny') // once: the approval is spent
    expect(r.executed).toHaveLength(1)
    // the host learns that the approval REALLY ran (and only then marks the card sent): exactly one release, of exactly that call
    expect(r.gate.takeReleased()).toEqual([{ tool: SEND, argsHash: card!.argsHash }])
    r.actions.markSent('pp', card!.id)
    expect(r.actions.approvals('pp')[0]?.actionPreview).toMatchObject({ status: 'sent' })
  })

  it('the key order of the arguments does not matter (the hash is of the canonical JSON), the values do', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    await r.call(SEND, MAIL_A)
    const [card] = r.endTurn()
    answer(r, card!.id, 'send')
    r.startTurn({ autonomy: 'propose' })
    const reordered = { body: MAIL_A.body, subject: MAIL_A.subject, to: MAIL_A.to }
    expect(await r.call(SEND, reordered)).toBe('allow')
  })

  it('an approval does not outlive its turn: unused, it is gone when the turn ends', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    await r.call(SEND, MAIL_A)
    const [card] = r.endTurn()
    answer(r, card!.id, 'send')
    r.startTurn({ autonomy: 'propose' })
    r.endTurn() // the persona did not repeat the call this turn
    r.gate.arm({ preAllow: [], approved: [] }) // the host re-arms with what the card still lists…
    expect(await r.call(SEND, MAIL_A)).toBe('deny') // …and a gate armed with nothing approved allows nothing
    r.actions.markSent('pp', card!.id)
    expect(r.actions.approvedFor('pp', 't1')).toEqual([])
  })

  it('Cancelar and Editar approve nothing: the persona is told, as data', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    await r.call(SEND, MAIL_A)
    const [card] = r.endTurn()
    answer(r, card!.id, 'cancel')
    expect(r.actions.approvedFor('pp', 't1')).toEqual([])
    r.startTurn({ autonomy: 'propose' })
    expect(await r.call(SEND, MAIL_A)).toBe('deny')
    expect(r.executed).toEqual([])
    expect(r.woken.at(-1)).toMatch(/cancelou/u)
  })
})

describe('(3) arguments rewritten after the approval: denied', () => {
  it('"I approved A, it sent B" cannot happen: B is refused, becomes its own card, and A is still the only thing approved', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    await r.call(SEND, MAIL_A)
    const [cardA] = r.endTurn()
    answer(r, cardA!.id, 'send')

    r.startTurn({ autonomy: 'propose' })
    expect(await r.call(SEND, MAIL_B)).toBe('deny') // 3 bolos → 30 bolos
    expect(r.executed).toEqual([])
    const [cardB] = r.endTurn()
    expect(cardB).toMatchObject({ status: 'pending', requestedInput: { body: 'Oi, Ana! Confirmo os 30 bolos para sexta.' } })
    expect(cardB!.argsHash).not.toBe(cardA!.argsHash)
    expect(r.actions.approvedFor('pp', 't1')).toEqual([{ tool: SEND, argsHash: cardA!.argsHash }]) // A is still approved, B is not

    r.startTurn({ autonomy: 'propose' })
    expect(await r.call(SEND, MAIL_A)).toBe('allow')
    expect(r.executed).toEqual([{ tool: SEND, input: MAIL_A }])
  })

  it('an approval for one TOOL does not cover another tool with the same arguments', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    await r.call(SEND, MAIL_A)
    const [card] = r.endTurn()
    answer(r, card!.id, 'send')
    r.startTurn({ autonomy: 'propose' })
    expect(await r.call('mcp__gmail__forward_email', MAIL_A)).toBe('deny')
    expect(r.executed).toEqual([])
  })

  it('a persona that keeps proposing something else is stopped after the second try, not obeyed', async () => {
    const r = await rig()
    expect(ACTION_MAX_ATTEMPTS).toBe(2)
    const tries = ['um', 'dois', 'três'].map(word => ({ ...MAIL_A, body: `Versão ${word}` }))
    const cards: Array<ReturnType<ExternalActions['record']>> = []
    for (const mail of tries) {
      r.startTurn({ autonomy: 'propose' })
      await r.call(SEND, mail)
      cards.push(...r.endTurn())
    }
    expect(cards.map(card => card === undefined)).toEqual([false, false, true])
    expect(r.executed).toEqual([])
  })

  it('a preview that was cut or has a hidden part cannot be approved blind, so it never gets to be allowed', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    await r.call(SEND, { ...MAIL_A, body: 'x'.repeat(6000) })
    const [card] = r.endTurn()
    expect(card).toMatchObject({ truncated: true })
    expect(() => answer(r, card!.id, 'send')).toThrow(/sem ver tudo/iu)
    r.startTurn({ autonomy: 'propose' })
    expect(await r.call(SEND, { ...MAIL_A, body: 'x'.repeat(6000) })).toBe('deny')
    r.startTurn({ autonomy: 'propose' })
    await r.call(SEND, { ...MAIL_A, token: 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
    const [hidden] = r.endTurn()
    expect(hidden).toMatchObject({ masked: true })
    expect(() => answer(r, hidden!.id, 'send')).toThrow(/sem ver tudo/iu)
    expect(r.executed).toEqual([])
  })
})

describe('(4) pay and delete ALWAYS ask for a preview, even with "Sempre permitir"', () => {
  /** The most permissive permission there can be: write access, every box "never ask". */
  const EVERYTHING: PermanentGrant = { access: 'write', confirm: { send: 'never', pay: 'never', delete: 'never' } }

  it('the policy and the gate say the same thing (one truth, Anvil 05/11): pay/delete are never pre-allowed, the gate refuses them and the card appears', async () => {
    const r = await rig()
    const listed = preAllowFor({ origin: 'request', autonomy: 'act', grant: EVERYTHING, gate: 'blocked-report' })
    expect(listed).toEqual(['read', 'change', 'send']) // the policy table no longer lists money or destruction, whatever the permission
    r.startTurn({ origin: 'request', autonomy: 'act', grant: EVERYTHING })
    expect(await r.call(SEND, MAIL_A)).toBe('allow') // "Sempre permitir" for the send box does its job
    expect(await r.call(PAY, { amount: 'R$ 120,00', payee: 'Padaria Lua', reference: 'pedido 14' })).toBe('deny')
    expect(await r.call(DELETE, { paths: ['/relatorios/2025.xlsx'] })).toBe('deny')
    expect(r.executed.map(row => row.tool)).toEqual([SEND])
    const cards = r.endTurn()
    expect(cards.map(card => card?.actionClass)).toEqual(['pay', 'delete'])
    expect(r.actions.approvals('pp').map(card => card.actionPreview?.canRemember)).toEqual([false, false])
  })

  it('"Não perguntar de novo" on a pay or delete card is ignored: no permission is written, the next one asks again', async () => {
    const r = await rig()
    r.startTurn({ origin: 'request', autonomy: 'act' })
    await r.call(PAY, { amount: 'R$ 120,00', payee: 'Padaria Lua' })
    const [card] = r.endTurn()
    answer(r, card!.id, 'send', { remember: true })
    expect(r.grants).toEqual([]) // nothing remembered
    r.startTurn({ origin: 'request', autonomy: 'act' })
    expect(await r.call(PAY, { amount: 'R$ 120,00', payee: 'Padaria Lua' })).toBe('allow') // THAT payment, once
    expect(await r.call(PAY, { amount: 'R$ 120,00', payee: 'Padaria Lua' })).toBe('deny')
    expect(await r.call(PAY, { amount: 'R$ 121,00', payee: 'Padaria Lua' })).toBe('deny') // another amount is another payment
    expect(r.executed).toHaveLength(1)
  })

  it('a delete is approved for its exact list, and only once', async () => {
    const r = await rig()
    r.startTurn({ origin: 'request', autonomy: 'act', grant: EVERYTHING })
    await r.call(DELETE, { paths: ['/a.txt', '/b.txt'] })
    const [card] = r.endTurn()
    // through the REAL gate the list is flat (`paths[0]`, `paths[1]`); the card must still list what will be deleted
    expect(r.actions.approvals('pp')[0]?.actionPreview).toMatchObject({ actionClass: 'delete', items: ['/a.txt', '/b.txt'], count: 2 })
    answer(r, card!.id, 'send')
    r.startTurn({ origin: 'request', autonomy: 'act', grant: EVERYTHING })
    expect(await r.call(DELETE, { paths: ['/a.txt', '/b.txt', '/c.txt'] })).toBe('deny') // one more file than the person saw
    expect(await r.call(DELETE, { paths: ['/a.txt', '/b.txt'] })).toBe('allow')
    expect(r.executed).toEqual([{ tool: DELETE, input: { paths: ['/a.txt', '/b.txt'] } }])
  })

  it('a harmless-looking name is NOT trusted as a read: without the server\'s own readOnly proof even "list_emails" is refused (fail closed)', async () => {
    const r = await rig()
    r.startTurn({ origin: 'request', autonomy: 'propose' })
    expect(await r.call(LIST, { query: 'x' })).toBe('allow') // proven read-only in the pre-flight
    expect(await r.call('mcp__gmail__list_threads', { query: 'x' })).toBe('deny') // same kind of name, no proof
    expect(r.executed.map(row => row.tool)).toEqual([LIST])
  })

  it('a tool the gate cannot classify is a send: it fails closed, it is not read', async () => {
    const r = await rig()
    r.startTurn({ origin: 'request', autonomy: 'propose' })
    expect(await r.call('mcp__gmail__frobnicate', { x: 1 })).toBe('deny')
    expect(r.executed).toEqual([])
  })
})

describe('"Só quando pedido" and a persona\'s own initiative never get a send through on their own', () => {
  it('an initiative with no permanent permission pre-allows nothing but what the policy table gives, and a send is refused', async () => {
    const r = await rig()
    expect(preAllowFor({ origin: 'initiative', autonomy: 'act', gate: 'blocked-report' })).toEqual([])
    r.startTurn({ origin: 'initiative', autonomy: 'act' })
    expect(await r.call(LIST, { query: 'x' })).toBe('deny')
    expect(await r.call(SEND, MAIL_A)).toBe('deny')
    expect(r.executed).toEqual([])
  })

  it('a runner that cannot stop a call (no hook) is given read only', () => {
    expect(preAllowFor({ origin: 'request', autonomy: 'act', grant: { access: 'write', confirm: { send: 'never', pay: 'never', delete: 'never' } }, gate: 'none' })).toEqual(['read'])
  })
})

describe('the card shows the real content even when the connector uses lists and nested fields', () => {
  it('recipients that came as a list (to[0], to[1]) are all on the card; a nested field (message.body) is found; nothing is invented', async () => {
    const r = await rig()
    r.startTurn({ autonomy: 'propose' })
    await r.call(SEND, { to: ['ana@exemplo.com', 'bia@exemplo.com'], message: { subject: 'Cardápio', body: 'Segue o cardápio de sábado.' } })
    r.endTurn()
    expect(r.actions.approvals('pp')[0]?.actionPreview).toMatchObject({ to: 'ana@exemplo.com, bia@exemplo.com', subject: 'Cardápio', body: 'Segue o cardápio de sábado.' })
  })
})

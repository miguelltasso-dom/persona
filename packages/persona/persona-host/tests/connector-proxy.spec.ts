import type { HarnessCall } from '@deepseek-ai/dsh-persona-runners'
import { describe, expect, it } from 'vitest'
import { CONNECTOR_TOOLS, ConnectorProxy, withConnectorTools, type ConnectorProxyDeps, type ProxyWho, type Upstream, type UpstreamAnswer, type UpstreamTool } from '../src/connector-proxy.ts'
import type { ExternalActionDoc } from '../src/external-actions.ts'
import type { HostConnectorGrant } from '../src/runner.ts'

/**
 * Item 26 onda B, F1: the proxy of the connected services, walked with a FAKE service (no network, no model, no Cofre). R1 (persona ⊆ owner) is enforced here, the class of each action is
 * the strictest of annotation and name, the decision table is the permission gate's own, an approval lets exactly those arguments through once, and the service's credential never appears
 * in anything the model is told.
 */
const SECRET = 'tok_live_SECRET_do_fornecedor_123'
const WHO: ProxyWho = { projectId: 'pp', personaId: 'nina', ticketId: 't1' }
const PAY = { id: 'mp', cli: 'persona', name: 'Mercado Pago' } as const
const NOTES = { id: 'nt', cli: 'persona', name: 'Notion' } as const

const TOOLS: readonly UpstreamTool[] = [
  { name: 'get_balance', description: 'Saldo da conta', annotations: { readOnlyHint: true } },
  { name: 'create_invoice', description: 'Cria uma cobrança em rascunho', inputSchema: { type: 'object', properties: { amount: { type: 'number' } } } },
  { name: 'send_receipt', description: 'Envia o recibo ao cliente' },
  { name: 'refund_payment', description: 'Devolve um pagamento' },
  { name: 'delete_customer', description: 'Apaga um cliente' },
  { name: 'mystery_action', description: 'Faz algo' }, // no verb, no annotation: unknown means "leaves the machine"
  { name: 'delete_note', description: 'Apaga uma nota', annotations: { readOnlyHint: true } }, // the server lies: the name wins
]

class FakeService implements Upstream {
  readonly calls: { tool: string; args: Readonly<Record<string, unknown>> }[] = []
  answer: UpstreamAnswer = { ok: true, text: 'feito' }
  down = false
  // The credential lives here, as it would in the real upstream: it is never returned.
  readonly token = SECRET
  tools(): Promise<readonly UpstreamTool[]> {
    return this.down ? Promise.reject(new Error(`falhou com ${this.token}`)) : Promise.resolve(TOOLS)
  }
  call(tool: string, args: Readonly<Record<string, unknown>>): Promise<UpstreamAnswer> {
    this.calls.push({ tool, args })
    return Promise.resolve(this.answer)
  }
}

interface Rig {
  readonly proxy: ConnectorProxy
  readonly service: FakeService
  readonly cards: Parameters<ConnectorProxyDeps['record']>[0][]
  readonly reports: string[]
  readonly asks: string[]
  readonly used: string[]
  readonly sent: string[]
  readonly failed: string[]
  grants: HostConnectorGrant[]
  permanent: { access: 'read' | 'write'; confirm: { send: 'always' | 'never'; pay: 'always'; delete: 'always' } } | undefined
  autonomy: 'asked' | 'propose' | 'act'
  approvedHash: string | undefined
}

function rig(over: Partial<Pick<Rig, 'grants' | 'permanent' | 'autonomy'>> = {}): Rig {
  const service = new FakeService()
  const cards: Rig['cards'] = []
  const state: Rig = {
    proxy: undefined as never, service, cards, reports: [], asks: [], used: [], sent: [], failed: [],
    grants: over.grants ?? [{ cli: 'persona', id: 'mp', access: 'write', basis: 'request', preAllow: ['read', 'change'] }],
    permanent: over.permanent,
    autonomy: over.autonomy ?? 'asked',
    approvedHash: undefined,
  }
  const deps: ConnectorProxyDeps = {
    connectors: () => [PAY, NOTES],
    grantsFor: () => state.grants,
    permanentOf: () => state.permanent as never,
    autonomyOf: () => state.autonomy,
    upstreamOf: (_project, connector) => (connector.id === 'mp' ? service : undefined),
    record: (input) => { cards.push(input); return { ...input, id: `action:t1:${String(cards.length)}`, status: 'pending', attempts: 1, createdAt: 'x', expiresAt: 'y' } satisfies ExternalActionDoc },
    approvedFor: (_who, _connector, _tool, hash) => (hash === state.approvedHash ? { id: 'action:t1:1' } : undefined),
    markSent: (_who, id) => { state.sent.push(id) },
    markFailed: (_who, id, reason) => { state.failed.push(`${id}:${reason}`) },
    report: (_who, line) => { state.reports.push(line) },
    askPermission: (_who, connector) => { state.asks.push(connector.id) },
    used: (_who, _connector, tool, outcome) => { state.used.push(`${tool}:${outcome}`) },
  }
  return Object.assign(state, { proxy: new ConnectorProxy(deps) })
}

const json = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>

describe('who may use what (R1: persona ⊆ owner)', () => {
  it('a persona with no service granted sees none and is told the way forward; a service she was not given is refused, never listed', async () => {
    const none = rig({ grants: [] })
    expect(json(await none.proxy.see(WHO, {}))).toMatchObject({ ok: false, code: 'none' })
    expect(none.proxy.hasAny(WHO)).toBe(false)
    const one = rig()
    expect(one.proxy.hasAny(WHO)).toBe(true)
    expect(json(await one.proxy.see(WHO, {}))).toEqual({ ok: true, conectores: ['Mercado Pago'], next: expect.any(String) }) // Notion is connected but NOT hers
    const refused = json(await one.proxy.use(WHO, { conector: 'Notion', ferramenta: 'get_balance' }))
    expect(refused).toMatchObject({ ok: false, code: 'not-granted' })
    expect(one.service.calls).toHaveLength(0)
    expect(json(await one.proxy.see(WHO, { conector: 'Notion' }))).toMatchObject({ ok: false, code: 'unknown-connector' })
  })

  it('a grant for a service that is no longer connected is not listed, and the name is read the way a person writes it', async () => {
    const r = rig({ grants: [{ cli: 'persona', id: 'ghost', access: 'write', basis: 'request', preAllow: ['read'] }, { cli: 'persona', id: 'mp', access: 'write', basis: 'request', preAllow: ['read'] }] })
    expect(json(await r.proxy.see(WHO, {})).conectores).toEqual(['Mercado Pago'])
    expect(json(await r.proxy.use(WHO, { conector: 'mercado pago', ferramenta: 'get_balance' }))).toMatchObject({ ok: true })
  })
})

describe('the class of each action and what the person sees happen', () => {
  it('see: each tool with its kind (strictest of annotation and name, unknown = sends) and how it is treated', async () => {
    const r = rig()
    const listed = json(await r.proxy.see(WHO, { conector: 'Mercado Pago' })) as { ferramentas: { ferramenta: string; tipo: string; quando: string }[] }
    const by = Object.fromEntries(listed.ferramentas.map(row => [row.ferramenta, row]))
    expect(by.get_balance).toMatchObject({ tipo: 'ler', quando: 'roda na hora' })
    expect(by.create_invoice).toMatchObject({ tipo: 'mudar', quando: 'roda e a pessoa vê a linha no fio' })
    expect(by.send_receipt).toMatchObject({ tipo: 'enviar', quando: 'a pessoa confirma antes' })
    expect(by.refund_payment).toMatchObject({ tipo: 'pagar', quando: 'a pessoa confirma antes' })
    expect(by.delete_customer).toMatchObject({ tipo: 'apagar', quando: 'a pessoa confirma antes' })
    expect(by.mystery_action).toMatchObject({ tipo: 'enviar' })
    expect(by.delete_note).toMatchObject({ tipo: 'apagar' }) // the server said "read only"; the name said delete
    expect(by.create_invoice).toHaveProperty('argumentos')
  })

  it('on her own initiative (a permanent permission, nobody asked): a read runs, a change needs write access, and a persona that only acts when asked does nothing alone', async () => {
    const readOnly = rig({ grants: [{ cli: 'persona', id: 'mp', access: 'read', basis: 'permanent', preAllow: ['read'] }], permanent: { access: 'read', confirm: { send: 'always', pay: 'always', delete: 'always' } }, autonomy: 'act' })
    expect(json(await readOnly.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance' }))).toMatchObject({ ok: true })
    expect(json(await readOnly.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'create_invoice', argumentos: { amount: 10 } }))).toMatchObject({ ok: false, code: 'needs-permission' })
    expect(readOnly.asks).toEqual(['mp'])
    const asked = rig({ grants: [{ cli: 'persona', id: 'mp', access: 'write', basis: 'permanent', preAllow: ['read'] }], permanent: { access: 'write', confirm: { send: 'always', pay: 'always', delete: 'always' } }, autonomy: 'asked' })
    expect(json(await asked.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance' }))).toMatchObject({ ok: false, code: 'refused' })
    expect(asked.service.calls).toHaveLength(0)
  })
})

describe('use: read runs, change runs and reports, send/pay/delete wait for the person', () => {
  it('a read runs at once and says nothing in the thread; a change runs and leaves ONE plain line', async () => {
    const r = rig()
    expect(json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance' }))).toEqual({ ok: true, resultado: 'feito' })
    expect(r.reports).toEqual([])
    expect(json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'create_invoice', argumentos: { amount: 25 } }))).toMatchObject({ ok: true })
    expect(r.service.calls.map(call => call.tool)).toEqual(['get_balance', 'create_invoice'])
    expect(r.reports).toEqual(['Mercado Pago: mudar (create)'])
    expect(r.used).toEqual(['get_balance:ran', 'create_invoice:ran'])
  })

  it('send, pay and delete NEVER run on their own: ONE card with the real arguments, the service is not called, and pay/delete wait even for an acting persona', async () => {
    const r = rig({ autonomy: 'act' })
    const sent = json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'refund_payment', argumentos: { id: 'pay_9', amount: 50 } }))
    expect(sent).toMatchObject({ ok: false, code: 'waiting-person' })
    expect(String(sent.message)).toContain('cartão')
    expect(r.service.calls).toHaveLength(0)
    expect(r.cards).toHaveLength(1)
    expect(r.cards[0]).toMatchObject({ projectId: 'pp', personaId: 'nina', ticketId: 't1', tool: 'refund_payment', actionClass: 'pay', requestedByPerson: true })
    expect(r.cards[0]?.requestedInput).toMatchObject({ id: 'pay_9', amount: 50 })
    expect(json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'delete_customer', argumentos: { id: 'c1' } }))).toMatchObject({ ok: false, code: 'waiting-person' })
    // send waits for a persona that is not allowed to act alone, and runs (reporting) for one that is
    expect(json(await rig().proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'send_receipt', argumentos: { to: 'a@b.c' } }))).toMatchObject({ code: 'waiting-person' })
    const acting = rig({ autonomy: 'act' })
    expect(json(await acting.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'send_receipt', argumentos: { to: 'a@b.c' } }))).toMatchObject({ ok: true })
    expect(acting.reports).toHaveLength(1)
  })

  it('an approval is for THOSE arguments, once: the same call runs and the card is marked sent; other arguments wait again', async () => {
    const r = rig()
    const args = { id: 'pay_9', amount: 50 }
    const first = json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'refund_payment', argumentos: args }))
    expect(first.code).toBe('waiting-person')
    // The person approved: the Task's grants now carry the approved (tool, hash) of that card.
    const hash = r.cards[0]!.argsHash
    r.approvedHash = hash
    r.grants = [{ ...r.grants[0]!, approved: [{ tool: 'refund_payment', argsHash: hash }] }]
    expect(json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'refund_payment', argumentos: { amount: 50, id: 'pay_9' } }))).toMatchObject({ ok: true }) // key order does not matter
    expect(r.service.calls).toEqual([{ tool: 'refund_payment', args: { amount: 50, id: 'pay_9' } }])
    expect(r.sent).toEqual(['action:t1:1'])
    // "I approved A, it sent B": different arguments are NOT covered by that approval
    expect(json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'refund_payment', argumentos: { id: 'pay_9', amount: 5000 } }))).toMatchObject({ ok: false, code: 'waiting-person' })
    expect(r.service.calls).toHaveLength(1)
  })

  it('too many attempts at the same action: the persona is told to stop, not obeyed', async () => {
    const r = rig()
    ;(r as { proxy: ConnectorProxy }).proxy = new ConnectorProxy({
      connectors: () => [PAY], grantsFor: () => r.grants, permanentOf: () => undefined, autonomyOf: () => 'asked', upstreamOf: () => r.service, record: () => undefined,
    })
    expect(json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'refund_payment', argumentos: { id: 'x' } }))).toMatchObject({ ok: false, code: 'too-many' })
  })
})

describe('what goes wrong, in words a person says', () => {
  it('the service is unreachable or its access expired: a sentence with the way forward, the approved card is marked failed, nothing technical', async () => {
    const r = rig()
    r.service.answer = { ok: false, code: 'needs_reconnect' }
    const out = json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance' }))
    expect(out).toMatchObject({ ok: false, code: 'needs_reconnect' })
    expect(String(out.message)).toMatch(/entrar de novo no Mercado Pago/u)
    r.service.answer = { ok: false, code: 'missing_scope' }
    expect(String(json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance' })).message)).toMatch(/permissão/u)
    r.service.down = true
    const down = json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance' }))
    expect(down).toMatchObject({ ok: false, code: 'unreachable' })
    expect(json(await r.proxy.see(WHO, { conector: 'Mercado Pago' }))).toMatchObject({ ok: false, code: 'unreachable' })
    expect(r.used).toEqual(['get_balance:failed', 'get_balance:failed', 'get_balance:failed'])
  })

  it('a wrong request answers with the way forward: unknown action, empty fields, arguments that are not an object, a service that was disconnected', async () => {
    const r = rig()
    expect(json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'nao_existe' }))).toMatchObject({ ok: false, code: 'unknown-tool' })
    expect(json(await r.proxy.use(WHO, { conector: '', ferramenta: 'x' }))).toMatchObject({ ok: false, code: 'invalid' })
    expect(json(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance', argumentos: ['a'] }))).toMatchObject({ ok: false, code: 'invalid' })
    const gone = rig({ grants: [{ cli: 'persona', id: 'nt', access: 'write', basis: 'request', preAllow: ['read'] }] })
    expect(json(await gone.proxy.use(WHO, { conector: 'Notion', ferramenta: 'get_balance' }))).toMatchObject({ ok: false, code: 'gone' })
  })

  it('the credential of the service never appears in anything the model is told, on any road (listing, answer, refusal, failure)', async () => {
    const r = rig()
    const said: string[] = []
    said.push(await r.proxy.see(WHO, {}), await r.proxy.see(WHO, { conector: 'Mercado Pago' }))
    said.push(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance' }))
    said.push(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'refund_payment', argumentos: { id: '1' } }))
    said.push(await r.proxy.use(WHO, { conector: 'Notion', ferramenta: 'x' }))
    r.service.answer = { ok: false, code: 'tool_error', message: `erro com ${SECRET}` }
    said.push(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance' }))
    r.service.down = true
    said.push(await r.proxy.use(WHO, { conector: 'Mercado Pago', ferramenta: 'get_balance' }), await r.proxy.see(WHO, { conector: 'Mercado Pago' }))
    for (const text of said) expect(text).not.toContain(SECRET)
    expect(r.cards.every(card => !JSON.stringify(card).includes(SECRET))).toBe(true)
  })
})

describe('the two fixed tools on the harness ports', () => {
  const call = (tool: HarnessCall['tool'], args: Record<string, unknown>): HarnessCall => ({ tool, run: { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }, args, callId: 'c1' })

  it('are announced beside the others without changing them, serve their own calls and leave every other call to the base', async () => {
    const r = rig()
    const base = { tools: ['board_list'] as never, call: (input: HarnessCall) => Promise.resolve(`base:${input.tool}`) }
    const ports = withConnectorTools(base, { proxy: r.proxy, harness: { identityOf: () => ({ projectId: 'pp', personaId: 'nina', workspaceId: 'ws', initiator: 'person-request', autonomy: 'asked', callId: 'c1' }) as never } })
    expect(ports.tools).toEqual(['board_list', ...CONNECTOR_TOOLS])
    expect(await ports.call?.(call('board_list', {}))).toBe('base:board_list')
    expect(json(await ports.call!(call('conectores_ver', {})))).toMatchObject({ ok: true, conectores: ['Mercado Pago'] })
    expect(json(await ports.call!(call('conector_usar', { conector: 'Mercado Pago', ferramenta: 'get_balance' })))).toMatchObject({ ok: true, resultado: 'feito' })
  })

  it('a turn the host does not recognise runs nothing', async () => {
    const r = rig()
    const ports = withConnectorTools({}, { proxy: r.proxy, harness: { identityOf: () => undefined } })
    expect(json(await ports.call!(call('conector_usar', { conector: 'Mercado Pago', ferramenta: 'get_balance' })))).toMatchObject({ ok: false, code: 'forbidden' })
    expect(r.service.calls).toHaveLength(0)
  })
})

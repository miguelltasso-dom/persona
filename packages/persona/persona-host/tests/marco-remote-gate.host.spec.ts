import { AsyncLocalStorage } from 'node:async_hooks'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { request } from 'node:http'
import { connect } from 'node:net'
import { afterEach, expect, it } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { geralChannelId, openJourney, say, sayOn, seedJourney, seedProject } from './journeys/journey-host.ts'
import type { DeviceBook, DeviceRecord } from '../src/remote-web/device-book.ts'
import { DevicePairing, memoryPairStore } from '../src/remote-web/pair-guard.ts'
import { PairRequests } from '../src/remote-web/pair-requests.ts'
import { pairedPrincipal } from '../src/remote-web/remote-principal.ts'
import { OWNER_DEVICE_ONLY, PHONE_NEVER, PHONE_PLANNED, PHONE_READS, PHONE_WRITES, phoneAllows, REMOTE_NOT_ALLOWED } from '../src/remote-web/phone-allow.ts'
import { DEVICE_COOKIE, POLL_HEADER, REMOTE_HEADER, RemoteGate, type DeviceMember, type GateAuditEvent } from '../src/remote-web/remote-gate.ts'

/**
 * M5 e2e remoto, R1 (fluxo real por HTTP) e R2 (a lista do celular contra os Remotes de VERDADE), Gauge 15:5x, em staging.
 * R1: o "tailnet" é o alias 127.0.0.2 (o CI não tem Tailscale). O que se prova de ponta a ponta: o portão só atende nesse endereço; o código certo NÃO dá sessão (só o pedido, o dono APROVA no PC);
 * o cookie só vale do mesmo endereço; a chamada do celular entra no HOST como o membro do aparelho; revogar corta; e nada do que é segredo (código, segredo do aparelho, pollToken) aparece
 * no que o portão deixou no log de atividade. O portão usa o livro de aparelhos do HOST (`h.remoteDevices`) e a chamada atravessa o funil de verdade: o teste serve o Peer pareado como o Gateway
 * o fixa (`ctx.invocation.peer.principal`, um AsyncLocalStorage por chamada), que é de onde o funil lê quem chama.
 */
const peers = new AsyncLocalStorage<{ readonly peer: { readonly principal: unknown } }>
const TAILNET = '127.0.0.2'
const OTHER_NODE = '127.0.0.3'
const SA = { workspaceId: 'ws', projectId: 'sa' } as const
const MARK = { dmSa: 'MARCA-DM-ALHEIA-SA-9103', channelSa: 'MARCA-CANAL-SA-9104' } as const
const BOB: DeviceMember = { workspace: { id: 'ws', name: 'Acme' }, member: { id: 'bob', name: 'Bob', role: 'member' } }

interface Answer { readonly status: number; readonly headers: Record<string, string | string[] | undefined>; readonly body: string }
interface Call { readonly method?: string; readonly path: string; readonly headers?: Record<string, string>; readonly body?: string; readonly from?: string }

const call = (port: number, input: Call): Promise<Answer> => new Promise((resolve, reject) => {
  const req = request({
    host: TAILNET, port, path: input.path, method: input.method ?? 'GET', agent: false, ...(input.from === undefined ? {} : { localAddress: input.from }),
    headers: { host: `${TAILNET}:${String(port)}`, ...(input.headers ?? {}) },
  }, (res) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('end', () => { resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }) })
  })
  req.on('error', reject)
  req.end(input.body)
})

const cookieOf = (answer: Answer): string => { const raw = answer.headers['set-cookie']; return ((Array.isArray(raw) ? raw[0] : raw) ?? '').split(';')[0] ?? '' }

function plant(): PersonaHost {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }])
  seedProject(h, { id: 'sa', name: 'Equipe', team: [{ id: 'lia2', name: 'Lia', title: 'Coordenação', coordination: true }] })
  h.sessionMemberId = 'ana'
  h.createMember({ id: 'bob', ...SA, displayName: 'Bob', handle: 'bob', role: 'member' })
  say(h, 'ch1', 'texto no canal pessoal da Ana')
  h.createDm({ id: 'dm-sa', ...SA, participantA: 'ana', participantB: 'lia2' })
  h.postMessage({ id: 'dms1', ...SA, streamKind: 'dm', ownerId: 'dm-sa', body: `Lia, combinado só nosso: ${MARK.dmSa}`, actorId: 'ana', subjectId: 'dms1' })
  sayOn(h, 'sa', 'chs1', `aviso do projeto compartilhado ${MARK.channelSa}`)
  return h
}

interface Rig { readonly h: PersonaHost; readonly gate: RemoteGate; readonly book: DeviceBook; readonly pairing: DevicePairing; readonly requests: PairRequests; readonly audited: GateAuditEvent[]; readonly port: number }
const gates: RemoteGate[] = []
afterEach(async () => { for (const gate of gates.splice(0)) await gate.close() })

/** O host real + o portão do Bolt + um funil mínimo meu no lugar do S2 (Caller paired + PHONE_ALLOW). */
async function rig(): Promise<Rig> {
  const h = plant()
  const now = (): number => Date.now()
  const book: DeviceBook = h.remoteDevices // o livro do HOST: é nele que o funil confere se o aparelho está vivo
  Object.defineProperty((h as unknown as { ctx: object }).ctx, 'invocation', { configurable: true, get: () => peers.getStore() })
  const pairing = new DevicePairing(memoryPairStore(), now)
  const requests = new PairRequests(book, now)
  const audited: GateAuditEvent[] = []
  const json = (status: number, value: unknown): Response => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
  const gate = new RemoteGate({
    book, pairing, requests, hostLabel: 'PC da Acme', memberOf: id => (id === 'bob' ? BOB : undefined),
    allowAddress: address => address === TAILNET, allowRemote: () => true, now,
    whois: () => Promise.resolve(undefined), selfLogin: () => Promise.resolve(undefined), audit: event => audited.push(event),
    dispatch: async (req: Request, device: DeviceRecord) => {
      const method = new URL(req.url).pathname.replace(/^\/api\//u, '')
      if (!phoneAllows(method, { memberIsOwner: false })) return json(403, { ok: false, reason: REMOTE_NOT_ALLOWED })
      const fn = (h as unknown as Record<string, ((request: unknown) => unknown) | undefined>)[method]
      if (typeof fn !== 'function') return json(404, { ok: false, reason: 'missing' })
      const body = req.method === 'POST' ? (await req.json()) as unknown : {}
      try {
        const out = await peers.run({ peer: { principal: pairedPrincipal(device.id) } }, async () => fn.call(h, body))
        return json(200, out ?? null)
      } catch { return json(403, { ok: false, reason: 'refused' }) }
    },
  })
  gates.push(gate)
  const port = await gate.listen(TAILNET, 0)
  return { h, gate, book, pairing, requests, audited, port }
}

const pairOn = (rigged: Rig, code: string, from?: string): Promise<Answer> =>
  call(rigged.port, { method: 'POST', path: '/remote/pair', headers: { [REMOTE_HEADER]: '1', 'content-type': 'application/json' }, body: JSON.stringify({ code, label: 'Pixel do Bob' }), ...(from === undefined ? {} : { from }) })
const apiAs = (rigged: Rig, cookie: string, method: string, body: unknown, from?: string): Promise<Answer> =>
  call(rigged.port, { method: 'POST', path: `/api/${method}`, headers: { cookie, [REMOTE_HEADER]: '1', 'content-type': 'application/json' }, body: JSON.stringify(body), ...(from === undefined ? {} : { from }) })

it('R1: o portão só atende no endereço do "tailnet": a MESMA porta em 127.0.0.1 é recusada', async () => {
  const rigged = await rig()
  expect((await call(rigged.port, { path: '/remote/me' })).status).toBe(200)
  await expect(new Promise((resolve, reject) => { const socket = connect({ host: '127.0.0.1', port: rigged.port }, () => { socket.destroy(); resolve('conectou') }); socket.on('error', reject) })).rejects.toMatchObject({ code: 'ECONNREFUSED' })
})

it('R1: o código CERTO não dá sessão (só um pedido); sem o dono aprovar não há cookie e a API recusa; o código errado recebe a recusa genérica', async () => {
  const rigged = await rig()
  const wrong = await pairOn(rigged, 'ZZZZ-ZZZZ')
  expect(wrong.status).toBe(403)
  expect(wrong.body).not.toMatch(/ZZZZ/u) // o código errado não volta na resposta
  const code = rigged.pairing.issue('bob').code
  const typed = await pairOn(rigged, code)
  expect(typed.status).toBe(202)
  expect(cookieOf(typed), 'o código certo NÃO entrega cookie').toBe('')
  const { pollToken } = JSON.parse(typed.body) as { requestId: string; pollToken: string }
  const waiting = await call(rigged.port, { path: '/remote/pair/status', headers: { [POLL_HEADER]: pollToken } })
  expect(cookieOf(waiting), 'esperando o dono: ainda sem cookie').toBe('')
  expect((await apiAs(rigged, '', 'ping', {})).status, 'sem cookie a API não responde').toBe(401)
  expect(rigged.book.list().length, 'nenhum aparelho entrou no livro sem a aprovação').toBe(0)
})

async function pairBob(rigged: Rig): Promise<{ cookie: string; requestId: string; code: string; pollToken: string }> {
  const code = rigged.pairing.issue('bob').code
  const typed = await pairOn(rigged, code)
  const { requestId, pollToken } = JSON.parse(typed.body) as { requestId: string; pollToken: string }
  expect(rigged.requests.approve(requestId), 'o dono aprova no PC').toBe(true)
  const approved = await call(rigged.port, { path: '/remote/pair/status', headers: { [POLL_HEADER]: pollToken } })
  const cookie = cookieOf(approved)
  expect(cookie, 'aprovado: o celular recebe o cookie do aparelho').toMatch(new RegExp(`^${DEVICE_COOKIE}=`, 'u'))
  expect(String(approved.headers['set-cookie'])).toMatch(/HttpOnly/iu)
  expect(String(approved.headers['set-cookie'])).toMatch(/SameSite=Strict/iu)
  return { cookie, requestId, code, pollToken }
}

it('R1: aprovado, o celular do Bob lê o canal do projeto DELE pelo portão (controle positivo) e o cookie de outro endereço não vale', async () => {
  const rigged = await rig()
  const { cookie } = await pairBob(rigged)
  const own = await apiAs(rigged, cookie, 'listMessages', { ...SA, streamKind: 'channel', ownerId: geralChannelId(rigged.h, 'sa'), actorId: 'bob', afterSeq: 0, limit: 200 })
  expect(own.status).toBe(200)
  expect(own.body, 'o Bob lê o aviso do projeto compartilhado pelo celular').toContain(MARK.channelSa)
  const stolen = await apiAs(rigged, cookie, 'ping', {}, OTHER_NODE)
  expect(stolen.status, 'o cookie copiado para OUTRO endereço não vale').toBeGreaterThanOrEqual(400)
})

it('R1 (VERMELHO até o S2): pelo celular do Bob, a DM da Ana com a Lia (dentro do MESMO projeto) NÃO sai: a chamada entra no host como o BOB, não como o dono', async () => {
  const rigged = await rig()
  const { cookie } = await pairBob(rigged)
  const out = await apiAs(rigged, cookie, 'listMessages', { ...SA, streamKind: 'dm', ownerId: 'dm-sa', dmId: 'dm-sa', actorId: 'bob', afterSeq: 0, limit: 200 })
  expect(out.body, 'identidade em campo do serviço: o celular virou o dono').not.toContain(MARK.dmSa)
})

it('R1: revogar o aparelho no PC corta o celular na hora (a mesma chamada que funcionava passa a ser recusada)', async () => {
  const rigged = await rig()
  const { cookie } = await pairBob(rigged)
  expect((await apiAs(rigged, cookie, 'ping', {})).status).toBe(200)
  const device = rigged.book.list()[0]
  expect(device, 'o aparelho está no livro').toBeDefined()
  expect(rigged.book.revoke(device?.id ?? '')).toBe(true)
  expect((await apiAs(rigged, cookie, 'ping', {})).status, 'revogado').toBeGreaterThanOrEqual(401)
})

it('R1: o que o celular NÃO pode chamar recusa com remote-not-allowed pelo portão: Cofre, navegador do PC, mover cartão, backup, pareamento', async () => {
  const rigged = await rig()
  const { cookie } = await pairBob(rigged)
  for (const method of ['saveConnectorSecret', 'browserView', 'moveTicket', 'backupNow', 'issueDeviceCode', 'setRemoteAccess', 'listDevices', 'revokeDevice', 'completeOnboarding']) {
    const out = await apiAs(rigged, cookie, method, {})
    expect(out.status, method).toBe(403)
    expect(out.body, method).toContain(REMOTE_NOT_ALLOWED)
  }
})

it('R10: nada de segredo na atividade do PC: o código, o pollToken e o segredo do aparelho nunca aparecem nos eventos de auditoria do portão (e o código errado também não)', async () => {
  const rigged = await rig()
  await pairOn(rigged, 'ZZZZ-ZZZZ')
  const { code, pollToken, cookie } = await pairBob(rigged)
  const everything = JSON.stringify(rigged.audited)
  for (const secret of [code, pollToken, cookie.split('=')[1] ?? '', 'ZZZZ-ZZZZ']) expect(everything.includes(secret) && secret !== '', `o log da atividade carrega um segredo (${secret.slice(0, 4)}…)`).toBe(false)
})

/* ---------- R2: a lista do celular contra os Remotes de VERDADE (leitura independente da do Bolt) ---------- */
const ALLOWED = [...PHONE_READS, ...PHONE_WRITES, ...OWNER_DEVICE_ONLY]

it('R2: todo nome da lista do celular é um Remote que EXISTE no host, exceto os "planejados" (um erro de digitação abriria nada e fecharia a tela sem aviso)', () => {
  const real = new Set(remoteMethods(plant()).map(item => item.method))
  const unknown = ALLOWED.filter(name => !real.has(name) && !PHONE_PLANNED.includes(name))
  expect(unknown, 'nomes na lista que não existem como Remote e não estão em PHONE_PLANNED').toEqual([])
})

it('R2: nenhum nome "planejado" já existe como Remote (a lista não carrega um "planejado" velho que passaria a valer sem teste)', () => {
  const real = new Set(remoteMethods(plant()).map(item => item.method))
  expect(PHONE_PLANNED.filter(name => real.has(name)), 'já existem: tirar de PHONE_PLANNED e dar teste').toEqual([])
})

it('R2: nenhum nome permitido casa com o que NUNCA pode ir ao celular (Cofre, segredo, navegador do PC, backup, pasta, atualizar, pareamento, mover cartão, desfazer)', () => {
  const offenders = ALLOWED.filter(name => PHONE_NEVER.some(pattern => pattern.test(name)))
  expect(offenders).toEqual([])
})

it('R2: o celular de um MEMBRO nunca ganha os Remotes só-dono; o do DONO ganha só listDevices e revokeDevice', () => {
  const real = remoteMethods(plant()).map(item => item.method)
  const forMember = real.filter(name => phoneAllows(name, { memberIsOwner: false }))
  const forOwner = real.filter(name => phoneAllows(name, { memberIsOwner: true }))
  expect(forMember.filter(name => OWNER_DEVICE_ONLY.includes(name))).toEqual([])
  expect(forOwner.filter(name => !forMember.includes(name)).sort()).toEqual([...OWNER_DEVICE_ONLY].filter(name => real.includes(name)).sort())
})

it('R2: o celular enxerga uma fração PEQUENA dos Remotes do host (a lista é fechada, não "tudo menos o perigoso")', () => {
  const real = remoteMethods(plant()).map(item => item.method)
  const open = real.filter(name => phoneAllows(name, { memberIsOwner: false }))
  expect(real.length).toBeGreaterThan(300)
  expect(open.length / real.length, `${String(open.length)} de ${String(real.length)} Remotes abertos ao celular`).toBeLessThan(0.15)
})

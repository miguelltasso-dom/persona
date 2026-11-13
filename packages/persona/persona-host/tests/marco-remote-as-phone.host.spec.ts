import { AsyncLocalStorage } from 'node:async_hooks'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, geralChannelId, it, openJourney, say, sayOn, seedJourney, seedProject } from './journeys/journey-host.ts'
import { runAsHost } from '../src/remote-web/caller-context.ts'
import { pairedPrincipal } from '../src/remote-web/remote-principal.ts'

/**
 * M5 e2e remoto (R3, R11 e R12 do plano, Gauge): o PC é o DONO (host.sessionMemberId = 'ana') e, AO MESMO TEMPO, o celular pareado do membro Bob chama o MESMO host.
 * A matriz de `cross-project-reads` (marcas únicas, ids alheios) roda por dois chamadores:
 *   directAs(bob) = h.sessionMemberId = 'bob' (o caminho direto: controle de que a matriz e as marcas funcionam)
 *   phoneAs(bob)  = um PEER pareado como o Gateway o fixa (`ctx.invocation.peer.principal`), que é de onde o funil (`callerFor`) lê QUEM chama: o teste atravessa o funil de verdade
 *                   (callerFor, runAs, a lista de permitidos, callerMember), inclusive com dono e celular chamando AO MESMO TEMPO (um AsyncLocalStorage por chamada, como o Gateway).
 * (Um `runAs` por fora NÃO vale: sem Peer o funil assume o dono e sobrescreve o chamador, que é o comportamento certo para chamada em processo.)
 */
const peers = new AsyncLocalStorage<{ readonly peer: { readonly principal: unknown } }>()
/** Faz o `ctx.invocation` do host responder pelo Peer da chamada em curso (o que o Gateway faz para cada chamada). */
const withPeers = (h: PersonaHost): void => { Object.defineProperty((h as unknown as { ctx: object }).ctx, 'invocation', { configurable: true, get: () => peers.getStore() }) }
const PP = SCOPE
const SA = { workspaceId: 'ws', projectId: 'sa' } as const
const MARK = { channelPp: 'MARCA-CANAL-PP-8101', dmPp: 'MARCA-DM-PP-8102', dmSa: 'MARCA-DM-ALHEIA-SA-8103', channelSa: 'MARCA-CANAL-SA-8104' } as const
const FOREIGN_FOR_BOB = [MARK.channelPp, MARK.dmPp, MARK.dmSa] as const
const TEAM = [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }]

type Wrap = (call: () => Promise<string>) => Promise<string>
const directAs = (h: PersonaHost, actor: string): Wrap => async (call) => { h.sessionMemberId = actor; return call() }
/** O aparelho VIVO do livro (h.remoteDevices, S2 do Bolt) ou, enquanto o livro não existe no host, um id fixo: o vermelho de hoje continua sendo o de IDENTIDADE (o celular vira o dono). */
const bookOf = (h: PersonaHost): { enroll(memberId: string, label: string, options: { address: string }): { id: string; secret: string }; revoke(id: string): boolean; isLive(id: string): boolean } | undefined => (h as unknown as { remoteDevices?: ReturnType<typeof bookOf> }).remoteDevices
const enrolled = (h: PersonaHost, memberId: string): string => bookOf(h)?.enroll(memberId, 'Celular do ' + memberId, { address: '100.64.0.2' }).id ?? 'd1'
const phoneAs = (h: PersonaHost, memberId: string, deviceId: string = enrolled(h, memberId)): Wrap => async (call) => { withPeers(h); h.sessionMemberId = 'ana'; return peers.run({ peer: { principal: pairedPrincipal(deviceId) } }, call) }
const ownerPeer = (h: PersonaHost): Wrap => async (call) => { withPeers(h); h.sessionMemberId = 'ana'; return peers.run({ peer: { principal: { kind: 'owner' } } }, call) }

function plant(): PersonaHost {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, TEAM)
  seedProject(h, { id: 'sa', name: 'Equipe', team: [{ id: 'lia2', name: 'Lia', title: 'Coordenação', coordination: true }] })
  h.sessionMemberId = 'ana'
  h.createMember({ id: 'bob', ...SA, displayName: 'Bob', handle: 'bob', role: 'member' })
  say(h, 'ch1', `texto no canal pessoal: ${MARK.channelPp}`)
  h.createDm({ id: 'dm-pp', ...PP, participantA: 'ana', participantB: 'bia' })
  h.postMessage({ id: 'dmp1', ...PP, streamKind: 'dm', ownerId: 'dm-pp', body: `Bia, anote: ${MARK.dmPp}`, actorId: 'ana', subjectId: 'dmp1' })
  h.createDm({ id: 'dm-sa', ...SA, participantA: 'ana', participantB: 'lia2' })
  h.postMessage({ id: 'dms1', ...SA, streamKind: 'dm', ownerId: 'dm-sa', body: `Lia, combinado só nosso: ${MARK.dmSa}`, actorId: 'ana', subjectId: 'dms1' })
  sayOn(h, 'sa', 'chs1', `aviso do projeto compartilhado ${MARK.channelSa}`)
  return h
}

const READ = /^(list|get|search|follow|preview)[A-Z]|^(search|attentionEvents)$/u
const SKIP = /^(getOnboarding|getEngineStatus|getProviderLimitPool|getOfficialQuota|getWindowReserve|getUsagePanel|getAccount|getTeamAi|getTeamConnect|getRuleKinds|getConnectorHealth|getConnectorCatalog|listEmailPresets|previewImport|previewCofreImport|previewCliSkills|previewSkillImport|previewInvite|getStoreHealth|listBackups|getEmailConnection)/u
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Chama um Remote por um Caller e devolve o texto da resposta (JSON), ou 'refused'. Um stream é lido por um instante. */
async function callRemote(h: PersonaHost, wrap: Wrap, remote: { name: string; stream: boolean }, request: Record<string, unknown>): Promise<string> {
  const method = (h as unknown as Record<string, ((request: unknown, signal?: AbortSignal) => unknown) | undefined>)[remote.name]
  if (typeof method !== 'function') return 'missing'
  return wrap(async () => {
    try {
      if (remote.stream) {
        const abort = new AbortController()
        const frames: string[] = []
        const stream = method.call(h, request, abort.signal) as AsyncIterable<unknown>
        const reading = (async () => { try { for await (const frame of stream) frames.push(JSON.stringify(frame)) } catch { /* recusado ou encerrado */ } })()
        await Promise.race([reading, sleep(150)])
        abort.abort()
        await Promise.race([reading, sleep(100)])
        return frames.join('\n')
      }
      const called = method.call(h, request, new AbortController().signal)
      const value = called !== null && typeof called === 'object' && 'then' in called ? await Promise.race([called as Promise<unknown>, sleep(400).then(() => undefined)]) : called
      return value === undefined ? '' : JSON.stringify(value) ?? ''
    } catch { return 'refused' }
  })
}

function targets(h: PersonaHost): Array<{ name: string; request: Record<string, unknown> }> {
  const base = { ...SA, actorId: 'bob', afterSeq: 0, limit: 200, query: 'MARCA', text: 'MARCA' }
  const items: Array<{ name: string; request: Record<string, unknown> }> = [
    { name: 'canal pessoal', request: { ...base, streamKind: 'channel', ownerId: 'geral', eventId: 'ch1', messageId: 'ch1', subjectId: 'ch1', channelId: 'geral' } },
    { name: 'DM pessoal', request: { ...base, streamKind: 'dm', ownerId: 'dm-pp', dmId: 'dm-pp', eventId: 'dmp1', messageId: 'dmp1', subjectId: 'dmp1' } },
    { name: 'DM alheia no MESMO projeto', request: { ...base, streamKind: 'dm', ownerId: 'dm-sa', dmId: 'dm-sa', eventId: 'dms1', messageId: 'dms1', subjectId: 'dms1' } },
  ]
  return items.map(item => ({ ...item, request: { ...item.request, channelId: item.request.channelId ?? geralChannelId(h, 'sa') } }))
}

/** Roda TODA leitura com o id alheio e devolve o que vazou (vazio = prova). */
async function leaks(h: PersonaHost, wrap: Wrap): Promise<string[]> {
  const found: string[] = []
  const remotes = remoteMethods(h).filter(item => READ.test(item.method) && !SKIP.test(item.method)).map(item => ({ name: item.method, stream: (item as { mode?: string }).mode === 'stream' }))
  expect(remotes.length, 'a lista de Remotes de leitura veio vazia: o teste não prova nada').toBeGreaterThan(40)
  for (const remote of remotes) {
    for (const target of targets(h)) {
      const out = await callRemote(h, wrap, remote, target.request)
      for (const mark of FOREIGN_FOR_BOB) if (out.includes(mark)) found.push(`${remote.name} com ${target.name} devolveu ${mark}`)
    }
  }
  return found
}

it('CONTROLE: o caminho de hoje (h.sessionMemberId = bob) não vaza marca alheia, e o dono lê o que é dele (a matriz e as marcas funcionam)', async () => {
  const h = plant()
  expect(await leaks(h, directAs(h, 'bob'))).toEqual([])
  h.sessionMemberId = 'ana'
  expect(JSON.stringify(h.listMessages({ ...PP, streamKind: 'channel', ownerId: geralChannelId(h, 'pp'), actorId: 'ana', afterSeq: 0, limit: 200 }))).toContain(MARK.channelPp)
})

it('R3: o celular pareado do Bob (o PC continua na sessão do DONO) não lê nada de fora da ACL do Bob por nenhuma leitura nem stream', async () => {
  const h = plant()
  const found = await leaks(h, phoneAs(h, 'bob'))
  expect(found, `o celular do Bob agiu como o DONO (identidade em campo do serviço):\n${found.slice(0, 12).join('\n')}${found.length > 12 ? `\n... e mais ${found.length - 12}` : ''}`).toEqual([])
})

it('R11: o PC (dono) e o celular do Bob chamam o MESMO host ao mesmo tempo, com await no meio: cada um enxerga só o seu, nas duas ordens', async () => {
  const h = plant()
  const list = { name: 'listMessages', stream: false }
  const ownerReq = { ...PP, streamKind: 'channel', ownerId: geralChannelId(h, 'pp'), actorId: 'ana', afterSeq: 0, limit: 200 }
  const bobReq = { ...SA, streamKind: 'dm', ownerId: 'dm-sa', dmId: 'dm-sa', actorId: 'bob', afterSeq: 0, limit: 200 }
  const asOwner: Wrap = ownerPeer(h)
  const [ownerOut, bobOut, ownerAgain] = await Promise.all([
    callRemote(h, asOwner, list, ownerReq),
    callRemote(h, phoneAs(h, 'bob'), list, bobReq),
    callRemote(h, asOwner, list, ownerReq),
  ])
  expect(ownerOut, 'o dono continua lendo o canal pessoal').toContain(MARK.channelPp)
  expect(ownerAgain, 'e de novo depois de o celular ter chamado').toContain(MARK.channelPp)
  expect(bobOut, 'o celular do Bob não lê a DM alheia dentro do mesmo projeto').not.toContain(MARK.dmSa)
})

const ownChannelOfBob = (h: PersonaHost): Record<string, unknown> => ({ ...SA, streamKind: 'channel', ownerId: geralChannelId(h, 'sa'), actorId: 'bob', afterSeq: 0, limit: 200 })
const listMessages = { name: 'listMessages', stream: false }

it('SEAM (S2 do Bolt): o host tem o livro de aparelhos h.remoteDevices com enroll / revoke / isLive', () => {
  const h = plant()
  const book = bookOf(h)
  expect(book, 'h.remoteDevices ainda não está no host (S2)').toBeDefined()
  const device = book?.enroll('bob', 'Celular do Bob', { address: '100.64.0.2' })
  expect(device?.id).toBeTruthy()
  expect(book?.isLive(device?.id ?? '')).toBe(true)
  expect(book?.revoke(device?.id ?? '')).toBe(true)
  expect(book?.isLive(device?.id ?? '')).toBe(false)
})

it('R12 FALHA FECHADA: paired com aparelho que NUNCA existiu recusa TODA chamada (mesmo as legítimas do Bob) e nunca devolve dado do dono', async () => {
  const h = plant()
  const out = await callRemote(h, phoneAs(h, 'bob', 'aparelho-que-nunca-existiu'), listMessages, ownChannelOfBob(h))
  expect(out, 'um aparelho que não está vivo no livro não lê nem o canal do próprio Bob').toBe('refused')
  const matrix = await leaks(h, phoneAs(h, 'bob', 'aparelho-que-nunca-existiu'))
  expect(matrix).toEqual([])
})

it('R12 FALHA FECHADA: o aparelho VIVO lê o que é do Bob (controle positivo); depois de REVOGADO a mesma chamada recusa', async () => {
  const h = plant()
  const book = bookOf(h)
  expect(book, 'h.remoteDevices ainda não está no host (S2)').toBeDefined()
  const id = book?.enroll('bob', 'Celular do Bob', { address: '100.64.0.2' }).id ?? ''
  const alive = await callRemote(h, phoneAs(h, 'bob', id), listMessages, ownChannelOfBob(h))
  expect(alive, 'controle positivo: o Bob lê o canal do projeto dele pelo celular vivo').toContain(MARK.channelSa)
  expect(book?.revoke(id)).toBe(true)
  const revoked = await callRemote(h, phoneAs(h, 'bob', id), listMessages, ownChannelOfBob(h))
  expect(revoked, 'revogado = recusa, nunca cai no dono').toBe('refused')
})

it('R12 CONTROLES: o dono ({kind: owner}) e os pontos internos do host (runAsHost: timer, escalonador) continuam funcionando', async () => {
  const h = plant()
  h.sessionMemberId = 'ana'
  const asOwner: Wrap = ownerPeer(h)
  const asHost: Wrap = async call => runAsHost(call)
  expect(await callRemote(h, asOwner, listMessages, { ...PP, streamKind: 'channel', ownerId: geralChannelId(h, 'pp'), actorId: 'ana', afterSeq: 0, limit: 200 })).toContain(MARK.channelPp)
  expect(await callRemote(h, asHost, listMessages, { ...PP, streamKind: 'channel', ownerId: geralChannelId(h, 'pp'), actorId: 'ana', afterSeq: 0, limit: 200 })).toContain(MARK.channelPp)
})

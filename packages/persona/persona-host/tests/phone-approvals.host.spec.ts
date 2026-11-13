/**
 * M5 vetoria de PHONE_WRITES (Lumen, 12/11 19:30). A lista das escritas do celular é por NOME de Remote, e `decideApproval` é UM nome que despacha por `request.kind` para coisas de dano muito diferente:
 * `hire` (cria uma persona), `vault` (aprova um registro do Cofre), `connector` (concede um conector a uma persona), `action` (ENVIA o e-mail/pagamento/exclusão que a persona preparou). A própria lista
 * diz que o celular NUNCA cria/muda personas nem toca o Cofre, e o requisito 4 do M5 diz que aprovar envio/pagamento/exclusão pelo remoto pede um 2º gesto: o host hoje não vê o `kind` e um celular do dono
 * aprova tudo com UMA chamada. Vermelhos contra o host real (o celular é um Peer pareado, como em `computers-remotes.host.spec`). Controles: recusar é seguro e o autor da mensagem não se falsifica.
 * Promovido do staging do Lumen para a suite do host (Bolt, 12/11).
 */
import { describe, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { geralChannelId, it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

const SH = { workspaceId: 'ws', projectId: 'sh' } as const

function rig(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [])
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'bia', name: 'Bia', title: 'Texto' }] })
  h.createMember({ id: 'gus', ...SH, displayName: 'Gus', handle: 'gus', role: 'member' })
  return h
}
/** The same host, spoken to as a paired phone of `deviceId` (the Peer the Gateway would have set). */
const asDevice = (h: PersonaHost, deviceId: string): PersonaHost => Object.create(h, { ctx: { value: { invocation: { peer: { principal: { kind: 'paired', deviceId } } } } } }) as PersonaHost
const enroll = (h: PersonaHost, member: string): string => {
  const made = h.remoteDevices.enroll(member, `Celular de ${member}`)
  if (typeof made === 'string') throw new Error(`enroll: ${made}`)
  return made.id
}
const outcome = (run: () => unknown): string => {
  try { run(); return 'resolveu' } catch (error) { return error instanceof RemoteFault ? `${error.code}${error.details.reason === undefined ? '' : `:${String(error.details.reason)}`}` : error instanceof Error ? error.message : 'erro' }
}

describe('decideApproval do celular: o dano depende do kind, e o celular nunca cria persona nem toca o Cofre', () => {
  it('o celular do DONO aprovando uma contratação (hire) NÃO cria a persona: recusa pc-only (hoje: contrata)', () => {
    const h = rig()
    h.proposeHire({ ...SH, id: 'h1', creatorPersonaId: 'bia', name: 'Capivara', title: 'Financeiro', description: 'Cuida do caixa.' })
    const before = h.listPersonas({ ...SH }).length
    const phone = asDevice(h, enroll(h, 'ana'))
    expect(outcome(() => phone.decideApproval({ ...SH, id: 'h1', kind: 'hire', accept: true }))).toBe('forbidden:pc-only')
    expect(h.listPersonas({ ...SH }).length, 'a persona não nasceu').toBe(before)
  })

  it('controle: o celular do dono RECUSA a contratação (recusar é seguro) e o PC aprova', () => {
    const h = rig()
    h.proposeHire({ ...SH, id: 'h2', creatorPersonaId: 'bia', name: 'Tamandua', title: 'Compras', description: 'Compra.' })
    const phone = asDevice(h, enroll(h, 'ana'))
    expect(outcome(() => phone.decideApproval({ ...SH, id: 'h2', kind: 'hire', accept: false }))).toBe('resolveu')
    h.proposeHire({ ...SH, id: 'h3', creatorPersonaId: 'bia', name: 'Lontra', title: 'Estoque', description: 'Conta.' })
    expect(outcome(() => h.decideApproval({ ...SH, id: 'h3', kind: 'hire', accept: true })), 'no PC (sem Peer) o dono aprova').toBe('resolveu')
  })
})

describe('o autor de uma escrita do celular é o membro do aparelho, nunca o que o pedido diz', () => {
  it('o celular do Gus não posta em nome da Ana; posta como Gus', () => {
    const h = rig()
    const phone = asDevice(h, enroll(h, 'gus'))
    const channel = geralChannelId(h, 'sh')
    const post = (actorId: string, id: string) => (): unknown => phone.postMessage({ id, ...SH, streamKind: 'channel', ownerId: channel, body: 'oi pessoal', actorId, subjectId: id, occurredAt: '2026-11-12T10:00:00.000Z' })
    expect(outcome(post('ana', 'm1'))).toBe('forbidden')
    expect(outcome(post('gus', 'm2'))).toBe('resolveu')
  })
})

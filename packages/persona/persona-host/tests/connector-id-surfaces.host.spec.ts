/**
 * Lumen, varredura (Keel 12:52, até 13:15): depois do CONN-1 do Flint (listConnectorGrants/listAudit), que OUTRAS superfícies levam o id de um conector da CONTA a um MEMBRO com leitura num
 * projeto COMPARTILHADO? O id de um conector da conta é a URL do proxy com a CHAVE dentro. Rig: projeto `sh` (compartilhado), a dona (ana), um membro com leitura (gus; o controle prova que lê),
 * um pedido de "Liberar o Gmail para o Teo" (o cartão de Aprovações) e a Bia com o Gmail concedido. Cada superfície é lida como o Gus e o teste lista as que devolveram a chave.
 * Foi VERMELHO em listApprovals (connector.connectorId e permissionTarget) e em listMessages #geral (o id do evento connector-grant:... embutia a URL) até o conserto do Flint (13:19, connectorHandleOf);
 * agora é a regressão da família: cobre também a busca (Ctrl+K) e a exportação, que seguem sem a chave.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { ConnectorPorts } from '../src/connector-grants-host.ts'
import { geralChannelId, it, openJourney, sayOn, seedJourney, seedProject } from './journeys/journey-host.ts'

const KEY = '0f'.repeat(24)
const GMAIL = { cli: 'claude', id: `https://proxy.example.test/v1/mcp/${KEY}`, name: 'Gmail' }
const PORTS: ConnectorPorts = {
  cliIsolation: () => 'full',
  connectorDefinitionOf: () => 'account',
  permissionRequests: () => 'blocked-report',
  availableConnectors: () => [GMAIL, { cli: 'claude', id: 'notes-mcp', name: 'Notas' }],
  connectorsNeededBy: (text, available) => (/e-?mail/iu.test(text) ? available.filter(item => item.name === 'Gmail') : []),
}
const NOTE = { done: ['Texto do orçamento pronto.'], needed: ['Rascunho do e-mail'], files: [], decisions: ['Tom direto'] }
const SH = { workspaceId: 'ws', projectId: 'sh' } as const

function attempt(work: () => unknown): string {
  try { return JSON.stringify(work()) ?? '' } catch (error) { return `refused:${error instanceof Error ? error.message : 'x'}` }
}

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h)
  seedProject(h, { id: 'sh', name: 'Loja', team: [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }, { id: 'teo', name: 'Teo', title: 'Arte' }] })
  h.createMember({ id: 'gus', ...SH, displayName: 'Gus', handle: 'gus', role: 'member' })
  for (const id of ['bia', 'teo']) h.product.updatePersona({ ...h.product.getPersona(id)!, runner: { kind: 'cli', cli: 'claude', model: 'default' } }, 'sh')
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.connectorPorts = PORTS
  h.teamworkEnabled = true
  h.screens.screens.put('sh', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

it('control: Gus really reads the shared project (the sweep is not red for the wrong reason)', () => {
  const h = open()
  h.sessionMemberId = 'gus'
  expect(attempt(() => h.listTasks(SH))).not.toMatch(/^refused/u)
})

it('no surface hands a MEMBER the proxy URL (the key) of an account connector: approvals card, catalog, health, grants, audit, thread', async () => {
  const h = open()
  sayOn(h, 'sh', 'u1', '@Bia envie um email para a Ana com o orçamento')
  const rt = h.orchestration.runtime('sh')
  const bia = rt.repo.tickets.list().find(ticket => ticket.execution?.name === 'Bia')!
  const result = h.handoffs.ask({ projectId: 'sh', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Rascunho do email', note: NOTE, callId: 'c1' })
  if (!result.ok) throw new Error(result.message)
  h.sessionMemberId = 'ana'
  expect(attempt(() => h.listApprovals(SH)), 'control: the owner sees the connector card').toContain('connector-ask:')
  h.grantConnectorByName({ ...SH, personaId: 'bia', name: 'Gmail' }) // the owner also gives Bia the Gmail (the grant list / audit / thread lines)

  h.sessionMemberId = 'gus'
  const surfaces: Array<[string, () => unknown]> = [
    ['listApprovals', () => h.listApprovals(SH)],
    ['getConnectorCatalog', () => h.getConnectorCatalog(SH)],
    ['getConnectorHealth', () => h.getConnectorHealth(SH)],
    ['listConnectorGrants(bia)', () => h.listConnectorGrants({ ...SH, personaId: 'bia' })],
    ['listAudit', () => h.listAudit({ workspaceId: 'ws' })],
    ['listMessages(#geral)', () => h.listMessages({ ...SH, streamKind: 'channel', ownerId: geralChannelId(h, 'sh'), actorId: 'gus', afterSeq: 0, limit: 200 })],
    ['listTasks', () => h.listTasks(SH)],
    ['getOverviewNow', () => h.getOverviewNow(SH)],
    ['search (Ctrl+K)', () => h.search({ ...SH, actorId: 'gus', query: 'permissão', limit: 20 })],
    ['exportProject', () => h.exportProject({ ...SH, includeDmIds: [] })],
  ]
  const leaking = surfaces.filter(([, read]) => attempt(read).includes(KEY)).map(([name]) => name)
  expect(leaking, `surfaces that hand a member the connector key: ${leaking.join(', ')}`).toEqual([])
})

it('CONN-3 sweep (Flint): search (Ctrl+K), the diagnostics and the approvals of the OWNER either — nothing hands out the key; an OLD grant line (id written with the URL) is read with the handle', () => {
  const h = open()
  h.sessionMemberId = 'ana'
  h.grantConnectorByName({ ...SH, personaId: 'bia', name: 'Gmail' })
  const general = geralChannelId(h, 'sh')
  // A line written BEFORE the fix: its id holds the proxy URL (this is what an older base has in its thread).
  h.events.append({
    id: `connector-grant:bia:claude:${GMAIL.id}:2026-11-12T11:00:00.000Z`, ...SH, streamKind: 'channel', ownerId: general, type: 'message',
    body: 'Você deu à Bia permissão de usar o Gmail (só leitura).', actorId: 'guia', subjectId: '', occurredAt: '2026-11-12T11:00:00.000Z',
  })
  h.sessionMemberId = 'gus'
  const surfaces: Array<[string, () => unknown]> = [
    ['search("Gmail")', () => h.search({ ...SH, actorId: 'gus', query: 'Gmail', limit: 50 })],
    ['listMessages(#geral)', () => h.listMessages({ ...SH, streamKind: 'channel', ownerId: general, actorId: 'gus', afterSeq: 0, limit: 200 })],
    ['listApprovals', () => h.listApprovals(SH)],
  ]
  expect(surfaces.filter(([, read]) => attempt(read).includes(KEY)).map(([name]) => name)).toEqual([])
  expect(attempt(() => h.listMessages({ ...SH, streamKind: 'channel', ownerId: general, actorId: 'gus', afterSeq: 0, limit: 200 }))).toMatch(/connector-grant:bia:claude:account:[0-9a-f]{12}:/u)
})

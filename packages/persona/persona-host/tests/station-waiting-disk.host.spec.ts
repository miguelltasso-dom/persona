// DESTINO (após "candidato validado"): packages/persona/persona-host/tests/station-waiting-disk.host.spec.ts
// Contrato: persona-spec/contracts/marco-dogfood-estacao.md §1 G1 e §5.2. VERMELHO: hoje StationGate.waiting vive só na RAM.
import { latestAssignment } from '@deepseek-ai/dsh-persona-engine'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { RAM_FLOOR_BYTES, RAM_PER_CLI_BYTES } from '../src/station/admission.ts'
import { SCOPE, dbPathOf, it, openJourneyFile, reopenJourney } from './journeys/journey-host.ts'

const NOW = '2026-11-12T03:00:00.000Z'
const FREE_ENOUGH = RAM_FLOOR_BYTES + RAM_PER_CLI_BYTES * 3
const FREE_LOW = 400 * 1024 ** 2

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', ...SCOPE, name: 'Guia', title: 'Cargo', description: 'x', personality: 'Direta.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'guia',
    runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
  })
  h.product.updatePersona({ ...h.product.getPersona('p1')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  h.sessionMemberId = 'ana'
}
const setFree = (h: PersonaHost, bytes: number): void => { (h.station as unknown as { deps: { freeBytes: () => number } }).deps.freeBytes = () => bytes }
const pair = (h: PersonaHost): void => { expect(h.station.redeem(h.station.issueCode().code)).toBe('ok') }
const dispose = (h: PersonaHost): Promise<void> => (h as unknown as { ctx: { fiber: { dispose(): Promise<void> } } }).ctx.fiber.dispose()
const ticketOf = (h: PersonaHost, triggerId: string) => h.orchestration.runtime('pp').repo.tickets.list().find(item => item.origin.triggerId === triggerId)

it('M4/G1: um cartão parado por "sem vaga" volta para a fila depois do reinício e roda quando a RAM folga', async () => {
  const first = openJourneyFile(NOW)
  seed(first)
  pair(first)
  setFree(first, FREE_LOW)
  first.postMessage({ id: 'm1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Guia faça o relatório', actorId: 'ana', subjectId: 'm1' })
  await first.orchestration.flush('pp')
  const stopped = latestAssignment(ticketOf(first, 'm1')!)!.id
  expect(first.orchestration.stationGate!.waitingCount()).toBe(1)
  const path = dbPathOf(first)
  await dispose(first) // queda: a RAM do gate some

  const again = reopenJourney(path, NOW)
  again.sessionMemberId = 'ana'
  expect(again.orchestration.stationGate!.waitingCount()).toBe(1) // VERMELHO: hoje 0, o cartão fica "blocked" para sempre
  setFree(again, FREE_ENOUGH)
  again.orchestration.runnerFactory = () => Promise.resolve(createFakeRunner({}))
  again.orchestration.stationGate!.resumeNow()
  await vi.waitFor(() => { expect(latestAssignment(ticketOf(again, 'm1')!)!.id).not.toBe(stopped) }, { timeout: 10_000 })
  expect(again.orchestration.stationGate!.waitingCount()).toBe(0)
})

it('M4/G1: o cartão que andou enquanto a estação estava fora é descartado sem rodar duas vezes', async () => {
  const first = openJourneyFile(NOW)
  seed(first)
  pair(first)
  setFree(first, FREE_LOW)
  first.postMessage({ id: 'm1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Guia faça o relatório', actorId: 'ana', subjectId: 'm1' })
  await first.orchestration.flush('pp')
  const path = dbPathOf(first)
  const ticketId = ticketOf(first, 'm1')!.id
  await dispose(first)

  const again = reopenJourney(path, NOW)
  again.sessionMemberId = 'ana'
  again.orchestration.runtime('pp').engine.retryTicket(ticketId) // a pessoa clicou Retomar enquanto isso: o assignment mudou
  const moved = latestAssignment(ticketOf(again, 'm1')!)!.id
  setFree(again, FREE_ENOUGH)
  again.orchestration.runnerFactory = () => Promise.resolve(createFakeRunner({}))
  expect(await again.orchestration.resumeStationWaiting()).toBe(0) // não roda de novo: o assignment da fila já não é o último
  expect(latestAssignment(ticketOf(again, 'm1')!)!.id).toBe(moved)
})

it('M4/G6: "Desligada" pela pessoa continua desligada depois de queda e atualização; ligada continua ligada', async () => {
  const first = openJourneyFile(NOW)
  seed(first)
  pair(first)
  await first.setStationRunning({ ...SCOPE, running: false })
  const path = dbPathOf(first)
  await dispose(first)
  const second = reopenJourney(path, NOW)
  expect(second.station.isPaired()).toBe(true)
  expect(second.station.isRunning()).toBe(false)
  second.sessionMemberId = 'ana'
  await second.setStationRunning({ ...SCOPE, running: true })
  await dispose(second)
  expect(reopenJourney(path, NOW).station.isRunning()).toBe(true)
})

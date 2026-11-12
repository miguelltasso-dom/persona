/**
 * P1-10 (Carbon, colheita-s1), perfis do navegador, lado do host:
 *  - o turno de um perfil compartilhado é devolvido quando o turno da persona TERMINA (o `release` do `TurnBrowser` diz "gives the turn back when the turn ends"): antes só voltava
 *    quando o runner quente era despejado, e um Chrome aberto prende o dono do turno ("opener") sem prazo, então a persona B ficava com 'busy' (sem navegador) até alguém fechar o Chrome;
 *  - as sete mutações do navegador devolvem a MESMA view completa de `browserView` (com `withoutBrowser`): a marca "sem navegador" de uma persona do Cursor não some depois de criar/conceder.
 * Sem CLI e sem Chrome de verdade: o runner é o fake e o Chrome é um launcher de mentira.
 */
import { createFakeRunner, type FakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import { openTurnBrowser } from '../src/browser/turn-browser.ts'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, cli] of [['bia', 'Bia', 'claude'], ['teo', 'Téo', 'claude'], ['cur', 'Cursor', 'cursor']] as const) {
    h.createPersona({
      ...SCOPE, id, name, title: id === 'bia' ? 'Coordenação' : 'Pesquisa',
      description: 'Trabalha.', personality: 'Calma.', instructions: 'Faça.',
      avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'cli', runnerCli: cli,
      runnerModel: 'haiku', canRecruit: false, createdBy: 'ana', systemRoles: id === 'bia' ? ['coordination'] : [],
    })
  }
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
  vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }, { id: 'cursor', kind: 'cursor', phase: 'ready', available: true, loggedIn: true }] as never)
}

/** The REAL turn logic of the browser service (take, pin by the live Chrome, release), with a fake Chrome: nothing opens. */
/** The browser folder is shared by the tests of one file (one host): every test works with a profile of its own name. */
let counter = 0
const freshName = (): string => `Loja ${String(++counter)}`

function rig(h: PersonaHost): { readonly profileId: string; readonly runners: FakeRunner[] } {
  const service = h.browser.service
  const deps = (service as unknown as { deps: { chrome?: unknown; launch?: unknown } }).deps
  deps.chrome = () => ({ path: 'C:\\Chrome\\chrome.exe', version: '157' })
  deps.launch = () => Promise.resolve({ port: 9222, version: '157', close: () => Promise.resolve() })
  const name = freshName()
  h.browser.create(name)
  const profileId = service.profiles().find(profile => profile.name === name)!.id
  h.browser.grant('bia', profileId)
  h.browser.grant('teo', profileId)
  const runners: FakeRunner[] = []
  h.orchestration.runnerFactory = () => {
    const runner = createFakeRunner({ holdUntilIdle: true })
    runners.push(runner)
    return Promise.resolve(runner)
  }
  h.orchestration.browserOf = async personaId => await openTurnBrowser({ service, personaId, profileName: name, serverPath: 'C:\\app\\mcp.js' })
  return { profileId, runners }
}

function resolve(h: PersonaHost, personaId: string, ticketId: string): Promise<FakeRunner> {
  const call = (h.orchestration as unknown as { resolveFor(persona: unknown, projectId: string, mode: string, purpose: string, onFirstToken: undefined, answerOnly: boolean, ticketId: string): Promise<FakeRunner> }).resolveFor
  return call.call(h.orchestration, h.product.getPersona(personaId), 'pp', 'asked', 'task', undefined, false, ticketId)
}

const holder = (h: PersonaHost, profileId: string): string | undefined => h.browser.service.holderOf(profileId)?.id

it('while a persona works the profile is hers; when her turn ends the profile is free for the next persona (the Chrome stays up)', async () => {
  const h = host()
  seed(h)
  const { profileId } = rig(h)
  const runner = await resolve(h, 'bia', 't1')
  await runner.ensureSession('s1', '.', 'Tarefa', 'worker')
  await runner.deliver('s1', 'r1', 'faça o pedido', 'queue') // the turn is open
  expect(holder(h, profileId)).toBe('bia')
  expect(h.browser.service.takeTurn(profileId, { kind: 'persona', id: 'teo' })).toMatchObject({ ok: false }) // mid-turn: Téo is still told the profile is busy
  await runner.cancel('s1', { keepInbox: false }) // her turn ended (the fake settles the held session and emits `idle`, as a CLI does)
  expect(holder(h, profileId)).toBeUndefined() // RED today: still Bia's, pinned by the open Chrome, until her runner is evicted
  expect(h.browser.service.takeTurn(profileId, { kind: 'persona', id: 'teo' })).toMatchObject({ ok: true })
  expect(h.browser.service.state(profileId)?.running).toBe(true) // the Chrome was not closed: the next persona finds the same logins
})

it('the lease is taken when the runner is resolved for the Task and held until a turn event: Téo is told "busy" before Bia even starts typing', async () => {
  const h = host()
  seed(h)
  const { profileId } = rig(h)
  await resolve(h, 'bia', 't1')
  expect(holder(h, profileId)).toBe('bia')
  expect(h.browser.service.takeTurn(profileId, { kind: 'persona', id: 'teo' })).toMatchObject({ ok: false })
})

it('every browser action answers with the whole screen, "sem navegador" included (a Cursor persona keeps its mark after creating or granting)', () => {
  const h = host()
  seed(h)
  const before = h.browserView(SCOPE)
  expect(before.withoutBrowser).toEqual(['cur'])
  const name = freshName()
  const created = h.createBrowserProfile({ ...SCOPE, name })
  const profileId = created.profiles.find(profile => profile.name === name)!.id
  expect(created.withoutBrowser).toEqual(['cur']) // RED today: the mutation answers `browser.view()` without it
  expect(h.grantBrowserProfile({ ...SCOPE, profileId, personaId: 'bia' }).withoutBrowser).toEqual(['cur'])
  expect(h.renameBrowserProfile({ ...SCOPE, profileId, name: `${name} renomeada` }).withoutBrowser).toEqual(['cur'])
  expect(h.takeBrowserProfile({ ...SCOPE, profileId }).withoutBrowser).toEqual(['cur'])
  expect(h.releaseBrowserProfile({ ...SCOPE, profileId }).withoutBrowser).toEqual(['cur'])
  expect(h.revokeBrowserProfile({ ...SCOPE, profileId, personaId: 'bia' }).withoutBrowser).toEqual(['cur'])
})

it('closing a profile answers with the whole screen too', async () => {
  const h = host()
  seed(h)
  const name = freshName()
  const created = h.createBrowserProfile({ ...SCOPE, name })
  const closed = await h.closeBrowserProfile({ ...SCOPE, profileId: created.profiles.find(profile => profile.name === name)!.id })
  expect(closed.withoutBrowser).toEqual(['cur'])
})

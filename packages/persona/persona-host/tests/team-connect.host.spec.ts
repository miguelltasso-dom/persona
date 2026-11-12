import type { ConnectionSnapshot } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

/**
 * Item 13 (Tally, 11/11), the host: the team was set up on Claude, Claude is confirmed logged out, and the person has Codex signed in. "Ligar para todas" moves everyone who is
 * CONFIRMED without AI onto the chosen account, one at a time, with a real progress. The probe is injected (no CLI, no model).
 */
const { host } = bindHostFile()
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

const claudeOut: ConnectionSnapshot = { id: 'claude', kind: 'cli', installed: true, loggedIn: false, models: [] }
const claudeUnsure: ConnectionSnapshot = { id: 'claude', kind: 'cli', installed: true, loggedIn: false, models: [], authUnknown: true }
const codexIn: ConnectionSnapshot = { id: 'codex', kind: 'cli', installed: true, loggedIn: true, models: [] }

function team(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, model] of [['bia', 'Bia', 'opus'], ['teo', 'Teo', 'sonnet'], ['lia', 'Lia', 'default']] as const) {
    h.createPersona({
      ...SCOPE, id, name, title: 'Cargo', description: 'x', personality: 'Clara.', instructions: 'Ajude.', avatarKind: 'gallery', avatarRef: name.toLowerCase(),
      runnerKind: 'cli', runnerCli: 'claude', runnerModel: model, canRecruit: false, createdBy: 'ana',
    })
  }
}

async function settleConnect(h: PersonaHost): Promise<void> {
  await h.teamConnect.settled('pp')
}

it('the banner counts only the CONFIRMED lack, the modal offers the signed-in account, and one click moves the whole team onto it, one at a time', async () => {
  const h = host()
  team(h)
  vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeOut, codexIn])
  await h.connections.ready()
  const listed = h.product.listPersonas('pp').map(row => row.id) // the team's own order is the order they are woken in
  const overview = h.getTeamAi(SCOPE)
  expect(overview.without.map(row => row.personaId)).toEqual(listed)
  expect(listed.slice().sort()).toEqual(['bia', 'lia', 'teo'])
  expect(overview.unsure).toBe(0)
  expect(overview.choices.map(choice => [choice.id, choice.provider, choice.room])).toEqual([['codex', 'codex', 'desconhecida']])

  const started = h.connectTeam({ ...SCOPE })
  expect(started.ok).toBe(true)
  if (started.ok) expect(started.view.rows.map(row => row.status)).toEqual(['esperando', 'esperando', 'esperando'])
  await settleConnect(h)

  const done = h.getTeamConnect(SCOPE)
  expect(done).toMatchObject({ state: 'done', provider: 'codex', accountId: 'codex' })
  expect(done.rows.map(row => row.personaId)).toEqual(listed)
  expect(done.rows.map(row => row.status)).toEqual(['conectada', 'conectada', 'conectada'])
  for (const id of ['bia', 'teo', 'lia']) expect(h.product.getPersona(id)?.runner).toMatchObject({ kind: 'cli', cli: 'codex', model: 'default' })
  expect(h.getTeamAi(SCOPE).without).toEqual([]) // nobody is left without AI
})

it('an engine the probe could not check is "conferindo", NOT "sem IA": the banner never accuses a logout nobody confirmed, and there is nobody to wake', async () => {
  const h = host()
  team(h)
  vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeUnsure, codexIn])
  await h.connections.ready()
  const overview = h.getTeamAi(SCOPE)
  expect(overview.without).toEqual([])
  expect(overview.unsure).toBe(3)
  expect(h.connectTeam({ ...SCOPE })).toEqual({ ok: false, code: 'no_one' })
  for (const id of ['bia', 'teo', 'lia']) expect(h.product.getPersona(id)?.runner).toMatchObject({ cli: 'claude' }) // not a single runner was touched
})

it('with no account signed in there is nothing to wake them with; a persona already on the chosen engine keeps her model', async () => {
  const h = host()
  team(h)
  vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeOut])
  await h.connections.ready()
  expect(h.getTeamAi(SCOPE).choices).toEqual([])
  expect(h.connectTeam({ ...SCOPE })).toEqual({ ok: false, code: 'no_account' })
  h.product.updatePersona({ ...h.product.getPersona('bia')!, runner: { kind: 'cli', cli: 'codex', model: 'gpt-5', effort: 'high' } }, 'pp')
  vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeOut, codexIn])
  await h.connections.retry()
  const first = h.getTeamAi(SCOPE)
  expect(first.without.map(row => row.personaId).sort()).toEqual(['lia', 'teo']) // Bia is on Codex, which answers: she is fine
  h.connectTeam({ ...SCOPE })
  await settleConnect(h)
  expect(h.product.getPersona('bia')?.runner).toMatchObject({ cli: 'codex', model: 'gpt-5', effort: 'high' })
  expect(h.product.getPersona('teo')?.runner).toMatchObject({ cli: 'codex', model: 'default' })
})

it('only the workspace owner connects the team (it changes everyone\'s engine)', async () => {
  const h = host()
  team(h)
  h.createMember({ id: 'cris', ...SCOPE, displayName: 'Cris', handle: 'cris', role: 'member' })
  vi.spyOn(h.connections, 'detect').mockResolvedValue([claudeOut, codexIn])
  await h.connections.ready()
  expect(h.connectTeam({ ...SCOPE })).toMatchObject({ ok: true }) // the host's actor is the owner here
})

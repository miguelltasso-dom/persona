import { readFileSync } from 'node:fs'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { slugOf, freeName } from '../src/team-channels.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * CV-6 (contracts/team-channels.md). DRAFT written during the host freeze — it needs `h.teamChannels` (TeamChannels), the Remotes
 * `listChannels` (extended) / `listChannelMembers` / `renameChannel` / `archiveChannel` / `unarchiveChannel` / `setChannelPinned` /
 * `createChannel` (memberIds) and the refusal of a post in an archived channel. Adjust the names to what lands.
 */

const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Design' },
  { id: 'caio', name: 'Caio', title: 'Mídia' },
]

function rig(): PersonaHost {
  const h = openJourney('2026-11-05T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  return h
}

const sector = (h: PersonaHost, id: string, name: string): void => {
  h.governance.gov.putSector({ id, workspaceId: 'ws', name, policyJson: '{}' })
  h.teamChannels.reconcile('pp') // a sector made/renamed through the store: the host's mutation hook (setSector, applyRecommendation…) does this; listChannels never does (Keel 04:12)
}
const put = (h: PersonaHost, personaId: string, sectorId: string): void => {
  h.setSector({ workspaceId: 'ws', personaId, sectorId })
}
const channels = (h: PersonaHost) => h.listChannels({ ...SCOPE })
const named = (h: PersonaHost, name: string) => channels(h).find(channel => channel.name === name)
const fault = (run: () => unknown): RemoteFault => {
  try { run() } catch (error) { if (error instanceof RemoteFault) return error; throw error }
  throw new Error('expected a RemoteFault')
}

it('slugs: lower case, no accents, [a-z0-9-], at most 32; a taken name gets -equipe, -equipe-2…', () => {
  expect(slugOf('Mídia Social & Redes')).toBe('midia-social-redes')
  expect(slugOf('  ')).toBe('equipe')
  expect(slugOf('x'.repeat(40))).toHaveLength(32)
  expect(freeName('geral', new Set(['geral']))).toBe('geral-equipe')
  expect(freeName('geral', new Set(['geral', 'geral-equipe']))).toBe('geral-equipe-2')
})

it('a team with 2+ personas gets its channel; one persona does not; a sector called "Geral" does not collide with #geral', () => {
  const h = rig()
  sector(h, 's-marketing', 'Marketing'); put(h, 'bia', 's-marketing'); put(h, 'teo', 's-marketing')
  sector(h, 's-solo', 'Solo'); put(h, 'caio', 's-solo')
  sector(h, 's-geral', 'Geral'); put(h, 'lia', 's-geral'); put(h, 'caio', 's-geral')
  const list = channels(h)
  expect(list.find(channel => channel.name === 'marketing')).toMatchObject({ kind: 'team', archived: false, memberCount: 2 })
  expect(named(h, 'solo')).toBeUndefined()
  expect(named(h, 'geral')).toMatchObject({ kind: 'general' })
  expect(named(h, 'geral-equipe')).toMatchObject({ kind: 'team' })
})

it('shrinking never archives; an empty team archives with ONE line and nothing is deleted; the team coming back brings the same channel back', () => {
  const h = rig()
  sector(h, 's-m', 'Marketing'); put(h, 'bia', 's-m'); put(h, 'teo', 's-m'); put(h, 'caio', 's-m')
  const id = named(h, 'marketing')?.id ?? ''
  sector(h, 's-other', 'Outros') // a place to move people to (a persona with no sector is also fine; adjust to what setSector accepts)
  put(h, 'teo', 's-other'); put(h, 'caio', 's-other') // down to one: still active
  expect(named(h, 'marketing')?.archived).toBe(false)
  put(h, 'bia', 's-other') // empty
  const archived = named(h, 'marketing')
  expect(archived).toMatchObject({ archived: true, archivedReason: 'team-gone' })
  const lines = () => h.events.listProject('pp').filter(row => row.id === `team-gone:${id}`)
  expect(lines()).toHaveLength(1)
  expect(lines()[0]?.body).toBe('A equipe Marketing não existe mais. O canal foi arquivado; nada foi apagado.')
  channels(h); channels(h) // reconciling again does not repeat the line
  expect(lines()).toHaveLength(1)
  put(h, 'bia', 's-m'); put(h, 'teo', 's-m') // the team returns
  expect(named(h, 'marketing')).toMatchObject({ id, archived: false })
})

it('a renamed sector renames the channel — unless the person renamed the channel; a taken name is a duplicate-name fault', () => {
  const h = rig()
  sector(h, 's-m', 'Marketing'); put(h, 'bia', 's-m'); put(h, 'teo', 's-m')
  const id = named(h, 'marketing')?.id ?? ''
  sector(h, 's-m', 'Comunicação')
  expect(channels(h).find(channel => channel.id === id)?.name).toBe('comunicacao')
  h.renameChannel({ ...SCOPE, channelId: id, name: 'campanhas' })
  sector(h, 's-m', 'Vendas')
  expect(channels(h).find(channel => channel.id === id)?.name).toBe('campanhas') // locked
  expect(fault(() => h.renameChannel({ ...SCOPE, channelId: id, name: 'geral' })).code).toBe('conflict')
})

it('#diretoria is born with a manager (members = managers + owner); the person may rename it — the organogram finds it by its kind, never makes a second one; archive and unarchive keep its members', () => {
  const h = rig()
  const managers = h.product.listPersonas('pp').filter(persona => persona.systemRoles.includes('team_manager'))
  expect(managers.length, 'the Coordenação is also a Gestor today (GES-1)').toBeGreaterThan(0)
  h.teamChannels.reconcile('pp')
  const born = named(h, 'diretoria')
  expect(born).toMatchObject({ kind: 'directorate', archived: false })
  const before = h.listChannelMembers({ ...SCOPE, channelId: born?.id ?? '' }).map(member => `${member.kind}:${member.id}`).sort()
  expect(before).toEqual(expect.arrayContaining(['human:ana', ...managers.map(persona => `persona:${persona.id}`)]))
  h.renameChannel({ ...SCOPE, channelId: born?.id ?? '', name: 'conselho' })
  h.teamChannels.reconcile('pp'); h.teamChannels.reconcile('pp')
  expect(channels(h).filter(channel => channel.kind === 'directorate')).toHaveLength(1) // no second #diretoria
  expect(named(h, 'diretoria')).toBeUndefined()
  expect(named(h, 'conselho')?.id).toBe(born?.id)
  h.archiveChannel({ ...SCOPE, channelId: born?.id ?? '' })
  h.teamChannels.reconcile('pp') // archived BY THE PERSON: the organogram does not bring it back or make another
  expect(channels(h).filter(channel => channel.kind === 'directorate')).toHaveLength(1)
  expect(named(h, 'conselho')).toMatchObject({ archived: true, archivedReason: 'by-person' })
  h.unarchiveChannel({ ...SCOPE, channelId: born?.id ?? '' })
  expect(h.listChannelMembers({ ...SCOPE, channelId: born?.id ?? '' }).map(member => `${member.kind}:${member.id}`).sort()).toEqual(before) // nothing lost
})

it('who is on a channel: team = the sector\'s personas, custom = whom the person put in, general = everyone; archived = nobody; stable order', () => {
  const h = rig()
  sector(h, 's-m', 'Marketing'); put(h, 'teo', 's-m'); put(h, 'bia', 's-m')
  const team = named(h, 'marketing')?.id ?? ''
  expect(h.teamChannels.teamPersonasOf('pp', team).map(persona => persona.id)).toEqual(['bia', 'teo']) // by name
  const custom = h.createChannel({ id: 'c-lancamento', ...SCOPE, name: 'lancamento', topic: '', memberIds: [{ kind: 'persona', id: 'caio' }, { kind: 'human', id: 'ana' }] })
  expect(h.listChannelMembers({ ...SCOPE, channelId: custom.id }).map(member => member.id).sort()).toEqual(['ana', 'caio'])
  expect(h.teamChannels.teamPersonasOf('pp', 'geral')).toHaveLength(4)
  h.archiveChannel({ ...SCOPE, channelId: custom.id })
  expect(h.teamChannels.teamPersonasOf('pp', custom.id)).toEqual([])
})

it('archive by the person, #geral never archives, unarchive, pinning is per person, a post in an archived channel is refused', () => {
  const h = rig()
  sector(h, 's-m', 'Marketing'); put(h, 'bia', 's-m'); put(h, 'teo', 's-m')
  const id = named(h, 'marketing')?.id ?? ''
  expect(fault(() => h.archiveChannel({ ...SCOPE, channelId: 'geral' })).code).toBe('forbidden')
  expect(h.archiveChannel({ ...SCOPE, channelId: id })).toMatchObject({ archived: true, archivedReason: 'by-person' })
  expect(fault(() => h.postMessage({ id: 'm-x', ...SCOPE, streamKind: 'channel', ownerId: id, body: 'oi', actorId: 'ana', subjectId: 'm-x' })).message).toMatch(/arquivado/u)
  expect(h.unarchiveChannel({ ...SCOPE, channelId: id }).archived).toBe(false)
  h.setChannelPinned({ ...SCOPE, channelId: id, pinned: true })
  expect(named(h, 'marketing')?.pinned).toBe(true)
  expect([...h.channelRepos.pinnedBy('ana')]).toContain(id)
  expect([...h.channelRepos.pinnedBy('bruno')]).toEqual([]) // pinning is the person's own: someone else sees none
})

it('NEVER deletes: no organogram path removes a channel row, and there is no Remote that does', () => {
  const sources = ['../src/team-channels.ts', '../../persona-store/src/channel/repos.ts'].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'))
  for (const source of sources) expect(source).not.toMatch(/DELETE\s+FROM\s+channel\s/iu)
  const host = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  expect(host).not.toMatch(/@Remote\s+(?:async\s+)?(?:delete|remove)Channel\(/u)
})

it('the cure at boot: a database that already had teams gets their channels when it opens', () => {
  const h = rig()
  sector(h, 's-m', 'Marketing'); put(h, 'bia', 's-m'); put(h, 'teo', 's-m')
  h.teamChannels.reconcile('pp') // what the boot does for every project
  expect(named(h, 'marketing')).toBeDefined()
})

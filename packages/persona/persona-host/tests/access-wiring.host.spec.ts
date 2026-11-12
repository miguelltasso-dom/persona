/**
 * Item 16, third slice, wired: the list of colleagues in the prompt says what each of them can reach, and ONE constant sentence sends a persona
 * who lacks an access to the colleague who has it, instead of telling the owner "falta o login". It lives in the cache-stable prefix, once, and
 * only changes when the owner changes a grant.
 */
import { afterEach, expect } from 'vitest'
import { ACCESS_RULE, accessMapOf, type AccessEntry } from '../src/access-map.ts'
import { teamGuidance } from '../src/harness-team.ts'
import PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
afterEach(() => { host().orchestration.accessOf = undefined })
const CLOCK = '2026-11-12T10:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, title] of [['atlas', 'Atlas', 'Coordenação'], ['nina', 'Nina', 'Mídia'], ['bia', 'Bia', 'Redação']] as const) {
    h.createPersona({
      ...SCOPE, id, name, title, description: 'Ajuda.', personality: 'Calma.', instructions: 'Ajude.',
      avatarKind: 'gallery', avatarRef: id, runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
      ...(id === 'atlas' ? { systemRoles: ['coordination' as const] } : {}),
    })
  }
}

const eventOf = (id: string, body = 'Qual o horário?'): Parameters<PersonaHost['orchestration']['talkLayers']>[0] => ({
  id, streamId: 'channel:geral', workspaceId: 'ws', projectId: 'pp', seq: 1, type: 'message', body, actorId: 'ana', subjectId: 's', occurredAt: CLOCK, deleted: false,
})

const occurrences = (text: string, part: string): number => text.split(part).length - 1

const MAP: AccessEntry[] = accessMapOf([
  { personaId: 'nina', cli: 'claude', connectorId: 'insta', name: 'Instagram', access: 'write' },
  { personaId: 'bia', cli: 'claude', connectorId: 'gmail', name: 'Gmail', access: 'read' },
], id => ({ nina: 'Nina', bia: 'Bia', atlas: 'Atlas' } as Readonly<Record<string, string>>)[id])

it('with grants, each colleague\'s line says what she can reach, and the rule is in the PREFIX once, never in the tail', () => {
  const h = host()
  seed(h)
  h.orchestration.accessOf = () => MAP
  const layers = h.orchestration.talkLayers(eventOf('e1'), h.product.getPersona('atlas')!, [])
  expect(layers.prefix).toContain('Nina (Mídia, acesso: Instagram)')
  expect(layers.prefix).toContain('Bia (Redação, acesso: Gmail (só leitura))')
  expect(occurrences(layers.prefix, ACCESS_RULE)).toBe(1)
  const tail = layers.text.slice(layers.text.indexOf(layers.prefix) + layers.prefix.length)
  expect(tail).not.toContain(ACCESS_RULE)
  expect(tail).not.toContain('acesso:')
})

it('the prefix is byte-identical for different messages while the grants are the same, and only changes when a grant does', () => {
  const h = host()
  seed(h)
  h.orchestration.accessOf = () => MAP
  const speaker = h.product.getPersona('atlas')!
  const a = h.orchestration.talkLayers(eventOf('e1', 'Qual o horário?'), speaker, [])
  const b = h.orchestration.talkLayers({ ...eventOf('e2', 'Preciso de 3 posts para sexta'), occurredAt: '2026-11-13T09:30:00.000Z' }, speaker, [])
  expect(a.prefix).toBe(b.prefix)
  h.orchestration.accessOf = () => MAP.filter(entry => entry.label === 'Instagram') // the owner took the Gmail grant back
  const c = h.orchestration.talkLayers(eventOf('e3'), speaker, [])
  expect(c.prefix).not.toBe(a.prefix)
  expect(c.prefix).not.toContain('Gmail')
})

it('without any grant nothing about access is said (no rule, no suffix): the prefix is exactly what it was', () => {
  const h = host()
  seed(h)
  h.orchestration.accessOf = undefined // the host is shared by the tests of this file: start from nobody holding anything
  const speaker = h.product.getPersona('atlas')!
  const none = h.orchestration.talkLayers(eventOf('e1'), speaker, [])
  h.orchestration.accessOf = () => []
  const empty = h.orchestration.talkLayers(eventOf('e1'), speaker, [])
  expect(empty.prefix).toBe(none.prefix)
  expect(none.prefix).not.toContain('acesso')
  expect(none.prefix).not.toContain(ACCESS_RULE)
})

it('the team paragraph of a Task carries the same suffix, by name, and nothing when a colleague holds nothing', () => {
  const paragraph = teamGuidance([
    { name: 'Nina', title: 'Mídia', access: 'Instagram' },
    { name: 'Bia', title: 'Redação', access: '' },
    { name: 'Teo', title: 'Arte' },
  ])
  expect(paragraph).toContain('Equipe: Bia (Redação), Nina (Mídia, acesso: Instagram), Teo (Arte).')
})

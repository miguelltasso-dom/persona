// Carbon P1-11 (perfil vaza DM alheia): the profile of a persona listed the WHOLE project's memories and skills, so what the owner told Bia in private (a memory
// with scope "persona", or a skill made for her) showed in Teo's profile. A profile shows what the team shares plus what is HERS.
import { expect, it } from 'vitest'
import type { MemoryView, SkillView } from '@deepseek-ai/dsh-persona-host/types'
import { memoriesOfPersona } from '../src/client/data/adapters/memory.ts'
import { skillsOfPersona } from '../src/client/data/adapters/skills.ts'

const source = { quote: 'Só a Bia usa o preço de atacado.', by: 'Ana', mine: true, at: '2026-11-12T10:00:00.000Z', where: 'dm' as const, place: '' }
const forBia: MemoryView = { id: 'm-bia', body: 'Usar o preço de atacado.', status: 'active', origin: 'conversation', source, scope: 'persona', to: { name: 'Bia' } }
const forTeam: MemoryView = { id: 'm-team', body: 'Abrimos às 6h.', status: 'active', origin: 'conversation', source: { ...source, where: 'channel', place: 'geral' }, scope: 'team' }
const fromVault: MemoryView = { id: 'm-vault', body: 'CNPJ da padaria.', status: 'active', origin: 'vault' }

it('Bia\'s private memory shows on Bia\'s profile and NOT on Teo\'s; the team\'s and the vault\'s show on both', () => {
  const views = [forBia, forTeam, fromVault]
  expect(memoriesOfPersona(views, 'Bia').map(view => view.id)).toEqual(['m-bia', 'm-team', 'm-vault'])
  expect(memoriesOfPersona(views, 'Teo').map(view => view.id)).toEqual(['m-team', 'm-vault'])
})

it('a private memory with no name (an older row) is never shown on any profile', () => {
  const nameless: MemoryView = { id: 'm-x', body: forBia.body, status: 'active', origin: 'conversation', source, scope: 'persona' }
  expect(memoriesOfPersona([nameless], 'Bia')).toEqual([])
})

it('P1-NOVO, defence in depth: a private memory that was NOT said by the one looking is never shown, even if a host sent it (the host filters first; this is the second lock)', () => {
  const someoneElses: MemoryView = { ...forBia, id: 'm-other', source: { ...source, by: 'Caio', mine: false } }
  expect(memoriesOfPersona([someoneElses], 'Bia')).toEqual([])
  expect(memoriesOfPersona([forBia, someoneElses], 'Bia').map(view => view.id)).toEqual(['m-bia'])
})

const mine = (over: Partial<SkillView>): SkillView => ({ id: 's', name: 'S', version: 1, status: 'active', body: '', sharedWithTeam: false, ...over })

it('a skill made for Bia (not shared) shows on Bia\'s profile and NOT on Teo\'s; a shared one, and one with no owner, show on both', () => {
  const views = [
    mine({ id: 'learned-pb-cartaz', personaId: 'bia' }),
    mine({ id: 'taught-teo', personaId: 'teo' }),
    mine({ id: 'sk-team', sharedWithTeam: true, personaId: 'bia' }),
    mine({ id: 'sk-library' }),
  ]
  expect(skillsOfPersona(views, 'bia').map(view => view.id)).toEqual(['learned-pb-cartaz', 'sk-team', 'sk-library'])
  expect(skillsOfPersona(views, 'teo').map(view => view.id)).toEqual(['taught-teo', 'sk-team', 'sk-library'])
})

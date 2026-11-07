import { expect, it } from 'vitest'
import { campaignTeamOf } from '../src/campaign-team.ts'
import type { RoutablePersona } from '../src/function-route.ts'

/**
 * TEAM-12 (b), EQ-8: a campaign that did not list its functions still needs text, art and posts: the persona that already does each one is
 * REUSED, only what nobody does is hired. Anything else (not a campaign, functions listed, sectors named) is left to the Gestor as it was.
 */
const person = (id: string, name: string, title: string, extra: Partial<RoutablePersona> = {}): RoutablePersona => ({
  id, name, title, description: title, coordination: false, paused: false, ...extra,
})
const LIA = person('lia', 'Lia', 'Coordenação', { coordination: true })
const BIA = person('bia', 'Bia', 'Redação')
const TEO = person('teo', 'Teo', 'Design')
const CAIO = person('caio', 'Caio', 'Mídia')
const GOAL = 'Monte um time para a campanha de lançamento do produto'

it('the team already has the three functions: all reused, nobody hired, and the request that opens one Task per function', () => {
  const team = campaignTeamOf(GOAL, [LIA, BIA, TEO, CAIO])
  expect(team?.reuse).toEqual([{ personaId: 'bia', function: 'Redação' }, { personaId: 'teo', function: 'Design' }, { personaId: 'caio', function: 'Mídia' }])
  expect(team?.hire).toEqual([])
  expect(team?.request).toBe('texto, arte, posts')
})

it('only what nobody does is hired — and never the generic structure (Atendimento, Financeiro, Pessoas)', () => {
  const some = campaignTeamOf(GOAL, [LIA, BIA, TEO])
  expect(some?.reuse.map(row => row.function)).toEqual(['Redação', 'Design'])
  expect(some?.hire.map(row => row.title)).toEqual(['Mídia'])
  const none = campaignTeamOf(GOAL, [LIA])
  expect(none?.reuse).toEqual([])
  expect(none?.hire.map(row => row.title)).toEqual(['Redação', 'Design', 'Mídia'])
  expect((none?.hire ?? []).map(row => row.title).join()).not.toMatch(/Atendimento|Financeiro|Pessoas/u)
})

it('a team of ONE person is read too (the routing by function needs two to choose; "who does it" does not)', () => {
  const team = campaignTeamOf(GOAL, [LIA, BIA])
  expect(team?.reuse).toEqual([{ personaId: 'bia', function: 'Redação' }])
  expect(team?.hire.map(row => row.title)).toEqual(['Design', 'Mídia'])
})

it('a paused persona is not reused: her function is hired instead of left waiting on her', () => {
  const team = campaignTeamOf(GOAL, [LIA, BIA, person('teo', 'Teo', 'Design', { paused: true }), CAIO])
  expect(team?.reuse.map(row => row.function)).toEqual(['Redação', 'Mídia'])
  expect(team?.hire.map(row => row.title)).toEqual(['Design'])
})

it('the words of a campaign are read: lançamento, divulgação, marketing, anúncio, promoção', () => {
  for (const goal of ['Monte uma equipe para o lançamento do app', 'Monte um time para a divulgação da loja', 'Monte um time para o marketing do verão', 'Monte uma equipe para anúncios do mês', 'Monte um time para a promoção de natal']) {
    expect(campaignTeamOf(goal, [LIA, BIA, TEO, CAIO]), goal).toBeDefined()
  }
})

it('not a campaign, functions listed, or sectors named: undefined (the Gestor goes on exactly as before)', () => {
  expect(campaignTeamOf('Monte uma equipe para a minha padaria', [LIA, BIA, TEO, CAIO])).toBeUndefined()
  expect(campaignTeamOf('Monte um time para a campanha de lançamento: texto, arte e posts', [LIA, BIA, TEO, CAIO])).toBeUndefined()
  expect(campaignTeamOf('Monte um time para a campanha. Setores: vendas, suporte', [LIA, BIA, TEO, CAIO])).toBeUndefined()
})

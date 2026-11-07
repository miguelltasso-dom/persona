import { expect, it } from 'vitest'
import { routeByFunction, type RoutablePersona } from '../src/function-route.ts'

/**
 * TEAM-13 (D-090 #1), the pure part: a request that names nobody is read for the FUNCTIONS it asks for ("texto" → Redação, "arte" →
 * Design, "posts" → Mídia) and matched to the personas by their own title and description. A list of functions is a split, one part
 * per persona; nothing that names no function is invented a match (the caller keeps its default).
 */
const person = (id: string, name: string, title: string, extra: Partial<RoutablePersona> = {}): RoutablePersona => ({
  id, name, title, description: title, coordination: false, paused: false, ...extra,
})
const TEAM = [
  person('lia', 'Lia', 'Coordenação', { coordination: true }),
  person('bia', 'Bia', 'Redação'),
  person('teo', 'Teo', 'Design'),
  person('caio', 'Caio', 'Mídia'),
]

const names = (route: ReturnType<typeof routeByFunction>): string[] =>
  route === undefined ? [] : route.kind === 'single' ? [route.part.persona.name] : route.parts.map(part => part.persona.name)

it('a list of functions is split: one part per persona, in the order the person wrote them, with the words that named each', () => {
  const route = routeByFunction(TEAM, 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts')
  expect(route?.kind).toBe('split')
  expect(names(route)).toEqual(['Bia', 'Teo', 'Caio'])
  expect(route?.kind === 'split' ? route.parts.map(part => part.cues) : []).toEqual([['texto'], ['arte'], ['posts']])
})

it('articles and "para" between the functions do not break the list: "o texto, a arte e os posts"', () => {
  expect(names(routeByFunction(TEAM, 'faça o texto, a arte e os posts da semana'))).toEqual(['Bia', 'Teo', 'Caio'])
  expect(routeByFunction(TEAM, 'faça o texto para o blog e a arte para os posts')?.kind).toBe('split')
})

it('one function is one owner: the persona of that function, never "the first one"', () => {
  expect(names(routeByFunction(TEAM, 'Preciso da arte do cartaz'))).toEqual(['Teo'])
  expect(names(routeByFunction(TEAM, 'escreva o texto da página inicial'))).toEqual(['Bia'])
  expect(names(routeByFunction(TEAM, 'agende os posts no Instagram'))).toEqual(['Caio'])
  expect(routeByFunction(TEAM, 'Preciso da arte do cartaz')?.kind).toBe('single')
})

it('words are read without accents or case: "REDAÇÃO" and "redacao" are the same function', () => {
  expect(names(routeByFunction(TEAM, 'Preciso de REDAÇÃO para um anúncio?'))).toContain('Bia')
  expect(names(routeByFunction(TEAM, 'preciso de redacao de um slogan'))).toEqual(['Bia'])
})

it('functions that are not a list ("e depois publique") are one owner, never a split', () => {
  const route = routeByFunction(TEAM, 'revise o texto e depois publique nas redes')
  expect(route?.kind).toBe('single')
})

it('nothing in the request names a function of the team: undefined (the caller keeps its default)', () => {
  expect(routeByFunction(TEAM, 'faça a lista de preços novos')).toBeUndefined()
  expect(routeByFunction(TEAM, 'bom dia, tudo bem?')).toBeUndefined()
})

it('a team with nobody to choose between is not routed: one persona besides Coordination, or none', () => {
  expect(routeByFunction([TEAM[0]!, TEAM[2]!], 'preciso da arte do cartaz')).toBeUndefined()
  expect(routeByFunction([TEAM[0]!], 'preciso da arte do cartaz')).toBeUndefined()
})

it('Coordination never takes a function part: it routes, even when its own words match', () => {
  const team = [person('lia', 'Lia', 'Coordenação de texto', { coordination: true }), TEAM[2]!, TEAM[3]!]
  expect(names(routeByFunction(team, 'preciso do texto do folder'))).not.toContain('Lia')
})

it('a persona with a custom function is found by the words she uses herself', () => {
  const team = [
    person('bento', 'Bento', 'Engenharia'),
    person('clara', 'Clara', 'Advogada', { description: 'Contratos trabalhistas e revisão jurídica' }),
  ]
  expect(names(routeByFunction(team, 'revise o contrato de locação'))).toEqual(['Clara'])
})

it('a paused persona is still named by her function (the host decides what a pause means), the flag travels with the part', () => {
  const team = [TEAM[0]!, TEAM[1]!, person('teo', 'Teo', 'Design', { paused: true }), TEAM[3]!]
  const route = routeByFunction(team, 'texto, arte e posts')
  expect(route?.kind === 'split' ? route.parts.map(part => [part.persona.name, part.persona.paused]) : []).toEqual([['Bia', false], ['Teo', true], ['Caio', false]])
})

it('a persona with two functions takes both parts as one: "Bia" writes text and legends', () => {
  const team = [TEAM[0]!, TEAM[1]!, TEAM[2]!]
  const route = routeByFunction(team, 'faça o texto, a legenda e a arte')
  expect(route?.kind).toBe('split')
  expect(route?.kind === 'split' ? route.parts.map(part => [part.persona.name, part.cues]) : []).toEqual([['Bia', ['texto', 'legenda']], ['Teo', ['arte']]])
})

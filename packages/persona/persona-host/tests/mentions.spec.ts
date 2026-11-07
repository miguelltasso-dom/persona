import { expect, it } from 'vitest'
import { firstMention, mentionsOf } from '../src/mentions.ts'

/** CV-5: the `@name` resolver (pure). */
const team = ['Ana', 'Anabela', 'Ana Paula', 'Bento', 'Nina', 'João', 'Leo', 'Leonardo', 'Mia'].map(name => ({ name }))
const names = (body: string): string[] => mentionsOf(team, body).map(item => item.name)

it('the whole name must match: "@Anabela" is not "Ana", and "@Leonardo" is not "Leo"', () => {
  expect(names('@Anabela olhe isso')).toEqual(['Anabela'])
  expect(names('@Ana olhe isso')).toEqual(['Ana'])
  expect(names('@Leonardo e @Leo')).toEqual(['Leonardo', 'Leo'])
})

it('the longest name wins at the same spot, with spaces too', () => {
  expect(names('@Ana Paula faça o relatório')).toEqual(['Ana Paula'])
  expect(names('@Ana faça o relatório')).toEqual(['Ana'])
})

it('an e-mail or an @ glued to a word is not a mention', () => {
  expect(names('mande para bento@Nina.com')).toEqual([])
  expect(names('x@Ana.com')).toEqual([])
  expect(names('veja @@Nina')).toEqual([])
  expect(names('ping (@Nina), por favor')).toEqual(['Nina'])
})

it('case does not matter, accents are kept, punctuation after the name is fine', () => {
  expect(names('@nina,')).toEqual(['Nina'])
  expect(names('Oi @João.')).toEqual(['João'])
  expect(names('@Nina_2 oi')).toEqual([])
  expect(names('@Nina-Maria oi')).toEqual(['Nina'])
})

it('several mentions come back once each, in the order the text names them', () => {
  expect(names('@Nina @Bento, vejam isso')).toEqual(['Nina', 'Bento'])
  expect(names('@Bento e depois @Nina, de novo @Bento')).toEqual(['Bento', 'Nina'])
  expect(firstMention(team, '@Mia e @Nina')?.name).toBe('Mia')
})

it('no @, an empty name, or a lone @ never invents a mention', () => {
  expect(names('bom dia a todos')).toEqual([])
  expect(names('só um @ solto')).toEqual([])
  expect(mentionsOf([{ name: '' }, { name: '  ' }], '@ oi')).toEqual([])
})

it('30–100 personas: the lookup stays exact and fast', () => {
  const many = Array.from({ length: 100 }, (_, index) => ({ name: `Pessoa${String(index)}` }))
  expect(mentionsOf(many, '@Pessoa7 e @Pessoa77 e @Pessoa7x').map(item => item.name)).toEqual(['Pessoa7', 'Pessoa77'])
})

// Carbon P1-11: saving the company Ficha (CNPJ) in the Cofre writes a newer `brief` (the card, factKey `company.card`). The "Descrever a empresa" text on Memória › Resumo took the
// FIRST active brief, so the card replaced what the owner wrote about the business (and the edit button went with it). The card is data, not the description.
import { expect, it } from 'vitest'
import { companyProfileText } from '../src/client/data/company-profile.ts'

const CARD = 'Razão social: Padaria Lua Ltda\nCNPJ: 12.345.678/0001-90'
const STORY = 'A Padaria Lua faz pães artesanais em Campinas desde 2015 e atende cafés da região.'

it('the owner\'s description wins over the Ficha, whichever is newer (the list is newest first)', () => {
  const records = [
    { kind: 'brief', status: 'active', body: CARD, factKey: 'company.card' },
    { kind: 'brief', status: 'active', body: STORY },
  ] as const
  expect(companyProfileText(records)).toBe(STORY)
  expect(companyProfileText([...records].reverse())).toBe(STORY)
})

it('only the Ficha (no description yet) is NOT a profile: the screen still offers to describe the company', () => {
  expect(companyProfileText([{ kind: 'brief', status: 'active', body: CARD, factKey: 'company.card' }])).toBeNull()
})

it('nothing else changed: the first active brief with words is the profile; a revoked or empty one is not', () => {
  expect(companyProfileText([
    { kind: 'brief', status: 'revoked', body: 'Antiga.' },
    { kind: 'brief', status: 'active', body: '   ' },
    { kind: 'brief', status: 'active', body: `  ${STORY}  ` },
  ])).toBe(STORY)
  expect(companyProfileText([])).toBeNull()
})

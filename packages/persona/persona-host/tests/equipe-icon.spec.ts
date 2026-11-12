import { expect, it } from 'vitest'
import { EQUIPE_ICONS, equipeIconByName, equipeIconOf } from '../src/equipe-icon.ts'

/** Casa da Equipe: the glyph of an equipe is decided by the host — stored one if valid, else the name's first known word, else `equipe-geral` (Muse's table, 12/11). */

it('the default is by the equipe\'s NAME: no accent, no case, whole words (Muse\'s small-business words included)', () => {
  const cases: Array<[string, string]> = [
    ['Vendas', 'equipe-vendas'], ['Loja', 'equipe-vendas'], ['Comercial', 'equipe-vendas'], ['Balcão', 'equipe-vendas'],
    ['Atendimento', 'equipe-atendimento'], ['SAC', 'equipe-atendimento'], ['Clientes', 'equipe-atendimento'], ['WhatsApp', 'equipe-atendimento'],
    ['Redes sociais', 'equipe-redes'], ['Instagram', 'equipe-redes'], ['Mídias', 'equipe-redes'],
    ['Criação', 'equipe-criacao'], ['Arte', 'equipe-criacao'],
    ['Coordenação', 'equipe-coordenacao'], ['Diretoria', 'equipe-coordenacao'], ['Administração', 'equipe-coordenacao'],
    ['Financeiro', 'equipe-financeiro'], ['Contas', 'equipe-financeiro'], ['Cobrança', 'equipe-financeiro'], ['Caixa', 'equipe-financeiro'],
    ['Produção', 'equipe-producao'], ['Cozinha', 'equipe-producao'], ['Estoque', 'equipe-producao'], ['Entregas', 'equipe-producao'], ['Logística', 'equipe-producao'],
    ['PRODUÇÃO', 'equipe-producao'], ['  vendas  ', 'equipe-vendas'],
  ]
  for (const [name, icon] of cases) expect(equipeIconByName(name), name).toBe(icon)
})

it('no match = equipe-geral; a word INSIDE another word is not a match ("sac" is not "sacolas"); an empty name is geral', () => {
  expect(equipeIconByName('Sacolas')).toBe('equipe-geral')
  expect(equipeIconByName('Lançamento')).toBe('equipe-geral')
  expect(equipeIconByName('Marketing digital')).toBe('equipe-redes') // marketing is in the table
  expect(equipeIconByName('Pesquisa')).toBe('equipe-geral')
  expect(equipeIconByName('')).toBe('equipe-geral')
  expect(equipeIconByName('   ')).toBe('equipe-geral')
})

it('in doubt between two kinds, the FIRST word of the name wins', () => {
  expect(equipeIconByName('Vendas e Atendimento')).toBe('equipe-vendas')
  expect(equipeIconByName('Atendimento e Vendas')).toBe('equipe-atendimento')
  expect(equipeIconByName('Equipe de Cozinha e Caixa')).toBe('equipe-producao') // "equipe", "de" are no kind: the first KNOWN word is "cozinha"
})

it('a stored glyph wins when it is one of the eight; anything else is ignored and the name decides', () => {
  expect(equipeIconOf('Vendas', 'equipe-financeiro')).toBe('equipe-financeiro')
  expect(equipeIconOf('Vendas', 'estrela')).toBe('equipe-vendas')
  expect(equipeIconOf('Vendas', '')).toBe('equipe-vendas')
  expect(equipeIconOf('Vendas', undefined)).toBe('equipe-vendas')
  expect(equipeIconOf('Qualquer', undefined)).toBe('equipe-geral')
  expect(EQUIPE_ICONS).toHaveLength(8)
})

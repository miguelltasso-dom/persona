/**
 * Item 15: `ask_vault_code` is offered by the WORDS of a request, never on every Task: only a request that talks about a second factor (a code by SMS/WhatsApp, 2FA,
 * two steps) pays for the tool's definition. A miss only means the tool is not offered and the persona says she cannot, never a wrong action.
 */
import { expect, it } from 'vitest'
import { harnessToolsNeeded } from '../src/harness-turn.ts'

it.each([
  'O banco pediu o código de 6 dígitos',
  'Entre no portal com 2FA e baixe a nota',
  'O site usa verificação em duas etapas, peça o código quando aparecer',
  'Ative a autenticação em dois fatores da loja',
  'Vai chegar um código por WhatsApp: digite no portal do contador',
  'o codigo de seguranca chegou no celular',
  'Pegue o token do banco e entre no extrato',
  'Entre na prefeitura; ela manda um código por SMS',
])('a request that asks for a second factor is offered the card tool: %s', (text) => {
  expect(harnessToolsNeeded(text)).toContain('ask_vault_code')
})

it.each([
  'Escreva o texto da página inicial',
  'Revise o código do botão de compra',
  'Mova o cartão da faixa Agora para Fazendo',
  'Resuma a reunião e mande para o time',
  'Crie uma rotina que resuma o dia toda segunda-feira',
  'O código promocional é LUA10, coloque no cartaz',
])('a request that does not is not: %s', (text) => {
  expect(harnessToolsNeeded(text)).not.toContain('ask_vault_code')
})

it('a second-factor request alone offers only the card tool; mixed with a board request it offers both, in the host\'s order', () => {
  expect(harnessToolsNeeded('Peça o código de 6 dígitos quando o banco pedir')).toEqual(['ask_vault_code'])
  const both = harnessToolsNeeded('Mova o cartão para Fazendo e use o 2FA do portal')
  expect(both).toContain('board_card_move')
  expect(both).toContain('ask_vault_code')
})

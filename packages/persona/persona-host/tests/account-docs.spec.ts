import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { isMachineAccountDoc, MACHINE_ACCOUNT_DOCS, MACHINE_ACCOUNT_TABLES, sameAccountHome } from '../src/account-docs.ts'

/**
 * D-116 regra 4 (Tally): a lista UNICA do estado de conta que e da maquina e nunca viaja no pacote do "Levar". O teste de DERIVA varre o fonte do host: um doc de conta novo que nao esta na lista FALHA aqui, e uma
 * entrada que o fonte nao usa mais tambem (lista morta).
 */
const SRC = join(process.cwd(), 'packages', 'persona', 'persona-host', 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : []))
}

it('DERIVA: todo doc de conta que o host le ou grava esta em MACHINE_ACCOUNT_DOCS, e nenhuma entrada e morta', () => {
  const found = new Set<string>()
  for (const file of sourceFiles(SRC)) {
    if (file.endsWith('account-docs.ts')) continue
    for (const match of readFileSync(file, 'utf8').matchAll(/['"`](account_[a-z_]+|active_account|quota_wait)['"`]/gu)) found.add(match[1]!)
  }
  const known = new Set<string>([...MACHINE_ACCOUNT_DOCS, ...MACHINE_ACCOUNT_TABLES])
  expect([...found].filter(name => !known.has(name)), 'doc de conta fora da lista do que nao viaja').toEqual([])
  expect(MACHINE_ACCOUNT_DOCS.filter(name => !found.has(name)), 'entrada que o fonte nao usa mais').toEqual([])
})

it('isMachineAccountDoc: o que e da maquina nao viaja; o resto (memoria, regras, skills) nao e dela', () => {
  for (const kind of MACHINE_ACCOUNT_DOCS) expect(isMachineAccountDoc(kind), kind).toBe(true)
  for (const kind of ['persona_memory', 'house_rules', 'skills', 'team_connect', 'persona_scope']) expect(isMachineAccountDoc(kind), kind).toBe(false)
})

it('sameAccountHome: a mesma pasta escrita de outro jeito no Windows e a mesma; a vazia nunca e igual a outra vazia', () => {
  expect(sameAccountHome('C:\\Contas\\A', 'c:/contas/a/')).toBe(true)
  expect(sameAccountHome(' C:/Contas/A ', 'C:\\Contas\\A\\')).toBe(true)
  expect(sameAccountHome('C:\\Contas\\A', 'C:\\Contas\\B')).toBe(false)
  expect(sameAccountHome('', '')).toBe(false)
  expect(sameAccountHome('  ', '')).toBe(false)
})

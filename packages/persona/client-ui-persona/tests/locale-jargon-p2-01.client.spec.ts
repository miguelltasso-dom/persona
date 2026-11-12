/**
 * COLHEITA-S1 · P2-01 (Carbon): jargão e a colisão "Cofre" × "Memória". Vermelho primeiro (Keel: reproduzir antes de corrigir).
 * Regras do leigo: nenhum texto pt mostra "tokens", "JSON", "TLS", "Brief" ou "a pessoa". "Cofre" é só o cofre de senhas; a
 * Memória da empresa tem o próprio nome nas telas que a mostram (Importação, Busca, Aprovações, Membros, Regras, Uso).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SOURCES = fileURLToPath(new URL('../locale-sources/', import.meta.url))

function dictOf(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`${SOURCES}${file}`, 'utf8')) as Record<string, unknown>
}

/** Palavras que o leigo não lê como português do dia a dia. Os {placeholders} não são texto: o nome do campo não aparece. */
const JARGAO = /\btokens?\b|\bJSON\b|\bTLS\b|\bBriefs?\b|\b[Aa] pessoa\b|\bdesta pessoa\b/u

/** Textos que falam da Memória da empresa: nenhum pode chamá-la de "Cofre" (o Cofre é o de senhas). */
const MEMORIA_SEM_COFRE: readonly (readonly [string, string])[] = [
  ['importers.pt.json', 'subtitle'],
  ['importers.pt.json', 'empty.hint'],
  ['importers.pt.json', 'bycScreen.savedToast'],
  ['importers.pt.json', 'bycScreen.savedToast.one'],
  ['importers.pt.json', 'bycScreen.savedOpen'],
  ['shell.pt.json', 'search.subtitle'],
  ['shell.pt.json', 'search.filter.vault'],
  ['shell.pt.json', 'decision.kind.vault'],
  ['approvals.pt.json', 'vault.titleField'],
  ['approvals.pt.json', 'type.vault'],
  ['approvals.pt.json', 'vault.title'],
  ['approvals.pt.json', 'inbox.group.vault'],
  ['approvals.pt.json', 'remember.scopeAction.vault'],
  ['approvals.pt.json', 'remember.scopeTarget.vault'],
  ['chat.pt.json', 'context.recordsLabel'],
  ['persona-editor.pt.json', 'builder.placeholder'],
  ['members.pt.json', 'sync.vault'],
]

describe('P2-01 · vocabulário cotidiano (pt-BR)', () => {
  it('nenhum texto pt mostra tokens, JSON, TLS, Brief ou "a pessoa"', () => {
    const achados: string[] = []
    for (const file of readdirSync(SOURCES).filter(name => name.endsWith('.pt.json'))) {
      for (const [key, value] of Object.entries(dictOf(file))) {
        if (typeof value === 'string' && JARGAO.test(value.replace(/\{[^}]*\}/gu, ''))) achados.push(`${file} ${key}: ${value}`)
      }
    }
    expect(achados).toEqual([])
  })

  it('"Cofre" não aparece onde o texto fala da Memória da empresa', () => {
    const achados = MEMORIA_SEM_COFRE.flatMap(([file, key]) => {
      const value = dictOf(file)[key]
      return typeof value === 'string' && /\bCofre\b/u.test(value) ? [`${file} ${key}: ${value}`] : []
    })
    expect(achados).toEqual([])
  })

  it('o cofre de senhas segue "Cofre" (item do menu e título da tela)', () => {
    expect(dictOf('shell.pt.json')['sidebar.cofre']).toBe('Cofre')
    expect(dictOf('cofre.pt.json')['card.title']).toBe('Cofre')
  })
})

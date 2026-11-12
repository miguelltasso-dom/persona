/**
 * Guarda contra uma classe de erro que só aparece no app REAL (Ember 13:42, 'Permissões ativas'): o CSS Modules do bundle LOCALIZA o nome de um contêiner POR ARQUIVO. Uma `@container NOME (...)` num
 * arquivo só casa com um `container: NOME / ...` do MESMO arquivo; com a declaração em outro `.module.css` o bundle gera dois nomes diferentes (`THujiG_permission-list` x `A-wzLa_permission-list`) e a
 * query nunca vale. A galeria compila do `src` sem localizar, então ela não vê o erro, e o jsdom não mede layout. Esta régua lê todos os `.module.css` do cliente.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(process.cwd(), 'packages/persona/client-ui-persona/src')

function cssModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return cssModules(path)
    return entry.name.endsWith('.module.css') ? [path] : []
  })
}

const files = cssModules(ROOT)

describe('o nome de um contêiner é declarado no MESMO arquivo que o usa (o CSS Modules o localiza por arquivo)', () => {
  it('a varredura enxerga os módulos de CSS do cliente', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('nenhuma `@container NOME (...)` usa um nome declarado em outro arquivo', () => {
    const broken: string[] = []
    for (const file of files) {
      const css = readFileSync(file, 'utf8').replace(/\r/gu, '')
      const used = [...css.matchAll(/@container\s+([A-Za-z_][\w-]*)\s*\(/gu)].map(match => match[1] ?? '')
      for (const name of new Set(used)) {
        const declared = new RegExp(`container(?:-name)?:\\s*${name}\\b`, 'u').test(css)
        if (!declared) broken.push(`${file.slice(ROOT.length + 1)}: @container ${name}`)
      }
    }
    expect(broken, `contêiner usado sem ser declarado no mesmo arquivo (no bundle o nome é outro): ${broken.join('; ')}`).toEqual([])
  })
})

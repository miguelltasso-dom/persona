import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Guard (Muse, 04/11): the client bundle injects CSS modules by file name, so two IMPORTED `X.module.css`
 * in different folders silently drop one stylesheet (governance/Governance.module.css vs
 * primitives/Governance.module.css hid the Teste dos 2 dias header and art). Give each module a unique name.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

describe('CSS module names are unique among imported modules', () => {
  it('no two imported *.module.css share a file name', () => {
    const files = walk(SRC)
    const sources = files.filter(f => /\.(tsx?|jsx?)$/u.test(f))
    const importedCss = new Set<string>()
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/from\s+'(\.{1,2}\/[^']+\.module\.css)'/gu)) {
        importedCss.add(join(dirname(file), match[1]!))
      }
    }
    const byName = new Map<string, string[]>()
    for (const css of importedCss) {
      const name = basename(css)
      byName.set(name, [...(byName.get(name) ?? []), css.slice(SRC.length + 1)])
    }
    const collisions = [...byName.entries()].filter(([, paths]) => paths.length > 1)
    expect(collisions).toEqual([])
  })
})

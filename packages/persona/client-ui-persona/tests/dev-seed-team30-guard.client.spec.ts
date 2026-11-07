// @vitest-environment node
// CV-1 (Muse): o dev seed de 30 personas é SÓ de desenvolvimento. Este guarda prova, lendo o código, que o único arquivo de src
// que importa o módulo é o seed de dev (`seed-default-team.ts`): o onboarding e o app real nunca o chamam.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('dev-seed-team30 só é chamado pelo seed de dev', () => {
  it('nenhum outro arquivo de src importa o módulo', () => {
    const root = fileURLToPath(new URL('../src', import.meta.url))
    const importers: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) { walk(path); continue }
        if (!(name.endsWith('.ts') || name.endsWith('.tsx')) || name === 'dev-seed-team30.ts') continue
        if (readFileSync(path, 'utf8').includes('dev-seed-team30')) importers.push(relative(root, path).split(sep).join('/'))
      }
    }
    walk(root)
    expect(importers).toEqual(['client/remote/seed-default-team.ts'])
  })
})

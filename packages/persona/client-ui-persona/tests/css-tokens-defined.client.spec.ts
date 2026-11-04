import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Muse (design system): a `var(--persona-*)` with no definition and no fallback makes the whole declaration invalid,
 * so the browser silently drops it (an h1 rendered at 15 px, spacing at 0). 18 invented names were found on 04/11
 * (`--persona-text-sm`, `--persona-space-m`, `--persona-type-body-s`…). Every token a stylesheet reads must be defined
 * somewhere in the client (theme or a component), or carry a fallback.
 */
const ROOT = new URL('../src/client/', import.meta.url).pathname.replace(/^\/(\w:)/u, '$1')

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files(path, out)
    else if (/\.(css|tsx?)$/u.test(name)) out.push(path)
  }
  return out
}

const all = files(ROOT)
const defined = new Set<string>()
for (const path of all) {
  for (const match of readFileSync(path, 'utf8').matchAll(/--(persona-[\w-]+)\s*[:'"]/gu)) defined.add(match[1]!)
}

describe('design tokens', () => {
  it('every var(--persona-*) read by a stylesheet without a fallback is defined', () => {
    const missing: string[] = []
    for (const path of all.filter(p => p.endsWith('.css'))) {
      for (const match of readFileSync(path, 'utf8').matchAll(/var\(--(persona-[\w-]+)\s*\)/gu)) {
        if (!defined.has(match[1]!)) missing.push(`${match[1]} in ${path.slice(ROOT.length)}`)
      }
    }
    expect(missing).toEqual([])
  })
})

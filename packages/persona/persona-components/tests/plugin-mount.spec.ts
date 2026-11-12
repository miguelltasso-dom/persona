import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as entry from '../src/index.ts'
import PersonaComponents from '../src/plugin.ts'

// P0-01 (Carbon, colheita-s1): the Cordis Loader mounts a plugin from the module's DEFAULT export (or an object with `apply`). The package
// entry only had a named export, so the plugin failed to mount at every real boot while the unit tests (which imported ./plugin.ts) stayed green.
describe('persona-components mounts through the package entry', () => {
  it('the entry exports the plugin as default (what Loader.unwrapExports reads)', () => {
    expect((entry as { default?: unknown }).default).toBe(PersonaComponents)
  })

  it('the aggregate host tsconfig references the package (clean-tree compile)', () => {
    const root = join(import.meta.dirname, '..', '..', '..', '..')
    const text = readFileSync(join(root, 'tsconfig.host.json'), 'utf8')
    expect(text).toContain('./packages/persona/persona-components')
  })
})

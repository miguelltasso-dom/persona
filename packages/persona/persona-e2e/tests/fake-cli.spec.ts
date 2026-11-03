import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withFakeCliOnPath } from '../src/fake-cli.ts'
import { PACKAGE_ROOT } from '../src/paths.ts'

describe('persona-e2e fake CLI fixtures', () => {
  it('answers --version via fake stub cmd', () => {
    const scope = withFakeCliOnPath()
    try {
      const stub = join(scope.binDir, 'claude.cmd')
      const version = execFileSync(stub, ['--version'], { encoding: 'utf8', shell: true }).trim()
      expect(version).toContain('fake-persona-e2e')
    } finally {
      scope.restore()
    }
  })

  it('runs fake-cli.mjs directly for auth probes', () => {
    const script = join(PACKAGE_ROOT, 'fixtures', 'fake-cli', 'fake-cli.mjs')
    const out = execFileSync(process.execPath, [script, 'codex', 'authStatus'], { encoding: 'utf8' })
    expect(out).toContain('authenticated')
  })
})

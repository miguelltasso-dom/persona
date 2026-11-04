import { delimiter } from 'node:path'
import { join } from 'node:path'
import { PACKAGE_ROOT } from './paths.ts'

const FAKE_CLI_DIR = join(PACKAGE_ROOT, 'fixtures', 'fake-cli')

export interface FakeCliPathScope {
  /** Directory prepended to `PATH`. */
  readonly binDir: string
  /** Restore the previous `PATH`. */
  restore(): void
}

/**
 * Prepend fake CLI stubs (`claude`, `codex`, `opencode`, `cursor-agent`) to `PATH`.
 */
export function withFakeCliOnPath(): FakeCliPathScope {
  const previous = process.env.PATH ?? ''
  process.env.PATH = `${FAKE_CLI_DIR}${delimiter}${previous}`
  return {
    binDir: FAKE_CLI_DIR,
    restore: () => { process.env.PATH = previous },
  }
}

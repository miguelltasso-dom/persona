import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from '../src/paths.ts'

describe('persona-boot-smoke.mjs benign pageerrors', () => {
  it('caps listConversationSubjects rate-limited during clean-home tour', () => {
    const source = readFileSync(join(REPO_ROOT, 'scripts/persona/persona-boot-smoke.mjs'), 'utf8')
    expect(source).toMatch(/listConversationSubjects.*rate-limited/i)
    expect(source).toMatch(/benignGateway <= 4/)
    expect(source).toMatch(/--host-timeout-ms/)
  })
})

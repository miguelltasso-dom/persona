import { expect, it } from 'vitest'
import { githubSignature, verifyGitHubSignature } from '../src/hmac.ts'

it('accepts a matching GitHub HMAC and rejects a bad or missing one', async () => {
  const body = '{"zen":"ok"}'
  const header = await githubSignature('test-secret', body)
  expect(header.startsWith('sha256=')).toBe(true)
  expect(await verifyGitHubSignature('test-secret', body, header)).toBe(true)
  expect(await verifyGitHubSignature('test-secret', body, 'sha256=deadbeef')).toBe(false)
  expect(await verifyGitHubSignature('test-secret', body, null)).toBe(false)
})

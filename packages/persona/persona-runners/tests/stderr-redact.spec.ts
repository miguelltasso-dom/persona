/**
 * ISO-5 condition 2: the CLI's stderr never carries the names of the person's connectors to the screen or a log.
 */
import { describe, expect, it } from 'vitest'
import { STDERR_OMITTED, redactCliStderr } from '../src/oar/stderr-redact.ts'

describe('redactCliStderr', () => {
  it('removes the line that lists the blocked connectors, whatever they are called', () => {
    const message = 'claude: session failed: exit code 1; signal none\nstderr (tail):\nWarning: claude.ai MCP servers blocked by enterprise policy: claude.ai Gmail, claude.ai Google Drive, Minha Loja\nsomething else'
    const clean = redactCliStderr(message)
    expect(clean).not.toMatch(/Gmail|Drive|Minha Loja/u)
    expect(clean).toContain(STDERR_OMITTED)
    expect(clean).toContain('session failed: exit code 1')
    expect(clean).toContain('something else')
  })

  it('also catches the other wordings of a blocked-connector warning', () => {
    for (const line of ['MCP server "Acme CRM" was blocked', 'connectors Acme CRM, Mail blocked by policy', 'Blocked by policy: Acme']) {
      expect(redactCliStderr(line)).not.toMatch(/Acme/u)
    }
  })

  it('leaves every other message exactly as it was', () => {
    const plain = 'not logged in\nplease run claude login'
    expect(redactCliStderr(plain)).toBe(plain)
    expect(redactCliStderr('')).toBe('')
  })
})

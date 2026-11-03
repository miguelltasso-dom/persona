import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyPersonaDiagnostic, createPersonaLogger, looksLikeCredential, redactLogLine } from '../src/persona-log.ts'

describe('persona local logs', () => {
  it('redacts credentials and message bodies', () => {
    expect(looksLikeCredential('sk-abcdefghijklmnopqrstuv')).toBe(true)
    expect(redactLogLine('token sk-abcdefghijklmnopqrstuv')).toContain('[redacted-secret]')
    expect(redactLogLine('{"body":"hello this is a long private dm text"}')).toContain('[redacted-message]')
  })

  it('writes rotating files and copies a redacted diagnostic', async () => {
    const home = await mkdtemp(join(tmpdir(), 'persona-logs-'))
    const logger = createPersonaLogger(home, () => new Date('2026-11-03T19:00:00.000Z'))
    await logger.write('main', 'ok')
    await logger.write('runners', 'prompt sk-abcdefghijklmnopqrstuv')
    const body = await readFile(join(home, 'logs', 'runners-2026-11-03.log'), 'utf8')
    expect(body).toContain('[redacted-secret]')
    expect(body).not.toContain('sk-abcdefghijklmnopqrstuv')
    await writeFile(join(home, 'logs', 'host-2026-11-03.log'), 'host up\n', 'utf8')
    const copied: string[] = []
    const text = await copyPersonaDiagnostic(home, '{"ok":true}', (value) => { copied.push(value) })
    expect(copied[0]).toBe(text)
    expect(text).toContain('local only')
    expect(text).not.toMatch(/sk-/u)
  })
})

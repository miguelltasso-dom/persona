import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPersonaShellPrefs, writePersonaShellPrefs } from '../src/shell-prefs.ts'

describe('persona shell prefs', () => {
  it('defaults start-with-Windows off and only persists explicit true', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'persona-shell-'))
    expect(await readPersonaShellPrefs(userData)).toEqual({ startWithWindows: false, teamPaused: false })
    await writePersonaShellPrefs(userData, { startWithWindows: true, teamPaused: true })
    expect(await readPersonaShellPrefs(userData)).toEqual({ startWithWindows: true, teamPaused: true })
    const raw = await readFile(join(userData, 'persona-shell.json'), 'utf8')
    expect(raw).toContain('"startWithWindows": true')
  })
})

/**
 * TEAM-15 boot line of the host (`[persona-host] flags …`): parsing, and what counts as "the app came up with the v1.1 team functions ON".
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseHostFlags, readHostFlags, v11FlagsOn } from '../src/host-flags.ts'

const ON = '[persona-host] flags teamwork=1 fanout=1 startOnBoardMove=1 productTools=1 defaults=production'
const homes: string[] = []
afterEach(() => { while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true }) })

describe('host flags boot line', () => {
  it('reads the four switches and the defaults, takes the LAST boot line, and says nothing for an exe that predates TEAM-15', () => {
    expect(parseHostFlags(`ruído\n${ON}\nmais ruído`)).toEqual({ teamwork: true, fanout: true, startOnBoardMove: true, productTools: true, defaults: 'production' })
    const flipped = '[persona-host] flags teamwork=0 fanout=1 startOnBoardMove=0 productTools=1 defaults=test'
    expect(parseHostFlags(`${ON}\n${flipped}`)).toMatchObject({ teamwork: false, startOnBoardMove: false, defaults: 'test' })
    expect(parseHostFlags('dsh web: http://127.0.0.1:1/?token=x')).toBeUndefined()
  })

  it('"ON" needs all four AND the production defaults (a host that inherited Vitest does not count)', () => {
    expect(v11FlagsOn(parseHostFlags(ON))).toBe(true)
    expect(v11FlagsOn(parseHostFlags(ON.replace('fanout=1', 'fanout=0')))).toBe(false)
    expect(v11FlagsOn(parseHostFlags(ON.replace('defaults=production', 'defaults=test')))).toBe(false)
    expect(v11FlagsOn(undefined)).toBe(false)
  })

  it('falls back to the run\'s logs folder when the process output has no line', () => {
    const home = mkdtempSync(join(tmpdir(), 'host-flags-'))
    homes.push(home)
    mkdirSync(join(home, 'logs'))
    writeFileSync(join(home, 'logs', 'host-2026-11-05.log'), `${ON}\n`)
    expect(readHostFlags('sem linha', home)).toMatchObject({ teamwork: true, defaults: 'production' })
    expect(readHostFlags('sem linha', join(home, 'nope'))).toBeUndefined()
  })
})

/**
 * TEAM-15 boot line of the host (`[persona-host] flags …`): parsing, and what counts as "the app came up with the v1.1 team functions ON".
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseHostFlags, parseHostSurfaces, readHostFlags, surfacesProblems, v11FlagsOn } from '../src/host-flags.ts'

const ON = '[persona-host] flags teamwork=1 fanout=1 startOnBoardMove=1 productTools=1 defaults=production'
const SURFACES = '[persona-host] surfaces invite=0 station=0 channels=0 skillImport=0 sharedBrowser=1 defaults=production'
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

describe('host surfaces boot line (D-113)', () => {
  it('reads the five surfaces and the defaults from the LAST boot line, and says nothing for a host that predates D-113', () => {
    expect(parseHostSurfaces(`${SURFACES}\n`)).toEqual({ invite: false, station: false, channels: false, skillImport: false, sharedBrowser: true, defaults: 'production' })
    expect(parseHostSurfaces(`${SURFACES.replace('invite=0', 'invite=1')}\nruido\n${SURFACES}\n`)?.invite).toBe(false)
    expect(parseHostSurfaces('sem linha')).toBeUndefined()
  })

  it('the product\'s default is proven only with invite/station/channels/skillImport OFF and the production defaults; sharedBrowser can be demanded ON or OFF', () => {
    const on = parseHostSurfaces(SURFACES)
    expect(surfacesProblems(on, 'on')).toEqual([])
    expect(surfacesProblems(on, 'any')).toEqual([])
    expect(surfacesProblems(on, 'off')).toHaveLength(1)
    expect(surfacesProblems(parseHostSurfaces(SURFACES.replace('sharedBrowser=1', 'sharedBrowser=0')), 'on')).toHaveLength(1)
    expect(surfacesProblems(undefined)).toHaveLength(1)
  })

  it('each surface that is ON, and defaults that are not the product\'s, are accused one by one (a host that inherited Vitest has them all ON)', () => {
    const vitestHost = parseHostSurfaces('[persona-host] surfaces invite=1 station=1 channels=1 skillImport=1 sharedBrowser=1 defaults=test')
    expect(surfacesProblems(vitestHost)).toHaveLength(5)
    expect(surfacesProblems(parseHostSurfaces(SURFACES.replace('station=0', 'station=1')))).toEqual([expect.stringContaining('station is ON')])
  })
})

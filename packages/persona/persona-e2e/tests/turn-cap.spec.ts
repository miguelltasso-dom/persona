/**
 * The real run's budget helpers: the limiter scan of an installation and the tolerant read of the per-attempt ledger file.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readTurnLedgerFile, scanForTurnCap } from '../src/turn-cap.ts'

const dirs: string[] = []
afterEach(() => { while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true }) })

function installation(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'turn-cap-'))
  dirs.push(root)
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
  return join(root, 'Persona.exe')
}

describe('scanForTurnCap', () => {
  it('finds the limiter name in the asar or in the unpacked runtime', () => {
    expect(scanForTurnCap(installation({ 'resources/app.asar': 'xx PERSONA_REAL_TURN_CAP yy' })).found).toBe(true)
    const unpacked = scanForTurnCap(installation({ 'resources/app.asar': 'nothing', 'resources/app.asar.unpacked/dsh/host.js': 'if (process.env.PERSONA_REAL_TURN_CAP === "1") {}' }))
    expect(unpacked.found).toBe(true)
    expect(unpacked.file).toContain('host.js')
  })

  it('finds it in the packaged runners package FIRST, reading only that package (the full walk of a real install takes minutes)', () => {
    const owner = 'resources/app.asar.unpacked/dsh/node_modules/@deepseek-ai/dsh-persona-runners/lib/index.js'
    const scan = scanForTurnCap(installation({
      [owner]: 'const REAL_TURN_CAP_ENV = "PERSONA_REAL_TURN_CAP"',
      'resources/app.asar': 'x'.repeat(1000),
      'resources/app.asar.unpacked/other/huge.js': 'y'.repeat(1000),
    }))
    expect(scan.found).toBe(true)
    expect(scan.file).toContain('dsh-persona-runners')
    expect(scan.ownerPackageChecked).toBe(true)
    expect(scan.scannedFiles).toBe(1)
  })

  it('does not find it when the build has no limiter, and says how much it looked at', () => {
    const scan = scanForTurnCap(installation({ 'resources/app.asar': 'PERSONA_REAL_CLI only', 'resources/app.asar.unpacked/x.js': '// nothing' }))
    expect(scan.found).toBe(false)
    expect(scan.scannedFiles).toBe(2)
    expect(scan.timedOut).toBe(false)
  })
})

describe('readTurnLedgerFile', () => {
  const ledger = (content: string | undefined): string => {
    const dir = mkdtempSync(join(tmpdir(), 'turn-ledger-'))
    dirs.push(dir)
    const file = join(dir, 'attempt-1.ledger')
    if (content !== undefined) writeFileSync(file, content)
    return file
  }

  it('reads the exact limiter format; absent means 0 turns', () => {
    expect(readTurnLedgerFile(ledger(undefined))).toMatchObject({ exists: false, turns: 0, valid: true })
    expect(readTurnLedgerFile(ledger('{"version":1,"turns":0,"entries":[]}'))).toMatchObject({ exists: true, turns: 0, valid: true })
    expect(readTurnLedgerFile(ledger('{"version":1,"turns":1,"entries":[{"at":"2026-11-04T12:00:00Z"}]}'))).toMatchObject({ turns: 1, valid: true })
  })

  it('fails closed on anything else: corrupt, wrong version, bad turns, no entries, not an object', () => {
    for (const bad of ['', '{', 'null', '[]', '{"version":2,"turns":1,"entries":[]}', '{"version":1,"turns":-1,"entries":[]}',
      '{"version":1,"turns":1.5,"entries":[]}', '{"version":1,"turns":"1","entries":[]}', '{"version":1,"turns":1}']) {
      const read = readTurnLedgerFile(ledger(bad))
      expect(read.valid, JSON.stringify(bad)).toBe(false)
      expect(read.turns, JSON.stringify(bad)).toBeNull()
      expect(read.error, JSON.stringify(bad)).toBeTypeOf('string')
    }
  })
})

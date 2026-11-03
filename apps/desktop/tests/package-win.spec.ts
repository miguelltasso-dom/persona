import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('D8 package-win check', () => {
  it('lists every blocker at once and never starts an admin install', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx/esm', 'scripts/package-win.mjs'], {
      cwd: desktopRoot,
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(result.status).toBe(2)
    const report = JSON.parse(result.stdout) as {
      mode: string
      unsigned: boolean
      adminInstall: boolean
      blocked: boolean
      blockers: string[]
      miguel: string
      verify: string
      defender: { suggested: boolean }
    }
    expect(report.mode).toBe('check')
    expect(report.unsigned).toBe(true)
    expect(report.adminInstall).toBe(false)
    expect(report.blocked).toBe(true)
    expect(report.blockers.length).toBeGreaterThan(0)
    expect(report.miguel).toMatch(/winget install/u)
    expect(report.miguel).toMatch(/LongPathsEnabled/u)
    expect(report.verify).toBe('node --import tsx/esm apps/desktop/scripts/package-win.mjs')
    expect(report.defender.suggested).toBe(true)
    expect(result.stdout).not.toMatch(/Start-Process|msiexec/u)
    expect(JSON.stringify(report)).not.toMatch(/Atlas/u)
  })
})

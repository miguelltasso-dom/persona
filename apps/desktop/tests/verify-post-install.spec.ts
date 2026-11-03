import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { verifyPostInstall } from '../scripts/verify-post-install.ts'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('D8 verify-post-install (no toolchain)', () => {
  it('accepts unsigned Persona identity from source without VS Build Tools', () => {
    const report = verifyPostInstall()
    expect(report.ok).toBe(true)
    expect(report.productName).toBe('Persona')
    expect(report.protocol).toBe('persona://')
    expect(report.appId).toBe('com.persona.app')
    expect(report.unsigned).toBe(true)
    expect(report.adminInstall).toBe(false)
    expect(report.blockers).toEqual([])
    expect(JSON.stringify(report)).not.toMatch(/Atlas/u)
  })

  it('package-win --verify-identity exits 0 without admin install', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx/esm', 'scripts/package-win.mjs', '--verify-identity'], {
      cwd: desktopRoot,
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout) as { mode: string; ok: boolean; adminInstall: boolean }
    expect(report.mode).toBe('verify-identity')
    expect(report.ok).toBe(true)
    expect(report.adminInstall).toBe(false)
    expect(result.stdout).not.toMatch(/Start-Process|msiexec/u)
  })
})

import { spawnSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  NSIS_PER_USER,
  SHORT_ROOT,
  WINDOW_FRAME_SOURCE,
  WINDOW_FRAME_UPSTREAM,
  nsisAdminStop,
  remainingAdminNeeds,
  windowFramePrebuildPresent,
} from '../src/win-package-policy.ts'
import {
  WINDOWS_TITLEBAR_COLOR_DARK,
  WINDOWS_TITLEBAR_COLOR_LIGHT,
  WINDOWS_TITLEBAR_SYMBOL_DARK,
  WINDOWS_TITLEBAR_SYMBOL_LIGHT,
} from '../src/windows-layout.ts'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('Windows package policy (no admin)', () => {
  it('keeps NSIS per-user and treats window-frame as optional', () => {
    expect(NSIS_PER_USER).toEqual({
      perMachine: false,
      allowElevation: false,
      packElevateHelper: false,
    })
    expect(SHORT_ROOT).toBe('C:\\p8')
    expect(WINDOW_FRAME_UPSTREAM.publishedDll).toBe(false)
    expect(WINDOW_FRAME_UPSTREAM.license).toBe('MIT')
    expect(nsisAdminStop()).toMatch(/window-frame\.dll is optional/u)
    expect(nsisAdminStop()).toContain(WINDOW_FRAME_SOURCE)
    expect(nsisAdminStop()).toMatch(/#FAF3E4/u)
    expect(nsisAdminStop()).not.toMatch(/Atlas/u)
    expect(remainingAdminNeeds()).toMatch(/Authenticode/u)
  })

  it('uses Muse paper colors on the Electron title-bar overlay', () => {
    expect(WINDOWS_TITLEBAR_COLOR_LIGHT).toBe('#FAF3E4')
    expect(WINDOWS_TITLEBAR_COLOR_DARK).toBe('#1E1526')
    expect(WINDOWS_TITLEBAR_SYMBOL_LIGHT).toBe('#34243F')
    expect(WINDOWS_TITLEBAR_SYMBOL_DARK).toBe('#F6EEE0')
  })

  it('package-win --nsis-stop exits 0 because branded chrome is optional', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx/esm', 'scripts/package-win.mjs', '--nsis-stop'], {
      cwd: desktopRoot,
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(result.status).toBe(0)
    const report = JSON.parse(result.stdout) as {
      mode: string
      adminInstall: boolean
      unsigned: boolean
      windowFrameOptional: boolean
      upstream: { publishedDll: boolean }
      winCodeSign: string
    }
    expect(report.mode).toBe('nsis-stop')
    expect(report.adminInstall).toBe(false)
    expect(report.unsigned).toBe(true)
    expect(report.windowFrameOptional).toBe(true)
    expect(report.upstream.publishedDll).toBe(false)
    expect(report.winCodeSign).toBe('disabled')
    expect(result.stdout).not.toMatch(/Start-Process|msiexec/u)
    expect(windowFramePrebuildPresent()).toBe(false)
  })

  it('prepares installer bitmaps without compiling window-frame.dll', () => {
    const output = mkdtempSync(join(tmpdir(), 'persona-installer-ui-'))
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      join(desktopRoot, 'scripts', 'prepare-windows-installer.ps1'),
      '-OutputDirectory', output,
    ], {
      cwd: desktopRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/omitted|Prepared native installer resources/u)
    expect(existsSync(join(output, 'window-frame.dll'))).toBe(false)
    expect(existsSync(join(output, 'uninstaller-sidebar.bmp'))).toBe(true)
    expect(existsSync(join(output, 'brand.bmp'))).toBe(true)
  })
})

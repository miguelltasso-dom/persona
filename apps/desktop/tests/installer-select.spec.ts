import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const scripts = join(dirname(fileURLToPath(import.meta.url)), '../scripts')

describe('optional window-frame NSIS include', () => {
  it('selects branded chrome only when the DLL exists', () => {
    const select = readFileSync(join(scripts, 'installer-select.nsh'), 'utf8')
    expect(select).toMatch(/!if \/FileExists "\$\{INSTALLER_BUILD_DIR\}\\window-frame\.dll"/u)
    expect(select).toContain('installer.nsh')
    expect(select).toContain('installer-stock.nsh')
  })

  it('keeps per-user stock NSIS without calling the DLL', () => {
    const stock = readFileSync(join(scripts, 'installer-stock.nsh'), 'utf8')
    expect(stock).toContain('setInstallModePerUser')
    expect(stock).toContain('installer-directories.nsh')
    expect(stock).not.toMatch(/window-frame\.dll::/u)
    expect(stock).not.toMatch(/File "\/oname=\$PLUGINSDIR\\window-frame\.dll"/u)
    expect(stock).not.toContain('InstallerApplyFrame')
  })

  it('points electron-builder at the selector', async () => {
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    const config = createElectronBuilderConfig({
      DSH_DESKTOP_APP_ID: 'com.example.installer',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
      DSH_DESKTOP_TARGET_PLATFORM: 'win32',
      DSH_DESKTOP_TARGET_ARCH: 'x64',
      DSH_DESKTOP_UNSIGNED: '1',
    }, 'win32', 'x64')
    expect(config.nsis.include).toMatch(/installer-select\.nsh$/u)
    expect(config.nsis.perMachine).toBe(false)
    expect(config.nsis.allowElevation).toBe(false)
    expect(config.nsis.packElevateHelper).toBe(false)
  })
})

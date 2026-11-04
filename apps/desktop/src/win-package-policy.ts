/**
 * Windows packaging policy that does not need admin: short root, native reuse,
 * unsigned electron-builder, NSIS per-user. Branded window-frame.dll is
 * optional — stock NSIS plus Electron titleBarOverlay ship without it.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = fileURLToPath(new URL('..', import.meta.url))

export const SHORT_ROOT = 'C:\\p8'
export const SHORT_CACHE = 'C:\\p8c'

export const NSIS_PER_USER = {
  perMachine: false,
  allowElevation: false,
  packElevateHelper: false,
} as const

export const WINDOW_FRAME_SOURCE = 'apps/desktop/installer/window-frame.cpp'

/**
 * Official MIT upstream check for a precompiled `window-frame.dll`.
 * Releases publish the app installer, not a standalone helper DLL.
 */
export const WINDOW_FRAME_UPSTREAM = {
  repo: 'deepseek-ai/deepseek-harness',
  license: 'MIT',
  checkedRelease: 'dsh-v0.2.2-alpha.3',
  publishedDll: false,
  note: 'No standalone window-frame.dll asset; no hash to verify. Persona uses stock NSIS when the DLL is absent.',
} as const

/**
 * Locate a compiled `@deepseek-ai/node-addon-system` binary to reuse.
 * @param root - Repo root.
 */
export function findNativeAddonPrebuild(root: string): string | undefined {
  const names = [
    join(root, 'native', 'system', 'build', 'Release', 'system.node'),
    join(root, 'node_modules', '@deepseek-ai', 'node-addon-system', 'build', 'Release', 'system.node'),
    join(root, 'apps', 'desktop', 'node_modules', '@deepseek-ai', 'node-addon-system', 'build', 'Release', 'system.node'),
  ]
  return names.find(path => existsSync(path))
}

/**
 * True when branded NSIS can use a compiled `window-frame.dll` on this host.
 */
export function windowFramePrebuildPresent(root: string = desktopRoot): boolean {
  return existsSync(join(root, '.desktop-build', 'targets', 'win-x64', 'installer-ui', 'window-frame.dll'))
}

/**
 * What still needs admin or extra toolchain after the optional-frame fallback.
 */
export function remainingAdminNeeds(): string {
  return [
    'Still admin/toolchain if wanted later: VS C++ x86 (branded NSIS chrome only),',
    'LongPathsEnabled (workaround: C:\\p8 junction), Developer Mode (symlinks),',
    'Authenticode signing, node-gyp rebuild of @deepseek-ai/node-addon-system.',
    'Persona-Setup.exe itself: unsigned, per-user, no window-frame.dll.',
  ].join(' ')
}

/**
 * Branded NSIS chrome is optional. Stock installer does not need this DLL.
 */
export function nsisAdminStop(): string {
  return [
    'window-frame.dll is optional. Without',
    `${WINDOW_FRAME_SOURCE} compiled by VS C++ x86 tools,`,
    'installer-select.nsh uses stock per-user NSIS; the running app uses Electron',
    "titleBarStyle 'hidden' + titleBarOverlay (Muse paper #FAF3E4 / #1E1526).",
    WINDOW_FRAME_UPSTREAM.note,
    remainingAdminNeeds(),
  ].join(' ')
}

/**
 * D8 identity / protocol checks that do not need VS Build Tools, Electron, or an installer.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const desktopRoot = fileURLToPath(new URL('..', import.meta.url))

export interface PostInstallCheck {
  ok: boolean
  productName: string
  protocol: string
  appId: string
  unsigned: true
  adminInstall: false
  exePresent: boolean
  exe: string | null
  blockers: string[]
}

/**
 * Confirm unsigned Persona identity from source (and an unpacked dir when present).
 * @param options - Optional unpacked folder from `--dir`.
 */
export function verifyPostInstall(options: { unpackedDir?: string } = {}): PostInstallCheck {
  const blockers: string[] = []
  const builder = readFileSync(join(desktopRoot, 'scripts/electron-builder-config.mjs'), 'utf8')
  const product = readFileSync(join(desktopRoot, 'src/product.ts'), 'utf8')
  const deepLink = readFileSync(join(desktopRoot, 'src/deep-link.ts'), 'utf8')
  if (!product.includes("export const PERSONA_PRODUCT_NAME = 'Persona'")) blockers.push('productName')
  if (!product.includes("export const PERSONA_PROTOCOL = 'persona'")) blockers.push('protocol')
  if (!product.includes("export const PERSONA_APP_ID = 'com.persona.app'")) blockers.push('appId')
  if (!deepLink.includes("export const PERSONA_TASK_SCHEME = 'persona'")) blockers.push('deep-link')
  if (!builder.includes("schemes: ['persona']")) blockers.push('builder-protocol')
  if (!builder.includes("productName: 'Persona'")) blockers.push('builder-productName')
  if (!builder.includes('DSH_DESKTOP_UNSIGNED')) blockers.push('unsigned-flag')
  if (builder.includes('adminInstall: true')) blockers.push('admin-install')
  if (/https?:\/\/(?:api\.)?deepseek\.com/iu.test(builder) || /https?:\/\/(?:api\.)?deepseek\.com/iu.test(product)) {
    blockers.push('deepseek-host')
  }
  const candidates = [
    options.unpackedDir === undefined ? undefined : join(options.unpackedDir, 'Persona.exe'),
    join(desktopRoot, '.desktop-build', 'targets', 'win-x64', 'artifacts', 'win-unpacked', 'Persona.exe'),
    join(desktopRoot, '.desktop-build', 'win-x64', 'dist', 'win-unpacked', 'Persona.exe'),
  ]
  const exe = candidates.find(path => path !== undefined && existsSync(path))
  return {
    ok: blockers.length === 0,
    productName: 'Persona',
    protocol: 'persona://',
    appId: 'com.persona.app',
    unsigned: true,
    adminInstall: false,
    exePresent: exe !== undefined,
    exe: exe ?? null,
    blockers,
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = verifyPostInstall()
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exit(report.ok ? 0 : 2)
}

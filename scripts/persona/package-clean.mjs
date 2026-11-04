#!/usr/bin/env node
/**
 * D8 packaging from a CLEAN worktree of the last published green commit
 * (origin/persona-dev), same method as scripts/persona/publish.mjs (D-049).
 *
 * Never packages the shared dirty checkout (GOVERNANCE in flight).
 *
 *   node scripts/persona/with-lock.mjs "Rivet D8 clean" -- node scripts/persona/package-clean.mjs
 *
 * Options: --commit <rev>  --dir  --no-install  --no-overlay
 * Exit: 0 Setup/exe ready, 1 typecheck/package red, 2 setup failure.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const main = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_WT = resolve(main, '..', 'persona-push')
const SHORT_WT = 'C:\\p8w'
const CACHE = 'C:\\p8c'
const argv = process.argv.slice(2)
const wantDir = argv.includes('--dir')
const noInstall = argv.includes('--no-install')
const noOverlay = argv.includes('--no-overlay')
const resume = argv.includes('--resume')
const commitFlag = argv.indexOf('--commit')
const requested = commitFlag >= 0 ? argv[commitFlag + 1] : 'origin/persona-dev'

const run = (cwd, cmd, args, options = {}) => spawnSync(cmd, args, {
  cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 28,
  shell: process.platform === 'win32' && cmd === 'pnpm',
  ...options,
})
const log = (message) => console.log(`[package-clean ${new Date().toISOString()}] ${message}`)

function ensureJunction(short, target) {
  if (existsSync(short)) return { ok: true, path: short, detail: 'existing' }
  const made = run(main, 'cmd.exe', ['/c', 'mklink', '/J', short, target])
  return { ok: made.status === 0 && existsSync(short), path: short, detail: made.stdout || made.stderr || 'created' }
}

function applyOverlay(wt) {
  const desktop = join(wt, 'apps', 'desktop')
  const scripts = join(desktop, 'scripts')
  copyFileSync(join(main, 'apps/desktop/scripts/installer-select.nsh'), join(scripts, 'installer-select.nsh'))
  copyFileSync(join(main, 'apps/desktop/scripts/installer-stock.nsh'), join(scripts, 'installer-stock.nsh'))
  copyFileSync(join(main, 'apps/desktop/scripts/prepare-windows-installer.ps1'), join(scripts, 'prepare-windows-installer.ps1'))
  copyFileSync(join(main, 'apps/desktop/scripts/runtime-patch-policy.ts'), join(scripts, 'runtime-patch-policy.ts'))
  copyFileSync(join(main, 'apps/desktop/src/persona-vault-ipc.ts'), join(desktop, 'src/persona-vault-ipc.ts'))
  copyFileSync(join(main, 'apps/desktop/src/secure-shell.ts'), join(desktop, 'src/secure-shell.ts'))

  const ebc = join(scripts, 'electron-builder-config.mjs')
  let cfg = readFileSync(ebc, 'utf8')
  if (!cfg.includes('existsSync')) {
    cfg = cfg.replace("import { readFileSync } from 'node:fs'", "import { existsSync, readFileSync } from 'node:fs'")
  }
  cfg = cfg.replace(
    "include: fileURLToPath(new URL('./installer.nsh', import.meta.url)),",
    "include: fileURLToPath(new URL('./installer-select.nsh', import.meta.url)),",
  )
  cfg = cfg.replace(
    `      if (windowsSigner !== undefined) {
        await windowsSigner({ path: join(buildPaths.root, 'installer-ui', 'window-frame.dll'), hash: 'sha256', isNest: false })
      }`,
    `      const frameDll = join(buildPaths.root, 'installer-ui', 'window-frame.dll')
      if (windowsSigner !== undefined && existsSync(frameDll)) {
        await windowsSigner({ path: frameDll, hash: 'sha256', isNest: false })
      }`,
  )
  if (!cfg.includes('packElevateHelper')) {
    cfg = cfg.replace('allowElevation: false,', 'allowElevation: false,\n      packElevateHelper: false,')
  }
  writeFileSync(ebc, cfg)

  return [
    'installer-select.nsh', 'installer-stock.nsh', 'prepare-windows-installer.ps1',
    'runtime-patch-policy.ts',
    'electron-builder-config.mjs', 'persona-vault-ipc.ts', 'secure-shell.ts',
  ]
}

function findArtifact(root, pattern) {
  const listed = run(root, 'cmd.exe', ['/c', 'dir', '/b', '/s', root])
  return (listed.stdout ?? '').split(/\r?\n/u).map(line => line.trim()).find(line => pattern.test(line))
}

function installTrial(setup) {
  const dest = mkdtempSync(join(tmpdir(), 'persona-nsis-'))
  const t0 = Date.now()
  const installed = run(dest, setup, ['/S', `/D=${dest}`], { timeout: 10 * 60_000 })
  const installMs = Date.now() - t0
  const exe = join(dest, 'Persona.exe')
  const uninstaller = ['Uninstall Persona.exe', 'Uninstall.exe']
    .map(name => join(dest, name))
    .find(path => existsSync(path))
  let uninstallMs
  let uninstallExit
  if (uninstaller !== undefined) {
    const u0 = Date.now()
    const undone = run(dest, uninstaller, ['/S'], { timeout: 180_000 })
    uninstallMs = Date.now() - u0
    uninstallExit = undone.status
  }
  const exePresent = existsSync(exe)
  rmSync(dest, { recursive: true, force: true })
  return {
    dest,
    exe: exePresent ? exe : null,
    exePresent,
    installMs,
    installExit: installed.status,
    uninstaller: uninstaller ?? null,
    uninstallMs: uninstallMs ?? null,
    uninstallExit: uninstallExit ?? null,
  }
}

if (argv.includes('--help')) {
  process.stdout.write('usage: node scripts/persona/package-clean.mjs [--commit origin/persona-dev] [--dir] [--resume] [--no-install] [--no-overlay]\n')
  process.exit(0)
}

mkdirSync(CACHE, { recursive: true })
const started = Date.now()
const target = run(main, 'git', ['rev-parse', requested]).stdout.trim()
if (!target) {
  log(`cannot resolve ${requested}`)
  process.exit(2)
}
log(`target ${target.slice(0, 10)} ${run(main, 'git', ['log', '-1', '--format=%s', target]).stdout.trim()}`)

const wt = existsSync(DEFAULT_WT) ? DEFAULT_WT : SHORT_WT
if (!existsSync(wt)) {
  const created = run(main, 'git', ['worktree', 'add', '--detach', wt, target])
  if (created.status !== 0) {
    log(`worktree add failed: ${(created.stderr || created.stdout).slice(-400)}`)
    process.exit(2)
  }
}
const current = run(wt, 'git', ['rev-parse', 'HEAD']).stdout.trim()
if (!resume || current !== target) {
  const checkout = run(wt, 'git', ['checkout', '--detach', '--force', target])
  if (checkout.status !== 0) {
    log(`checkout failed: ${(checkout.stderr || checkout.stdout).slice(-400)}`)
    process.exit(2)
  }
  const cleaned = run(wt, 'git', ['clean', '-fd', '--exclude=.desktop-build', '--exclude=node_modules'])
  log(`clean worktree ${(cleaned.stdout || cleaned.stderr || 'ok').trim().slice(0, 200)}`)
} else {
  log('resume: keep worktree at published commit (overlay reapplied)')
}
const short = ensureJunction(SHORT_WT, wt)
log(`worktree ${wt} junction ${short.path} (${short.detail})`)

if (!existsSync(join(wt, 'node_modules'))) {
  log('installing dependencies in the clean worktree (frozen lockfile)')
  const install = run(wt, 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline'])
  if (install.status !== 0) {
    log(`install failed:\n${`${install.stdout}${install.stderr}`.slice(-600)}`)
    process.exit(2)
  }
}

const overlay = noOverlay ? [] : applyOverlay(wt)
log(`overlay ${overlay.join(', ') || 'none'}`)

const pnpmEntry = join(wt, 'node_modules/pnpm/bin/pnpm.cjs')
const desktop = join(wt, 'apps', 'desktop')
const packArgs = ['exec', 'tsx', 'scripts/package-target.ts', 'win-x64', '--unsigned', '--skip-smoke']
if (wantDir) packArgs.push('--dir')
log(`pack ${packArgs.join(' ')}`)
const packed = run(desktop, process.execPath, [pnpmEntry, ...packArgs], {
  env: {
    ...process.env,
    npm_execpath: pnpmEntry,
    DSH_DESKTOP_UNSIGNED: '1',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    DSH_DESKTOP_PACKAGE_CACHE_DIR: CACHE,
  },
  timeout: 40 * 60_000,
})
const packLog = join(CACHE, 'package-clean.log')
writeFileSync(packLog, `${packed.stdout ?? ''}\n${packed.stderr ?? ''}`)
const artifactRoot = join(desktop, '.desktop-build')
const setup = findArtifact(artifactRoot, /persona-.*-win-x64-unsigned\.exe$/iu)
  ?? findArtifact(artifactRoot, /Persona-Setup\.exe$/iu)
const exe = findArtifact(artifactRoot, /win-unpacked\\Persona\.exe$/iu)
const preparedDsh = join(desktop, '.desktop-build', 'targets', 'win-x64', 'dsh')
const personaRuntime = {
  root: preparedDsh,
  personaApp: existsSync(join(preparedDsh, 'node_modules/@deepseek-ai/dsh-persona-app/cordis.patch.yml')),
  clientJs: existsSync(join(preparedDsh, 'node_modules/@deepseek-ai/dsh-client-ui-persona/lib/client.js')),
}
let setupCopy
if (setup !== undefined) {
  setupCopy = join(CACHE, 'Persona-Setup.exe')
  copyFileSync(setup, setupCopy)
}

let trial
if (!noInstall && !wantDir && setup !== undefined) {
  log(`install trial ${setup}`)
  trial = installTrial(setup)
}

const report = {
  ok: packed.status === 0 && (wantDir ? exe !== undefined : setup !== undefined),
  commit: target,
  requested,
  worktree: wt,
  shortWorktree: short,
  cache: CACHE,
  overlay,
  unsigned: true,
  adminInstall: false,
  windowFrameOptional: true,
  nsis: { perMachine: false, allowElevation: false, packElevateHelper: false },
  elapsedMs: Date.now() - started,
  packageExit: packed.status,
  setup: setup ?? null,
  setupCopy: setupCopy ?? null,
  setupBytes: setup !== undefined ? statSync(setup).size : null,
  exe: exe ?? null,
  skipSmoke: true,
  personaRuntime,
  logPath: packLog,
  trial: trial ?? null,
  tail: `${packed.stderr ?? ''}\n${packed.stdout ?? ''}`.slice(-2_500),
}
writeFileSync(join(CACHE, 'package-clean.json'), `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exit(report.ok ? 0 : packed.status === 0 ? 2 : 1)

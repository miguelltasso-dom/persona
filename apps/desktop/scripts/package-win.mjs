/**
 * Unsigned Windows packaging entry (D8). Never runs an admin installer.
 * --check lists every missing prerequisite. --dry assembles to a temp dir
 * and runs the packaged boot gate only when the host is ready.
 */
import { execFile, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { statfs } from 'node:fs/promises'

const run = promisify(execFile)
const desktopRoot = fileURLToPath(new URL('..', import.meta.url))
const MODE = process.argv.includes('--verify-identity')
  ? 'verify-identity'
  : process.argv.includes('--dry')
    ? 'dry'
    : process.argv.includes('--dir')
      ? 'dir'
      : process.argv.includes('--package')
        ? 'package'
        : 'check'

const MIGUEL_PHRASE = [
  'Para empacotar o Persona no Windows (sem assinatura, sem instalador admin):',
  '1) Instale Visual Studio Build Tools + Windows SDK: winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --includeRecommended"',
  '2) Ative caminhos longos (admin): New-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force',
  '3) Ative o Modo de Desenvolvedor em Configurações → Sistema → Para desenvolvedores.',
  '4) (sugerido) Add-MpPreference -ExclusionPath (Join-Path $PWD ".desktop-build")',
  'Verificar de novo: node --import tsx/esm apps/desktop/scripts/package-win.mjs',
].join(' ')

function vswherePath(env = process.env) {
  const pf = env['ProgramFiles(x86)']
  if (pf === undefined) return undefined
  const path = join(pf, 'Microsoft Visual Studio/Installer/vswhere.exe')
  return existsSync(path) ? path : undefined
}

async function probeVswhere() {
  const path = vswherePath()
  if (path === undefined) {
    return { ok: false, detail: 'vswhere.exe not found (VS C++ Build Tools)' }
  }
  try {
    const tools = await run(path, [
      '-latest', '-products', '*',
      '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property', 'installationPath',
    ], { windowsHide: true, timeout: 30_000 })
    const install = tools.stdout.trim()
    if (install === '') return { ok: false, detail: 'VS C++ tools not installed' }
    const sdkDir = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Windows Kits', '10')
    const sdk = existsSync(sdkDir)
    return {
      ok: sdk,
      detail: sdk ? install : `${install} (Windows SDK missing under ${sdkDir})`,
      sdk,
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

async function probeLongPaths() {
  if (process.platform !== 'win32') return { ok: true, detail: 'not windows' }
  try {
    const out = await run('reg', [
      'query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem', '/v', 'LongPathsEnabled',
    ], { windowsHide: true, timeout: 15_000 })
    const match = /LongPathsEnabled\s+REG_DWORD\s+0x([0-9a-fA-F]+)/u.exec(out.stdout)
    const value = match === undefined ? 0 : Number.parseInt(match[1], 16)
    return { ok: value === 1, detail: `LongPathsEnabled=${String(value)}` }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

async function probeDeveloperMode() {
  if (process.platform !== 'win32') return { ok: true, detail: 'not windows' }
  try {
    const out = await run('reg', [
      'query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock',
      '/v', 'AllowDevelopmentWithoutDevLicense',
    ], { windowsHide: true, timeout: 15_000 })
    const match = /AllowDevelopmentWithoutDevLicense\s+REG_DWORD\s+0x([0-9a-fA-F]+)/u.exec(out.stdout)
    const value = match === undefined ? 0 : Number.parseInt(match[1], 16)
    return { ok: value === 1, detail: `AllowDevelopmentWithoutDevLicense=${String(value)}` }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

function probeDefenderSuggestion() {
  const path = join(desktopRoot, '.desktop-build')
  return {
    ok: true,
    suggested: true,
    detail: `Add-MpPreference -ExclusionPath '${path}'`,
  }
}

async function probeDisk() {
  try {
    const stats = await statfs(desktopRoot)
    const freeGb = (stats.bavail * stats.bsize) / (1024 ** 3)
    return { ok: freeGb >= 5, detail: `${freeGb.toFixed(1)} GB free (need ≥5 GB)` }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

function probeNode() {
  const match = /^v(\d+)\.(\d+)/u.exec(process.version)
  const major = match === undefined ? 0 : Number(match[1])
  const minor = match === undefined ? 0 : Number(match[2])
  const ok = major > 24 || (major === 24 && minor >= 9)
  return { ok, detail: process.version, need: '>=24.9' }
}

function probeElectron() {
  const electronJs = join(desktopRoot, 'node_modules/electron/index.js')
  const exe = join(desktopRoot, 'node_modules/electron/dist/electron.exe')
  const ok = existsSync(electronJs) || existsSync(exe)
  return { ok, detail: ok ? 'electron present' : 'apps/desktop/node_modules/electron missing' }
}

function probeElectronSqlite() {
  const exe = join(desktopRoot, 'node_modules/electron/dist/electron.exe')
  if (!existsSync(exe)) return { ok: false, detail: 'electron.exe missing' }
  const result = spawnSync(exe, ['-e', 'import("node:sqlite").then(m => process.stdout.write(String("DatabaseSync" in m))).catch(e => { process.stdout.write(String(e)); process.exit(2) })'], {
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  const ok = result.status === 0 && result.stdout.trim() === 'true'
  return { ok, detail: ok ? 'node:sqlite DatabaseSync' : (result.stdout || result.stderr || `exit ${String(result.status)}`).slice(0, 200) }
}

async function collectChecks() {
  const vswhere = await probeVswhere()
  const longPaths = await probeLongPaths()
  const developerMode = await probeDeveloperMode()
  const defender = probeDefenderSuggestion()
  const disk = await probeDisk()
  const node = probeNode()
  const electron = probeElectron()
  const sqlite = probeElectronSqlite()
  const blockers = [
    !vswhere.ok ? 'vswhere/VCTools/SDK' : undefined,
    !longPaths.ok ? 'LongPathsEnabled' : undefined,
    !developerMode.ok ? 'Developer Mode' : undefined,
    !disk.ok ? 'disk' : undefined,
    !node.ok ? 'node' : undefined,
    !electron.ok ? 'electron' : undefined,
    !sqlite.ok ? 'node:sqlite' : undefined,
  ].filter(item => item !== undefined)
  return {
    vswhere,
    longPaths,
    developerMode,
    defender,
    disk,
    node,
    electron,
    sqlite,
    blocked: blockers.length > 0,
    blockers,
  }
}

function probeNativeNeeds() {
  return {
    'node:sqlite': { needsVcTools: false, detail: 'builtin in Electron/Node 24 (DatabaseSync)' },
    '@cursor/sdk': { needsVcTools: false, detail: 'JavaScript SDK; no node-gyp' },
    '@deepseek-ai/node-addon-system': {
      needsVcTools: true,
      detail: 'native/system flock/landlock host addon — `pnpm run build:native-system` / node-gyp',
    },
    'nsis-window-frame': {
      needsVcTools: true,
      detail: 'installer-only window-frame.dll (NSIS). Not used by electron-builder --dir',
    },
  }
}

function dirBlockers(checks) {
  return [
    !checks.disk.ok ? 'disk' : undefined,
    !checks.node.ok ? 'node' : undefined,
    !checks.electron.ok ? 'electron' : undefined,
    !checks.sqlite.ok ? 'node:sqlite' : undefined,
  ].filter(item => item !== undefined)
}

async function ensureShortJunction() {
  if (process.platform !== 'win32') return { ok: false, path: undefined, detail: 'not windows' }
  const short = 'C:\\p8'
  const repo = fileURLToPath(new URL('../../..', import.meta.url))
  if (existsSync(short)) {
    return { ok: true, path: short, detail: 'existing', repo }
  }
  const made = spawnSync('cmd.exe', ['/c', 'mklink', '/J', short, repo], {
    encoding: 'utf8', windowsHide: true, timeout: 15_000,
  })
  const ok = made.status === 0 && existsSync(short)
  return {
    ok,
    path: ok ? short : undefined,
    detail: ok ? 'created' : (made.stderr || made.stdout || `exit ${String(made.status)}`).slice(0, 400),
    repo,
  }
}

/** package-target.ts reads `npm_execpath` to spawn pnpm. Direct `node` launch has none. */
function resolvePnpmEntry() {
  const fromEnv = process.env.npm_execpath?.trim()
  if (fromEnv) return fromEnv
  const workspace = join(desktopRoot, '../../node_modules/pnpm/bin/pnpm.cjs')
  return existsSync(workspace) ? workspace : undefined
}

function spawnPackageTarget(args, env) {
  const pnpmEntry = resolvePnpmEntry()
  const timeout = 20 * 60_000
  if (pnpmEntry === undefined) {
    return { status: 1, error: new Error('pnpm entry not found'), stdout: '', stderr: 'pnpm entry not found' }
  }
  return spawnSync(process.execPath, [pnpmEntry, 'exec', 'tsx', 'scripts/package-target.ts', ...args], {
    cwd: desktopRoot,
    encoding: 'utf8',
    windowsHide: true,
    env: { ...env, npm_execpath: pnpmEntry },
    timeout,
  })
}

async function runDir(checks) {
  const short = await ensureShortJunction()
  const cache = 'C:\\p8c'
  await mkdir(cache, { recursive: true })
  const logPath = join(cache, 'dir.log')
  const packed = spawnPackageTarget(['win-x64', '--unsigned', '--dir'], {
    ...process.env,
    DSH_DESKTOP_UNSIGNED: '1',
    DSH_DESKTOP_PACKAGE_CACHE_DIR: cache,
  })
  const spawnErr = packed.error instanceof Error ? packed.error.stack ?? packed.error.message : ''
  const stderr = `${packed.stderr ?? ''}\n${packed.stdout ?? ''}\n${spawnErr}`
  await writeFile(logPath, stderr)
  const exeCandidates = [
    join(desktopRoot, '.desktop-build', 'targets', 'win-x64', 'artifacts', 'win-unpacked', 'Persona.exe'),
    join(desktopRoot, '.desktop-build', 'win-x64', 'dist', 'win-unpacked', 'Persona.exe'),
    join(cache, 'win-unpacked', 'Persona.exe'),
  ]
  const exe = exeCandidates.find(path => existsSync(path))
  const nativeHint = /node-gyp|MSB8020|VCINSTALLDIR|windows-build-tools|node-addon-system|landlock|flock|gyp ERR/iu.exec(stderr)
  return {
    ran: true,
    shortPath: short,
    cache,
    cwd: desktopRoot,
    packageExit: packed.status,
    exePresent: exe !== undefined,
    exe: exe ?? null,
    logPath,
    nativeHint: nativeHint?.[0] ?? null,
    tail: stderr.slice(-3_000),
  }
}

async function runDry(checks) {
  if (checks.blocked) {
    return { ran: false, reason: 'prerequisites missing' }
  }
  const dest = await mkdtemp(join(tmpdir(), 'persona-win-dry-'))
  const packed = spawnPackageTarget(['win-x64', '--unsigned', '--dir'], {
    ...process.env,
    DSH_DESKTOP_UNSIGNED: '1',
  })
  const exe = join(desktopRoot, '.desktop-build', 'win-x64', 'dist', 'win-unpacked', 'Persona.exe')
  let boot
  if (existsSync(exe)) {
    boot = spawnSync(process.execPath, [
      '--import', 'tsx/esm',
      join(desktopRoot, 'scripts/smoke-packaged-runtime.ts'),
      '--unsigned',
    ], {
      cwd: desktopRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120_000,
    })
  }
  return {
    ran: true,
    dest,
    packageExit: packed.status,
    bootExit: boot?.status,
    exePresent: existsSync(exe),
  }
}

async function main() {
  if (MODE === 'verify-identity') {
    const { verifyPostInstall } = await import('./verify-post-install.ts')
    const identity = verifyPostInstall()
    process.stdout.write(`${JSON.stringify({
      mode: MODE,
      unsigned: true,
      adminInstall: false,
      ...identity,
    }, null, 2)}\n`)
    process.exit(identity.ok ? 0 : 2)
  }
  const checks = await collectChecks()
  const report = {
    mode: MODE,
    unsigned: true,
    adminInstall: false,
    ...checks,
    nativeNeeds: probeNativeNeeds(),
    miguel: MIGUEL_PHRASE,
    verify: 'node --import tsx/esm apps/desktop/scripts/package-win.mjs',
  }
  if (MODE === 'dir') {
    const blockers = dirBlockers(checks)
    report.dirBlockers = blockers
    report.dirSkipsAdmin = ['vswhere/VCTools/SDK', 'LongPathsEnabled', 'Developer Mode']
    if (blockers.length === 0) report.dir = await runDir(checks)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    process.exit(report.dir?.exePresent === true ? 0 : 2)
  }
  if (MODE === 'dry') {
    report.dry = await runDry(checks)
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (MODE === 'check' || checks.blocked) process.exit(checks.blocked ? 2 : 0)
  if (MODE === 'dry') process.exit(checks.blocked || report.dry?.packageExit !== 0 ? 2 : 0)
  process.exit(2)
}

await main()

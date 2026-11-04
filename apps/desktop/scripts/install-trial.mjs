/**
 * Silent per-user install of an unsigned Persona NSIS artifact into a temp
 * directory, then uninstall. Never elevates. Does not start an admin installer.
 */
import { execFile, spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

function findSetup(explicit) {
  if (explicit && existsSync(explicit)) return explicit
  const roots = [
    join(process.cwd(), 'apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts'),
    join(process.cwd(), 'apps/desktop/.desktop-build/targets/win-x64/artifacts'),
    'C:\\pbc',
  ]
  for (const root of roots) {
    const listed = spawnSync('cmd.exe', ['/c', 'dir', '/b', '/s', root], {
      encoding: 'utf8', windowsHide: true, timeout: 15_000,
    })
    const match = (listed.stdout ?? '').split(/\r?\n/u).find(line =>
      /persona-.*-win-x64-unsigned\.exe$/iu.test(line) || /Persona-Setup\.exe$/iu.test(line))
    if (match) return match.trim()
  }
  return undefined
}

async function main() {
  const setup = findSetup(process.argv[2])
  if (setup === undefined) {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: 'setup exe not found' }, null, 2)}\n`)
    process.exit(2)
  }
  const dest = await mkdtemp(join(tmpdir(), 'persona-nsis-'))
  const started = Date.now()
  const install = await run(setup, ['/S', `/D=${dest}`], {
    windowsHide: true,
    timeout: 10 * 60_000,
  }).catch(error => ({ error }))
  const installMs = Date.now() - started
  const exe = join(dest, 'Persona.exe')
  const uninstaller = ['Uninstall Persona.exe', 'Uninstall.exe']
    .map(name => join(dest, name))
    .find(path => existsSync(path))
  let uninstallMs
  let uninstallExit
  if (uninstaller !== undefined) {
    const u0 = Date.now()
    const undone = spawnSync(uninstaller, ['/S'], { windowsHide: true, timeout: 180_000, encoding: 'utf8' })
    uninstallMs = Date.now() - u0
    uninstallExit = undone.status
  }
  await rm(dest, { recursive: true, force: true }).catch(() => {})
  const report = {
    ok: existsSync(setup) && (install.error === undefined),
    setup,
    bytes: statSync(setup).size,
    dest,
    exePresent: existsSync(exe),
    installMs,
    installError: install.error instanceof Error ? install.error.message : null,
    uninstaller: uninstaller ?? null,
    uninstallMs: uninstallMs ?? null,
    uninstallExit: uninstallExit ?? null,
    elevated: false,
  }
  const log = join('C:\\pbc', 'install-trial.json')
  await writeFile(log, `${JSON.stringify(report, null, 2)}\n`).catch(() => {})
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exit(report.ok && report.exePresent ? 0 : 2)
}

await main()

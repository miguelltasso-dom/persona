/**
 * Unsigned Windows packaging entry (D8). Default is a toolchain check.
 * Never runs an admin installer. Full `:dir` / NSIS needs VS tools + long paths
 * (PLAN E4/E5) — this script reports those blockers and stops.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const MODE = process.argv.includes('--dir') ? 'dir' : process.argv.includes('--package') ? 'package' : 'check'

function vswherePath(env = process.env) {
  const pf = env['ProgramFiles(x86)']
  if (pf === undefined) return undefined
  const path = join(pf, 'Microsoft Visual Studio/Installer/vswhere.exe')
  return existsSync(path) ? path : undefined
}

async function probeVswhere() {
  const path = vswherePath()
  if (path === undefined) return { ok: false, detail: 'vswhere.exe not found (E4: VS C++ Build Tools)' }
  try {
    const located = await run(path, [
      '-latest', '-products', '*',
      '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property', 'installationPath',
    ], { windowsHide: true, timeout: 30_000 })
    const install = located.stdout.trim()
    if (install === '') return { ok: false, detail: 'VS C++ tools not installed' }
    return { ok: true, detail: install }
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

async function main() {
  const vswhere = await probeVswhere()
  const longPaths = await probeLongPaths()
  const blocked = !vswhere.ok || !longPaths.ok
  const report = {
    mode: MODE,
    unsigned: true,
    adminInstall: false,
    vswhere,
    longPaths,
    blocked,
    next: blocked ? 'Atlas/Miguel: E4 VS Build Tools + E5 LongPathsEnabled=1 / Developer Mode' : 'ready',
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (MODE === 'check' || blocked) process.exit(blocked ? 2 : 0)
  process.exit(2)
}

await main()

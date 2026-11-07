// BUG-QUIT-1: the acceptance run for a built exe (the cut), in one command, under the build lock:
//   node scripts/persona/with-lock.mjs "BUG-QUIT-1 exe do corte" --lock build -- node scripts/persona/bug-quit/validate-exe.mjs <Persona.exe> <pasta-de-saida> [--turn]
// Runs bug-quit.mjs (app-quit, --detach --clean) three times in a row and prints one verdict table:
//   1. plain "Sair"                         -> all processes gone <= 5 s
//   2. "Sair" with the fake-CLI stubs alive -> all processes gone <= 5 s, no CLI left behind
//   3. "Sair" then open the app again       -> the old process is gone before the second launch (nothing hands over to a ghost)
// plus, in run 1, the read-only overlay probe: an idle app must hold NO full-screen overlay window and NO global Ctrl+Shift+Space.
// With --turn a fourth run asks for the first delivery against a slow fake CLI first, so a CLI turn is in flight at "Sair" (needs the Playwright
// of persona-e2e; the stub may never receive the turn on some builds: the verdict then says "turn not in flight", never a pass).
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [exe, outRoot] = process.argv.slice(2).filter(item => !item.startsWith('--'))
const withTurn = process.argv.includes('--turn')
if (exe === undefined || outRoot === undefined) { console.log('usage: validate-exe.mjs <Persona.exe> <outDir> [--turn]'); process.exit(2) }
const LIMIT_MS = 5000
const measure = join(import.meta.dirname, 'bug-quit.mjs')
mkdirSync(outRoot, { recursive: true })

const plan = [
  { name: 'sair-liso', flags: ['--probe-overlay'] },
  { name: 'sair-com-stubs', flags: ['--fake-cli'] },
  { name: 'sair-e-reabrir', flags: ['--relaunch'] },
  ...(withTurn ? [{ name: 'sair-com-turno-em-voo', flags: ['--turn'] }] : []),
]

const rows = []
for (const step of plan) {
  const out = resolve(outRoot, step.name)
  const ran = spawnSync(process.execPath, [measure, exe, out, 'app-quit', '--detach', '--clean', ...step.flags], { encoding: 'utf8', windowsHide: true, timeout: 900_000 })
  let report
  try { report = JSON.parse(readFileSync(join(out, 'quit-app-quit.json'), 'utf8')) } catch (error) { report = { error: `no report (${String(error).slice(0, 80)}) ${String(ran.stderr).slice(-200)}` } }
  const probe = (() => { try { return JSON.parse(readFileSync(join(out, 'overlay-probe.json'), 'utf8')) } catch { return undefined } })()
  const idleOverlay = probe === undefined ? undefined : (probe.fromMain?.windows ?? []).some(window => window.kind === 'overlay')
  const turnEvents = (() => { try { return readFileSync(join(out, 'fake-cli.log'), 'utf8').split('\n').filter(line => line.includes('"event":"turn"')).length } catch { return 0 } })()
  const gone = report.outcome === 'all processes gone'
  const fast = typeof report.endedAfterMs === 'number' && report.endedAfterMs <= LIMIT_MS
  const reopened = report.relaunch ?? undefined
  rows.push({
    run: step.name,
    verdict: report.error !== undefined ? 'ERROR' : gone && fast ? 'PASS' : gone ? 'SLOW' : 'FAIL',
    endedAfterMs: report.endedAfterMs ?? null,
    outcome: report.outcome ?? report.error,
    firstPaintMs: report.firstFrame?.firstPaintAfterSpawnMs ?? null,
    ...(probe === undefined ? {} : { idleOverlayWindow: idleOverlay, globalChordHeldInIdle: probe.fromMain?.chordHeld }),
    ...(reopened === undefined ? {} : { reopen: reopened.note ?? reopened }),
    ...(step.name === 'sair-com-turno-em-voo' ? { turnEventsSeenByStub: turnEvents, turnInFlight: turnEvents > 0 } : {}),
  })
}

const idleOk = rows[0]?.idleOverlayWindow === false && rows[0]?.globalChordHeldInIdle === false
const turnRow = rows.find(row => row.run === 'sair-com-turno-em-voo')
const summary = {
  exe,
  limitMs: LIMIT_MS,
  accepted: rows.filter(row => row.run !== 'sair-com-turno-em-voo').every(row => row.verdict === 'PASS') && idleOk && (turnRow === undefined || (turnRow.turnInFlight === true && turnRow.verdict === 'PASS')),
  idleHoldsNoOverlayNoGlobalChord: idleOk,
  rows,
}
writeFileSync(join(outRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))
process.exit(summary.accepted ? 0 : 1)

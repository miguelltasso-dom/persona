#!/usr/bin/env node
/**
 * INST-2 (Rivet): the vault of a PACKAGED Persona.exe, launched again and again. H2 #3 answered `vault_unavailable` in 1 launch of 4 and the H2 #4 loop (12 launches)
 * in 2 of 12: the FIRST vault call of a run takes 5-11 s (the Electron main is busy booting) and the old 10 s transport deadline turned a slow call into a
 * refusal. The fix is `VAULT_REQUEST_TIMEOUT_MS = 60 s` in persona-vault (process-transport.ts); this loop is the acceptance: N launches, every call must succeed.
 *
 *   node scripts/persona/with-lock.mjs "INST-2 laco do cofre" --lock build -- node scripts/persona/exe-vault-loop.mjs <Persona.exe> <outDir> [--runs 20] [--parallel 1]
 *
 * Each launch gets its own temp home and user-data (so its own single-instance lock), and a synthetic Cordis probe in the persona profile that, as soon as the
 * Host starts, does three REAL vault calls through the Host -> Electron main -> safeStorage(DPAPI) channel (set, get, get), timing each one. The probe is
 * synthetic-only (no real secret). The app is stopped by killing exactly the process tree this script started (taskkill /PID <root> /T /F), never by name.
 * Exit 0 only when every run answered every call with `ok` and the status said `dpapi`.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? Number(args[at + 1]) : fallback }
const [exeArg, outArg] = args.filter((item, index) => !item.startsWith('--') && !['--runs', '--parallel'].includes(args[index - 1]))
if (exeArg === undefined || outArg === undefined) { console.error('usage: node scripts/persona/exe-vault-loop.mjs <Persona.exe> <outDir> [--runs 20] [--parallel 1]'); process.exit(2) }
const exe = resolve(exeArg)
const out = resolve(outArg)
const runs = flag('--runs', 20)
const parallel = Math.max(1, flag('--parallel', 1))
const perRunTimeoutMs = 240_000
if (!existsSync(exe)) { console.error(`no such exe: ${exe}`); process.exit(2) }
mkdirSync(out, { recursive: true })

const PROBE = `import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const inject = ['personaVault'];
export async function apply(ctx) {
  const vault = ctx.personaVault;
  const result = { trace: { uptimeS: Number(process.uptime().toFixed(2)), connected: process.connected === true, hasSend: typeof process.send === 'function', electron: Boolean(process.versions.electron) }, calls: [] };
  const secret = 'synthetic-vault-loop-check';
  const steps = [
    async () => { await vault.vault.set('vault-loop', 'dsh', secret) },
    async () => { if (await vault.vault.get('vault-loop', 'dsh') !== secret) throw Object.assign(new Error('round trip'), { code: 'round_trip_mismatch' }) },
    async () => { if (await vault.vault.get('vault-loop', 'dsh') !== secret) throw Object.assign(new Error('round trip'), { code: 'round_trip_mismatch' }) },
  ];
  for (let n = 0; n < steps.length; n += 1) {
    const started = Date.now();
    try { await steps[n](); result.calls.push({ n, ok: true, ms: Date.now() - started }) }
    catch (error) { result.calls.push({ n, ok: false, code: error?.code ?? 'error', ms: Date.now() - started }) }
  }
  try { result.status = vault.status() } catch (error) { result.status = { error: String(error?.code ?? error) } }
  writeFileSync(join(process.env.PERSONA_HOME, 'vault-loop.json'), JSON.stringify(result));
}
`

function prepareHome(home) {
  const profile = join(home, 'home', 'profiles', 'persona')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'rivet-vault-loop.mjs'), PROBE)
  writeFileSync(join(profile, 'cordis.patch.yml'), '- insert:\n    - id: rivet-vault-loop\n      name: ./rivet-vault-loop.mjs\n')
}

async function oneRun(index) {
  const home = mkdtempSync(join(tmpdir(), `persona-vault-loop-${String(index)}-`))
  prepareHome(home)
  const started = Date.now()
  const child = spawn(exe, [], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH', 'VITEST'].includes(name))),
      PERSONA_HOME: join(home, 'home'), DSH_HOME: join(home, 'home'), DSH_PROFILE: 'persona',
      DSH_DESKTOP_USER_DATA_DIR: join(home, 'user'), DSH_TELEMETRY_DISABLED: '1', DSH_DESKTOP_WELCOME: '0', DSH_DESKTOP_UPDATES: '0',
    },
  })
  let log = ''
  child.stdout.on('data', (chunk) => { log = (log + chunk.toString()).slice(-4000) })
  child.stderr.on('data', (chunk) => { log = (log + chunk.toString()).slice(-4000) })
  let exited = false
  child.once('exit', () => { exited = true })
  const proofFile = join(home, 'home', 'vault-loop.json')
  let row
  try {
    while (Date.now() - started < perRunTimeoutMs && !existsSync(proofFile)) {
      if (exited) { row = { i: index, ok: false, error: `the app exited before the vault answered: ${log.slice(-300)}` }; break }
      await new Promise(resolveWait => setTimeout(resolveWait, 250))
    }
    if (row === undefined) {
      if (!existsSync(proofFile)) row = { i: index, ok: false, error: `no vault answer in ${String(perRunTimeoutMs)} ms` }
      else {
        await new Promise(resolveWait => setTimeout(resolveWait, 300)) // the file is written in one call; let it land
        const proof = JSON.parse(readFileSync(proofFile, 'utf8'))
        const calls = proof.calls ?? []
        const ok = calls.length === 3 && calls.every(call => call.ok === true) && proof.status?.available === true && proof.status?.protection === 'dpapi'
        row = { i: index, ok, bootMs: Date.now() - started, trace: proof.trace, status: proof.status, calls }
      }
    }
  } finally {
    if (child.pid !== undefined) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    await new Promise(resolveWait => setTimeout(resolveWait, 1500))
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { rmSync(home, { recursive: true, force: true }); break } catch { await new Promise(resolveWait => setTimeout(resolveWait, 1000)) }
    }
  }
  console.log(JSON.stringify(row))
  return row
}

const results = []
let next = 1
await Promise.all(Array.from({ length: parallel }, async () => {
  for (;;) {
    const index = next
    next += 1
    if (index > runs) return
    results.push(await oneRun(index))
  }
}))
const failed = results.filter(row => row.ok !== true)
const firstCalls = results.map(row => row.calls?.[0]?.ms).filter(value => typeof value === 'number').sort((a, b) => a - b)
const percentile = (p) => (firstCalls.length === 0 ? null : firstCalls[Math.min(firstCalls.length - 1, Math.floor(p * firstCalls.length))])
const summary = { exe, runs: results.length, parallel, failed: failed.length, firstCallMs: { min: firstCalls[0] ?? null, p50: percentile(0.5), p95: percentile(0.95), max: firstCalls.at(-1) ?? null }, ok: failed.length === 0 && results.length === runs }
console.log(JSON.stringify(summary))
writeFileSync(join(out, 'vault-loop.json'), `${JSON.stringify({ summary, results: results.sort((a, b) => a.i - b.i) }, null, 2)}\n`)
process.exit(summary.ok ? 0 : 1)

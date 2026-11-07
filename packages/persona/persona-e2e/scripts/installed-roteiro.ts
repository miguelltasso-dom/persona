/**
 * Roteiro of the INSTALLED fake run on a new NSIS (Keel 04/11: "prepare o roteiro para rodar no Setup assim que o Rivet avisar").
 * One command, under the `build` lock (install + app boots are heavy; one at a time):
 *
 *   node scripts/persona/with-lock.mjs "Probe installed fake <hash>" -- node --import tsx/esm packages/persona/persona-e2e/scripts/installed-roteiro.ts --commit <hash> [--setup C:\p8c\Persona-Setup.exe] [--dir C:\p8i]
 *
 *   1. identity of the Setup (sha256, bytes, mtime) — the line Keel needs to know WHICH installer was proven
 *   2. removes a previous install in `--dir` (its own uninstaller, then the folder)
 *   3. silent install (`/S /D=<dir>`), timed
 *   4. identity of `<dir>\Persona.exe` + whether the real-turn limiter literal is inside it (`scanForTurnCap`)
 *   5. `mandatory-first-delivery-installed.spec.ts` with PERSONA_E2E=1 / PERSONA_INSTALLED_EXE / PERSONA_NSIS_COMMIT:
 *        happy path with the limiter (CAP=1), the FULL D-079 conversation (a/b/c/d) and the no-AI path
 *   6. reads the three `proof.json` and writes `artifacts/first-delivery/installed-roteiro.json` + prints the verdict line for Keel
 *
 * It spends NO model turn (fake CLI) and does not start the real run: that needs Keel's explicit OK (D-069). Flags:
 * `--skip-install` (reuse `--dir`), `--skip-tests` (install + identity only).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { exeIdentity } from '../src/exe-identity.ts'
import { v11FlagsOn, type HostFlags } from '../src/host-flags.ts'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { scanForTurnCap } from '../src/turn-cap.ts'

interface Args {
  readonly setup: string
  readonly dir: string
  readonly commit: string
  readonly skipInstall: boolean
  readonly skipTests: boolean
}

function parseArgs(argv: readonly string[]): Args {
  const value = (flag: string, fallback: string): string => {
    const index = argv.indexOf(flag)
    return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1]! : fallback
  }
  const commit = value('--commit', '')
  if (commit === '') {
    console.error('missing --commit <hash of the NSIS candidate>: the proofs must say which build they ran on')
    process.exit(2)
  }
  return {
    setup: value('--setup', 'C:\\p8c\\Persona-Setup.exe'),
    dir: value('--dir', 'C:\\p8i'),
    commit,
    skipInstall: argv.includes('--skip-install'),
    skipTests: argv.includes('--skip-tests'),
  }
}

const log = (line: string): void => { console.log(`[installed-roteiro] ${line}`) }

async function sha256Of(file: string): Promise<string> {
  const { createHash } = await import('node:crypto')
  const { createReadStream } = await import('node:fs')
  const hash = createHash('sha256')
  await new Promise<void>((done, fail) => {
    const stream = createReadStream(file)
    stream.on('data', (chunk) => { hash.update(chunk) })
    stream.on('end', () => { done() })
    stream.on('error', fail)
  })
  return hash.digest('hex')
}

function removePreviousInstall(dir: string): void {
  if (!existsSync(dir)) return
  const uninstaller = readdirSync(dir).find(name => /^Uninstall.*\.exe$/iu.test(name))
  if (uninstaller !== undefined) {
    const started = Date.now()
    log(`uninstalling the previous install in ${dir} (${uninstaller})`)
    // `_?=<dir>` makes the NSIS uninstaller run in place and block until done (it must be the LAST argument).
    spawnSync(join(dir, uninstaller), ['/S', `_?=${dir}`], { stdio: 'inherit', windowsHide: true })
    log(`uninstall finished in ${String(Math.round((Date.now() - started) / 1000))} s`)
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 })
  if (existsSync(dir)) throw new Error(`could not remove ${dir} (is a Persona.exe still running from it? run scripts/persona/reap-orphans.mjs)`)
}

function installSilently(setup: string, dir: string): number {
  const started = Date.now()
  log(`silent install: ${setup} /S /D=${dir}`)
  // NSIS: `/D=` must be the last argument, unquoted.
  const result = spawnSync(setup, ['/S', `/D=${dir}`], { stdio: 'inherit', windowsHide: true })
  const seconds = Math.round((Date.now() - started) / 1000)
  log(`installer exited with code ${String(result.status)} after ${String(seconds)} s`)
  if (result.status !== 0) throw new Error(`the installer exited with code ${String(result.status)}`)
  return seconds
}

interface ProofSummary {
  readonly name: string
  readonly file: string
  readonly exists: boolean
  readonly stage?: string | undefined
  readonly sameExe?: boolean | undefined
  readonly error?: string | undefined
  readonly extra?: Record<string, unknown> | undefined
}

function readProof(name: string, sha256: string): ProofSummary {
  const file = join(ARTIFACTS_DIR, 'first-delivery', name, 'proof.json')
  if (!existsSync(file)) return { name, file, exists: false }
  try {
    const proof = JSON.parse(readFileSync(file, 'utf8')) as {
      outcome?: { stage?: string; error?: string; leak1?: { leaked?: string[] } }
      exeIdentity?: { sha256?: string }
      fakeCliTurns?: number
      messages?: unknown[]
      turnCap?: { ledger?: { turns?: number; valid?: boolean } }
      hostFlags?: HostFlags | null
    }
    return {
      name,
      file,
      exists: true,
      stage: proof.outcome?.stage,
      sameExe: proof.exeIdentity?.sha256 === sha256,
      error: proof.outcome?.error,
      extra: { fakeCliTurns: proof.fakeCliTurns, messages: proof.messages?.length, limiterTurns: proof.turnCap?.ledger?.turns, limiterValid: proof.turnCap?.ledger?.valid, leak1: proof.outcome?.leak1?.leaked, hostFlags: proof.hostFlags ?? null },
    }
  } catch {
    return { name, file, exists: true, error: 'unreadable proof.json' }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  // `--unpacked`: run against a `win-unpacked` folder (same bits as the Setup, no registry key, no install): there is NO Setup to identify.
  const unpacked = process.argv.includes('--unpacked')
  let setup: { path: string; bytes: number; mtime: string; sha256: string }
  if (unpacked) {
    setup = { path: '(unpacked: no Setup)', bytes: 0, mtime: '', sha256: 'n/a' }
    log(`unpacked run in ${args.dir} (no Setup involved)`)
  } else {
    if (!existsSync(args.setup)) throw new Error(`no installer at ${args.setup}`)
    const setupInfo = statSync(args.setup)
    setup = { path: args.setup, bytes: setupInfo.size, mtime: setupInfo.mtime.toISOString(), sha256: await sha256Of(args.setup) }
    log(`Setup ${setup.path}: ${String(setup.bytes)} bytes, sha256 ${setup.sha256}, mtime ${setup.mtime}`)
  }

  let installSeconds: number | null = null
  if (!args.skipInstall && !unpacked) {
    removePreviousInstall(args.dir)
    installSeconds = installSilently(args.setup, args.dir)
  }
  const exe = join(args.dir, 'Persona.exe')
  if (!existsSync(exe)) throw new Error(`no ${exe} after the install`)
  process.env.PERSONA_NSIS_COMMIT = args.commit
  const identity = await exeIdentity(exe)
  const scanStarted = Date.now()
  const limiter = scanForTurnCap(exe, 300_000)
  log(`exe sha256 ${identity.sha256} (${String(identity.bytes)} bytes); limiter literal in the exe: ${String(limiter.found)} (${limiter.file ?? 'not found'}; owner package checked: ${String(limiter.ownerPackageChecked)}; scan ${String(Date.now() - scanStarted)} ms)`)

  let vitestExit: number | null = null
  if (!args.skipTests) {
    const repoRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
    log('running mandatory-first-delivery-installed.spec.ts (chat + CAP=1 refusal + full D-079 a/b/c/d + no-AI)')
    const run = spawnSync('pnpm', ['exec', 'vitest', 'run', 'packages/persona/persona-e2e/tests/mandatory-first-delivery-installed.spec.ts'], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: true,
      // `--v11`: the exe carries the v1.1 fixes, so the empty-channel line ("Ainda não há ninguém na equipe…") is asserted too.
      env: { ...process.env, PERSONA_E2E: '1', PERSONA_INSTALLED_EXE: exe, PERSONA_NSIS_COMMIT: args.commit, ...(process.argv.includes('--v11') ? { PERSONA_E2E_V11: '1' } : {}) },
    })
    vitestExit = run.status
  }

  const proofs = ['installed-happy', 'installed-d079', 'installed-no-engine'].map(name => readProof(name, identity.sha256))
  // The CORE of the "fake verde" that unlocks the real run: the first delivery (happy) and the no-AI path on THIS exe. The D-079 conversation is reported on its own.
  const isCore = (name: string): boolean => name !== 'installed-d079'
  const coreGreen = proofs.filter(proof => isCore(proof.name)).every(proof => proof.exists && proof.stage === 'passed' && proof.sameExe === true)
  const d079 = proofs.find(proof => proof.name === 'installed-d079')
  const d079Green = d079?.exists === true && d079.stage === 'passed' && d079.sameExe === true
  // KNOWN on the H2 base (Keel/Bolt, 05/11): (a) "obrigado" in a channel WITHOUT any persona ("Monte sua equipe") was met with silence; fixed in the v1.1 tree
  // ("Ainda não há ninguém na equipe para responder…"). It does not block the real run.
  const d079Known = d079?.exists === true && d079.stage === 'FAILED' && /\(a\) "obrigado"/u.test(d079.error ?? '')
  // LEAK-1 (Muse): the internal first-delivery prompt visible in #geral. The core proofs stay green (the real run is not blocked by it); it is reported on its own.
  const leaked = (proofs.find(proof => proof.name === 'installed-happy')?.extra?.leak1 as string[] | undefined) ?? []
  // TEAM-15 (Anvil): the exe prints its four v1.1 switches at boot; launched WITHOUT any flag variable, the line must show all four ON with the production defaults.
  const hostFlags = (proofs.find(proof => proof.name === 'installed-happy')?.extra?.hostFlags ?? null) as HostFlags | null
  const flagsOn = v11FlagsOn(hostFlags ?? undefined)
  const green = coreGreen && d079Green && leaked.length === 0 && vitestExit === 0 && (!process.argv.includes('--v11') || flagsOn)
  const open = [
    ...(process.argv.includes('--v11') && !flagsOn ? ['FLAGS (TEAM-15): a linha de boot não mostra as 4 funções ligadas com defaults=production'] : []),
    ...(leaked.length > 0 ? ['LEAK-1 aberto'] : []),
    ...(d079Known ? ['D-079 (a) CONHECIDO: canal sem equipe, corrigido no tree da v1.1'] : []),
  ]
  // `--v11`: the NEXT exe carries the v1.1 fixes (Bolt: a channel without a team answers "Ainda não há ninguém na equipe…"; LEAK-1 closed): neither is tolerated any more.
  const strict = process.argv.includes('--v11')
  const softGreen = !strict && coreGreen && (d079Green || d079Known)
  const verdict = {
    when: new Date().toISOString(),
    commit: args.commit,
    setup,
    installDir: args.dir,
    installSeconds,
    exe: identity,
    limiterInExe: limiter,
    vitestExit,
    proofs,
    leak1: leaked,
    hostFlags,
    flagsOn,
    knownOpen: open,
    strict,
    verdict: args.skipTests ? 'INSTALL-ONLY'
      : green ? 'PASSOU'
        : softGreen ? `PASSOU (${open.join('; ')})`
          : coreGreen ? `FALHOU (${[...(d079Green ? [] : ['D-079']), ...(leaked.length > 0 ? ['LEAK-1'] : []), ...(process.argv.includes('--v11') && !flagsOn ? ['FLAGS'] : [])].join('; ') || 'testes'})`
            : 'FALHOU',
  }
  mkdirSync(join(ARTIFACTS_DIR, 'first-delivery'), { recursive: true })
  writeFileSync(join(ARTIFACTS_DIR, 'first-delivery', 'installed-roteiro.json'), `${JSON.stringify(verdict, null, 2)}\n`)
  const proofLine = proofs.map(proof => `${proof.name}=${proof.exists ? String(proof.stage) : 'sem proof'}${proof.sameExe === false ? '(OUTRO exe!)' : ''}`).join(', ')
  log(`VEREDITO ${verdict.verdict} — hash ${args.commit}; Setup sha256 ${setup.sha256}; exe sha256 ${identity.sha256}; limitador no exe: ${String(limiter.found)}; ${proofLine}`)
  process.exitCode = verdict.verdict.startsWith('FALHOU') ? 1 : 0
  if (leaked.length > 0) log(`LEAK-1 ABERTO: ${leaked.join('; ')}`)
}

main().catch((error: unknown) => {
  console.error(`[installed-roteiro] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

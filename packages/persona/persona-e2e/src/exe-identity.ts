/**
 * Identity of the installed `Persona.exe` under test, so a proof can say WHICH build it ran on and the real-engine run can
 * refuse to start unless the fake-CLI run went green on the very same bytes (Atlas D-069 prerequisite).
 */
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ARTIFACTS_DIR } from './paths.ts'

export interface ExeIdentity {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
  /** Commit of the NSIS candidate (`PERSONA_NSIS_COMMIT`, e.g. `a1dccb5f8f`), when the operator declared it. */
  readonly nsisCommit: string | null
}

/**
 * @param exe - Path to the installed `Persona.exe`.
 * @returns Size and SHA-256 of the binary plus the declared NSIS commit.
 */
export async function exeIdentity(exe: string): Promise<ExeIdentity> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(exe)
    stream.on('data', (chunk) => { hash.update(chunk) })
    stream.on('end', () => { resolve() })
    stream.on('error', reject)
  })
  const nsisCommit = (process.env.PERSONA_NSIS_COMMIT ?? '').trim()
  return { path: exe, bytes: statSync(exe).size, sha256: hash.digest('hex'), nsisCommit: nsisCommit === '' ? null : nsisCommit }
}

/** Where the installed fake-CLI happy-path proof lives. */
export const INSTALLED_FAKE_PROOF = join(ARTIFACTS_DIR, 'first-delivery', 'installed-happy', 'proof.json')

/**
 * The prerequisite of the real run: the installed fake-CLI happy path passed on THIS exe (same sha256).
 * @param identity - Identity of the exe about to be used for the real run.
 * @returns `undefined` when satisfied, otherwise why not.
 */
export function fakeGreenProblem(identity: ExeIdentity): string | undefined {
  if (!existsSync(INSTALLED_FAKE_PROOF)) return `no fake-CLI proof at ${INSTALLED_FAKE_PROOF}: run mandatory-first-delivery-installed.spec.ts on this exe first`
  let proof: { outcome?: { stage?: string }; exeIdentity?: { sha256?: string } }
  try {
    proof = JSON.parse(readFileSync(INSTALLED_FAKE_PROOF, 'utf8')) as typeof proof
  } catch {
    return 'the fake-CLI proof is unreadable'
  }
  if (proof.outcome?.stage !== 'passed') return `the fake-CLI run on the installed exe did not pass (stage=${String(proof.outcome?.stage)})`
  if (proof.exeIdentity?.sha256 !== identity.sha256) return 'the fake-CLI proof is from a different exe build (sha256 differs): rerun the fake on this NSIS'
  return undefined
}

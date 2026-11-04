/**
 * Acceptance from persona-spec/WAVE2.md (BRIEFING item 17, Atlas 03/11/2026).
 * Priority: assuntos (1) + multi-conta (3) first; ensinar (2) after capture spike.
 * Start as `it.todo`; promote as Forge/Anvil (Thread/subject, context compile, skills),
 * Rivet (multi-account policy, isolated CLI homes, desktop capture), Prism/Lumen (UI), Muse (a11y/colors).
 * Prefer fake runners + disposable PERSONA_HOME — no real AI spend.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const runApp = process.env.PERSONA_E2E === '1'

describe('mandatory wave2 — assuntos coloridos (WAVE2 §1)', () => {
  describe.skipIf(!runApp)('W2 layer 2 partial (#geral SubjectBar)', () => {
    it('[W2-1 partial · Prism] SubjectBar smoke on #geral (3 assuntos still todo)', () => {
      runVitestSubprocess('packages/persona/persona-e2e/tests/real-gallery-wave2-subjects.spec.ts', [], {
        inheritPersonaE2e: true,
      })
    }, 420_000)
  })

  it(
    '[W2-1a · Forge+Anvil+Prism] same DM: create 3 assuntos (nome + cor); each keeps separate message history after switch',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-wave2-host.spec.ts', ['-t', 'W2-1a']) },
    300_000,
  )

  it(
    '[W2-1b · Forge+Prism] new message and persona reply stay on the active assunto; unread/working indicators per assunto',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-wave2-host.spec.ts', ['-t', 'W2-1b']) },
    300_000,
  )

  /** W2-1c: {@link ./mandatory-wave2-contract.spec.ts} (subject-context.spec.ts). */

  it(
    '[W2-1d · Lumen+Forge] ticket/card on project board shows origin assunto color + name when created from that thread (host: the Tarefa and its card carry the origin assunto)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-wave2-host.spec.ts', ['-t', 'W2-1d']) },
    300_000,
  )

  it.skipIf(process.env.PERSONA_E2E !== '1')(
    '[W2-1d · Lumen+Forge] ticket/card on project board shows origin assunto name (app: the card on Quadros says which assunto it came from)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/real-byc-w2-app.spec.ts', ['-t', 'W2-1d'], { inheritPersonaE2e: true }) },
    900_000,
  )

  it.skipIf(process.env.PERSONA_E2E !== '1')(
    '[W2-1e · Prism+Muse+Probe] keyboard: roving assunto chips, rename/archive, move message to another assunto; never color-only label',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/real-byc-w2-app.spec.ts', ['-t', 'W2-1e'], { inheritPersonaE2e: true }) },
    900_000,
  )
})

describe('mandatory wave2 — várias contas por provedor (WAVE2 §3)', () => {
  it(
    '[W2-3a · Rivet+Anvil] Connections UI: two fake accounts same CLI provider with labels; isolated config dirs; both show status/quota when available',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-wave2-host.spec.ts', ['-t', 'W2-3a']) },
    300_000,
  )

  /** W2-3b/c fixed+ask+next: {@link ./mandatory-wave2-contract.spec.ts} resolve-runner WAVE2 test. */

  it(
    '[W2-3d · Rivet] policy "dividir": alternates or balances by remaining official quota across linked accounts (fake quota fixtures; core account-policy split_balance)',
    () => { runVitestSubprocess('packages/persona/persona-core/tests/account-policy.spec.ts', ['-t', 'split_balance']) },
    300_000,
  )

  it.skipIf(process.env.PERSONA_E2E !== '1')(
    '[W2-3d · Rivet+Lumen] policy "dividir" is selectable in Conexões, reaches the host and survives a reload (app)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/real-byc-w2-app.spec.ts', ['-t', 'W2-3b/c/d'], { inheritPersonaE2e: true }) },
    900_000,
  )

  it.skipIf(process.env.PERSONA_E2E !== '1')(
    '[W2-3e · Lumen+Prism] Uso e limites + persona card show consumption and active account per persona',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/real-byc-w2-app.spec.ts', ['-t', 'W2-3e'], { inheritPersonaE2e: true }) },
    900_000,
  )
})

describe('mandatory wave2 — ensinar a persona (WAVE2 §2; after capture spike)', () => {
  it(
    '[W2-2a · Rivet] synthetic short desktop capture fixture → local artifact under persona/project retention; no upload without explicit share',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-wave2-host.spec.ts', ['-t', 'W2-2a']) },
    300_000,
  )

  /** W2-2b/c draft candidate: {@link ./mandatory-wave2-contract.spec.ts} teach-skill.spec.ts. */

  it(
    '[W2-2c · Forge] E2E: user review flow before skill activation (UI); contract covers disabled draft + no tool expansion',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-wave2-host.spec.ts', ['-t', 'W2-2c']) },
    300_000,
  )

  it(
    '[W2-2d · Prism+Muse] consent screen before record; blur-region option; private DM/project cannot promote to public skill without explicit action',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-wave2-host.spec.ts', ['-t', 'W2-2d']) },
    300_000,
  )
})

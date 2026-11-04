/**
 * Host-level first delivery through the REAL runner stack (PersonaRunners → OAR → CLI process) with the FAKE CLI.
 * Wraps `persona-host/scripts/first-delivery-real-cli.ts` (which has the evidence verifier and the 3-call budget) after
 * pinning every OAR binary to the stubs, so it can never reach a real engine. Spends nothing.
 *
 *   node --import tsx/esm packages/persona/persona-e2e/scripts/first-delivery-fake-host.ts
 *
 * The inner script writes `artifacts/first-delivery-real-cli.json` and exits non-zero when `broke` is not empty.
 */
import { withFakeCliOnPath } from '../src/fake-cli.ts'

const scope = withFakeCliOnPath({
  turnMs: Number(process.env.FAKE_CLI_TURN_MS ?? '1500'),
  reply: process.env.FAKE_CLI_REPLY
    ?? 'Resumo da Agência Ponto em 5 pontos: estúdio de sites para PMEs; cliente Padaria Lua; objetivo: divulgar o cardápio; prazo a definir. Tarefa da semana: revisar o texto do cardápio (dona: Coordenação; pronto quando revisado).',
})
process.env.PERSONA_REAL_CLI = '1'
delete process.env.VITEST
process.stderr.write(`[fake-host] OAR pinned to ${process.env.OAR_CLAUDE_BIN ?? '?'}\n`)
try {
  await import('../../persona-host/scripts/first-delivery-real-cli.ts')
} finally {
  scope.restore()
}

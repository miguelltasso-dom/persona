/**
 * Diagnostic: what does `detectConnections()` say with (a) no engine visible and (b) the fake CLI on PATH? Spends nothing.
 *
 *   node --import tsx/esm packages/persona/persona-e2e/scripts/detect-connections-diag.ts
 *
 * Measured 04/11: with NO engine every card says `installed=true` and `opencode` says `loggedIn=true` (probeCli forces
 * `binary.ok` when an OAR runtime exists), and detection takes ~27 s (10 s with the fake): the step 3 cards and the
 * step 5 "Falta uma IA" gate wait on it.
 */
import { detectConnections, resetConnectionCache } from '../../persona-runners/src/resolve/connections.ts'
import { withFakeCliOnPath, withNoEngineOnPath } from '../src/fake-cli.ts'

type Cards = Awaited<ReturnType<typeof detectConnections>>

function show(label: string, cards: Cards, ms: number): void {
  console.log(`\n== ${label} (${String(ms)} ms)`)
  for (const card of cards) {
    console.log(`${card.id.padEnd(9)} installed=${String(card.installed).padEnd(5)} loggedIn=${String(card.loggedIn).padEnd(5)} version=${card.version ?? '-'} error=${card.error?.code ?? '-'} authUnknown=${String(card.authUnknown ?? false)}`)
  }
}

{
  const scope = withNoEngineOnPath()
  resetConnectionCache()
  const startedAt = Date.now()
  const cards = await detectConnections({ force: true })
  show('NO ENGINE VISIBLE', cards, Date.now() - startedAt)
  scope.restore()
}
{
  const scope = withFakeCliOnPath()
  resetConnectionCache()
  const startedAt = Date.now()
  const cards = await detectConnections({ force: true })
  show('FAKE CLI ON PATH', cards, Date.now() - startedAt)
  console.log(scope.invocations().slice(0, 12).map(call => `  ${call.tool} ${call.argv.join(' ')}`).join('\n'))
  scope.restore()
}

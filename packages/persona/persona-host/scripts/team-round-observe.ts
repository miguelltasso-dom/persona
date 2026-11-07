/**
 * TEAM-10 observer — command line (Forge, 05/11; module moved 07/11). Thin shell: the observer itself (`readRoundEvidence`, `observeTeamRound`,
 * `observeHome`) lives in `persona-host/tests/support/team-round-observe.ts`, where the host aggregate type-check (`tsc -p tsconfig.host.json`) can
 * see it (`persona-host` is a REFERENCED project there, `rootDir: src`, so a spec cannot import from `scripts/`). Arguments, output and exit code are
 * exactly what they were.
 *
 * Reads a COPY of a Persona home's database after the REAL short team round and says — from the DATABASE, not from the screen — whether the REAL
 * model chose the team tools and the host did what it promises. Pure reading: no model call, no write to the home.
 *
 *   node --import tsx/esm packages/persona/persona-host/scripts/team-round-observe.ts <home-dir | persona.db> [--ceiling 14] [--any] [--no-tools] [--no-review]
 *        [--no-opinion] [--no-brief] [--out report.json]
 *
 * `--any` is the NATURAL round (TEAM-10 attempt 2, D-097): any collaboration the model chose passes.
 * Exit 0 only when no problem is left. Fail-closed: a missing piece is a named problem, not a pass.
 */

import { writeFileSync } from 'node:fs'
import { observeHome } from '../tests/support/team-round-observe.ts'

function main(): void {
  const argv = process.argv.slice(2)
  const target = argv.find(arg => !arg.startsWith('--') && argv[argv.indexOf(arg) - 1] !== '--ceiling' && argv[argv.indexOf(arg) - 1] !== '--out')
  if (target === undefined) {
    process.stderr.write('usage: team-round-observe.ts <home-dir | persona.db> [--ceiling 14] [--any] [--no-tools] [--no-review] [--no-opinion] [--no-brief] [--out report.json]\n')
    process.exit(2)
  }
  const ceiling = argv.includes('--ceiling') ? Number(argv[argv.indexOf('--ceiling') + 1]) : 14
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : undefined
  const result = observeHome(target, {
    ceilingTurns: Number.isFinite(ceiling) ? ceiling : 14,
    requireTools: !argv.includes('--no-tools'), requireReview: !argv.includes('--no-review'),
    requireOpinion: !argv.includes('--no-opinion'), requireBrief: !argv.includes('--no-brief'),
    anyCollaboration: argv.includes('--any'),
  })
  const f = result.facts
  process.stdout.write([
    `requests   tool(help ${String(f.requests.byTool.help)}, next ${String(f.requests.byTool.next)}) · words ${String(f.requests.byWords)} · plan ${String(f.requests.byPlan)} · review steps ${String(f.requests.reviewSteps)}`,
    `bilhete    reached the colleague ${String(f.bilhete.reachedColleague)}/${String(f.bilhete.requests)} · lines of the thread with a bilhete ${String(f.bilhete.inThread)}`,
    `help       asked ${String(f.help.asked)} · resumed ${String(f.help.resumed)} · waiting ${String(f.help.leftWaiting)} · failed ${String(f.help.failed)}`,
    `reviews    ${String(f.reviews.total)} · sealed ${String(f.reviews.sealed)} (verdict by tool ${String(f.reviews.sealedByToolVerdict)}, by words ${String(f.reviews.sealedByWords)}) · unreadable ${String(f.reviews.unreadable)} · engine ${String(f.reviews.engineFailed)}`,
    `opinion    rounds ${String(f.opinion.rounds)} · replies ${String(f.opinion.replies)} (others ${String(f.opinion.repliesFromOthers)}) · consolidated ${String(f.opinion.consolidated)} · with image ${String(f.opinion.requestsWithImage)}`,
    `brief      ${f.brief.present ? 'present' : 'absent'} · paid turns at its moment ${String(f.brief.paidTurnsAtItsMoment)}`,
    `ledger     ${String(f.ledger.turns)} turn(s) · measured ${String(f.ledger.measured)} · ceiling ${String(f.ledger.ceiling)}`,
    `team       collaborated ${String(f.collaborated)}`,
    ...result.problems.map(problem => `PROBLEM    ${problem}`),
    result.passed ? 'TEAM ROUND OBSERVED OK' : 'TEAM ROUND NOT PROVEN',
    '',
  ].join('\n'))
  if (out !== undefined && out !== '') writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
  process.exit(result.passed ? 0 : 1)
}

main()

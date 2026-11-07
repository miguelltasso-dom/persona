/**
 * TEAM-10: the reading of the real team round for the person, in tokens and quota (Atlas 05/11; D-092: no money). Read-only: the Persona home's database (and its WAL/SHM) is COPIED to a scratch
 * directory and the copy is queried, exactly like the Probe's evidence reader, so the evidence stays as the app left it. Zero model, zero network.
 *
 *   node --import tsx/esm packages/persona/persona-engine/scripts/team10-reading.ts --home <PERSONA_HOME> \
 *     --quota-before <quota-read.json> --quota-after <quota-read.json> [--since <ISO>] [--until <ISO>] [--tokens-per-point <min>,<max>] \
 *     [--budget persona-spec/reports/team10-budget-dry.json] [--out persona-spec/reports/team10-reading.md] [--incomplete "<why the round stopped early>"]
 *
 * `--incomplete` is for a round that stopped before its end (the Probe's verdict says so): the band registered before the data is for a WHOLE round, so a short round must not read
 * as "inside/below the budget": the sentence says the round was incomplete and why, and what it did spend.
 *
 * `--since/--until` bound the ledger to the round (the home may hold older turns). `--tokens-per-point` is only for an account whose week is already calibrated (the host's
 * `accountForEstimate` gives it); without it the quota is read as the official meter says it, in whole points.
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { renderTeam10Technical, team10Reading, type Team10Budget, type Team10Calibration, type Team10Quota, type Team10Turn } from '../src/bench/team10-reading.ts'

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 ? process.argv[at + 1] : undefined
}

function readTurns(home: string, since: string | undefined, until: string | undefined): Team10Turn[] {
  const source = join(home, 'db', 'persona.db')
  if (!existsSync(source)) throw new Error(`no database at ${source}`)
  const scratch = mkdtempSync(join(tmpdir(), 'persona-team10-reading-'))
  try {
    const copy = join(scratch, 'persona.db')
    copyFileSync(source, copy)
    for (const suffix of ['-wal', '-shm']) {
      if (!existsSync(source + suffix)) continue
      try {
        copyFileSync(source + suffix, copy + suffix)
      } catch (error) {
        // A live host keeps `-shm` locked on Windows; it is rebuilt from the WAL. The WAL itself must copy.
        if (suffix !== '-shm') throw error
      }
    }
    const db = new DatabaseSync(copy)
    try {
      const rows = db.prepare('SELECT * FROM turn_ledger ORDER BY at').all() as Record<string, unknown>[]
      return rows
        .filter(row => (since === undefined || String(row.at) >= since) && (until === undefined || String(row.at) <= until))
        .map((row): Team10Turn => ({
          kind: String(row.kind),
          inputTokens: Number(row.input_tokens),
          outputTokens: Number(row.output_tokens),
          cacheReadTokens: Number(row.cache_read_tokens),
          cacheWriteTokens: Number(row.cache_write_tokens),
          origin: row.origin === null || row.origin === undefined ? null : String(row.origin),
          envMode: row.env_mode === null || row.env_mode === undefined ? null : String(row.env_mode),
          envModeReason: row.env_mode_reason === null || row.env_mode_reason === undefined ? null : String(row.env_mode_reason),
        }))
    } finally {
      db.close()
    }
  } finally {
    try { rmSync(scratch, { recursive: true, force: true }) } catch (error) { void error }
  }
}

const readQuota = (path: string | undefined): Team10Quota | undefined => (path === undefined ? undefined : JSON.parse(readFileSync(path, 'utf8')) as Team10Quota)

const home = flag('home')
if (home === undefined) throw new Error('--home <PERSONA_HOME> is required')
const budgetPath = flag('budget') ?? 'persona-spec/reports/team10-budget-dry.json'
const dry = JSON.parse(readFileSync(budgetPath, 'utf8')) as { turns12?: { turns?: number; totalInputMin?: number; totalInputMax?: number } }
const budget: Team10Budget | undefined = dry.turns12?.totalInputMin === undefined || dry.turns12.totalInputMax === undefined
  ? undefined
  : { turns: dry.turns12.turns ?? 11, totalInputMin: dry.turns12.totalInputMin, totalInputMax: dry.turns12.totalInputMax, expectedInput: 120_000 }
const perPoint = flag('tokens-per-point')?.split(',').map(Number)
const calibrations: Team10Calibration[] = perPoint !== undefined && perPoint.length === 2 && perPoint.every(Number.isFinite)
  ? [{ window: 'week', tokensPerPoint: { min: Math.min(...perPoint), max: Math.max(...perPoint) } }]
  : []
const before = readQuota(flag('quota-before'))
const after = readQuota(flag('quota-after'))
const reading = team10Reading({
  turns: readTurns(home, flag('since'), flag('until')),
  ...(before === undefined ? {} : { before }),
  ...(after === undefined ? {} : { after }),
  ...(budget === undefined ? {} : { budget }),
  ...(calibrations.length === 0 ? {} : { calibrations }),
})
const incomplete = flag('incomplete')
// The person's sentence: an incomplete round never reads as a pass of the budget band (the band is for a whole round).
const personText = incomplete === undefined || budget === undefined
  ? reading.text
  : reading.text.replace(/Isso (ficou|passou)[^()]*\([^)]*\)\./u, `Mas foi uma rodada incompleta (${incomplete}): a faixa prevista (${String(Math.round(budget.totalInputMin / 1000))} mil a ${String(Math.round(budget.totalInputMax / 1000))} mil) vale para a rodada inteira, de cerca de ${String(budget.turns)} chamadas; o número acima é só o que ela chegou a gastar.`)
const text = renderTeam10Technical(reading).replace(reading.text, personText)
const out = flag('out')
if (out === undefined) process.stdout.write(`${text}\n`)
else {
  writeFileSync(out, `${text}\n`)
  process.stdout.write(`${personText}\n(wrote ${out})\n`)
}

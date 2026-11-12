/**
 * Dry proof for item 24 (colheita): the dedicated station on THIS machine, with no model and no network.
 *
 * Issues a pairing code and redeems it, holds Windows awake and releases it, reads the real free memory and decides an
 * admission, and reports what Tailscale looks like here. Prints one JSON; nothing leaves the machine.
 *
 * Usage: pnpm exec tsx scripts/persona/station-dry.ts [--json <path>]
 */

import { freemem } from 'node:os'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAM_FLOOR_BYTES, RAM_PER_CLI_BYTES } from '../../packages/persona/persona-host/src/station/admission.ts'
import { PairingBook } from '../../packages/persona/persona-host/src/station/pairing.ts'
import { PowerKeeper } from '../../packages/persona/persona-host/src/station/power.ts'
import { Station } from '../../packages/persona/persona-host/src/station/station.ts'
import { readTailscale } from '../../packages/persona/persona-host/src/station/tailscale.ts'

const jsonAt = process.argv.indexOf('--json')
const outPath = (jsonAt >= 0 ? process.argv[jsonAt + 1] : undefined) ?? join('.maestri', 'tmp', 'station-dry.json')

const pairing = new PairingBook()
const power = new PowerKeeper()
const station = new Station({ pairing, power, freeBytes: () => freemem() })
const steps: Array<Record<string, unknown>> = []

const issued = station.issueCode()
steps.push({ step: 'codigo', code: issued.code, expiresAt: issued.expiresAt })
steps.push({ step: 'parear', result: station.redeem(issued.code) })
steps.push({ step: 'parear-de-novo', result: station.redeem(issued.code) })
steps.push({ step: 'estado-depois-de-parear', view: await station.view() })

const free = freemem()
steps.push({
  step: 'admissao',
  freeBytes: free,
  floorBytes: RAM_FLOOR_BYTES,
  perCliBytes: RAM_PER_CLI_BYTES,
  result: station.admitTurn(),
  power: power.state(),
})
station.noteTurnEnded(0)
steps.push({ step: 'fila-vazia', power: power.state() })

steps.push({ step: 'tailscale', status: await readTailscale() })

const result = {
  note: 'estacao dedicada: pareamento, Windows acordado so com trabalho, RAM real e Tailscale; sem modelo e sem rede',
  steps,
}
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify(result, null, 2))

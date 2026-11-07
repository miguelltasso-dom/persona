/**
 * Dry (zero model): print the prompt the Persona worker really receives on the OPT-8b task (the host as wired), its size in characters and in
 * estimated tokens, line by line, so a cut can be argued from the text itself. Writes the text to --out when given.
 *
 *   node --import tsx/esm packages/persona/persona-engine/scripts/worker-prompt-dump.ts [--out <file.txt>]
 */
import { writeFileSync } from 'node:fs'
import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import { buildPairRealBPlan } from '../src/bench/pair-real-b.ts'
import { PAIR_REAL_TASK } from '../src/bench/pair-real.ts'

const plan = buildPairRealBPlan()
const direct = plan.calls.find(call => call.cell === 'direct-cold')?.prompt ?? ''
const persona = plan.calls.find(call => call.cell === 'persona-cold')?.prompt ?? ''
process.stdout.write(`direct: ${String(direct.length)} chars ~${String(estimateTokens(direct))} tok\n`)
process.stdout.write(`persona: ${String(persona.length)} chars ~${String(estimateTokens(persona))} tok (extra ~${String(estimateTokens(persona) - estimateTokens(direct))})\n`)
process.stdout.write(`task prompt in persona prompt: ${String(persona.includes(PAIR_REAL_TASK.prompt))}\n\n`)
persona.split('\n').forEach((line, index) => { process.stdout.write(`${String(index + 1).padStart(3)} [${String(estimateTokens(line)).padStart(3)}] ${line}\n`) })
const at = process.argv.indexOf('--out')
if (at >= 0 && process.argv[at + 1] !== undefined) writeFileSync(process.argv[at + 1] as string, persona)

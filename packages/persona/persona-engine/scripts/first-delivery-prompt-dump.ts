/**
 * Dry (zero model): the prompt the host really sends for the answer-only route (the first delivery): `firstDeliveryExecutionPrompt` composed by the
 * orchestration, and then wrapped by the runner session (`prefixOwnerNorms`, role worker). Prints how many times the worker template and the owner
 * norms appear and the size in characters / estimated tokens, so a duplicated block is visible in numbers.
 *
 *   node --import tsx/esm packages/persona/persona-engine/scripts/first-delivery-prompt-dump.ts [--out <file.txt>]
 */
import { writeFileSync } from 'node:fs'
import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import { prefixOwnerNorms } from '../../persona-runners/src/proactivity/owner-prompt.ts'
import { firstDeliveryExecutionPrompt, firstDeliveryTask } from '../src/first-delivery.ts'

const task = firstDeliveryTask({ companyBrief: 'Padaria Estrela: pães artesanais, entrega local, 3 funcionários.', executorName: 'Nina' })
const inner = firstDeliveryExecutionPrompt({
  fields: {
    identity: { name: 'Nina', title: 'Padeira-chefe' },
    personality: 'Calorosa.', instructions: 'Montar cardápios e conferir estoque.', functionLabel: 'Padeira-chefe', vault: '',
    capabilities: 'Primeira entrega em texto. Sem ferramentas, shell ou arquivos. Execute a atribuição diretamente.',
  },
  assignment: task.assignment,
})
const wrapped = prefixOwnerNorms(inner, { id: 'nina', name: 'Nina', title: 'Padeira-chefe', instructions: 'Montar cardápios e conferir estoque.' })
const count = (text: string, needle: string): number => text.split(needle).length - 1
for (const [label, text] of [['firstDeliveryExecutionPrompt (host builds)', inner], ['after prefixOwnerNorms (runner session sends)', wrapped]] as const) {
  process.stdout.write(`${label}: ${String(text.length)} chars ~${String(estimateTokens(text))} tok | worker template x${String(count(text, 'Você executa a Tarefa autorizada'))} | owner norms x${String(count(text, 'Normas de dono'))} | text-only block x${String(count(text, 'apenas uma resposta em texto') + count(text, 'só uma resposta em texto'))}\n`)
}
const at = process.argv.indexOf('--out')
if (at >= 0 && process.argv[at + 1] !== undefined) writeFileSync(process.argv[at + 1] as string, wrapped)

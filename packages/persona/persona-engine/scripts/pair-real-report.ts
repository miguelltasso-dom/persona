/**
 * Turns the two raw real reports (`pair-real.json` from the paired run, `pair-real-base.json` from the single-request calls) into the
 * final `pair-real.md`, `pair-real.json` summary and the calibration `estimateAsk` takes (`persona-spec/baselines/pair-real-calibration.json`).
 * Pure file work: no CLI, no model, no lock. Re-runnable. Counters stay RAW; every derived number says what it is derived from.
 *
 *   node --import tsx/esm packages/persona/persona-engine/scripts/pair-real-report.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calibrationFrom, formatPairRealMarkdown, inputOf, summarizePairReal, type PairRealResult } from '../src/bench/pair-real.ts'
import { TIER_PRICE } from '../src/bench/token-faithful.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const pair = JSON.parse(readFileSync(resolve(root, 'persona-spec/reports/pair-real.json'), 'utf8')) as { readonly results: readonly PairRealResult[] }
const base = JSON.parse(readFileSync(resolve(root, 'persona-spec/reports/pair-real-base.json'), 'utf8')) as {
  readonly calls: readonly { readonly label: string; readonly numTurns?: number; readonly inputTokens?: number; readonly cacheCreationTokens?: number; readonly cacheReadTokens?: number; readonly outputTokens?: number; readonly durationMs?: number; readonly totalCostUsd?: number; readonly estimatedPromptTokens: number }[]
  readonly derived: { readonly vendorBaseTokens: number | null; readonly tokenizerRatio: number | null; readonly vendorBaseRange?: readonly number[] }
}
const results = pair.results

/** Haiku list price shape (cheap tier in the bench): $1 in / $5 out per Mtok; cache read ×0.1, cache write ×1.25. */
function microUsd(row: PairRealResult): number | undefined {
  const total = inputOf(row)
  if (total === undefined || row.outputTokens === undefined) return undefined
  const read = row.cacheReadTokens ?? 0
  const write = row.cacheWriteTokens ?? 0
  const fresh = Math.max(0, total - read - write)
  const price = TIER_PRICE.cheap
  return Math.round(fresh * price.input + read * price.input * 0.1 + write * price.input * 1.25 + row.outputTokens * price.output)
}

const summary = summarizePairReal(results)
const baseTotal = (label: string): number | undefined => {
  const row = base.calls.find(call => call.label === label)
  return row === undefined ? undefined : (row.inputTokens ?? 0) + (row.cacheCreationTokens ?? 0) + (row.cacheReadTokens ?? 0)
}
const a = baseTotal('A-trivial')
const c = baseTotal('C-trivial-again')
const baseTokens = a === undefined || c === undefined ? base.derived.vendorBaseTokens ?? undefined : Math.round((a + c) / 2)
const direct = results.find(row => row.step === 'direct' && row.pass === 'cold')
const directTotal = direct === undefined ? undefined : inputOf(direct)
const innerRequests = directTotal === undefined || baseTokens === undefined ? undefined : Math.round(directTotal / baseTokens)

const calibration = calibrationFrom(results, {
  ...(baseTokens === undefined ? {} : { vendorBaseTokens: baseTokens }),
  ...(base.derived.tokenizerRatio === null ? {} : { tokenizerRatio: base.derived.tokenizerRatio }),
})

const rows = results.map(row => `| ${row.arm} | ${row.step} | ${row.pass} | ${String(inputOf(row) ?? 'n/d')} | ${String(row.outputTokens ?? 'n/d')} | ${String(microUsd(row) ?? 'n/d')} |`)
const baseRows = base.calls.map(call => `| ${call.label} | ${String(call.numTurns ?? 'n/d')} | ${String((call.inputTokens ?? 0) + (call.cacheCreationTokens ?? 0) + (call.cacheReadTokens ?? 0))} | ${String(call.cacheReadTokens ?? 'n/d')} | ${String(call.cacheCreationTokens ?? 'n/d')} | ${String(call.outputTokens ?? 'n/d')} | ${String(call.estimatedPromptTokens)} |`)

const text = [
  formatPairRealMarkdown(results, 'real'),
  '## Leitura (o que isto prova e o que não prova)',
  '',
  '**O contador da rodada é da sessão inteira da CLI, não de um prompt.** A chamada direta somou ' + String(directTotal ?? 'n/d') + ' tokens de entrada para um pedido de uma linha: com a base de uma requisição única medida abaixo (' + String(baseTokens ?? 'n/d') + '), isso é ≈ ' + String(innerRequests ?? 'n/d') + ' requisições internas da CLI (o agente explorou, tentou ferramentas negadas). Por isso a tabela **não compara o desenho dos prompts** (Persona ≈ 0,3–0,5 mil tokens) e sim o comportamento da CLI nesta máquina; a razão entre braços muda de chamada para chamada (a execução da Persona somou ≈ 93 mil, a lente curta quente voltou a 306 mil).',
  '',
  '### Custo estimado por chamada (preço de lista do Haiku: cache lido ×0,1, gravado ×1,25) — µUSD',
  '',
  '| braço | passo | passagem | entrada total | saída | µUSD |',
  '|---|---|---|---:|---:|---:|',
  ...rows,
  '',
  '### Uma requisição única (`claude -p --output-format json`, o que a Persona não controla)',
  '',
  '| chamada | requisições | entrada total | cache lido | cache gravado | saída | prompt estimado |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...baseRows,
  '',
  `- **Base do vendor, uma requisição, nesta máquina: ${String(a ?? 'n/d')}–${String(c ?? 'n/d')} tokens** (sistema + esquema de ferramentas + a memória/skills/MCP da pessoa), não os 12 000 que eu supunha. Só ≈ 45% veio do cache; o resto foi **regravado a cada chamada** (cache gravado ≈ 21–24 mil por chamada, a ×1,25).`,
  `- **Razão do tokenizador (texto neutro em português, uma requisição): ${String(base.derived.tokenizerRatio ?? 'n/d')}×** — o estimador de 4 caracteres por token **subconta ≈ 41%** (≈ 2,3 caracteres por token em português com acentos). Os números absolutos do bench ficam subestimados por esse fator; os cortes relativos entre configurações pouco mudam.`,
  `- **Cache entre sessões frescas:** a sonda depois de 6 min leu ${String(results.find(row => row.step === 'ttl_probe')?.cacheReadTokens ?? 'n/d')} tokens do cache: **o TTL real nesta assinatura é > 5 min** (≥ 6 min). A suposição "TTL 5 min → cache de prefixo 0,00 no dia espaçado" vale no máximo para quem tem TTL de 5 min; aqui o prefixo da base sobrevive.`,
  `- **A triagem custa uma chamada inteira:** triagem fria ${String(results.find(row => row.step === 'triage' && row.pass === 'cold') === undefined ? 'n/d' : inputOf(results.find(row => row.step === 'triage' && row.pass === 'cold')!))} tokens de entrada e ${String(results.find(row => row.step === 'triage' && row.pass === 'cold')?.outputTokens ?? 'n/d')} de saída, ~${String(Math.round((results.find(row => row.step === 'triage' && row.pass === 'cold')?.durationMs ?? 0) / 1000))} s — a mesma ordem de grandeza de uma execução. Pular a triagem (D-073, já ligado) corta uma chamada inteira da CLI, não só um prompt pequeno.`,
  `- **W3 (relato curto):** saída fria ${String(results.find(row => row.arm === 'persona_lean' && row.pass === 'cold')?.outputTokens ?? 'n/d')} contra ${String(results.find(row => row.arm === 'persona' && row.step === 'execution' && row.pass === 'cold')?.outputTokens ?? 'n/d')} (razão ${summary.leanOutputRatio === null ? 'n/d' : summary.leanOutputRatio.toFixed(2)}), mas quente ${String(results.find(row => row.arm === 'persona_lean' && row.pass === 'warm')?.outputTokens ?? 'n/d')} contra ${String(results.find(row => row.arm === 'persona' && row.step === 'execution' && row.pass === 'warm')?.outputTokens ?? 'n/d')} (razão ${summary.leanOutputRatioWarm === null ? 'n/d' : summary.leanOutputRatioWarm.toFixed(2)}). O critério de pronto foi cumprido nos dois braços e nas duas passagens. **Resultado: INCONCLUSIVO** — 1 de 2 pares mostra a economia; n = 1 por célula, com o agente variando de ≈ 90 mil a ≈ 306 mil de entrada entre chamadas parecidas. Não dá para ligar a W3 por este par.`,
  `- **Tempo por chamada medido:** execução ${calibration.secondsPerCall?.execucao === undefined ? 'n/d' : `${String(calibration.secondsPerCall.execucao.min)}–${String(calibration.secondsPerCall.execucao.max)} s`}, triagem ${calibration.secondsPerCall?.triagem === undefined ? 'n/d' : `${String(calibration.secondsPerCall.triagem.min)}–${String(calibration.secondsPerCall.triagem.max)} s`} (entra no \`estimateAsk\`; a conversa curta não foi medida e fica sem tempo).`,
  '',
  '### Chamadas gastas (teto 20, D-070)',
  '',
  `Pareada: 9 (ledger do limitador: ${String(9)} turnos). Uma requisição única: ${String(base.calls.length + 1)} (A, B, C e B de novo com texto neutro, porque o primeiro B virou 4 requisições por ser uma tarefa). Total 13 de 20; o limitador do Rivet estava ligado na pareada (CAP=20, ledger próprio).`,
  '',
].join('\n')

writeFileSync(resolve(root, 'persona-spec/reports/pair-real.md'), text)
writeFileSync(resolve(root, 'persona-spec/reports/pair-real.json'), `${JSON.stringify({ mode: 'real', summary, directInputTotal: directTotal ?? null, innerRequestsOfDirect: innerRequests ?? null, vendorBaseTokens: baseTokens ?? null, tokenizerRatio: base.derived.tokenizerRatio, calibration, results }, null, 2)}\n`)
writeFileSync(resolve(root, 'persona-spec/baselines/pair-real-calibration.json'), `${JSON.stringify({ origin: 'calibrated', source: 'persona-spec/reports/pair-real.json + pair-real-base.json', at: new Date().toISOString().slice(0, 10), calibration }, null, 2)}\n`)
process.stdout.write(`wrote pair-real.md, pair-real.json and baselines/pair-real-calibration.json ${JSON.stringify(calibration)}\n`)

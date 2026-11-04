/** Write OPT-8 and v1-close reports from the scripted gates. */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatOpt8AcceptanceMarkdown, measureOpt8Acceptance } from '../src/token-measure.ts'
import { assertV1Close, formatV1CloseMarkdown } from '../src/v1-close.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const opt8 = resolve(root, 'persona-spec/reports/opt8-acceptance.md')
const v1 = resolve(root, 'persona-spec/reports/v1-close.md')
assertV1Close()
const live = measureOpt8Acceptance({
  baselineTokensPerTask: 100,
  liveEntries: [{
    id: 'e1',
    personaId: 'atlas',
    engine: 'claude',
    kind: 'execution',
    inputTokens: 40,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    layers: { system: 0, tools: 0, required: 0, subject: 0, recall: 0, message: 10 },
    at: '2026-11-04T06:00:00.000Z',
    ticketId: 't1',
  }],
})
writeFileSync(opt8, [
  formatOpt8AcceptanceMarkdown(),
  '## Livro live (fixture −40%)',
  '',
  `Score **${String(live.passed)}/${String(live.total)}**. Falhou: ${live.failed.join(', ') || '—'}. Bloqueado: ${live.blocked.join(', ') || '—'}.`,
  '',
].join('\n'))
writeFileSync(v1, formatV1CloseMarkdown())
process.stdout.write(`wrote ${opt8}\n`)
process.stdout.write(`wrote ${v1}\n`)

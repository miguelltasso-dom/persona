/**
 * Held-out memory/context quality set. No LLM. Measures compileContext,
 * Chain of Recall, contradiction flags, and aging.
 */

import { contradicts, decayMemory, type AgedMemory } from '../domain/aging.ts'
import { recallChain, type RecallNode } from './chain.ts'
import { compileContext } from './index.ts'
import type { CompiledContext, ContextRecord, ContextScope } from './types.ts'

const SCOPE: ContextScope = {
  workspaceId: 'ws',
  projectId: 'hire',
  agentId: 'coord',
  actorId: 'ana',
  audienceId: 'channel:geral',
  policyRevision: 'v1',
}

function record(partial: Partial<ContextRecord> & Pick<ContextRecord, 'id' | 'kind' | 'body'>): ContextRecord {
  return {
    workspaceId: 'ws',
    projectId: 'hire',
    revision: 1,
    status: 'active',
    sourceIds: [],
    ...partial,
  }
}

export interface MemoryQualityCase {
  id: string
  passed: boolean
  detail: string
}

export interface MemoryQualityReport {
  cases: MemoryQualityCase[]
  passed: number
  failed: number
  total: number
  ratio: number
}

function tokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

/**
 * Run the fixed quality set. Numbers belong in the Forge report.
 */
export async function runMemoryQualityEval(): Promise<MemoryQualityReport> {
  const cases: MemoryQualityCase[] = []
  const allow = async (item: { projectId?: string; id?: string }): Promise<boolean> => {
    if (item.projectId !== undefined && item.projectId !== 'hire') return false
    if (item.id === 'mem-dm') return false
    return true
  }

  const compiled: CompiledContext = await compileContext({
    scope: SCOPE,
    budgetTokens: 400,
    countTokens: tokens,
    authorize: allow,
    snapshot: {
      revision: 'r1',
      requiredIds: ['dec-lilas'],
      records: [
        record({ id: 'dec-lilas', kind: 'decision', body: 'Lilás é a cor oficial.', factKey: 'brand.color' }),
        record({ id: 'mem-hire', kind: 'memory', body: 'Candidata Ana enviou o CV.', relevance: 0.9 }),
        record({ id: 'mem-other', kind: 'memory', body: 'Segredo do projeto Site.', projectId: 'web', relevance: 1 }),
        record({ id: 'mem-dm', kind: 'memory', body: 'CNPJ da DM 12.345.678/0001-90.', relevance: 1 }),
      ],
    },
  })
  const text = compiled.text
  cases.push({
    id: 'compile-required-in',
    passed: text.includes('Lilás é a cor oficial.'),
    detail: 'constraint/decision obrigatória entra',
  })
  cases.push({
    id: 'compile-relevant-in',
    passed: text.includes('Candidata Ana enviou o CV.'),
    detail: 'memória do projeto entra',
  })
  cases.push({
    id: 'compile-other-project-out',
    passed: !text.includes('Segredo do projeto Site'),
    detail: 'projeto alheio fica de fora',
  })
  cases.push({
    id: 'compile-dm-out',
    passed: !text.includes('CNPJ') && !text.includes('12.345.678'),
    detail: 'DM não autorizada fica de fora',
  })

  const nodes = new Map<string, RecallNode>([
    ['n1', { id: 'n1', summary: 'Brief', body: 'Lilás oficial', neighborIds: ['n2', 'n-secret'] }],
    ['n2', { id: 'n2', summary: 'CV', body: 'Ana enviou o CV', neighborIds: [] }],
    ['n-secret', { id: 'n-secret', summary: 'DM', body: 'token sk-ant-LEAK', neighborIds: [] }],
  ])
  const hops = await recallChain({
    startId: 'n1',
    scope: SCOPE,
    maxHops: 8,
    load: id => nodes.get(id),
    authorize: async node => node.id !== 'n-secret',
  })
  cases.push({
    id: 'recall-right-in',
    passed: hops.some(hop => hop.id === 'n2') && hops.some(hop => hop.body.includes('Ana')),
    detail: 'cadeia inclui o vizinho autorizado',
  })
  cases.push({
    id: 'recall-secret-out',
    passed: hops.every(hop => hop.id !== 'n-secret') && !JSON.stringify(hops).includes('sk-ant'),
    detail: 'revogação no meio cancela o hop secreto',
  })

  cases.push({
    id: 'contradiction-flagged',
    passed: contradicts('O site não usa lilás.', 'O site usa lilás.')
      && !contradicts('O site usa lilás.', 'O site usa lilás.'),
    detail: 'envelhecimento marca contradição sem LLM',
  })

  let working: AgedMemory = {
    id: 'w1', layer: 'working', body: 'rascunho de hoje', score: 0.3, uses: 0, archived: false,
  }
  for (let i = 0; i < 8; i += 1) working = decayMemory(working)
  cases.push({
    id: 'aging-archives',
    passed: working.archived === true && working.score < 0.05,
    detail: 'memória de trabalho envelhece e arquiva sem LLM',
  })

  const passed = cases.filter(item => item.passed).length
  const total = cases.length
  return { cases, passed, failed: total - passed, total, ratio: passed / total }
}

/**
 * @param report - Quality cells.
 */
export function formatMemoryQualityReport(report: MemoryQualityReport): string {
  const rows = report.cases.map(item => `| ${item.id} | ${item.passed ? 'pass' : 'FAIL'} | ${item.detail} |`)
  return [
    '# Avaliação de memória/contexto (sem LLM)',
    '',
    `| casos | ${String(report.passed)}/${String(report.total)} | razão ${report.ratio.toFixed(2)} |`,
    '',
    '| caso | resultado | o que prova |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}

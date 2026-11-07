import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import { describe, expect, it } from 'vitest'
import {
  FAITHFUL_SCENARIO_IDS,
  LEVERS_AS_WIRED,
  LEVERS_LEGACY,
  LEVERS_OPTIMIZED,
  LEVER_LADDER,
  fitRecall,
  fitSubject,
  leverLadder,
  retrieveRecall,
  runFaithfulScenario,
  workerPromptText,
} from '../src/bench/token-faithful.ts'
import {
  FAITHFUL_REGRESSION_RATIO,
  compareFaithfulRows,
  UNWIRED_LEVERS,
  engineCacheTable,
  formatWiringGainTable,
  wiringGainTable,
  formatEngineCacheTable,
  faithfulSnapshot,
  formatFaithfulTable,
  gateFaithful,
  type FaithfulBaseline,
} from '../src/bench/token-gate.ts'
import { FIXTURE_NINA, FIXTURE_RECALL_ROWS, FIXTURE_SUBJECT_HISTORY } from '../src/bench/token-fixtures.ts'
import { composeHostTalk } from '../src/prompts/talk-output.ts'
import { VARIABLE_LAYER_BUDGET } from '../src/prompts/stable-prefix.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('faithful scripted runner (OPT-2)', () => {
  it('is deterministic and counts real prompts, not constants', () => {
    for (const id of FAITHFUL_SCENARIO_IDS) {
      const a = runFaithfulScenario(id, LEVERS_OPTIMIZED)
      const b = runFaithfulScenario(id, LEVERS_OPTIMIZED)
      expect(b.totalTokens).toBe(a.totalTokens)
      expect(b.costMicroUsd).toBe(a.costMicroUsd)
      for (const entry of a.entries) {
        const layered = entry.layers.system + entry.layers.tools + entry.layers.required
          + entry.layers.subject + entry.layers.recall + entry.layers.message
        expect(entry.inputTokens).toBeGreaterThanOrEqual(layered)
        expect(entry.origin).toBe('estimate')
      }
    }
  })

  it('every lever off spends more than every lever on, at the same or better delivery', () => {
    for (const id of FAITHFUL_SCENARIO_IDS) {
      const before = runFaithfulScenario(id, LEVERS_LEGACY)
      const after = runFaithfulScenario(id, LEVERS_OPTIMIZED)
      // a single question carries a few more tokens in the Persona prompt (stable prefix, brevity rule): ≤ 2%, and always cheaper
      expect(after.totalTokens).toBeLessThanOrEqual(before.totalTokens * 1.02)
      expect(after.costMicroUsd).toBeLessThanOrEqual(before.costMicroUsd)
      expect(after.quality.score).toBeGreaterThanOrEqual(before.quality.score)
      expect(after.quality.missing).toEqual([])
    }
  })

  it('idle day and a quiet 30-persona day spend zero model calls; a busy day batches', () => {
    expect(runFaithfulScenario('idle-routines').calls).toBe(0)
    expect(runFaithfulScenario('initiative-30').calls).toBe(0)
    expect(runFaithfulScenario('idle-routines', LEVERS_LEGACY).calls).toBeGreaterThan(90)
    const busy = runFaithfulScenario('initiative-30-busy')
    expect(busy.calls).toBe(5)
    expect(busy.turns.every(turn => turn.tier === 'cheap')).toBe(true)
  })

  it('walks the ladder one lever at a time: cost never rises (layout noise ≤ 1%) and quality never falls', () => {
    for (const id of FAITHFUL_SCENARIO_IDS) {
      const steps = leverLadder(id)
      expect(steps).toHaveLength(LEVER_LADDER.length)
      for (const step of steps) {
        // stablePrefix pays ~9 tokens of layout on a single cold call; it earns them back on the first warm one.
        expect(step.after.costMicroUsd, `${id} ${step.lever}`).toBeLessThanOrEqual(step.before.costMicroUsd * 1.01)
        expect(step.after.quality.score, `${id} ${step.lever}`).toBeGreaterThanOrEqual(step.before.quality.score)
      }
    }
  })

  it('pre-router answers courtesy lines without a model; legacy asks one', () => {
    const on = runFaithfulScenario('geral-simple', LEVERS_OPTIMIZED)
    const off = runFaithfulScenario('geral-simple', LEVERS_LEGACY)
    expect(on.calls).toBe(1)
    expect(off.calls).toBe(2)
  })

  it('warm coordination delivers its system prompt once; cold sends it every time', () => {
    const cold = runFaithfulScenario('dia-padaria', { ...LEVERS_OPTIMIZED, skipTriage: false, warmSession: false })
    const warm = runFaithfulScenario('dia-padaria', { ...LEVERS_OPTIMIZED, skipTriage: false })
    const coordinationTokens = (report: typeof cold): number[] => report.turns
      .filter(turn => turn.entry.kind === 'triage').map(turn => turn.entry.inputTokens)
    const [coldFirst, coldSecond] = coordinationTokens(cold)
    const [warmFirst, warmSecond] = coordinationTokens(warm)
    expect(warmFirst).toBe(coldFirst)
    expect(warmSecond ?? 0).toBeLessThan((coldSecond ?? 0) - 400)
  })

  it('routes talk and support turns to the cheap engine; execution stays on the persona engine', () => {
    const report = runFaithfulScenario('dia-padaria')
    for (const turn of report.turns) {
      const heavy = turn.entry.kind === 'execution'
      expect(turn.tier, turn.entry.kind).toBe(heavy ? 'persona' : 'cheap')
    }
    const flat = runFaithfulScenario('dia-padaria', { ...LEVERS_OPTIMIZED, talkOnCheap: false, supportOnCheap: false })
    expect(flat.turns.every(turn => turn.tier === 'persona')).toBe(true)
    expect(flat.costMicroUsd).toBeGreaterThan(report.costMicroUsd)
    expect(flat.totalTokens).toBe(report.totalTokens)
  })

  it('the host today sits between the naive harness and every lever on', () => {
    for (const id of FAITHFUL_SCENARIO_IDS) {
      const naive = runFaithfulScenario(id, LEVERS_LEGACY)
      const today = runFaithfulScenario(id, LEVERS_AS_WIRED)
      const all = runFaithfulScenario(id, LEVERS_OPTIMIZED)
      expect(today.costMicroUsd, id).toBeLessThanOrEqual(naive.costMicroUsd)
      expect(all.costMicroUsd, id).toBeLessThanOrEqual(today.costMicroUsd)
      expect(today.quality.score, id).toBe(1)
    }
  })

  it('reports cache hit per engine and never invents it for engines that do not report', () => {
    const claude = runFaithfulScenario('dia-padaria', LEVERS_OPTIMIZED, { engine: 'claude' })
    const cursor = runFaithfulScenario('dia-padaria', LEVERS_OPTIMIZED, { engine: 'cursor' })
    expect(claude.cacheReported).toBe(true)
    expect(claude.prefixHitRate).toBeGreaterThanOrEqual(0.6)
    expect(cursor.cacheReported).toBe(false)
    expect(cursor.entries.every(entry => entry.cacheReadTokens === 0 && entry.cacheWriteTokens === 0)).toBe(true)
    expect(cursor.totalTokens).toBe(claude.totalTokens)
  })
})

describe('bench fidelity', () => {
  it('rebuilds the host talk prompt byte for byte at the shipped context policy', () => {
    const message = 'Qual o horário do standup?'
    const report = runFaithfulScenario('geral-simple', {
      ...LEVERS_OPTIMIZED, context: 'headClip', preroute: false, summarizeSubject: false,
    })
    const first = report.turns[0]
    expect(first?.entry.kind).toBe('reply')
    const host = composeHostTalk({
      fields: {
        identity: { name: 'Atlas', title: 'Coordenação' },
        personality: 'Calmo, direto e organizado. Fala pouco, decide rápido e avisa a pessoa sem rodeios.',
        instructions: 'Triar cada pedido, despachar para quem tem o mandato certo, responder a pessoa em até 100 palavras e nunca prometer um prazo que a equipe não confirmou.',
        functionLabel: 'coordenação',
        vault: '',
        colleagues: [
          { name: 'Bento', title: 'Revisor' },
          { name: 'Nina', title: 'Padeira-chefe' },
        ],
        capabilities: 'resposta de conversa; sem ferramentas; sem shell; sem arquivos; nunca ecoe a mensagem da pessoa; sem placeholders (Recebido, Vou encaminhar, digitando); pedido simples responde direto; trabalho: o que entendeu, quem faz, quando volta',
      },
      surface: 'talk',
      userText: message,
      required: 'regra: nunca inventar preço; usar sempre a tabela do Cofre.\nmarca: lilás é a cor oficial da Padaria Lua; tom caloroso e curto.\nprivacidade: telefone e endereço de cliente nunca vão para canal público.',
      recall: fitRecall(retrieveRecall(FIXTURE_RECALL_ROWS, message), message, 'headClip'),
    })
    expect(first?.entry.layers.system).toBeGreaterThan(0)
    expect(estimateTokens(host.text)).toBe(first?.entry.inputTokens)
  })

  it('freezes the legacy before as the real snapshot-path prompt, not a strawman', () => {
    const report = runFaithfulScenario('geral-simple', LEVERS_LEGACY)
    const first = report.turns[0]
    expect(first?.entry.inputTokens).toBeGreaterThan(400)
    expect(first?.entry.layers.message).toBeGreaterThan(0)
  })
})

describe('context budget keeps the evidence (OPT-4 quality guard)', () => {
  const many = [
    'nota: a vitrine é trocada às sextas com fotos novas e legenda curta de sempre para o Instagram da Padaria.',
    'nota: a vitrine da sexta leva bolo de fubá, pão de queijo e a promoção do combo café e pão do mês corrente.',
    'nota: vitrine de natal leva panetone e chocotone com preço da tabela do Cofre, sem desconto sem aprovação.',
    'nota: a vitrine do dia dos namorados leva cupcakes de morango e brigadeiro de colher em embalagem kraft.',
    'nota: a vitrine precisa de limpeza todo dia ao fechar; produto de vidro fica no armário do fundo da loja.',
    'nota: vitrine refrigerada tem o termostato ajustado em 4 graus; anotar a temperatura na planilha do turno.',
    'nota: a vitrine de domingo repete o cardápio de sábado sem os bolos, que só saem sob encomenda antecipada.',
    'nota: a vitrine do café da manhã destaca pão na chapa, queijo minas e geleia caseira nas manhãs de semana.',
    'nota: a vitrine de sábado inclui o pão de fermentação natural e a encomenda das 9h da Ana Souza em separado.',
  ]
  const message = 'Como está a vitrine de sábado e a encomenda da Ana Souza?'

  it('head clip drops late evidence; ranking keeps it inside the same budget', () => {
    const rows = retrieveRecall(many, message)
    const evidence = 'encomenda das 9h da Ana Souza'
    const head = fitRecall(rows, message, 'headClip')
    const ranked = fitRecall(rows, message, 'ranked')
    expect(estimateTokens(head)).toBeLessThanOrEqual(VARIABLE_LAYER_BUDGET.recall)
    expect(estimateTokens(ranked)).toBeLessThanOrEqual(VARIABLE_LAYER_BUDGET.recall)
    expect(head.includes(evidence)).toBe(false)
    expect(ranked.includes(evidence)).toBe(true)
  })

  it('subject digest keeps decisions and the answer to a follow-up', () => {
    const subject = fitSubject(FIXTURE_SUBJECT_HISTORY, true, 'ranked')
    expect(estimateTokens(subject)).toBeLessThanOrEqual(VARIABLE_LAYER_BUDGET.subject)
    expect(subject).toContain('40 pães')
    expect(subject).toContain('regra: nunca divulgar preço novo')
    expect(estimateTokens(subject)).toBeLessThan(estimateTokens(FIXTURE_SUBJECT_HISTORY.join('\n')))
  })
})

describe('worker prompt dedupe (OPT-4)', () => {
  it('writes the owner norms once', () => {
    const full = workerPromptText(FIXTURE_NINA, false)
    const dedup = workerPromptText(FIXTURE_NINA, true)
    expect(full.match(/Normas de dono/g)).toHaveLength(2)
    expect(dedup.match(/Normas de dono/g)).toHaveLength(1)
    expect(dedup).toContain('nunca encerre com')
    expect(estimateTokens(dedup)).toBeLessThan(estimateTokens(full) - 30)
  })
})

describe('regression gate (OPT-2)', () => {
  const baseline = faithfulSnapshot()

  it('matches the frozen baseline file', () => {
    const frozen = JSON.parse(readFileSync(resolve(root, 'persona-spec/baselines/token-faithful.json'), 'utf8')) as FaithfulBaseline
    expect(gateFaithful(frozen)).toEqual([])
    expect(formatFaithfulTable(baseline)).toContain('dia-padaria')
  })

  it('fails when tokens or cost rise more than 10% with no quality gain', () => {
    const worse = baseline.optimized.map(row => (
      row.id === 'padaria-lua'
        ? { ...row, tokens: Math.ceil(row.tokens * (1 + FAITHFUL_REGRESSION_RATIO + 0.02)), costMicroUsd: Math.ceil(row.costMicroUsd * 1.2) }
        : row))
    const findings = compareFaithfulRows(baseline.optimized, worse)
    expect(findings.map(row => `${row.id}:${row.reason}`).sort()).toEqual(['padaria-lua:cost', 'padaria-lua:tokens'])
  })

  it('accepts a rise that buys a recorded quality gain of at least 0.15', () => {
    const richer = baseline.optimized.map(row => (
      row.id === 'padaria-lua' ? { ...row, tokens: Math.ceil(row.tokens * 1.3), costMicroUsd: Math.ceil(row.costMicroUsd * 1.3), quality: 1 } : row))
    const lowBase = baseline.optimized.map(row => (row.id === 'padaria-lua' ? { ...row, quality: 0.8 } : row))
    expect(compareFaithfulRows(lowBase, richer)).toEqual([])
    expect(compareFaithfulRows(baseline.optimized, richer, { 'padaria-lua': 0.2 })).toEqual([])
  })

  it('fails when fewer tokens cost delivery, and when an idle day starts spending', () => {
    const cut = baseline.optimized.map(row => (
      row.id === 'multi-review' ? { ...row, tokens: Math.floor(row.tokens * 0.5), quality: 0.5 } : row))
    expect(compareFaithfulRows(baseline.optimized, cut).map(row => `${row.id}:${row.reason}`)).toEqual(['multi-review:quality'])
    const chatty = baseline.optimized.map(row => (row.id === 'idle-routines' ? { ...row, tokens: 120, calls: 1 } : row))
    expect(compareFaithfulRows(baseline.optimized, chatty).map(row => row.reason)).toEqual(['idle'])
  })
})

describe('prefix cache per engine (OPT-3)', () => {
  it('meets the 60% prefix target on engines that report cache and says n/d on the others', () => {
    const rows = engineCacheTable()
    expect(rows.map(row => row.engine)).toEqual(['claude', 'codex', 'opencode', 'cursor'])
    for (const row of rows) {
      if (row.reported) expect(row.optimizedPrefixHit, row.engine).toBeGreaterThanOrEqual(0.6)
    }
    const text = formatEngineCacheTable(rows)
    expect(text).toContain('| cursor | não')
    expect(text).toContain('ausência ≠ 0%')
    const cursorRow = text.split('\n').find(line => line.startsWith('| cursor')) ?? ''
    expect(cursorRow).not.toContain('0.00')
  })
})

describe('what is still unwired in the host (contract token-wiring.md)', () => {
  it('measures each unwired lever alone, never worse on cost and never worse on quality', () => {
    const rows = wiringGainTable()
    expect(rows).toHaveLength(UNWIRED_LEVERS.length)
    for (const row of rows) {
      expect(row.costAfter, row.lever).toBeLessThanOrEqual(row.costBefore)
      expect(row.tokensAfter, row.lever).toBeLessThanOrEqual(row.tokensBefore)
      expect(row.qualityAfter, row.lever).toBeGreaterThanOrEqual(row.qualityBefore)
    }
    const byName = (needle: string) => rows.find(row => row.lever.startsWith(needle))
    expect(byName('leanReports')?.costAfter).toBeLessThan(byName('leanReports')?.costBefore ?? 0)
    expect(formatWiringGainTable(rows)).toContain('Rivet oar/session.ts')
  })

  it('prices the Persona MCP tool list for a worker that carries it; the host sends the title only', () => {
    const full = { ...LEVERS_AS_WIRED, workerContext: 'full' as const }
    const none = runFaithfulScenario('dia-padaria', { ...full, toolsListing: 'none' })
    const needed = runFaithfulScenario('dia-padaria', { ...full, toolsListing: 'needed' })
    const all = runFaithfulScenario('dia-padaria', { ...full, toolsListing: 'all' })
    expect(LEVERS_AS_WIRED.toolsListing).toBe('none')
    expect(LEVERS_AS_WIRED.workerContext).toBe('title')
    // title-only (the host): the tool listing never reaches the worker, so the lever changes nothing
    const hostAll = runFaithfulScenario('dia-padaria', { ...LEVERS_AS_WIRED, toolsListing: 'all' })
    expect(hostAll.totalTokens).toBe(runFaithfulScenario('dia-padaria', LEVERS_AS_WIRED).totalTokens)
    expect(none.totalTokens).toBeLessThan(needed.totalTokens)
    expect(needed.totalTokens).toBeLessThan(all.totalTokens)
    for (const entry of none.entries.filter(row => row.kind === 'execution')) expect(entry.layers.tools).toBe(0)
  })
})

describe('the courtesy line (host fidelity, 04/11)', () => {
  it('before D-075 the host answered "valeu!" with a talk call although the pre-router says no model; the lever (now wired) removes it', () => {
    const asHost = runFaithfulScenario('geral-simple', { ...LEVERS_AS_WIRED, courtesyNoModel: false })
    const free = runFaithfulScenario('geral-simple', LEVERS_AS_WIRED)
    expect(LEVERS_AS_WIRED.courtesyNoModel).toBe(true)
    expect(asHost.calls).toBe(2)
    expect(free.calls).toBe(1)
    expect(free.totalTokens).toBeLessThan(asHost.totalTokens)
    expect(free.quality.score).toBe(1)
    // the question alone costs the same either way: only the courtesy turn changes
    expect(runFaithfulScenario('geral-question', LEVERS_AS_WIRED).calls).toBe(1)
  })
})

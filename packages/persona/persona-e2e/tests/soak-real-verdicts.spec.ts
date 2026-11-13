/**
 * Os vereditos PUROS do soak em tempo real (M7, Probe): cada um acusa uma corrida DEFEITUOSA e deixa passar a boa (prova de que o veredito não é vácuo).
 */
import { describe, expect, it } from 'vitest'
import { conservationProblems, frozenProblems, hostIdentityProblems, leakProblems, leakReading, processTree, REALTIME_INVARIANTS, restChildrenProblems, samplePhoto, slope, stuckProblems, toViolations, type ProcRow, type SoakSample } from '../src/marco/soak-real-verdicts.ts'
import { describeChildren, readTree, survivors, type SampledRow } from '../src/marco/soak-sampler.ts'

const MIN = 60_000

function sample(minute: number, over: Partial<SoakSample> = {}): SoakSample {
  return { atMs: minute * MIN, hostPid: 100, hostCreated: 1_000, rssMb: 400, hostRssMb: 300, children: 0, handles: 500, rows: 10, dbMb: 5, rpcMs: 40, cards: [], ...over }
}
const card = (id: string, stage: string, projectId = 'A'): { id: string; projectId: string; stage: string } => ({ id, projectId, stage })

describe('processTree: a posse da árvore (pid + criação; o pai é mais velho que o filho)', () => {
  const rows: ProcRow[] = [
    { pid: 100, ppid: 1, created: 1_000, rssBytes: 300e6, name: 'node.exe' },
    { pid: 200, ppid: 100, created: 2_000, rssBytes: 80e6, name: 'node.exe' },
    { pid: 300, ppid: 200, created: 3_000, rssBytes: 20e6, name: 'cmd.exe' },
    { pid: 400, ppid: 100, created: 500, rssBytes: 99e6, name: 'velho.exe' },
    { pid: 500, ppid: 999, created: 4_000, rssBytes: 99e6, name: 'alheio.exe' },
  ]

  it('conta os descendentes vivos (filho e neto) e NÃO adota quem é mais velho que o pai (ppid reaproveitado) nem o alheio', () => {
    const tree = processTree(rows, { pid: 100, created: 1_000 })
    expect(tree?.descendants.map(row => row.pid).sort()).toEqual([200, 300])
  })

  it('raiz ausente ou com a criação trocada (pid reaproveitado) = undefined: o chamador ERRA, nunca lê "zero filhos"', () => {
    expect(processTree(rows, { pid: 100, created: 1_001 })).toBeUndefined()
    expect(processTree([], { pid: 100, created: 1_000 })).toBeUndefined()
  })
})

describe('slope: a tendência por mínimos quadrados', () => {
  it('reta crescente, plana e ponto único', () => {
    expect(slope([[0, 10], [1, 20], [2, 30]])).toBeCloseTo(10)
    expect(slope([[0, 7], [1, 7], [2, 7]])).toBe(0)
    expect(slope([[0, 7]])).toBe(0)
    expect(slope([[1, 7], [1, 9]])).toBe(0)
  })
})

describe('hostIdentityProblems: o host é o mesmo processo', () => {
  it('passa com o mesmo (pid, criação); acusa reinício sozinho; aceita o reinício que o roteiro INJETOU', () => {
    const steady = [sample(0), sample(1), sample(2)]
    expect(hostIdentityProblems(steady)).toEqual([])
    const restarted = [sample(0), sample(1), sample(2, { hostPid: 101, hostCreated: 2_000 }), sample(3, { hostPid: 101, hostCreated: 2_000 })]
    expect(hostIdentityProblems(restarted)).toHaveLength(1)
    expect(hostIdentityProblems(restarted, [1.5 * MIN])).toEqual([])
    expect(hostIdentityProblems([])).toHaveLength(1)
  })
})

describe('frozenProblems: TRAVOU (1) — a sonda do host', () => {
  it('passa com a sonda rápida; acusa a que estourou o tempo e a lenta', () => {
    expect(frozenProblems([sample(0), sample(1, { rpcMs: 4_900 })])).toEqual([])
    expect(frozenProblems([sample(0), sample(1, { rpcMs: undefined })])).toHaveLength(1)
    expect(frozenProblems([sample(0), sample(1, { rpcMs: 6_000 })])).toHaveLength(1)
  })
})

describe('stuckProblems: TRAVOU (2) — cartão andando que não anda', () => {
  it('acusa o cartão em "doing" parado além do limite, UMA vez; cartão esperando em review/needs_you/done não é travado', () => {
    const run = [0, 10, 20, 30].map(minute => sample(minute, { cards: [card('c1', 'doing'), card('c2', 'review'), card('c3', 'done')] }))
    const problems = stuckProblems(run, 15 * MIN)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('c1')
  })

  it('o cartão que muda de coluna reinicia a conta (andou = não travou)', () => {
    const run = [sample(0, { cards: [card('c1', 'doing')] }), sample(10, { cards: [card('c1', 'doing')] }), sample(12, { cards: [card('c1', 'review')] }), sample(30, { cards: [card('c1', 'review')] })]
    expect(stuckProblems(run, 15 * MIN)).toEqual([])
  })
})

describe('conservationProblems: PERDEU CARTÃO', () => {
  it('passa quando os cartões só entram e avançam; acusa o sumiço, a troca de projeto, a duplicata e a volta de coluna', () => {
    const good = [sample(0, { cards: [card('a', 'todo')] }), sample(1, { cards: [card('a', 'doing'), card('b', 'todo')] }), sample(2, { cards: [card('a', 'done'), card('b', 'doing')] })]
    expect(conservationProblems(good)).toEqual([])
    expect(conservationProblems([sample(0, { cards: [card('a', 'todo'), card('b', 'todo')] }), sample(1, { cards: [card('a', 'todo')] })])).toEqual([expect.stringContaining('sumiu')])
    expect(conservationProblems([sample(0, { cards: [card('a', 'todo', 'A')] }), sample(1, { cards: [card('a', 'todo', 'B')] })])).toEqual([expect.stringContaining('trocou de projeto')])
    expect(conservationProblems([sample(0, { cards: [card('a', 'todo'), card('a', 'todo')] })])).toEqual([expect.stringContaining('2 vezes')])
    expect(conservationProblems([sample(0, { cards: [card('a', 'done')] }), sample(1, { cards: [card('a', 'doing')] })])).toEqual([expect.stringContaining('voltou')])
    expect(conservationProblems([sample(0, { cards: [card('a', 'done')] }), sample(1, { cards: [card('a', 'doing')] })], false)).toEqual([])
  })
})

describe('leakProblems / leakReading: VAZOU (1) — memória e banco com tendência', () => {
  const rising = Array.from({ length: 12 }, (_, index) => sample(index * 5, { rssMb: 400 + index * 20, dbMb: 5 + index * 0.5 }))
  const flat = Array.from({ length: 12 }, (_, index) => sample(index * 5, { rssMb: 400 + (index % 2), dbMb: 5 }))

  it('sem limite nada é acusado (a 1ª rodada só mede), mas os números saem', () => {
    expect(leakProblems(rising, { warmupMs: 10 * MIN })).toEqual([])
    expect(leakReading(rising, 10 * MIN).rssSlopeMbPerHour).toBeGreaterThan(200)
  })

  it('com limite: acusa a corrida que cresce e deixa passar a plana; o aquecimento não entra na conta', () => {
    const limits = { warmupMs: 10 * MIN, maxRssSlopeMbPerHour: 50, maxDbSlopeMbPerHour: 1 }
    expect(leakProblems(rising, limits)).toHaveLength(2)
    expect(leakProblems(flat, limits)).toEqual([])
    const warmupSpike = [sample(0, { rssMb: 900 }), ...flat.slice(1)]
    expect(leakProblems(warmupSpike, { warmupMs: 10 * MIN, maxRssSlopeMbPerHour: 50 })).toEqual([])
    expect(leakProblems(flat, { warmupMs: 10 * MIN, maxRssMb: 300 })).toEqual([expect.stringContaining('pico')])
  })

  it('soak curto demais para julgar (menos de 4 medições depois do aquecimento) é acusado, não aprovado', () => {
    expect(leakProblems(flat.slice(0, 4), { warmupMs: 10 * MIN, maxRssMb: 9_999 })).toEqual([expect.stringContaining('curto demais')])
  })
})

describe('restChildrenProblems: VAZOU (2) — os filhos do host em repouso (o pool quente é de propósito)', () => {
  const rest = (counts: number[]): SoakSample[] => counts.map((children, index) => sample(index, { children, cards: [card('a', 'done')] }))

  it('15 filhos ESTÁVEIS em repouso (o pool quente da 1ª rodada real) passam sem limite; só um teto os acusa', () => {
    expect(restChildrenProblems(rest([15, 15, 15]))).toEqual([])
    expect(restChildrenProblems(rest([15, 14, 15]))).toEqual([])
    expect(restChildrenProblems(rest([15, 15, 15]), 20)).toEqual([])
    expect(restChildrenProblems(rest([15, 15, 15]), 12)).toEqual([expect.stringContaining('teto 12')])
  })

  it('acusa filho que continua nascendo em repouso (cresce além da folga) e não julga se a fila não drenou', () => {
    expect(restChildrenProblems(rest([4, 6, 9]))).toEqual([expect.stringContaining('abre processo sem trabalho')])
    expect(restChildrenProblems([sample(0, { cards: [card('a', 'doing')] }), sample(1, { cards: [card('a', 'doing')] }), sample(2, { cards: [card('a', 'doing')] })])).toEqual([expect.stringContaining('não drenou')])
    expect(restChildrenProblems([sample(0)])).toHaveLength(1)
  })
})

describe('samplePhoto / toViolations: o formato do relatório do Gauge (marco-soak/1, mode realtime)', () => {
  it('a foto leva horas fracionárias, bytes e os dois campos só do tempo real (rssBytes, children)', () => {
    const photo = samplePhoto(sample(30, { rssMb: 512, dbMb: 2, children: 3, handles: 777, rows: 42 }))
    expect(photo).toEqual({ hour: 0.5, resources: 777, listeners: 0, dbBytes: 2 * 1_048_576, rows: 42, heapBytes: 0, rssBytes: 512 * 1_048_576, children: 3 })
  })

  it('cada problema vira uma Violation com o nome da invariante RT', () => {
    expect(toViolations(REALTIME_INVARIANTS.lost, ['o cartão a sumiu', 'o cartão b sumiu'], 60, '30 min reais')).toEqual([
      { invariant: REALTIME_INVARIANTS.lost, projectId: '*', step: 60, simulated: '30 min reais', detail: 'o cartão a sumiu' },
      { invariant: REALTIME_INVARIANTS.lost, projectId: '*', step: 60, simulated: '30 min reais', detail: 'o cartão b sumiu' },
    ])
    expect(toViolations(REALTIME_INVARIANTS.frozen, [], 1, 'x')).toEqual([])
  })
})

describe('readTree (amostrador): lê a árvore com handles; o host que sumiu é ERRO', () => {
  const rows: SampledRow[] = [
    { pid: 100, ppid: 1, created: 1_000, rssBytes: 300 * 1_048_576, handles: 400, name: 'node.exe', cmd: 'node apps/cli/src/bin.ts --profile persona' },
    { pid: 200, ppid: 100, created: 2_000, rssBytes: 80 * 1_048_576, handles: 90, name: 'node.exe', cmd: 'node claude-cli.mjs --mcp-config x' },
    { pid: 300, ppid: 200, created: 3_000, rssBytes: 5 * 1_048_576, handles: 40, name: 'conhost.exe', cmd: 'conhost.exe 0xffffffff' },
  ]

  it('descreve os descendentes do mais velho para o mais novo (nome, pid, pai, comando) para o Forge separar CLI, MCP e conhost', async () => {
    const described = [
      { name: 'node.exe', pid: 200, ppid: 100, created: 2_000, createdIso: new Date(2_000).toISOString(), cmd: 'node claude-cli.mjs --mcp-config x', rssMb: 80 },
      { name: 'conhost.exe', pid: 300, ppid: 200, created: 3_000, createdIso: new Date(3_000).toISOString(), cmd: 'conhost.exe 0xffffffff', rssMb: 5 },
    ]
    expect(await describeChildren({ pid: 100, created: 1_000 }, rows)).toEqual(described)
    await expect(describeChildren({ pid: 100, created: 9_999 }, rows)).rejects.toThrow('não está mais vivo')
  })

  it('soma RSS e handles do host e dos filhos; conta só os filhos e traz a lista com PID + criação', async () => {
    const reading = await readTree({ pid: 100, created: 1_000 }, rows)
    expect(reading).toMatchObject({ rssMb: 385, hostRssMb: 300, children: 2, handles: 530, childNames: { 'node.exe': 1, 'conhost.exe': 1 } })
    expect(reading.childList.map(child => `${String(child.pid)}@${String(child.created)}`)).toEqual(['200@2000', '300@3000'])
  })

  it('survivors: depois que o host fechou, só conta quem tem o MESMO pid E a MESMA criação (pid reaproveitado não é vazamento)', async () => {
    const seen = [{ pid: 200, created: 2_000 }, { pid: 300, created: 3_000 }, { pid: 400, created: 4_000 }]
    const after: SampledRow[] = [
      { pid: 200, ppid: 1, created: 2_000, rssBytes: 1, handles: 1, name: 'node.exe', cmd: 'node claude.mjs (órfão)' },
      { pid: 300, ppid: 1, created: 9_000, rssBytes: 1, handles: 1, name: 'outro.exe', cmd: 'outro processo com o pid reaproveitado' },
    ]
    expect((await survivors(seen, after)).map(row => row.pid)).toEqual([200])
    expect(await survivors(seen, [])).toEqual([])
  })

  it('host morto (pid reaproveitado com outra criação) lança em vez de ler "0 filhos"', async () => {
    await expect(readTree({ pid: 100, created: 9_999 }, rows)).rejects.toThrow('não está mais vivo')
  })
})

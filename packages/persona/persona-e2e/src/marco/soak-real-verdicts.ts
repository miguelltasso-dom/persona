/**
 * SOAK EM TEMPO REAL (M7, parte do Probe): os vereditos PUROS. O Gauge faz o soak em processo com relógio acelerado (invariantes I1–I8, hash de quadro); este módulo julga o que SÓ o
 * processo de verdade mostra: o host vivo por 30 min com a CLI de mentira rodando como processo-filho. Perguntas do Keel: TRAVOU? VAZOU? PERDEU CARTÃO? RAM?
 *   travou   `frozenProblems` (a sonda do host parou de responder ou ficou lenta) + `stuckProblems` (cartão andando que não anda mais, sem motivo legítimo para esperar)
 *   vazou    `leakProblems` (RSS/banco com tendência depois do aquecimento) + `idleProblems` (filhos vivos voltam ao valor de antes quando a fila drena) + `hostIdentityProblems` (o host não reiniciou sozinho)
 *   perdeu   `conservationProblems` (nenhum cartão some, nenhum troca de projeto)
 * Os LIMIARES de memória e banco NÃO são chutados (Gauge, plano §5): sem limite passado a métrica só é REGISTRADA na curva; a 2ª rodada trava o limiar com folga. As regras estruturais (host é o mesmo
 * processo, filhos voltam ao zero, cartão não some) valem desde a 1ª rodada.
 */

/** Uma linha da lista de processos do sistema. `created` em epoch ms: o par (pid, created) é a identidade (um pid reaproveitado não é o mesmo processo). */
export interface ProcRow {
  readonly pid: number
  readonly ppid: number
  readonly created: number
  readonly rssBytes: number
  readonly name: string
}

/** A árvore do host: ele mesmo e todos os descendentes VIVOS. */
export interface ProcTree<T extends ProcRow = ProcRow> {
  readonly root: T
  readonly descendants: readonly T[]
}

/**
 * A árvore de processos do host, SEGURA quanto à posse: o filho conta só se o pai é MAIS VELHO que ele (um ppid reaproveitado não adota ninguém) e a raiz só vale com o mesmo (pid, created).
 * Lista vazia ou raiz ausente = `undefined` (o chamador trata como ERRO: "o host sumiu", nunca como "zero filhos").
 * @param rows - A lista inteira de processos.
 * @param root - A identidade do host.
 */
export function processTree<T extends ProcRow>(rows: readonly T[], root: { readonly pid: number; readonly created: number }): ProcTree<T> | undefined {
  const rootRow = rows.find(row => row.pid === root.pid && row.created === root.created)
  if (rootRow === undefined) return undefined
  const seen = new Set<string>([`${String(rootRow.pid)}@${String(rootRow.created)}`])
  const descendants: T[] = []
  const queue: T[] = [rootRow]
  for (let parent = queue.shift(); parent !== undefined; parent = queue.shift()) {
    for (const row of rows) {
      const key = `${String(row.pid)}@${String(row.created)}`
      if (row.ppid !== parent.pid || row.created < parent.created || seen.has(key) || row.pid === parent.pid) continue
      seen.add(key)
      descendants.push(row)
      queue.push(row)
    }
  }
  return { root: rootRow, descendants }
}

/** O que cada passo de medição guarda (a cada 30 s reais). */
export interface SoakSample {
  /** Ms reais desde o início do soak. */
  readonly atMs: number
  readonly hostPid: number
  readonly hostCreated: number
  /** RSS do host + todos os descendentes, em MB. */
  readonly rssMb: number
  /** RSS só do host, em MB. */
  readonly hostRssMb: number
  /** Descendentes vivos do host (as CLIs de mentira, o que mais ele abrir). */
  readonly children: number
  /** Quantos descendentes por nome de processo (node.exe, cmd.exe…): diz o QUE fica vivo, não só quantos. */
  readonly childNames?: Readonly<Record<string, number>>
  /** Handles do sistema da árvore do host (Windows: HandleCount): o vazamento de arquivo/socket/pipe aparece aqui. */
  readonly handles: number
  /** Linhas que o host mostra (mensagens dos canais + cartões). */
  readonly rows: number
  /** Banco + WAL + SHM em MB. */
  readonly dbMb: number
  /** Latência da sonda (`listTasks`) em ms; `undefined` = a sonda estourou o tempo. */
  readonly rpcMs: number | undefined
  /** Os cartões vistos neste passo (todos os projetos). */
  readonly cards: ReadonlyArray<{ readonly id: string; readonly projectId: string; readonly stage: string }>
}

const ORDER = ['todo', 'doing', 'review', 'done'] as const

/** Mínimos quadrados: a inclinação de y por x (y por hora quando x está em horas). 0 com menos de 2 pontos ou x constante. */
export function slope(points: ReadonlyArray<readonly [number, number]>): number {
  if (points.length < 2) return 0
  const n = points.length
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / n
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n
  let num = 0
  let den = 0
  for (const [x, y] of points) {
    num += (x - meanX) * (y - meanY)
    den += (x - meanX) ** 2
  }
  return den === 0 ? 0 : num / den
}

const HOUR = 3_600_000
const minutes = (ms: number): string => String(Math.round(ms / 60_000))

/** O host é o MESMO processo do começo ao fim (nem caiu, nem reiniciou sozinho). `restartedAtMs` lista os reinícios que o roteiro INJETOU (o novo processo vira o esperado dali em diante). */
export function hostIdentityProblems(samples: readonly SoakSample[], restartedAtMs: readonly number[] = []): string[] {
  const out: string[] = []
  const first = samples[0]
  if (first === undefined) return ['nenhuma medição foi feita']
  let expected = { pid: first.hostPid, created: first.hostCreated }
  for (const sample of samples) {
    if (sample.hostPid === expected.pid && sample.hostCreated === expected.created) continue
    const injected = restartedAtMs.some(at => at <= sample.atMs && sample.atMs - at <= 120_000)
    if (!injected) out.push(`o host mudou de processo sozinho aos ${minutes(sample.atMs)} min (pid ${String(expected.pid)} → ${String(sample.hostPid)})`)
    expected = { pid: sample.hostPid, created: sample.hostCreated }
  }
  return out
}

/** TRAVOU (1): a sonda do host respondeu sempre e dentro do teto. Sem resposta ou acima de `maxMs` = o host congelou. */
export function frozenProblems(samples: readonly SoakSample[], maxMs = 5_000): string[] {
  const out: string[] = []
  for (const sample of samples) {
    if (sample.rpcMs === undefined) out.push(`a sonda do host não respondeu aos ${minutes(sample.atMs)} min`)
    else if (sample.rpcMs > maxMs) out.push(`a sonda do host levou ${String(Math.round(sample.rpcMs))} ms aos ${minutes(sample.atMs)} min (teto ${String(maxMs)} ms)`)
  }
  return out
}

/**
 * TRAVOU (2): um cartão ANDANDO (`doing`) que não muda de coluna há mais de `stuckAfterMs`. Esperar em `review`/`needs_you`/`done` é legítimo (a pessoa decide; a aprovação pede o Miguel) e não conta.
 * @param samples - As medições em ordem de tempo.
 * @param stuckAfterMs - O limite de cartão andando parado (cada rodada diz o seu).
 */
export function stuckProblems(samples: readonly SoakSample[], stuckAfterMs: number): string[] {
  const out: string[] = []
  const since = new Map<string, { stage: string; atMs: number }>()
  const flagged = new Set<string>()
  for (const sample of samples) {
    for (const card of sample.cards) {
      const known = since.get(card.id)
      if (known === undefined || known.stage !== card.stage) {
        since.set(card.id, { stage: card.stage, atMs: sample.atMs })
        continue
      }
      if (card.stage === 'doing' && sample.atMs - known.atMs > stuckAfterMs && !flagged.has(card.id)) {
        flagged.add(card.id)
        out.push(`o cartão ${card.id} está em "doing" há ${minutes(sample.atMs - known.atMs)} min sem andar (limite ${minutes(stuckAfterMs)} min)`)
      }
    }
  }
  return out
}

/**
 * PERDEU CARTÃO: nenhum cartão visto some de uma medição para a seguinte, e nenhum aparece em dois projetos (a cerca). Cartão NOVO que chega é normal; só o SUMIÇO e a TROCA de projeto são acusados.
 * @param samples - As medições em ordem de tempo.
 * @param allowedStageOrder - Se verdadeiro (padrão), também acusa cartão que volta de coluna (feito → fazendo) sem que o roteiro tenha reaberto.
 */
export function conservationProblems(samples: readonly SoakSample[], allowedStageOrder = true): string[] {
  const out: string[] = []
  const projectOf = new Map<string, string>()
  const stageOf = new Map<string, string>()
  let previous: ReadonlySet<string> = new Set()
  for (const sample of samples) {
    const now = new Set(sample.cards.map(card => card.id))
    for (const id of previous) if (!now.has(id)) out.push(`o cartão ${id} sumiu aos ${minutes(sample.atMs)} min`)
    const dupes = new Map<string, number>()
    for (const card of sample.cards) {
      dupes.set(card.id, (dupes.get(card.id) ?? 0) + 1)
      const project = projectOf.get(card.id)
      if (project !== undefined && project !== card.projectId) out.push(`o cartão ${card.id} trocou de projeto (${project} → ${card.projectId}) aos ${minutes(sample.atMs)} min`)
      projectOf.set(card.id, card.projectId)
      const before = stageOf.get(card.id)
      if (allowedStageOrder && before !== undefined) {
        const was = ORDER.indexOf(before as (typeof ORDER)[number])
        const is = ORDER.indexOf(card.stage as (typeof ORDER)[number])
        if (was >= 0 && is >= 0 && is < was) out.push(`o cartão ${card.id} voltou de "${before}" para "${card.stage}" aos ${minutes(sample.atMs)} min`)
      }
      stageOf.set(card.id, card.stage)
    }
    for (const [id, count] of dupes) if (count > 1) out.push(`o cartão ${id} aparece ${String(count)} vezes no mesmo instante (${minutes(sample.atMs)} min)`)
    previous = now
  }
  return [...new Set(out)]
}

/** Os limites de vazamento. Campo ausente = a métrica só é REGISTRADA (1ª rodada mede; a 2ª trava). */
export interface LeakLimits {
  /** Medições antes disto (ms reais) não entram na tendência: o host ainda está esquentando. */
  readonly warmupMs: number
  readonly maxRssSlopeMbPerHour?: number
  readonly maxRssMb?: number
  readonly maxDbSlopeMbPerHour?: number
}

/** Números para o relatório: nunca acusam sozinhos. */
export interface LeakReading {
  readonly rssSlopeMbPerHour: number
  readonly dbSlopeMbPerHour: number
  readonly rssFirstMb: number
  readonly rssLastMb: number
  readonly rssPeakMb: number
  readonly samplesUsed: number
}

/** Lê a tendência depois do aquecimento (sempre devolve os números; quem julga é {@link leakProblems}). */
export function leakReading(samples: readonly SoakSample[], warmupMs: number): LeakReading {
  const used = samples.filter(sample => sample.atMs >= warmupMs)
  const rss = used.map(sample => [sample.atMs / HOUR, sample.rssMb] as const)
  const db = used.map(sample => [sample.atMs / HOUR, sample.dbMb] as const)
  return {
    rssSlopeMbPerHour: slope(rss),
    dbSlopeMbPerHour: slope(db),
    rssFirstMb: used[0]?.rssMb ?? 0,
    rssLastMb: used[used.length - 1]?.rssMb ?? 0,
    rssPeakMb: Math.max(0, ...samples.map(sample => sample.rssMb)),
    samplesUsed: used.length,
  }
}

/** VAZOU (1): só acusa o que tem LIMITE; sem limite, nada é acusado (a curva vai para o relatório). Menos de 4 medições depois do aquecimento = não há o que julgar (acusa: o soak foi curto demais). */
export function leakProblems(samples: readonly SoakSample[], limits: LeakLimits): string[] {
  const reading = leakReading(samples, limits.warmupMs)
  const out: string[] = []
  const judged = limits.maxRssSlopeMbPerHour !== undefined || limits.maxRssMb !== undefined || limits.maxDbSlopeMbPerHour !== undefined
  if (judged && reading.samplesUsed < 4) return [`só ${String(reading.samplesUsed)} medições depois do aquecimento: o soak foi curto demais para julgar vazamento`]
  if (limits.maxRssSlopeMbPerHour !== undefined && reading.rssSlopeMbPerHour > limits.maxRssSlopeMbPerHour) out.push(`o RSS cresce ${reading.rssSlopeMbPerHour.toFixed(1)} MB/h (limite ${String(limits.maxRssSlopeMbPerHour)})`)
  if (limits.maxRssMb !== undefined && reading.rssPeakMb > limits.maxRssMb) out.push(`o pico de RSS foi ${String(Math.round(reading.rssPeakMb))} MB (limite ${String(limits.maxRssMb)})`)
  if (limits.maxDbSlopeMbPerHour !== undefined && reading.dbSlopeMbPerHour > limits.maxDbSlopeMbPerHour) out.push(`o banco cresce ${reading.dbSlopeMbPerHour.toFixed(1)} MB/h (limite ${String(limits.maxDbSlopeMbPerHour)})`)
  return out
}

/**
 * VAZOU (2): os processos-filhos do host (as CLIs) DEPOIS que a fila drena (nenhum cartão em `doing` nas últimas `quietSamples` medições). O host MANTÉM sessões quentes de propósito (pool: `warmCap`,
 * `SESSION_POOL_CAP`), então "voltar ao valor de antes" não é regra (a 1ª rodada, 12/11 15:40, mostrou 15 filhos no repouso = o pool, não um vazamento). As regras são duas:
 *   - ESTRUTURAL (desde a 1ª rodada): em repouso a contagem NÃO cresce (se sobe mais de `restGrowth` ao longo da cauda, algo continua abrindo processo sem trabalho);
 *   - com LIMITE (`maxChildren`, travado pela 2ª rodada depois de medir): o repouso não passa do teto do pool.
 * @param samples - As medições em ordem de tempo.
 * @param maxChildren - O teto de filhos no repouso; ausente = só mede.
 * @param quietSamples - Quantas medições finais formam o repouso.
 * @param restGrowth - O quanto a contagem pode subir dentro do repouso (um filho que reabre não é vazamento).
 */
export function restChildrenProblems(samples: readonly SoakSample[], maxChildren?: number, quietSamples = 3, restGrowth = 2): string[] {
  const tail = samples.slice(-quietSamples)
  if (tail.length < quietSamples) return [`menos de ${String(quietSamples)} medições no fim: não dá para provar que a fila drenou`]
  if (tail.some(sample => sample.cards.some(card => card.stage === 'doing'))) return ['a fila não drenou no fim do soak (ainda há cartão em "doing"): não dá para medir o repouso']
  const out: string[] = []
  const first = tail[0]?.children ?? 0
  const last = tail[tail.length - 1]?.children ?? 0
  if (last - first > restGrowth) out.push(`em repouso os filhos do host subiram de ${String(first)} para ${String(last)}: algo abre processo sem trabalho`)
  if (maxChildren !== undefined && last > maxChildren) out.push(`no repouso o host tem ${String(last)} processo(s) filho(s) (teto ${String(maxChildren)})`)
  return out
}


/** A foto por medição no formato do relatório do Gauge (`LeakPhoto` de `marco/soak-report.ts`; mesmo schema `marco-soak/1`, `mode: 'realtime'`). Tipo local para este módulo ficar puro. */
export interface RealtimePhoto {
  readonly hour: number
  /** Handles do sistema da árvore do host (`HandleCount`): o equivalente, visto de fora, de `process.getActiveResourcesInfo()`. */
  readonly resources: number
  /** Não se mede de fora do processo: 0. */
  readonly listeners: number
  readonly dbBytes: number
  /** Linhas que o host mostra (mensagens dos canais + cartões): o que cresce com a carga, visto pela porta que o cliente usa. */
  readonly rows: number
  /** Não se mede de fora do processo: 0 (o Gauge mede o heap no soak em processo). */
  readonly heapBytes: number
  readonly rssBytes: number
  readonly children: number
}

/**
 * A medição como foto do relatório (a curva do .json é a lista destas).
 * @param sample - A medição.
 */
export function samplePhoto(sample: SoakSample): RealtimePhoto {
  return {
    hour: Math.round((sample.atMs / HOUR) * 1000) / 1000,
    resources: sample.handles,
    listeners: 0,
    dbBytes: Math.round(sample.dbMb * 1_048_576),
    rows: sample.rows,
    heapBytes: 0,
    rssBytes: Math.round(sample.rssMb * 1_048_576),
    children: sample.children,
  }
}

/** Uma invariante quebrada no formato do Gauge (`Violation` de `marco/invariants.ts`). */
export interface RealtimeViolation {
  readonly invariant: string
  readonly projectId: string
  readonly step: number
  readonly simulated: string
  readonly detail: string
}

/** Os nomes das invariantes do tempo real (as do Gauge são I1–I8; as daqui começam com RT). */
export const REALTIME_INVARIANTS = {
  frozen: 'RT1 travou: a sonda do host',
  stuck: 'RT2 travou: cartão andando parado',
  leakCurve: 'RT3 vazou: memória/banco com tendência',
  leakChildren: 'RT4 vazou: filhos vivos no repouso',
  lost: 'RT5 perdeu cartão',
  host: 'RT6 o host é o mesmo processo',
} as const

/**
 * Os problemas de um veredito como `Violation`s do relatório do Gauge.
 * @param invariant - Um valor de {@link REALTIME_INVARIANTS}.
 * @param problems - O que o veredito puro acusou.
 * @param step - O passo (medição) do fim do soak.
 * @param simulated - O texto de hora do relatório (tempo real: "30 min reais").
 */
export function toViolations(invariant: string, problems: readonly string[], step: number, simulated: string): RealtimeViolation[] {
  return problems.map(detail => ({ invariant, projectId: '*', step, simulated, detail }))
}

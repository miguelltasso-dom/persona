/**
 * SOAK EM TEMPO REAL (M7, Probe; o soak em processo com relógio acelerado é do Gauge): o host de verdade, como PROCESSO, por `PERSONA_SOAK_MINUTES` (padrão 30), com 2 projetos, a CLI de mentira
 * (processo-filho de verdade, uma por turno), as superfícies do PRODUTO (D-113) e carga contínua pelas mesmas portas que o app usa. Responde as perguntas do Keel:
 *   travou?  RT1 a sonda do host (`listTasks`) responde sempre e rápido · RT2 nenhum cartão "doing" fica parado além do limite
 *   vazou?   RT3 RSS/banco sem tendência (só com limite; a 1ª rodada MEDE) · RT4 filhos vivos voltam ao valor de antes quando a fila drena · RT6 o host é o mesmo processo
 *   perdeu?  RT5 nenhum cartão some, troca de projeto ou aparece duas vezes
 *   RAM      a curva do RSS da árvore do host (host + CLIs) a cada 30 s, no .json (formato do Gauge: `marco-soak/1`, `mode: 'realtime'`, fotos com `rssBytes` e `children`)
 * Depois de montar (onboarding + equipe pela UI, uma vez) o navegador sai do caminho (`about:blank`): a medição é do HOST, não do Chromium. As chamadas seguem pela mesma porta HTTP do cliente.
 * Roda com `node scripts/persona/soak-real.mjs [--minutes N] [--out <pasta>]` (pela trava build). Sem o laço do quadro (M2) o soak prova o que existe hoje: a carga é "pessoa pede → persona responde →
 * cartão vai a revisão". Quando o laço existir, o mesmo roteiro ganha as ações dele no relatório (`boardLoop`) e o `stuck` passa a valer para o fluxo todo.
 * DEPENDÊNCIA: `src/marco/soak-report.ts` do Gauge (tipos e renderizador do relatório) — entra na árvore junto, depois do "candidato validado".
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { request as playwrightRequest, type APIRequestContext, type Page } from 'playwright'
import { describe, expect, it } from 'vitest'
import { hostRpcOk } from '../src/gauge-sb-ges.ts'
import { readHostSurfaces, surfacesProblems } from '../src/host-flags.ts'
import { describeChildren, identifyHost, dbSizeMb, readTree, survivors } from '../src/marco/soak-sampler.ts'
import { conservationProblems, frozenProblems, hostIdentityProblems, leakProblems, leakReading, REALTIME_INVARIANTS, restChildrenProblems, samplePhoto, stuckProblems, toViolations, type SoakSample } from '../src/marco/soak-real-verdicts.ts'
import { growthAfter, renderSoakReport, SOAK_REPORT_SCHEMA, type SoakReport } from '../src/marco/soak-report.ts'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { openV11Session } from '../src/v11-app.ts'
import { channelMessages, personasOf, postAsPerson, v11Tenant, type PersonaRow, type V11Tenant } from '../src/v11-helpers.ts'

const run = process.env.PERSONA_SOAK === '1'
const number = (name: string, fallback: number): number => {
  const raw = process.env[name]
  return raw === undefined || raw === '' || Number.isNaN(Number(raw)) ? fallback : Number(raw)
}
const optional = (name: string): number | undefined => {
  const raw = process.env[name]
  return raw === undefined || raw === '' || Number.isNaN(Number(raw)) ? undefined : Number(raw)
}

const MINUTES = number('PERSONA_SOAK_MINUTES', 30)
const SAMPLE_MS = number('PERSONA_SOAK_SAMPLE_S', 30) * 1_000
const POST_MS = number('PERSONA_SOAK_POST_S', 45) * 1_000
const STUCK_MS = number('PERSONA_SOAK_STUCK_MIN', 10) * 60_000
const WARM_HOUR = number('PERSONA_SOAK_WARM_HOUR', 0.1)
const DRAIN_MAX_MS = number('PERSONA_SOAK_DRAIN_MIN', 8) * 60_000
/** Minutes of REST after the queue drains (default 0): Forge's proof (e) "load → 15 min idle → the tree and the handles go back to the plateau" is `PERSONA_SOAK_IDLE_MIN=15`. */
const IDLE_MS = number('PERSONA_SOAK_IDLE_MIN', 0) * 60_000
const OUT = process.env.PERSONA_SOAK_OUT ?? join(ARTIFACTS_DIR, 'marco-soak', new Date().toISOString().replace(/[:.]/gu, '-'))

interface SoakTask { readonly id: string; readonly projectId: string; readonly title: string; readonly stage: string }
interface Side { readonly tenant: V11Tenant; readonly maker: PersonaRow; readonly label: string }

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

/** O `page` mínimo que os helpers do V11 usam (`url`, `context().request`, `waitForTimeout`): as chamadas seguem pela porta HTTP, sem navegador aberto. */
function pageLike(origin: string, request: APIRequestContext): Page {
  return { url: () => `${origin}/`, context: () => ({ request }), waitForTimeout: sleep } as unknown as Page
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([work, new Promise<never>((_resolve, reject) => { setTimeout(() => { reject(new Error(`sem resposta em ${String(ms)} ms`)) }, ms) })])
}

describe.skipIf(!run)('soak em tempo real — o host como processo, 2 projetos, CLI de mentira', () => {
  it('não trava, não vaza, não perde cartão', async () => {
    mkdirSync(OUT, { recursive: true })
    const home = join(OUT, 'home')
    rmSync(home, { recursive: true, force: true })
    const failSwitch = join(OUT, 'runner-fail.switch')
    rmSync(failSwitch, { force: true })
    const savedFlags = process.env.PERSONA_HOST_FLAGS
    process.env.PERSONA_HOST_FLAGS = 'production'
    const v11 = await openV11Session({
      hireTeam: true,
      home,
      engine: {
        turnMs: 400,
        failFile: failSwitch,
        rules: [
          { match: 'cartaz', reply: 'Cartaz pronto: "Pão de queijo em dobro", 2 por R$ 9, de sexta a domingo. Segue para a sua revisão.' },
          { match: '.', reply: 'Anotado. Já cuido disso.' },
        ],
      },
    })
    let api: APIRequestContext | undefined
    let closed = false
    try {
      // 0) o host sobe no padrão do produto (D-113): sem isso o soak provaria um app que o Miguel não tem
      expect(surfacesProblems(readHostSurfaces(v11.session.host.output(), home), 'on')).toEqual([])

      // 1) o navegador sai do caminho; as chamadas seguem pela porta HTTP com o mesmo cookie
      const tenantA = await v11Tenant(v11.page)
      const state = await v11.page.context().storageState()
      const origin = new URL(v11.page.url()).origin
      await v11.page.goto('about:blank')
      api = await playwrightRequest.newContext({ baseURL: origin, storageState: state })
      const rpc = pageLike(origin, api)

      // 2) o projeto B (a obra) com a sua própria equipe: a cerca de projeto vale; cada projeto tem persona e canal próprios
      const aPersonas = await personasOf(rpc, tenantA)
      const engine = (aPersonas[0] as unknown as { engine?: { cli?: string; model?: string } } | undefined)?.engine
      const created = await hostRpcOk<{ id: string }>(rpc, 'createProject', { id: 'soak-obra', workspaceId: tenantA.workspaceId, name: 'Obra do Beto', description: 'soak em tempo real', template: 'simples' })
      for (const [id, name, title] of [['soak-beto', 'Beto', 'Responsável da obra'], ['soak-cora', 'Cora', 'Compras da obra']] as const) {
        await hostRpcOk(rpc, 'createPersona', {
          workspaceId: tenantA.workspaceId, projectId: created.id, id, name, title, description: 'soak', personality: 'direto', instructions: 'Responda curto.', avatarKind: 'gallery', avatarRef: '',
          runnerKind: 'cli', runnerCli: engine?.cli ?? 'claude', runnerModel: engine?.model ?? 'sonnet', canRecruit: false, createdBy: tenantA.memberId,
        })
      }
      const channelsB = await hostRpcOk<Array<{ id: string; name: string }>>(rpc, 'listChannels', { workspaceId: tenantA.workspaceId, projectId: created.id })
      const channelB = channelsB.find(channel => /geral/iu.test(channel.name)) ?? channelsB[0]
      if (channelB === undefined) throw new Error('o projeto B não tem canal')
      const tenantB: V11Tenant = { ...tenantA, projectId: created.id, channelId: channelB.id }
      const bPersonas = await personasOf(rpc, tenantB)
      if (bPersonas.length < 2) throw new Error(`o projeto B ficou com ${String(bPersonas.length)} persona(s), esperava 2`)
      const makerA = aPersonas.find(row => !/coordena/iu.test(row.title ?? '')) ?? aPersonas[0]
      const makerB = bPersonas.find(row => row.name === 'Beto') ?? bPersonas[0]
      if (makerA === undefined || makerB === undefined) throw new Error('falta persona para a carga')
      const sides: Side[] = [{ tenant: tenantA, maker: makerA, label: 'A' }, { tenant: tenantB, maker: makerB, label: 'B' }]

      // 3) o host: quem escuta na porta, a identidade (pid + criação) e os filhos ANTES da carga
      const host = await identifyHost(Number(new URL(origin).port))
      const baselineChildren = (await readTree(host)).children
      const t0 = Date.now()
      const samples: SoakSample[] = []
      const injected: Array<{ atHour: number; name: string; outcome: string }> = []
      let lastCards: SoakSample['cards'] = []
      let hostDied: string | undefined
      // Every child the host ever had, by identity (PID + creation): how many samples it was seen in tells a short re-probe (seen once) from a resident one; after the host closes, a survivor is a leak (Forge 19:09).
      const lifetimes = new Map<string, { name: string; pid: number; createdIso: string; cmd: string; firstMin: number; lastMin: number; seenSamples: number }>()
      const identities: Array<{ pid: number; created: number }> = []

      const take = async (): Promise<SoakSample> => {
        const started = Date.now()
        let rpcMs: number | undefined
        let rows = 0
        try {
          const lists = await Promise.all(sides.map(side => withTimeout(hostRpcOk<SoakTask[]>(rpc, 'listTasks', { workspaceId: side.tenant.workspaceId, projectId: side.tenant.projectId }), 10_000)))
          rpcMs = Date.now() - started
          lastCards = lists.flat().map(task => ({ id: task.id, projectId: task.projectId, stage: task.stage }))
          const threads = await Promise.all(sides.map(side => withTimeout(channelMessages(rpc, side.tenant), 20_000)))
          rows = threads.reduce((sum, thread) => sum + thread.length, 0) + lastCards.length
        } catch {
          rpcMs = undefined
        }
        const tree = await readTree(host)
        const nowMin = Math.round(((Date.now() - t0) / 60_000) * 100) / 100
        for (const child of tree.childList) {
          const key = `${String(child.pid)}@${String(child.created)}`
          const known = lifetimes.get(key)
          if (known === undefined) {
            lifetimes.set(key, { name: child.name, pid: child.pid, createdIso: child.createdIso, cmd: child.cmd.slice(0, 120), firstMin: nowMin, lastMin: nowMin, seenSamples: 1 })
            identities.push({ pid: child.pid, created: child.created })
          } else {
            known.lastMin = nowMin
            known.seenSamples += 1
          }
        }
        return { atMs: Date.now() - t0, hostPid: host.pid, hostCreated: host.created, rssMb: tree.rssMb, hostRssMb: tree.hostRssMb, children: tree.children, childNames: tree.childNames, handles: tree.handles, rows, dbMb: dbSizeMb(home), rpcMs, cards: lastCards }
      }

      // 4) a carga: a cada POST_MS a pessoa pede um cartaz, alternando os projetos; a janela de falha do runner entra no meio; depois a fila DRENA (só mede)
      const totalMs = MINUTES * 60_000
      const failFrom = totalMs * 0.4
      const failTo = failFrom + Math.min(120_000, totalMs * 0.1)
      let failing = false
      let seq = 0
      let nextPost = 0
      let nextSample = 0
      let drainedSince: number | undefined
      let drainSnapshotTaken = false
      for (;;) {
        const elapsed = Date.now() - t0
        const loading = elapsed < totalMs
        if (loading && !failing && elapsed >= failFrom && elapsed < failTo) {
          writeFileSync(failSwitch, 'soak: o motor caiu')
          failing = true
          injected.push({ atHour: Math.round((elapsed / 3_600_000) * 100) / 100, name: 'o motor falha em todo turno por 2 min', outcome: 'a fila segue; os cartões que falham ficam bloqueados, não somem' })
        }
        if (failing && elapsed >= failTo) {
          rmSync(failSwitch, { force: true })
          failing = false
        }
        if (loading && elapsed >= nextPost) {
          const side = sides[seq % sides.length]
          if (side !== undefined) await postAsPerson(rpc, side.tenant, `@${side.maker.name} monte o cartaz ${String(seq + 1)} da promoção do pão de queijo`)
          seq += 1
          nextPost += POST_MS
        }
        if (elapsed >= nextSample) {
          try {
            samples.push(await take())
          } catch (error) {
            hostDied = error instanceof Error ? error.message : String(error)
            break
          }
          nextSample += SAMPLE_MS
          const last = samples[samples.length - 1]
          if (!loading && last !== undefined) {
            if (last.cards.some(card => card.stage === 'doing')) drainedSince = undefined
            else drainedSince ??= last.atMs
            // The first moment the queue is drained: who the host's children ARE (Forge's list: name, pid, parent, command line), before any rest.
            if (drainedSince !== undefined && !drainSnapshotTaken) {
              drainSnapshotTaken = true
              writeFileSync(join(OUT, 'children-at-drain.json'), `${JSON.stringify(await describeChildren(host), null, 2)}\n`)
            }
            if (drainedSince !== undefined && last.atMs - drainedSince >= Math.max(3 * SAMPLE_MS, IDLE_MS)) break
          }
        }
        if (!loading && elapsed > totalMs + DRAIN_MAX_MS + IDLE_MS) break
        await sleep(1_000)
      }
      rmSync(failSwitch, { force: true })
      // The same list at the END (after the rest, when there was one): what was released and what stayed.
      if (hostDied === undefined) writeFileSync(join(OUT, 'children-at-end.json'), `${JSON.stringify(await describeChildren(host), null, 2)}\n`)
      // The host's own output (boot lines such as `[persona-host] warmSweep on …`, `run failed …`): Forge asks which lines the run saw (12/11 18:47).
      writeFileSync(join(OUT, 'host-output.txt'), v11.session.host.output())

      // 5) os vereditos (puros) e o relatório no formato do Gauge
      const stepOf = samples.length
      const clock = `${String(MINUTES)} min reais`
      const reading = leakReading(samples, WARM_HOUR * 3_600_000)
      const violations = [
        ...toViolations(REALTIME_INVARIANTS.frozen, frozenProblems(samples), stepOf, clock),
        ...toViolations(REALTIME_INVARIANTS.stuck, stuckProblems(samples, STUCK_MS), stepOf, clock),
        ...toViolations(REALTIME_INVARIANTS.leakCurve, leakProblems(samples, {
          warmupMs: WARM_HOUR * 3_600_000,
          ...(optional('PERSONA_SOAK_MAX_RSS_SLOPE_MB_H') === undefined ? {} : { maxRssSlopeMbPerHour: optional('PERSONA_SOAK_MAX_RSS_SLOPE_MB_H') as number }),
          ...(optional('PERSONA_SOAK_MAX_RSS_MB') === undefined ? {} : { maxRssMb: optional('PERSONA_SOAK_MAX_RSS_MB') as number }),
          ...(optional('PERSONA_SOAK_MAX_DB_SLOPE_MB_H') === undefined ? {} : { maxDbSlopeMbPerHour: optional('PERSONA_SOAK_MAX_DB_SLOPE_MB_H') as number }),
        }), stepOf, clock),
        ...toViolations(REALTIME_INVARIANTS.leakChildren, restChildrenProblems(samples, optional('PERSONA_SOAK_MAX_CHILDREN')), stepOf, clock),
        ...toViolations(REALTIME_INVARIANTS.lost, conservationProblems(samples), stepOf, clock),
        ...toViolations(REALTIME_INVARIANTS.host, [...hostIdentityProblems(samples), ...(hostDied === undefined ? [] : [`o host sumiu no meio do soak: ${hostDied}`])], stepOf, clock),
      ]
      const last = samples[samples.length - 1]
      const boards = sides.map((side) => {
        const mine = (last?.cards ?? []).filter(card => card.projectId === side.tenant.projectId)
        const count = (stage: string): number => mine.filter(card => card.stage === stage).length
        return { projectId: side.tenant.projectId, todo: count('todo'), doing: count('doing'), review: count('review'), needsYou: count('blocked'), done: count('done') }
      })
      const report: SoakReport = {
        schema: SOAK_REPORT_SCHEMA, mode: 'realtime', seed: 0, simulatedHours: MINUTES / 60, steps: samples.length, stepMinutes: SAMPLE_MS / 60_000, boards,
        turnsByProject: { '*': v11.turns() }, nudges: 0, summaries: 0, approvalsPending: 0, injected, photos: samples.map(samplePhoto), violations, trace: [],
      }
      writeFileSync(join(OUT, 'report.json'), `${JSON.stringify({ ...report, measured: { rssSlopeMbPerHour: reading.rssSlopeMbPerHour, dbSlopeMbPerHour: reading.dbSlopeMbPerHour, rssPeakMb: reading.rssPeakMb, baselineChildren, childrenAtRest: last?.children, childNamesAtRest: last?.childNames, posts: seq, warmHour: WARM_HOUR, stuckAfterMin: STUCK_MS / 60_000 } }, null, 2)}\n`)
      const growth = growthAfter(report.photos, WARM_HOUR)
      writeFileSync(join(OUT, 'report.md'), `${renderSoakReport(report, new Date().toISOString(), { warmHour: WARM_HOUR })}\n## Medido (Probe, tempo real)\n\n- RSS da árvore do host: pico ${String(Math.round(reading.rssPeakMb))} MB; tendência ${reading.rssSlopeMbPerHour.toFixed(1)} MB/h depois de ${String(WARM_HOUR)} h (${String(reading.samplesUsed)} medições)\n- Banco: tendência ${reading.dbSlopeMbPerHour.toFixed(2)} MB/h\n- Cargas postadas: ${String(seq)}; filhos antes da carga: ${String(baselineChildren)}; no repouso: ${String(last?.children ?? 0)} (${JSON.stringify(last?.childNames ?? {})}) — o host mantém sessões quentes de propósito (pool), por isso o repouso só é julgado com teto (PERSONA_SOAK_MAX_CHILDREN) e por não crescer\n${growth === undefined ? '' : `- Crescimento depois do aquecimento: handles ${String(growth.resources)}, banco ${String(growth.dbBytes)} bytes, linhas ${String(growth.rows)}\n`}- Laço do quadro (M2): ainda não existe no host; este soak provou o que há hoje\n`)
      writeFileSync(join(OUT, 'children-lifetimes.json'), `${JSON.stringify([...lifetimes.values()].sort((a, b) => a.firstMin - b.firstMin), null, 2)}\n`)
      // The host closes HERE (the report is already written): what survives it for 10 s is a leaked child, whatever its kind (the same identity: PID + creation).
      await api?.dispose().catch(() => undefined)
      await v11.close()
      closed = true
      await sleep(10_000)
      const orphans = (await survivors(identities)).map(row => `${row.name} pid ${String(row.pid)}: ${row.cmd.slice(0, 120)}`)
      writeFileSync(join(OUT, 'orphans-after-close.json'), `${JSON.stringify({ childrenEverSeen: identities.length, survivorsAfter10s: orphans }, null, 2)}\n`)
      expect(violations, `ver ${join(OUT, 'report.md')}`).toEqual([])
      expect(orphans, 'filhos do host que sobreviveram ao fechamento do host (vazamento): ver orphans-after-close.json').toEqual([])
    } finally {
      await api?.dispose().catch(() => undefined)
      if (savedFlags === undefined) delete process.env.PERSONA_HOST_FLAGS
      else process.env.PERSONA_HOST_FLAGS = savedFlags
      if (!closed) await v11.close()
    }
  }, (MINUTES + 25) * 60_000)
})

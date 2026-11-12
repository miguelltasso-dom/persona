/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1 (`persona-spec/carbon/auditorias/colheita-s1.md`), P0-06: `steer` quebrado em todos os runners reais — "Direcionar agora" PERDE a mensagem
 * do usuário. `resolveRunner` embrulha o runner em mais de dez camadas e nenhuma repassa `steer`; `absorb` ignora o evento `steer:…` achando que o controle de trabalho cuida dele, e
 * `runner.steer` devolve `false`: o texto não vai ao CLI nem entra na fila.
 *
 * O cenário pelo WEB HOST (probe e CLI de mentira, 0 IA): uma Tarefa longa da Bia (turno de 9 s no stub); no meio dela a pessoa usa "Direcionar agora" com um texto que leva um sinal único.
 * CORRETO: o texto chega ao CLI — dentro do turno aberto (steer) ou num turno enfileirado logo depois —, NUNCA some. O stub marca cada turno pelos sinais que o prompt trouxe.
 *
 * ESTADO: o P0-06 foi CORRIGIDO na árvore depois da auditoria (12/11 ~03:30-03:45: `resolve-runner.ts` passou a repassar `steer` em cada camada). O cenário foi escrito para reproduzi-lo,
 * viu o bug já corrigido (modo `steer`, a mensagem chegou ao CLI como turno enfileirado) e ficou como teste NORMAL: regressão permanente. A observação (a Tarefa rodou e o host respondeu)
 * vem antes do veredito, para um verde por falha de observação não valer nada. A evidência de cada rodada fica em `artifacts/regressao/p0-06-observacao.json`.
 *
 *   PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/regressao-p0-06-steer-perde-mensagem.spec.ts   (sob `with-lock --lock build`; ~2 min)
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostRpcOk } from '../src/gauge-sb-ges.ts'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'
import { postAsPerson, until, v11Tenant, type V11Tenant } from '../src/v11-helpers.ts'

const TASK_TOKEN = 'PEDIDO-CARTAZ-4417'
const STEER_TOKEN = 'AJUSTE-VERDE-8820'

export interface SteerObservation {
  /** What the host answered to "Direcionar agora": `steer` (the open turn took it), `sent` (a normal message) or `undefined` (no answer). */
  readonly mode: string | undefined
  /** Some turn of the CLI carried the steered text. */
  readonly reachedCli: boolean
}

/** O veredito, PURO: todo motivo para dizer que o "Direcionar agora" perdeu a mensagem (vazio = a mensagem chegou ao CLI). */
export function steerLostProblems(seen: SteerObservation): string[] {
  const out: string[] = []
  if (seen.mode === undefined) out.push('o host não respondeu ao "Direcionar agora"')
  if (!seen.reachedCli) out.push(`a mensagem direcionada (modo "${String(seen.mode)}") nunca chegou ao CLI: nem dentro do turno aberto nem num turno enfileirado depois`)
  return out
}

describe('P0-06 — "Direcionar agora" não perde a mensagem (veredito do cenário, puro)', () => {
  it('a mensagem chegou ao CLI (por steer ou por fila): nada a acusar', () => {
    expect(steerLostProblems({ mode: 'steer', reachedCli: true })).toEqual([])
    expect(steerLostProblems({ mode: 'sent', reachedCli: true })).toEqual([])
  })
  it('acusa a mensagem perdida e a RPC sem resposta, cada um sozinho', () => {
    expect(steerLostProblems({ mode: 'sent', reachedCli: false })).toHaveLength(1)
    expect(steerLostProblems({ mode: 'steer', reachedCli: false })).toHaveLength(1)
    expect(steerLostProblems({ mode: undefined, reachedCli: true })).toHaveLength(1)
  })
})

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run).sequential('P0-06 — "Direcionar agora" no meio de uma Tarefa longa (web host, CLI de mentira)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regressao-p006-'))
  let session: RealPersonaSession
  let tenant: V11Tenant
  const scope = (): { workspaceId: string; projectId: string } => ({ workspaceId: tenant.workspaceId, projectId: tenant.projectId })

  beforeAll(async () => {
    session = await openRealPersonaApp({
      engine: { kind: 'fake', turnMs: 9_000, needles: [TASK_TOKEN, STEER_TOKEN] },
      cleanHostEnv: true,
      dismissOnboardingViaStorage: true,
      hostEnv: { PERSONA_REAL_CLI: '1' },
      home: join(dir, 'home'),
    })
    await session.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    const written = await until(session.page, async () => (await session.page.evaluate(() => localStorage.getItem('persona.tenant.v1'))) ?? undefined, 60_000, 500)
    expect(written, `the app never wrote its tenant; the page says: ${(await session.page.locator('body').innerText().catch(() => '?')).replace(/\s+/gu, ' ').slice(0, 400)}`).toBeDefined()
    tenant = await v11Tenant(session.page)
    await hostRpcOk(session.page, 'createPersona', {
      ...scope(), id: 'bia', name: 'Bia', title: 'Atendimento', description: 'Atende a padaria.', personality: 'Prestativa.', instructions: 'Fale em português, curto e claro.',
      avatarKind: 'gallery', avatarRef: 'luna', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: tenant.memberId,
    })
    const current = await hostRpcOk<Record<string, unknown>>(session.page, 'getAutonomy', { ...scope(), personaId: 'bia' })
    await hostRpcOk(session.page, 'setAutonomy', { ...scope(), ...current, personaId: 'bia', mode: 'act' })
  }, 240_000)

  afterAll(async () => {
    await session?.close().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  const turnWith = (token: string): boolean => session.fakeCli.invocations().some(call => call.event === 'turn' && call.needles?.[token] === true)
  let seen: SteerObservation | undefined

  it('OBSERVAÇÃO: a Tarefa longa da Bia começa, a pessoa usa "Direcionar agora" no meio dela e o host responde; o stub registrou o turno da Tarefa', async () => {
    await postAsPerson(session.page, tenant, `@Bia ${TASK_TOKEN}: monte o cartaz da promoção do pão de queijo`)
    // the turn is open: its process started and the stub has not finished it yet (a 9 s turn)
    const started = await until(session.page, async () => session.fakeCli.invocations().some(call => call.event === 'invoke' && call.argv.includes('stream-json')) || undefined, 60_000, 500)
    expect(started, 'o CLI da Bia nunca subiu').toBeDefined()
    await session.page.waitForTimeout(2_500)
    const steered = await hostRpcOk<{ mode?: string }>(session.page, 'steerWorkingTurn', {
      ...scope(), personaId: 'bia', subjectId: '', text: `${STEER_TOKEN}: use o fundo verde, não o azul`, streamKind: 'channel', ownerId: tenant.channelId,
    }).catch(() => undefined)
    // wait for the long turn to end and for any queued one to run
    const reached = await until(session.page, async () => turnWith(STEER_TOKEN) || undefined, 60_000, 1_000)
    const turns = session.fakeCli.invocations().filter(call => call.event === 'turn').map(call => JSON.stringify(call.needles))
    expect(turnWith(TASK_TOKEN), `o stub nunca registrou o turno da Tarefa: ${JSON.stringify(turns)}`).toBe(true)
    expect(steered, 'o host não respondeu ao "Direcionar agora"').toBeDefined()
    seen = { mode: steered?.mode, reachedCli: reached === true }
    // the harness keeps the console quiet: the evidence of the run goes to a file (artifacts are not versioned)
    const evidence = join(ARTIFACTS_DIR, 'regressao')
    mkdirSync(evidence, { recursive: true })
    writeFileSync(join(evidence, 'p0-06-observacao.json'), JSON.stringify({ at: new Date().toISOString(), seen, turnsDoStub: turns, invocacoes: session.fakeCli.invocations().filter(call => call.event === 'turn' || call.event === 'invoke').map(call => ({ event: call.event, proc: call.proc ?? call.pid, argv: call.event === 'invoke' ? call.argv.slice(1, 7).join(' ') : undefined, needles: call.needles })) }, null, 2))
  }, 300_000)

  // CORRIGIDO na árvore de 12/11 ~03:30-03:45 (as camadas de `resolveRunner` passam a repassar `steer`; o texto chega ao CLI como turno enfileirado, modo "steer"): teste NORMAL, regressão permanente.
  it('CORRETO (P0-06, corrigido): a mensagem direcionada chega ao CLI, dentro do turno aberto ou num turno enfileirado', () => {
    expect(steerLostProblems(seen!), JSON.stringify(seen)).toEqual([])
  })
})

/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1 (`persona-spec/carbon/auditorias/colheita-s1.md`), P0-07: `withThreadResume({ shared: true })` fixa uma chave única de sessão
 * para TODAS as conversas de uma persona, então o histórico nativo do CLI (processo vivo / `--resume`) vaza da DM privada para o #geral (e para /lado, fanout, indicadores).
 *
 * O cenário pelo WEB HOST (probe e CLI de mentira, 0 IA): a pessoa conta um segredo à Bia numa DM privada e depois pergunta algo à Bia no #geral. O stub marca cada turno pelo sinal
 * único que o prompt trouxe e registra o processo que o atendeu e o `--resume` com que subiu. CORRETO: cada conversa (`dm:<id>`, `channel:<id>`) tem a sua sessão — o turno do #geral
 * NÃO roda no processo da DM e NÃO sobe com `--resume` da sessão da DM.
 *
 * ESTADO: o veredito é puro e provado nos dois lados abaixo; o cenário fim a fim reproduz o P0-07 hoje, então a assertiva do comportamento correto está em `it.fails` e vira teste normal
 * quando o dono (Cobalt, 2a/runner) corrigir e o Carbon reauditar. Evidência do que o stub viu vai na mensagem de falha.
 *
 *   PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/regressao-p0-07-resume-entre-dms.spec.ts   (sob `with-lock --lock build`; ~1,5 min)
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostRpcOk } from '../src/gauge-sb-ges.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'
import { postAsPerson, until, v11Tenant, type HostMessage, type V11Tenant } from '../src/v11-helpers.ts'

const DM_TOKEN = 'SEGREDO-DM-7731'
const GERAL_TOKEN = 'PERGUNTA-GERAL-9902'

/** One turn the stub answered: the process that answered it and the `--resume` that process was started with. */
export interface TurnSeen {
  readonly proc: number
  readonly resumedFrom: string | undefined
}

/** O veredito, PURO: todo motivo para dizer que o histórico de uma conversa vazou para a outra (vazio = cada conversa tem a sua sessão). */
export function resumeLeakProblems(dm: TurnSeen | undefined, geral: TurnSeen | undefined): string[] {
  if (dm === undefined || geral === undefined) return [`não foi possível observar os dois turnos (DM: ${dm === undefined ? 'sem turno' : 'ok'}; #geral: ${geral === undefined ? 'sem turno' : 'ok'})`]
  const out: string[] = []
  if (dm.proc === geral.proc) out.push(`o turno do #geral rodou no MESMO processo do CLI (${String(geral.proc)}) que atendeu a DM privada: a sessão é compartilhada`)
  if (geral.resumedFrom !== undefined && geral.resumedFrom === `fake-session-${String(dm.proc)}`) out.push(`o turno do #geral subiu com --resume da sessão da DM (${geral.resumedFrom})`)
  return out
}

describe('P0-07 — o histórico de uma DM privada não vaza para outra conversa (veredito do cenário, puro)', () => {
  it('cada conversa na sua sessão: nada a acusar', () => {
    expect(resumeLeakProblems({ proc: 100, resumedFrom: undefined }, { proc: 200, resumedFrom: undefined })).toEqual([])
    expect(resumeLeakProblems({ proc: 100, resumedFrom: undefined }, { proc: 200, resumedFrom: 'fake-session-200' })).toEqual([]) // retomar a SUA própria sessão é certo
  })
  it('acusa o mesmo processo, o --resume da sessão da DM e a observação que faltou — cada um sozinho', () => {
    expect(resumeLeakProblems({ proc: 100, resumedFrom: undefined }, { proc: 100, resumedFrom: undefined })).toHaveLength(1)
    expect(resumeLeakProblems({ proc: 100, resumedFrom: undefined }, { proc: 200, resumedFrom: 'fake-session-100' })).toHaveLength(1)
    expect(resumeLeakProblems({ proc: 100, resumedFrom: undefined }, { proc: 100, resumedFrom: 'fake-session-100' })).toHaveLength(2)
    expect(resumeLeakProblems(undefined, { proc: 1, resumedFrom: undefined })).toHaveLength(1)
  })
})

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run).sequential('P0-07 — a DM privada e o #geral com a mesma persona (web host, CLI de mentira)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'regressao-p007-'))
  let session: RealPersonaSession
  let tenant: V11Tenant
  const scope = (): { workspaceId: string; projectId: string } => ({ workspaceId: tenant.workspaceId, projectId: tenant.projectId })

  beforeAll(async () => {
    session = await openRealPersonaApp({
      engine: { kind: 'fake', turnMs: 1_500, needles: [DM_TOKEN, GERAL_TOKEN] },
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
  }, 240_000)

  afterAll(async () => {
    await session?.close().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  /** The turn whose prompt carried the token, with the process that answered it and the `--resume` that process started with. */
  const turnWith = (token: string): TurnSeen | undefined => {
    const calls = session.fakeCli.invocations()
    const turn = calls.find(call => call.event === 'turn' && call.needles?.[token] === true)
    if (turn?.proc === undefined) return undefined
    const started = calls.find(call => call.event === 'invoke' && call.pid === turn.proc)
    const at = started?.argv.indexOf('--resume') ?? -1
    return { proc: turn.proc, resumedFrom: at >= 0 ? started?.argv[at + 1] : undefined }
  }

  async function answered(streamKind: 'dm' | 'channel', ownerId: string): Promise<HostMessage | undefined> {
    return until(session.page, async () => {
      const got = await hostRpcOk<{ events: HostMessage[] }>(session.page, 'listMessages', { ...scope(), streamKind, ownerId, actorId: tenant.memberId, afterSeq: 0, limit: 100 })
      return got.events.find(message => message.actorId === 'bia' && message.body.trim() !== '')
    }, 90_000, 1_000)
  }

  let dmTurn: TurnSeen | undefined
  let geralTurn: TurnSeen | undefined

  it('OBSERVAÇÃO: a pessoa conta o segredo na DM, pergunta no #geral, a Bia responde nas duas e o stub registrou os DOIS turnos (sem isto o veredito abaixo não vale nada)', async () => {
    const dm = await hostRpcOk<{ id: string }>(session.page, 'createDm', { ...scope(), id: 'dm-ana-bia', participantA: tenant.memberId, participantB: 'bia' })
    await hostRpcOk(session.page, 'postMessage', {
      id: 'dm-1', ...scope(), streamKind: 'dm', ownerId: dm.id, body: `Guarde só para você (${DM_TOKEN}): o cofre fica atrás do forno.`, actorId: tenant.memberId, subjectId: '',
    })
    expect(await answered('dm', dm.id), 'a Bia não respondeu na DM').toBeDefined()
    await postAsPerson(session.page, tenant, `@Bia ${GERAL_TOKEN}: o que a Ana te contou em particular?`)
    expect(await answered('channel', tenant.channelId), 'a Bia não respondeu no #geral').toBeDefined()
    // the stub writes its log when the turn ends: wait until BOTH turns are in it
    const both = await until(session.page, async () => { const first = turnWith(DM_TOKEN); const second = turnWith(GERAL_TOKEN); return first !== undefined && second !== undefined ? { first, second } : undefined }, 30_000, 500)
    const summary = session.fakeCli.invocations().filter(call => call.event === 'turn' || call.event === 'invoke').map(call => `${call.event}:${String(call.proc ?? call.pid)}${call.event === 'turn' ? ` needles=${JSON.stringify(call.needles)}` : ` ${call.argv.slice(1, 6).join(' ')}`}`)
    expect(both, `the stub did not log both turns: ${JSON.stringify(summary)}`).toBeDefined()
    dmTurn = both!.first
    geralTurn = both!.second
  }, 300_000)

  // P0-07 CORRIGIDO (Forge, 12/11): cada conversa roda na sua sessão do CLI (thread por stream); a assertiva do comportamento correto agora é um teste normal, a regressão permanente.
  const expectedRed = it
  expectedRed('CORRETO (P0-07 corrigido): o turno do #geral não roda na sessão da DM privada e não sobe com o --resume dela', () => {
    expect(resumeLeakProblems(dmTurn, geralTurn), JSON.stringify({ dmTurn, geralTurn })).toEqual([])
  })
})

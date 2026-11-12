/**
 * COLHEITA item 13, cenário RED fim a fim pelo WEB HOST (0 IA): "ligar a assinatura para o time" quando a CLI da conta escolhida ESTOURA O TEMPO.
 * Uma CLI que demora a responder o login NÃO é uma CLI deslogada: a linha da pessoa tem de dizer "não consegui conferir" (`nao_conferido`), NUNCA "sem login" (`sem_login`), e o aviso
 * do time nunca pode acusar um logout que ninguém confirmou (`without` só tem falta CONFIRMADA).
 *
 * É o probe REAL (`detectConnections`) contra CLIs de mentira (`fake-cli`): o stub muda de resposta no meio do teste por arquivos-chave (`authOutFile`: "não logado" confirmado;
 * `authHangFile`: não responde dentro do tempo do probe, 8 s). O host em processo não serve aqui: sob Vitest o detector padrão devolve `[]`; só o web host roda o detector de verdade.
 *
 * ACEITE do Keel (12/11 01:11): o cenário REPROVA num stub defeituoso e PASSA no produto. O defeituoso é o stub que, em vez de travar, diz "não logado" de verdade: o produto então
 * escreve `sem_login` (certo para aquele stub) e o veredito do cenário "só estourou o tempo" ACUSA — prova que o cenário separa estouro de tempo de logout.
 *
 *   PERSONA_E2E=1 pnpm exec vitest run packages/persona/persona-e2e/tests/colheita-conectar-time.spec.ts   (sob `with-lock --lock build`; ~2 min, um host)
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hostRpcOk } from '../src/gauge-sb-ges.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'
import { until, v11Tenant, type V11Tenant } from '../src/v11-helpers.ts'

interface TeamAi { readonly without: ReadonlyArray<{ readonly personaId: string; readonly name: string }>; readonly unsure: number; readonly choices: ReadonlyArray<{ readonly id: string; readonly provider: string }> }
interface TeamView { readonly state: string; readonly accountId?: string; readonly rows: ReadonlyArray<{ readonly personaId: string; readonly name: string; readonly status: string; readonly reason?: string }> }
interface Card { readonly id: string; readonly phase: string; readonly loggedIn: boolean; readonly unconfirmed?: boolean }

/** O veredito, PURO: todo motivo para dizer que um estouro de tempo foi lido como logout (vazio = o produto está certo). */
export function timeoutReadAsLogout(view: TeamView, banner: TeamAi, expectedRows: number): string[] {
  const out: string[] = []
  const wrongWords = view.rows.filter(row => row.reason === 'sem_login')
  if (wrongWords.length > 0) out.push(`${wrongWords.map(row => row.name).join(', ')}: a linha diz "sem login" (sem_login) mas a CLI só estourou o tempo`)
  const connected = view.rows.filter(row => row.status === 'conectada')
  if (connected.length > 0) out.push(`${connected.map(row => row.name).join(', ')}: ficou "conectada" sem que a CLI tenha respondido`)
  const notTold = view.rows.filter(row => row.status === 'nao_conectou' && row.reason !== 'nao_conferido' && row.reason !== 'sem_login') // "sem_login" is already reported above
  if (notTold.length > 0) out.push(`${notTold.map(row => row.name).join(', ')}: não conectou sem dizer "não consegui conferir" (nao_conferido)`)
  if (view.rows.length !== expectedRows) out.push(`o time tinha ${String(expectedRows)} pessoa(s) sem IA e a lista tem ${String(view.rows.length)} linha(s)`)
  if (banner.without.length > 0) out.push(`o aviso do time acusa ${banner.without.map(person => person.name).join(', ')} de estar sem IA, mas ninguém confirmou um logout`)
  return out
}

const row = (name: string, status: string, reason?: string): TeamView['rows'][number] => ({ personaId: name.toLowerCase(), name, status, ...(reason === undefined ? {} : { reason }) })
const quiet: TeamAi = { without: [], unsure: 3, choices: [] }

describe('13 — estouro de tempo não é logout (veredito do cenário, puro)', () => {
  it('o produto certo: todas "não consegui conferir", nada conectado, o aviso não acusa ninguém', () => {
    const view: TeamView = { state: 'partial', rows: ['Bia', 'Téo', 'Caio'].map(name => row(name, 'nao_conectou', 'nao_conferido')) }
    expect(timeoutReadAsLogout(view, quiet, 3)).toEqual([])
  })
  it('acusa cada leitura errada sozinha', () => {
    const base: TeamView['rows'] = ['Bia', 'Téo', 'Caio'].map(name => row(name, 'nao_conectou', 'nao_conferido'))
    expect(timeoutReadAsLogout({ state: 'partial', rows: [row('Bia', 'nao_conectou', 'sem_login'), base[1]!, base[2]!] }, quiet, 3)).toHaveLength(1)
    expect(timeoutReadAsLogout({ state: 'partial', rows: [row('Bia', 'conectada'), base[1]!, base[2]!] }, quiet, 3)).toHaveLength(1)
    expect(timeoutReadAsLogout({ state: 'partial', rows: [row('Bia', 'nao_conectou', 'falhou'), base[1]!, base[2]!] }, quiet, 3)).toHaveLength(1)
    expect(timeoutReadAsLogout({ state: 'partial', rows: base.slice(0, 2) }, quiet, 3)).toHaveLength(1)
    expect(timeoutReadAsLogout({ state: 'partial', rows: base }, { ...quiet, without: [{ personaId: 'bia', name: 'Bia' }] }, 3)).toHaveLength(1)
  })
})

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run).sequential('13 — ligar a assinatura para o time com a CLI da conta estourando o tempo (web host, probe real, CLIs de mentira)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'colheita-conectar-time-'))
  const outFile = join(dir, 'auth-out.txt')
  const hangFile = join(dir, 'auth-hang.txt')
  let session: RealPersonaSession
  let tenant: V11Tenant
  const scope = (): { workspaceId: string; projectId: string } => ({ workspaceId: tenant.workspaceId, projectId: tenant.projectId })
  const TEAM = [{ id: 'bia', name: 'Bia', title: 'Texto' }, { id: 'teo', name: 'Téo', title: 'Arte' }, { id: 'caio', name: 'Caio', title: 'Mídia' }]

  beforeAll(async () => {
    writeFileSync(outFile, 'codex') // o time está no codex, deslogado de verdade (CONFIRMADO); o claude está logado
    session = await openRealPersonaApp({
      engine: { kind: 'fake', authOutFile: outFile, authHangFile: hangFile },
      cleanHostEnv: true, // sem variáveis do Vitest: sob Vitest o detector padrão devolve []
      dismissOnboardingViaStorage: true,
      hostEnv: { PERSONA_REAL_CLI: '1' },
      home: join(dir, 'home'),
    })
    // The app writes its tenant (`persona.tenant.v1`) once the shell is up: wait for it, as the TEAM-10 driver does, before reading.
    await session.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    const written = await until(session.page, async () => (await session.page.evaluate(() => localStorage.getItem('persona.tenant.v1'))) ?? undefined, 60_000, 500)
    expect(written, 'the app never wrote its tenant').toBeDefined()
    tenant = await v11Tenant(session.page)
    for (const member of TEAM) {
      await hostRpcOk(session.page, 'createPersona', {
        ...scope(), id: member.id, name: member.name, title: member.title, description: `${member.title} do time.`, personality: 'Prestativa.', instructions: 'Fale em português, curto e claro.',
        avatarKind: 'gallery', avatarRef: 'sol', runnerKind: 'cli', runnerCli: 'codex', runnerModel: 'default', canRecruit: false, createdBy: tenant.memberId,
      })
    }
  }, 240_000)

  afterAll(async () => {
    await session?.close().catch(() => undefined)
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  it('PRODUTO: a conta (claude) estoura o tempo ao reconferir → as 3 linhas dizem "não consegui conferir", nenhuma "sem login", e o aviso não acusa ninguém', async () => {
    const page = session.page
    // 1 — o probe REAL respondeu: o codex está deslogado (confirmado) e o claude logado
    const cards = await until(page, async () => {
      const found = await hostRpcOk<Card[]>(page, 'listConnections', scope())
      const codex = found.find(card => card.id === 'codex')
      const claude = found.find(card => card.id === 'claude')
      return codex?.phase === 'ready' && claude?.phase === 'ready' ? found : undefined
    }, 120_000, 1_500)
    expect(cards, 'o probe não terminou: não há o que provar').toBeDefined()
    expect(cards!.find(card => card.id === 'codex')).toMatchObject({ loggedIn: false })
    expect(cards!.find(card => card.id === 'claude')).toMatchObject({ loggedIn: true })
    // 2 — as 3 pessoas estão SEM IA de verdade (falta confirmada) e a conta do claude é oferecida
    const before = await hostRpcOk<TeamAi>(page, 'getTeamAi', scope())
    expect(before.without.map(person => person.name).sort()).toEqual(['Bia', 'Caio', 'Téo'])
    expect(before.unsure).toBe(0)
    expect(before.choices.map(choice => choice.id)).toContain('claude')
    // 3 — a partir de agora o claude não responde o login dentro do tempo do probe; uma pessoa liga o time nele
    writeFileSync(hangFile, 'claude')
    const started = await hostRpcOk<{ ok: boolean }>(page, 'connectTeam', { ...scope(), accountId: 'claude' })
    expect(started.ok).toBe(true)
    const done = await until(page, async () => {
      const view = await hostRpcOk<TeamView>(page, 'getTeamConnect', scope())
      return view.state === 'running' ? undefined : view
    }, 120_000, 1_500)
    expect(done, 'a ligação do time nunca terminou').toBeDefined()
    const after = await hostRpcOk<TeamAi>(page, 'getTeamAi', scope())
    const reasons = timeoutReadAsLogout(done!, after, 3)
    expect(reasons, JSON.stringify({ done, after })).toEqual([])
    expect(done!.rows.map(item => item.reason)).toEqual(['nao_conferido', 'nao_conferido', 'nao_conferido'])
  }, 300_000)

  it('STUB DEFEITUOSO (em vez de travar, o claude diz "não logado" de verdade): a linha vira "sem login" e o veredito do cenário ACUSA', async () => {
    const page = session.page
    writeFileSync(hangFile, '') // para de travar
    writeFileSync(outFile, 'claude,codex') // agora o claude está deslogado de VERDADE
    const view = await hostRpcOk<TeamView>(page, 'retryTeamPersona', { ...scope(), personaId: 'bia' })
    const bia = view.rows.find(item => item.name === 'Bia')
    expect(bia, JSON.stringify(view)).toMatchObject({ status: 'nao_conectou', reason: 'sem_login' }) // para ESTE stub o produto está certo: o logout é confirmado
    const banner = await hostRpcOk<TeamAi>(page, 'getTeamAi', scope())
    const reasons = timeoutReadAsLogout(view, banner, 3)
    expect(reasons.length).toBeGreaterThanOrEqual(1) // o veredito de "só estourou o tempo" reprova esta observação
    expect(reasons.join('\n')).toMatch(/sem login/u)
  }, 240_000)
})

/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1 (`persona-spec/carbon/auditorias/colheita-s1.md`), P0-12 — processos órfãos no Windows: o processo `claude` (e o `chrome-devtools-mcp`) da persona
 * continuava VIVO (clicando e digitando na janela do usuário) depois de "Assumir controle" (`evictWarmRunners` não chegava a nenhum `dispose()`: `createOarSessionRunner` não o implementava), e ao
 * FECHAR o app o host nunca fechava os Chromes, a Estação nem os trabalhos destacados, deixando árvores `chrome.exe`/`powershell.exe` órfãs.
 *
 * O cenário pelo HOST em processo com o runner REAL e o CLI de mentira (0 IA): a Bia conversa (o stub do `claude` sobe e fica quente), e o teste mede se o PROCESSO do CLI continua vivo
 *   A  depois de "Assumir controle" (o host despeja o runner quente dela): tem de morrer;
 *   B  depois de FECHAR o host (`dispose`, o desligamento gracioso do produto): tem de morrer.
 * O harness web (`startWebHost`) encerra o host matando a ÁRVORE (`taskkill /T /F`), o que esconderia qualquer órfão: por isso o cenário é em processo, onde o `dispose` é o do produto.
 * Cada cenário tem antes um teste de OBSERVAÇÃO (o stub subiu e está vivo: sem isto "não sobrou ninguém" não prova nada). O estado hoje fica no resultado (`it.fails` enquanto o dono — Bolt — não entregar).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withFakeCliOnPath, type FakeCliPathScope } from '../src/fake-cli.ts'
import { openRemoteTeamHarness, type RemoteTeamHarness } from '../../persona-host/tests/remote-team-harness.ts'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms) })

/** Whether a process with this id is still alive (signal 0 only asks; a process we do not own would throw EPERM, which also means "alive"). */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** O veredito, PURO: todo processo do CLI que ainda vive depois de o host tê-lo despejado/fechado (vazio = ninguém sobrou). */
export function orphanProblems(stillAlive: readonly number[], when: string): string[] {
  return stillAlive.map(pid => `o processo do CLI ${String(pid)} continua VIVO depois de ${when}`)
}

describe('P0-12 — vereditos do cenário (puros)', () => {
  it('ninguém vivo passa; cada processo vivo é acusado com o momento', () => {
    expect(orphanProblems([], 'fechar o host')).toEqual([])
    expect(orphanProblems([101, 102], 'Assumir controle')).toHaveLength(2)
  })
  it('isAlive: o próprio processo está vivo; um id que não existe, não', () => {
    expect(isAlive(process.pid)).toBe(true)
    expect(isAlive(2_147_000_000)).toBe(false)
  })
})

const dirs: string[] = []
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }) })

describe('P0-12 — o processo do CLI não sobrevive a "Assumir controle" nem ao fim do host (host em processo, runner real, CLI de mentira)', () => {
  let cli: FakeCliPathScope | undefined
  let harness: RemoteTeamHarness | undefined
  beforeEach(() => {
    vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1')
    vi.stubEnv('PERSONA_REAL_CLI', '1') // the REAL runner path (the scripted runner never spawns anything)
  })
  afterEach(async () => {
    await harness?.dispose().catch(() => undefined)
    harness = undefined
    cli?.restore()
    cli = undefined
    vi.unstubAllEnvs()
  })

  /** A host whose Bia (claude) has answered one DM through the REAL runner path: her warm CLI is up. Returns the pids of the stub processes that answered. */
  async function biaHasAWarmCli(): Promise<number[]> {
    const dir = mkdtempSync(join(tmpdir(), 'regressao-p012-'))
    dirs.push(dir)
    cli = withFakeCliOnPath({ turnMs: 200, needles: ['ROTINA-DA-BIA'] })
    harness = openRemoteTeamHarness(join(dir, 'p.db'))
    const h = harness.h
    h.createWorkspace({ id: 'ws', name: 'Padaria Lua', personalProjectId: 'pp' })
    h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
    h.createPersona({
      workspaceId: 'ws', projectId: 'pp', id: 'bia', name: 'Bia', title: 'Atendimento', description: 'Atende.', personality: 'Calma.', instructions: 'Ajude.',
      avatarKind: 'gallery', avatarRef: 'luna', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'haiku', canRecruit: false, createdBy: 'ana',
    })
    h.createDm({ id: 'dm-bia', workspaceId: 'ws', projectId: 'pp', participantA: 'ana', participantB: 'bia' })
    h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
    h.orchestration.scripted = false
    h.postMessage({ id: 'd1', workspaceId: 'ws', projectId: 'pp', streamKind: 'dm', ownerId: 'dm-bia', body: 'Bia, ROTINA-DA-BIA: bom dia!', actorId: 'ana', subjectId: 'd1', occurredAt: new Date().toISOString() })
    await h.orchestration.flush('pp')
    for (let waited = 0; waited < 20_000; waited += 500) {
      if (cli.invocations().some(call => call.event === 'turn' && call.needles?.['ROTINA-DA-BIA'] === true)) break
      await sleep(500)
    }
    return [...new Set(cli.invocations().filter(call => call.event === 'turn' && call.proc !== undefined).map(call => call.proc!))]
  }

  const aliveAfter = async (pids: readonly number[], maxMs: number): Promise<number[]> => {
    for (let waited = 0; waited < maxMs; waited += 250) {
      if (pids.every(pid => !isAlive(pid))) return []
      await sleep(250)
    }
    return pids.filter(isAlive)
  }

  let pids: number[] = []

  it('OBSERVAÇÃO: a Bia respondeu pelo runner real, o stub do claude subiu e está VIVO (sem isto "não sobrou ninguém" não prova nada)', async () => {
    pids = await biaHasAWarmCli()
    expect(pids.length, `o stub nunca atendeu a Bia: ${JSON.stringify(cli?.invocations().filter(call => call.event === 'turn' || call.event === 'invoke').map(call => `${call.event}:${String(call.proc ?? call.pid)}`))}`).toBeGreaterThan(0)
    expect(pids.every(isAlive), 'o processo quente do CLI devia estar vivo antes de despejar').toBe(true)
  }, 120_000)

  it('A — "Assumir controle": o host despeja o runner quente da Bia e o processo do CLI MORRE', async () => {
    const warm = await biaHasAWarmCli()
    expect(warm.length).toBeGreaterThan(0)
    harness!.h.orchestration.evictWarmRunners('pp', 'bia')
    expect(orphanProblems(await aliveAfter(warm, 8_000), 'o runner quente ser despejado (Assumir controle)')).toEqual([])
  }, 120_000)

  it('B — fechar o host (dispose, o desligamento do produto): o processo do CLI MORRE', async () => {
    const warm = await biaHasAWarmCli()
    expect(warm.length).toBeGreaterThan(0)
    await harness!.dispose()
    harness = undefined
    expect(orphanProblems(await aliveAfter(warm, 8_000), 'fechar o host')).toEqual([])
  }, 120_000)
})

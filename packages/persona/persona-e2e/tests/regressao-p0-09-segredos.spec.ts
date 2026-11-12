/**
 * REGRESSÃO do Carbon, auditoria do snapshot 1 (`persona-spec/carbon/auditorias/colheita-s1.md`), P0-09 — Cofre v2 / H15b / H15c, segredo que vaza ou é sobrescrito:
 *   1  `saveCofreKey` aceitava um `id` da rede no MESMO namespace dos segredos de conector (`connector:*`), do webhook do GitHub, dos códigos 2FA (`code:*`) e do slot `default`:
 *      qualquer escritor sobrescrevia o segredo HMAC do webhook (forjava entregas) ou a credencial do conector;
 *   2  um banco com tokens ANTIGOS (inclusive um já rotacionado/revogado) subia, criava o backup ANTES da migração e a migração só limpava a linha ativa: sobravam linhas revogadas, versões e
 *      o backup em texto claro no SQLite, e os tokens saíam em claro no `.zip` de `exportProject`;
 *   3  num pedido de chat, uma persona restrita pelo dono a SÓ LEITURA recebia pré-autorização para mudar e enviar (`connector-policy`).
 *
 * O cenário pelo HOST com banco em ARQUIVO (0 IA): fase 1 grava o legado em texto claro (token ativo, token rotacionado/revogado, webhook, credencial IMAP) e fecha; fase 2 REABRE o mesmo
 * arquivo (o boot roda a migração) e então varre os BYTES de tudo que ficou no disco (banco, `-wal`, `-shm`, backups), o `.zip` do export, e confere que os segredos foram para o Cofre
 * selado (migrar não é perder). ESTADO: CORRIGIDO na árvore depois da auditoria (ids reservados, `purgeSecretFacts`, `scrubBackups`, teto de "só leitura"). Ficou NORMAL: regressão permanente.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VAULT_IMAP, VAULT_TELEGRAM } from '@deepseek-ai/dsh-persona-vault'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectorSlot, GITHUB_WEBHOOK_FACT } from '../../persona-host/src/cofre-migrate.ts'
import { decideConnectorUse } from '../../persona-host/src/connector-policy.ts'
import { readZipTexts } from '../../persona-host/src/export-md.ts'
import { openRemoteTeamHarness, type RemoteTeamHarness } from '../../persona-host/tests/remote-team-harness.ts'

const TG_OLD = 'tg-ROTACIONADO-9f3a-111111111'
const TG_NEW = 'tg-ATIVO-7c1d-222222222'
const WEBHOOK = 'whsec-WEBHOOK-4b8e-333333333'
const IMAP = JSON.stringify({ host: 'imap.padarialua.example', port: 993, secure: true, user: 'loja', password: 'imap-SENHA-5d2f-444444444' })
const SECRETS: Readonly<Record<string, string>> = { 'token rotacionado (revogado)': TG_OLD, 'token ativo do Telegram': TG_NEW, 'segredo do webhook': WEBHOOK, 'senha do IMAP': 'imap-SENHA-5d2f-444444444' }

interface Leak { readonly where: string; readonly what: string }

/** O veredito, PURO: onde cada segredo ainda aparece em claro (vazio = em lugar nenhum). */
export function leakProblems(leaks: readonly Leak[]): string[] {
  return leaks.map(leak => `${leak.what} aparece em claro em ${leak.where}`)
}

/** Every file under `root` (the database, its WAL and SHM, the backups), as path → bytes; a file above 80 MB is skipped (none of these is that big). */
function filesUnder(root: string): Array<{ readonly path: string; readonly bytes: Buffer }> {
  const out: Array<{ path: string; bytes: Buffer }> = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else if (stat.size <= 80 * 1024 * 1024) out.push({ path, bytes: readFileSync(path) })
    }
  }
  walk(root)
  return out
}

/** Every secret that is in the bytes of the files under `root` that `keep` selects. */
function leaksOnDisk(root: string, keep: (path: string) => boolean = () => true): Leak[] {
  const found: Leak[] = []
  for (const file of filesUnder(root).filter(item => keep(item.path))) {
    for (const [what, secret] of Object.entries(SECRETS)) if (file.bytes.includes(Buffer.from(secret, 'utf8'))) found.push({ where: file.path.replace(root, '…'), what })
  }
  return found
}
const isMainDatabase = (path: string): boolean => /[\\/]p\.db$/u.test(path)

describe('P0-09 — vereditos do cenário (puros)', () => {
  it('sem vazamento nada a acusar; cada segredo em claro é acusado com o lugar', () => {
    expect(leakProblems([])).toEqual([])
    expect(leakProblems([{ where: '…\\p.db', what: 'token ativo do Telegram' }])).toEqual(['token ativo do Telegram aparece em claro em …\\p.db'])
  })
})

describe('P0-09 — a política de conector: "só leitura" é um TETO que o pedido do chat não levanta (pura)', () => {
  const useOf = (access: 'read' | 'write', autonomy: string, actionClass: string): Parameters<typeof decideConnectorUse>[0] =>
    ({ origin: 'request', autonomy, actionClass, grant: { access, confirm: { send: 'ask', pay: 'ask', delete: 'ask' } } }) as unknown as Parameters<typeof decideConnectorUse>[0]
  it('com "só leitura", um pedido de chat que muda ou envia NÃO é pré-autorizado, nem com a persona autônoma', () => {
    for (const actionClass of ['change', 'send']) {
      for (const autonomy of ['asked', 'propose', 'act']) {
        expect(decideConnectorUse(useOf('read', autonomy, actionClass)), `${actionClass} com autonomia ${autonomy}`).not.toBe('run-and-report')
      }
    }
  })
  it('OBSERVAÇÃO: com "escrita", o mesmo pedido de chat que muda é executado e avisado; ler sempre roda', () => {
    expect(decideConnectorUse(useOf('write', 'act', 'change'))).toBe('run-and-report')
    expect(decideConnectorUse(useOf('read', 'asked', 'read'))).toBe('run')
  })
})

const dirs: string[] = []
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }) })
beforeEach(() => { vi.stubEnv('PERSONA_VAULT_TEST_CIPHER', '1') })
afterEach(() => { vi.unstubAllEnvs() })

const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

/** Phase 1: a database that an OLDER build left behind: every secret as the body of a Cofre record, one of them already rotated (revoked). Then the host is closed. */
async function legacyDatabase(): Promise<{ readonly root: string; readonly database: string }> {
  const root = mkdtempSync(join(tmpdir(), 'regressao-p009-'))
  dirs.push(root)
  mkdirSync(root, { recursive: true })
  const database = join(root, 'p.db')
  const first = openRemoteTeamHarness(database)
  try {
    const h = first.h
    h.createWorkspace({ id: 'ws', name: 'Padaria Lua', personalProjectId: 'pp' })
    h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
    const base = { workspaceId: 'ws', projectId: 'pp', kind: 'memory' as const, authorId: 'ana', visibility: { kind: 'workspace' as const }, sourceIds: [] as string[] }
    h.vault.createRecord({ ...base, id: 'old-tg', body: TG_OLD, factKey: VAULT_TELEGRAM })
    h.vault.revokeRecord('old-tg')
    h.vault.createRecord({ ...base, id: 'new-tg', body: TG_NEW, factKey: VAULT_TELEGRAM })
    h.vault.createRecord({ ...base, id: 'hook', body: WEBHOOK, factKey: GITHUB_WEBHOOK_FACT })
    h.vault.createRecord({ ...base, id: 'imap', body: IMAP, factKey: VAULT_IMAP })
    await first.h.cofreMigration
  } finally {
    await first.dispose()
  }
  return { root, database }
}

describe('P0-09 — um banco com tokens antigos sobe, migra e não deixa segredo em claro (host com banco em arquivo, 0 IA)', () => {
  let second: RemoteTeamHarness | undefined
  afterEach(async () => { await second?.dispose(); second = undefined })

  it('OBSERVAÇÃO: o banco legado TEM os segredos em claro antes do boot (sem isto, "não achar" nada não prova nada)', async () => {
    const { root } = await legacyDatabase()
    const before = leaksOnDisk(root)
    expect(before.map(leak => leak.what), `o legado devia ter os 4 segredos em claro no disco: ${JSON.stringify(before)}`).toEqual(expect.arrayContaining(Object.keys(SECRETS)))
  })

  it('depois do boot (a migração roda): nenhuma LINHA do banco, nenhum WAL/SHM e nenhum backup guarda segredo em claro — e os segredos estão no Cofre selado', async () => {
    const { root, database } = await legacyDatabase()
    second = openRemoteTeamHarness(database)
    const migrated = await second.h.cofreMigration
    // migrar não é perder: os 3 segredos ativos estão no Cofre selado, sob o slot do conector
    expect(migrated.migrated, 'a migração devia mover os segredos ativos').toBeGreaterThanOrEqual(3)
    expect(await second.h.cofreSecrets.read('pp', connectorSlot(VAULT_TELEGRAM))).toBe(TG_NEW)
    expect(await second.h.cofreSecrets.read('pp', connectorSlot(GITHUB_WEBHOOK_FACT))).toBe(WEBHOOK)
    expect(await second.h.cofreSecrets.read('pp', connectorSlot(VAULT_IMAP))).toBe(IMAP)
    // as LINHAS: nenhuma tabela guarda um segredo (o revogado e as versões incluídos)
    const rows: Leak[] = []
    for (const table of (second.h.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(row => row.name)) {
      const text = JSON.stringify(second.h.store.db.prepare(`SELECT * FROM "${table}"`).all())
      for (const [what, secret] of Object.entries(SECRETS)) if (text.includes(secret)) rows.push({ where: `a tabela ${table}`, what })
    }
    expect(leakProblems(rows)).toEqual([])
    // os outros arquivos do disco: WAL, SHM e backups (o banco principal tem o seu teste abaixo)
    await second.dispose()
    second = undefined
    expect(leakProblems(leaksOnDisk(root, path => !isMainDatabase(path))), `arquivos: ${filesUnder(root).map(file => file.path.replace(root, '…')).join(', ')}`).toEqual([])
  })

  // ACHADO do Probe (12/11 05:20), CORRIGIDO pelo Anvil (~05:40): as linhas já eram limpas, mas os BYTES do arquivo do banco principal ainda carregavam os 4 segredos depois da migração — o
  // `UPDATE` que apaga o corpo não zera o espaço antigo da página (`secure_delete = 0`, sem `VACUUM` no banco principal; só os backups levavam `VACUUM` em `scrubBackups`). Um `VACUUM`
  // numa CÓPIA removia tudo (medido). Quem lê o arquivo (um backup do disco, uma cópia do .db) recuperava os tokens. O `it.fails` acusou "Expect test to fail" assim que o conserto chegou
  // e virou teste NORMAL: regressão permanente do que o Carbon exige ("nunca no banco após o boot").
  it('CORRETO (P0-09, corrigido): o arquivo do banco principal NÃO carrega os segredos em claro depois da migração (bytes do p.db)', async () => {
    const { root, database } = await legacyDatabase()
    second = openRemoteTeamHarness(database)
    await second.h.cofreMigration
    await second.dispose()
    second = undefined
    expect(leakProblems(leaksOnDisk(root, isMainDatabase))).toEqual([])
  })

  it('o .zip do exportProject não leva nenhum segredo (nem o rotacionado), e o export funciona (leva o projeto)', async () => {
    const { database } = await legacyDatabase()
    second = openRemoteTeamHarness(database)
    await second.h.cofreMigration
    second.h.sessionMemberId = 'ana'
    const archive = second.h.exportProject({ ...SCOPE, includeDmIds: [] })
    const files = readZipTexts(Buffer.from(archive.base64, 'base64'))
    const everything = [...files.values()].join('\n')
    expect(files.size, 'o export tem de levar arquivos (senão "não achar segredo" não prova nada)').toBeGreaterThan(0)
    const leaked = Object.entries(SECRETS).filter(([, secret]) => everything.includes(secret)).map(([what]) => ({ where: `o .zip (${archive.filename})`, what }))
    expect(leakProblems(leaked)).toEqual([])
  })

  it('um id da tela nunca cai no namespace dos segredos de conector: nenhum dos ids reservados sobrescreve o segredo; um salvamento normal funciona', async () => {
    const { database } = await legacyDatabase()
    second = openRemoteTeamHarness(database)
    await second.h.cofreMigration
    second.h.sessionMemberId = 'ana'
    // OBSERVAÇÃO: o salvamento normal (sem id) funciona e o id que o Cofre dá não é um dos reservados
    const saved = await second.h.saveCofreKey({ ...SCOPE, service: 'minha-api', secret: 'chave-normal-xyz', title: 'Minha API' })
    expect(saved.id).not.toMatch(/^(?:connector:|code:|default$)/u)
    for (const id of ['connector:github.webhook.secret', 'connector:imap', 'connector:telegram', 'code:minha-conta', 'default']) {
      const outcome = await second.h.saveCofreKey({ ...SCOPE, service: 'ataque', secret: 'SOBRESCRITO-pelo-atacante', title: 'x', id }).then(() => 'aceito', (error: unknown) => (error instanceof Error ? error.message : 'erro'))
      expect(outcome, `o id reservado "${id}" foi aceito pela tela`).not.toBe('aceito')
    }
    // e o segredo real continua intacto
    expect(await second.h.cofreSecrets.read('pp', connectorSlot(GITHUB_WEBHOOK_FACT))).toBe(WEBHOOK)
    expect(await second.h.cofreSecrets.read('pp', connectorSlot(VAULT_IMAP))).toBe(IMAP)
  })
})

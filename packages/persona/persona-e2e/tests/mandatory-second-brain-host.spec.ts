/**
 * SB-7 (SECOND-BRAIN.md §6) — ADVERSARIAL host acceptance on top of the owners' unit suites, on the REAL PersonaHost
 * (in-memory SQLite, injected clock), no browser, no AI. Covers ACL/DM leakage, remembered-permission matrix with a fake
 * clock, export/import round-trip and path safety, and whether curation is actually wired to finished work.
 * App layer (Empresa › Segundo cérebro screens, captures): {@link ./real-gov-pb-app.spec.ts}.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { afterEach, describe, expect, it as vitestIt } from 'vitest'
import PersonaHost from '../../persona-host/src/index.ts'
import { bindHostFile, HOST_TEST_TIMEOUT_MS, it } from '../../persona-host/tests/host-harness.ts'
import { openJourney, sayOn, seedJourney, seedProject } from '../../persona-host/tests/journeys/journey-host.ts'

const { host } = bindHostFile('2026-11-03T09:00:00.000Z')

function bug(owner: string, title: string, fn: () => unknown): void {
  vitestIt.fails(`[BUG→${owner}] ${title}`, fn, HOST_TEST_TIMEOUT_MS)
}

const SCOPE = { workspaceId: 'ws', projectId: 'team' } as const
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const tmp = (): string => { const dir = mkdtempSync(join(tmpdir(), 'persona-sb-')); dirs.push(dir); return dir }

/** Ana (owner), Bia + Dan (members) on a shared project. */
function seed(): PersonaHost {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  for (const [id, name, role] of [['ana', 'Ana', 'owner'], ['bia', 'Bia', 'member'], ['dan', 'Dan', 'member']] as const) {
    h.createMember({ id, workspaceId: 'ws', projectId: 'pp', displayName: name, handle: id, role })
  }
  h.createProject({ id: 'team', workspaceId: 'ws', name: 'Equipe', description: 'compartilhado' })
  h.sessionMemberId = 'ana'
  return h
}

function put(h: PersonaHost, over: Partial<Parameters<PersonaHost['putBrainPage']>[0]> & { id: string; title: string; body: string }) {
  return h.putBrainPage({ ...SCOPE, kind: 'learning', editorKind: 'person', editorId: 'ana', ...over })
}

describe('SB-2 — DM e ACL: o que é privado nunca aparece para quem não deve', () => {
  function withDmPage(h: PersonaHost): void {
    put(h, { id: 'p-dm', title: 'Combinado no DM da Ana e da Bia', body: 'Plano secreto do reajuste de março.', visibility: 'members', memberIds: ['ana', 'bia'] })
    put(h, { id: 'p-pub', title: 'Horário da loja', body: 'Abrimos às seis.', visibility: 'workspace' })
  }

  it('[SB-2a] página de audiência DM (Ana+Bia): participantes leem; o Dan não vê em lista, busca, hoje nem por id', () => {
    const h = seed()
    withDmPage(h)
    h.sessionMemberId = 'bia'
    expect(h.getBrainPage({ ...SCOPE, pageId: 'p-dm' }).body).toMatch(/reajuste/u)
    h.sessionMemberId = 'dan'
    expect(h.listBrainPages(SCOPE).map(row => row.id)).toEqual(['p-pub', ...h.listBrainPages(SCOPE).map(row => row.id).filter(id => id !== 'p-pub' && id !== 'p-dm')])
    expect(h.searchBrainPages({ ...SCOPE, query: 'reajuste' })).toEqual([])
    expect(h.searchBrainPages({ ...SCOPE, query: 'Combinado' })).toEqual([])
    expect(h.listBrainChangedToday(SCOPE).map(row => row.id)).not.toContain('p-dm')
    expect(() => h.getBrainPage({ ...SCOPE, pageId: 'p-dm' })).toThrow('forbidden')
    expect(() => h.listBrainVersions({ ...SCOPE, pageId: 'p-dm' })).toThrow()
    expect(() => h.restoreBrainPage({ ...SCOPE, pageId: 'p-dm', revision: 1 })).toThrow()
  })

  it('[SB-2a] o "Comece aqui" (índice derivado) e "mudou hoje" do Dan citam o TÍTULO da página privada do DM — o índice é montado com todas as páginas, sem ACL', () => {
    const h = seed()
    withDmPage(h)
    h.sessionMemberId = 'dan'
    const home = h.getBrainHome(SCOPE)
    const startHere = h.getBrainPage({ ...SCOPE, pageId: home.startHereId }).body
    const everything = JSON.stringify(home) + startHere
    expect(everything, 'o início do Dan vazou a página privada').not.toMatch(/reajuste|Combinado no DM/u)
  })

  it('[SB-2b] exportar a pasta como Dan escreve o CONTEÚDO das páginas privadas de outros (exportBrainVault não filtra por ACL)', () => {
    const h = seed()
    withDmPage(h)
    h.sessionMemberId = 'dan'
    const dir = tmp()
    h.exportBrainVault({ ...SCOPE, folderPath: dir })
    const all = filesUnder(dir).map(file => readFileSync(file, 'utf8')).join('\n---\n')
    expect(all, 'export de quem não tem ACL carregou a página privada').not.toMatch(/reajuste|Combinado no DM/u)
  })

  it('[SB-2b] página restrita a uma persona não aparece para nenhum humano (nem o dono) em listas e busca', () => {
    const h = seed()
    put(h, { id: 'p-nina', title: 'Segredo da Nina', body: 'fato só da Nina', visibility: 'persona', personaId: 'nina' })
    for (const member of ['ana', 'bia', 'dan']) {
      h.sessionMemberId = member
      expect(h.listBrainPages(SCOPE).map(row => row.id), member).not.toContain('p-nina')
      expect(h.searchBrainPages({ ...SCOPE, query: 'Nina' }).map(row => row.id), member).not.toContain('p-nina')
    }
  })

  it('[SB-2c] convidado (guest) sem acesso ao projeto não lê nem lista o Segundo cérebro', () => {
    const h = seed()
    h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
    withDmPage(h)
    h.sessionMemberId = 'gus'
    expect(() => h.listBrainPages(SCOPE)).toThrow('forbidden')
    expect(() => h.getBrainHome(SCOPE)).toThrow('forbidden')
    expect(() => h.searchBrainPages({ ...SCOPE, query: 'reajuste' })).toThrow('forbidden')
  })
})

describe('SB-3 — permissão lembrada: casa EXATO ou pergunta de novo (relógio injetado)', () => {
  const grantReq = (over: Partial<Parameters<PersonaHost['grantBrainPermission']>[0]> = {}) => ({
    ...SCOPE, id: 'g1', personaId: 'nina', action: 'drafts-reply', target: 'clientes-aprovados', validity: '7d' as const, ...over,
  })
  const useReq = (over: Partial<Parameters<PersonaHost['useBrainPermission']>[0]> = {}) => ({
    ...SCOPE, grantId: 'g1', personaId: 'nina', action: 'drafts-reply', target: 'clientes-aprovados', ...over,
  })

  it('[SB-3a] mesma persona + ação + alvo dentro da validade: passa, e o uso é contado', () => {
    const h = seed()
    h.grantBrainPermission(grantReq())
    expect(h.useBrainPermission(useReq()).useCount).toBe(1)
    expect(h.useBrainPermission(useReq()).useCount).toBe(2)
  })

  it('[SB-3b] ação MAIOR (enviar em vez de rascunhar) pergunta de novo; a permissão não expande', () => {
    const h = seed()
    h.grantBrainPermission(grantReq())
    expect(() => h.useBrainPermission(useReq({ action: 'sends-reply' }))).toThrow('forbidden')
    expect(() => h.useBrainPermission(useReq({ action: 'drafts-reply-and-send' }))).toThrow('forbidden')
    expect(h.listBrainPermissions(SCOPE)[0]?.useCount).toBe(0)
  })

  it('[SB-3c] outro alvo dentro do mesmo verbo pergunta de novo (inclusive alvo parecido e maiúsculas)', () => {
    const h = seed()
    h.grantBrainPermission(grantReq())
    for (const target of ['todos', 'clientes-aprovados-2', 'clientes', 'CLIENTES-APROVADOS', '*', '']) {
      expect(() => h.useBrainPermission(useReq({ target })), `alvo ${JSON.stringify(target)}`).toThrow('forbidden')
    }
  })

  it('[SB-3d] outra persona pergunta de novo; a permissão não transfere', () => {
    const h = seed()
    h.grantBrainPermission(grantReq())
    expect(() => h.useBrainPermission(useReq({ personaId: 'sol' }))).toThrow('forbidden')
    expect(() => h.useBrainPermission(useReq({ personaId: '' }))).toThrow('forbidden')
  })

  it('[SB-3e] validade de 7 dias EXPIRA (relógio falso +8 dias) e some das permissões ativas', () => {
    const h = seed()
    h.grantBrainPermission(grantReq())
    expect(h.useBrainPermission(useReq()).useCount).toBe(1)
    h.orchestration.now = () => '2026-11-11T09:00:01.000Z'
    expect(() => h.useBrainPermission(useReq())).toThrow('forbidden')
  })

  it('[SB-3e] a permissão EXPIRADA continua listada em "permissões ativas" (getBrainHome.activeGrants só filtra revogadas)', () => {
    const h = seed()
    h.grantBrainPermission(grantReq())
    h.orchestration.now = () => '2026-11-11T09:00:01.000Z'
    expect(h.getBrainHome(SCOPE).activeGrants.map(row => row.id)).not.toContain('g1')
  })

  it('[SB-3f] revogar tem efeito imediato; "uma vez" gasta no primeiro uso', () => {
    const h = seed()
    h.grantBrainPermission(grantReq())
    h.revokeBrainPermission({ ...SCOPE, grantId: 'g1' })
    expect(() => h.useBrainPermission(useReq())).toThrow('forbidden')
    h.grantBrainPermission(grantReq({ id: 'g-once', validity: 'once' }))
    expect(h.useBrainPermission(useReq({ grantId: 'g-once' })).useCount).toBe(1)
    expect(() => h.useBrainPermission(useReq({ grantId: 'g-once' })), '"uma vez" não pode valer duas').toThrow('forbidden')
  })

  it('[SB-3g] escopo vazio/ambíguo (ação ou alvo em branco, ou curinga) NÃO cobre nada — hoje grant com action "" é aceito e cobre uma ação ""', () => {
    const h = seed()
    for (const [id, action, target] of [['g-a', '', 'x'], ['g-t', 'drafts-reply', ''], ['g-w', 'drafts-reply', '*']] as const) {
      let created = true
      try { h.grantBrainPermission(grantReq({ id, action, target })) } catch { created = false }
      if (!created) continue
      for (const probe of [{ action, target }, { action: 'drafts-reply', target: 'clientes-aprovados' }, { action: 'qualquer', target: 'qualquer' }]) {
        expect(() => h.useBrainPermission(useReq({ grantId: id, ...probe })), `${id} ${JSON.stringify(probe)} cobriu um escopo ambíguo`).toThrow('forbidden')
      }
    }
  })

  it('[SB-3h] a permissão concedida vira página tipada "permission" com persona, ação, alvo e validade legíveis', () => {
    const h = seed()
    const grant = h.grantBrainPermission(grantReq())
    const page = h.getBrainPage({ ...SCOPE, pageId: grant.pageId })
    expect(page.kind).toBe('permission')
    expect(page.body).toMatch(/nina/iu)
    expect(page.body).toMatch(/drafts-reply/u)
    expect(page.body).toMatch(/clientes-aprovados/u)
    expect(page.body).toMatch(/7 ?d|7 dias|sete/iu)
  })

  it('[SB-3] só quem escreve concede; convidado e membro sem escrita recebem forbidden', () => {
    const h = seed()
    h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
    h.sessionMemberId = 'gus'
    expect(() => h.grantBrainPermission(grantReq())).toThrow()
    h.sessionMemberId = 'ana'
    expect(h.listBrainPermissions(SCOPE)).toEqual([])
  })
})

describe('SB-4 — exportar para pasta e reimportar', () => {
  function pages(h: PersonaHost): void {
    put(h, { id: 'p-cli', kind: 'client', title: 'Padaria Lua', body: 'Cliente ativo desde 2024. Ver [[Regras da casa]].' })
    put(h, { id: 'p-reg', kind: 'rule', title: 'Regras da casa', body: 'Nunca vender fiado.', properties: { owner: 'ana' } })
  }

  it('[SB-4a] .md legível: frontmatter tipado, [[links]] preservados, uma pasta por tipo', () => {
    const h = seed()
    pages(h)
    const dir = tmp()
    h.exportBrainVault({ ...SCOPE, folderPath: dir })
    const files = filesUnder(dir).map(file => relative(dir, file).replace(/\\/gu, '/'))
    expect(files.some(file => /^client\/.+\.md$/u.test(file))).toBe(true)
    expect(files.some(file => /^rule\/.+\.md$/u.test(file))).toBe(true)
    const client = readFileSync(join(dir, files.find(file => file.startsWith('client/'))!), 'utf8')
    expect(client).toMatch(/^---\n[\s\S]*kind: client[\s\S]*---/u)
    expect(client).toContain('[[Regras da casa]]')
    expect(client).toContain('Cliente ativo desde 2024')
  })

  it('[SB-4b] reimportar a mesma pasta não duplica páginas nem versões', () => {
    const h = seed()
    pages(h)
    const dir = tmp()
    h.exportBrainVault({ ...SCOPE, folderPath: dir })
    const before = h.listBrainPages(SCOPE).length
    const revisions = h.listBrainVersions({ ...SCOPE, pageId: 'p-cli' }).length
    for (let i = 0; i < 2; i += 1) {
      const again = h.importBrainVault({ ...SCOPE, folderPath: dir })
      expect(again.created).toBe(0)
    }
    expect(h.listBrainPages(SCOPE)).toHaveLength(before)
    expect(h.listBrainVersions({ ...SCOPE, pageId: 'p-cli' })).toHaveLength(revisions)
  })

  bug('Forge+Anvil', '[SB-4b] (baixa) editar o .md na pasta e reimportar em modo two-way atualiza a página (nova versão) — hoje a edição é ignorada (skipped) e se perde', () => {
    const h = seed()
    pages(h)
    const dir = tmp()
    h.exportBrainVault({ ...SCOPE, folderPath: dir })
    const file = filesUnder(dir).find(path => path.replace(/\\/gu, '/').includes('/rule/'))!
    writeFileSync(file, readFileSync(file, 'utf8').replace('Nunca vender fiado.', 'Nunca vender fiado. Exceto à família.'), 'utf8')
    const before = h.listBrainPages(SCOPE).length
    h.importBrainVault({ ...SCOPE, folderPath: dir })
    expect(h.listBrainPages(SCOPE)).toHaveLength(before)
    const rule = h.listBrainPages({ ...SCOPE, kind: 'rule' })[0]!
    expect(rule.body).toContain('Exceto à família')
    expect(h.listBrainVersions({ ...SCOPE, pageId: rule.id }).length).toBeGreaterThanOrEqual(2)
  })

  it('[SB-4] título com ../ não escapa da pasta de exportação (path traversal)', () => {
    const h = seed()
    put(h, { id: 'p-evil', kind: 'learning', title: '../../fora-da-pasta', body: 'tentativa' })
    const parent = tmp()
    const dir = join(parent, 'export')
    mkdirSync(dir)
    h.exportBrainVault({ ...SCOPE, folderPath: dir })
    for (const file of filesUnder(parent)) {
      expect(resolve(file).startsWith(resolve(dir)), `arquivo fora da pasta: ${file}`).toBe(true)
    }
    expect(existsSync(join(parent, 'fora-da-pasta.md'))).toBe(false)
  })

  it('[SB-4] a pasta do usuário nunca é apagada: nota solta sobra e é listada como "leftover"', () => {
    const h = seed()
    pages(h)
    const dir = tmp()
    writeFileSync(join(dir, 'diario.md'), 'Minha nota solta.\n', 'utf8')
    const result = h.exportBrainVault({ ...SCOPE, folderPath: dir })
    expect(existsSync(join(dir, 'diario.md'))).toBe(true)
    expect(result.leftover.some(path => path.endsWith('diario.md'))).toBe(true)
  })
})

describe('SB-1 — curadoria: concluir tarefa com fato novo atualiza o Segundo cérebro', () => {
  bug('Anvil+Forge', '[SB-1a] concluir uma Tarefa gera/atualiza uma página com FONTE (tarefa) — curateAfterWork não é chamado por nenhum fluxo do host', async () => {
    const h = openJourney()
    seedJourney(h, [{ id: 'coord', name: 'Guia', title: 'Coordenação', coordination: true }])
    seedProject(h, { id: 'code', name: 'Software', template: 'software', team: [{ id: 'dev', name: 'Bento', title: 'Engenharia', coordination: true }] })
    const scope = { workspaceId: 'ws', projectId: 'code' } as const
    sayOn(h, 'code', 'm-1', 'preciso de um README no projeto')
    await h.orchestration.flush('code')
    const ticketId = h.getProjectBoard(scope).cards[0]!.ticketId
    const rt = h.orchestration.runtime('code')
    const ticket = rt.repo.tickets.get(ticketId)!
    rt.repo.tickets.save({ ...ticket, ended: { at: '2026-11-03T15:00:00.000Z', by: 'executor', outcome: 'completed' }, updatedAt: '2026-11-03T15:00:00.000Z' })
    h.orchestration.tick('code')
    await h.orchestration.flush('code')
    const created = h.listBrainPages(scope)
    expect(created.length, 'nenhuma página criada pela curadoria').toBeGreaterThan(0)
    expect(created.some(page => page.sources.some(source => source.includes(ticketId))), 'página sem fonte da tarefa').toBe(true)
  })

  it('[SB-1] sem curadoria, escrita manual preserva TODAS as versões (nada é sobrescrito sem rastro)', () => {
    const h = seed()
    put(h, { id: 'p-preco', kind: 'company', title: 'Preço do pão', body: 'O pão custa R$ 5.' })
    put(h, { id: 'p-preco', kind: 'company', title: 'Preço do pão', body: 'O pão custa R$ 6.', editorKind: 'persona', editorId: 'nina' })
    const versions = h.listBrainVersions({ ...SCOPE, pageId: 'p-preco' })
    expect(versions.map(row => row.revision)).toEqual([2, 1])
    expect(h.restoreBrainPage({ ...SCOPE, pageId: 'p-preco', revision: 1 }).body).toMatch(/R\$ 5/u)
  })
})

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) out.push(...filesUnder(abs))
    else out.push(abs)
  }
  return out
}

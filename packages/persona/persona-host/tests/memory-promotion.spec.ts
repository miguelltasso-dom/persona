/**
 * "Tornar do time" — regras puras (`src/memory-promotion.ts`) contra repositórios REAIS (SQLite temporário) + D-116 / segredo no JSON.
 * Contrato: persona-spec/contracts/memoria-da-dm-para-o-time.md.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { ProductRepos, ScreenRepos, VaultRepos, openTempStore, type TempStore } from '@deepseek-ai/dsh-persona-store'
import {
  MEMORY_PROMOTION_KIND,
  demoteToPersona,
  previewPromotion,
  promoteToTeam,
  type MemoryPromotionRow,
  type PromotionStores,
} from '../src/memory-promotion.ts'
import { memoryProofOf, MEMORY_PROOF_KIND, type MemoryProof } from '../src/owner-memory.ts'

const temps: TempStore[] = []
afterEach(async () => { await Promise.all(temps.splice(0).map(temp => temp.dispose())) })

const SCOPE = { workspaceId: 'ws', projectId: 'pp' }
const FACT = 'O cliente Zé só paga no Pix.'
const FULL = 'Lembra que o cliente Zé só paga no Pix, mas isso fica entre nós: ele está devendo desde março.'
const AT = '2026-11-11T15:00:00.000Z'
const context = { now: () => '2026-11-12T10:00:00.000Z', offsetMinutes: -180 }

async function rig() {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store)
  product.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  for (const [id, role] of [['ana', 'owner'], ['gus', 'owner'], ['mel', 'member']] as const) {
    product.createMember({ id, workspaceId: 'ws', displayName: id, handle: id, role })
  }
  product.createPersona({
    id: 'bia', workspaceId: 'ws', name: 'Bia', avatar: { kind: 'gallery', ref: 'bia' }, title: 'Texto', description: 'x', personality: 'x', instructions: 'x',
    runner: { kind: 'cli', cli: 'claude', model: 'm' }, tools: {}, skills: [], limits: {}, systemRoles: [], canRecruit: false, createdAt: AT, updatedAt: AT, createdBy: 'ana',
  }, 'pp')
  const vault = new VaultRepos(handle.store)
  const screens = new ScreenRepos(handle.store)
  // Stand-in até `VaultRepos.setVisibility` entrar com o OK do Keel (atualiza visibilidade, corpo editado e revisão).
  const setVisibility: PromotionStores['setVisibility'] = (id, visibility, _authorId, body) => {
    handle.store.db.prepare('UPDATE vault_record SET visibility_json = ?, body = COALESCE(?, body), revision = revision + 1 WHERE id = ?').run(JSON.stringify(visibility), body ?? null, id)
    return vault.getRecord(id)
  }
  const stores: PromotionStores = { vault, screens, product, setVisibility }
  const dmMemory = (id: string, by: string, body = FACT, quote = FULL, kind: 'memory' | 'constraint' = 'memory'): string => {
    vault.createRecord({ id, ...SCOPE, kind, body, authorId: by, visibility: { kind: 'persona', personaId: 'bia' }, sourceIds: ['m1'], factKey: `owner:${id}` })
    screens.put('pp', MEMORY_PROOF_KIND, id, { quote, messageId: 'm1', by, byId: by, at: AT, where: 'dm', place: '', scope: 'persona' } satisfies MemoryProof)
    return id
  }
  const preview = (id: string, viewer = 'ana') => previewPromotion(stores, { ...SCOPE, id }, viewer, context)
  const promote = (id: string, over: Partial<{ text: string; previewHash: string; explicit: boolean }> = {}, viewer = 'ana') => {
    const seen = previewPromotion(stores, { ...SCOPE, id }, viewer, context)
    return promoteToTeam(stores, { ...SCOPE, id, text: over.text ?? seen.fact, previewHash: over.previewHash ?? seen.textHash, explicit: over.explicit ?? true }, viewer, context)
  }
  const trail = (): MemoryPromotionRow[] => screens.list<MemoryPromotionRow>('pp', MEMORY_PROMOTION_KIND).sort((a, b) => a.at.localeCompare(b.at))
  const teamViewJson = (): string => JSON.stringify(
    vault.listRecords('pp')
      .filter(row => row.visibility.kind === 'workspace')
      .map(row => ({ record: row, proof: memoryProofOf(screens, 'pp', row.id) })),
  )
  return { vault, screens, stores, dmMemory, preview, promote, trail, teamViewJson }
}

describe('Tornar do time (módulo puro, repositórios reais)', () => {
  it('a prévia mostra o texto exato, a linha de origem como o time a leria e o hash do que o dono vê, e NÃO grava nada', async () => {
    const { vault, screens, dmMemory, preview, trail } = await rig()
    dmMemory('owner-mem-1', 'ana')
    const seen = preview('owner-mem-1')
    expect(seen).toMatchObject({ id: 'owner-mem-1', fact: FACT, rule: false })
    expect(seen.source.line).toBe('Você disse numa conversa privada com Bia, 11/11.')
    expect(seen.textHash).toMatch(/^[0-9a-f]{16}$/u)
    expect(seen.blocked).toBeUndefined()
    expect(vault.getRecord('owner-mem-1')?.visibility).toEqual({ kind: 'persona', personaId: 'bia' })
    expect(memoryProofOf(screens, 'pp', 'owner-mem-1')?.quote).toBe(FULL)
    expect(trail()).toEqual([])
  })

  it('promover: a equipe lê o FATO; a mensagem original da DM não sobe (a citação pública vira o fato) e fica guardada na trilha para o desfazer', async () => {
    const { vault, screens, dmMemory, promote, trail } = await rig()
    dmMemory('owner-mem-1', 'ana')
    expect(promote('owner-mem-1')).toEqual({ id: 'owner-mem-1', body: FACT })
    expect(vault.getRecord('owner-mem-1')?.visibility).toEqual({ kind: 'workspace' })
    expect(memoryProofOf(screens, 'pp', 'owner-mem-1')).toMatchObject({ quote: FACT, scope: 'team', byId: 'ana' })
    expect(JSON.stringify([vault.getRecord('owner-mem-1'), memoryProofOf(screens, 'pp', 'owner-mem-1')])).not.toContain('entre nós')
    expect(trail()).toHaveLength(1)
    expect(trail()[0]).toMatchObject({ direction: 'to-team', byId: 'ana', fromPersonaId: 'bia', textShown: FACT })
    expect(trail()[0]?.before?.quote).toBe(FULL)
  })

  it('a confirmação leva o hash do que o dono VIU: registro mudado no meio ou hash errado = "preview-changed"; sem `explicit` não promove', async () => {
    const { vault, dmMemory, stores, promote } = await rig()
    dmMemory('owner-mem-1', 'ana')
    const seen = previewPromotion(stores, { ...SCOPE, id: 'owner-mem-1' }, 'ana', context)
    vault.updateRecord('owner-mem-1', 'O cliente Zé paga no Pix ou no dinheiro.', 'ana')
    expect(() => promoteToTeam(stores, { ...SCOPE, id: 'owner-mem-1', text: seen.fact, previewHash: seen.textHash, explicit: true }, 'ana', context)).toThrow('preview-changed')
    expect(() => promote('owner-mem-1', { previewHash: 'ffffffffffffffff' })).toThrow('preview-changed')
    expect(() => promote('owner-mem-1', { explicit: false })).toThrow('explicit-required')
    expect(vault.getRecord('owner-mem-1')?.visibility).toEqual({ kind: 'persona', personaId: 'bia' })
  })

  it('só o DONO e só quem DISSE: o outro dono e a memória alheia são "não encontrada"; um membro comum que disse a sua não promove ("forbidden")', async () => {
    const { vault, dmMemory, preview, promote } = await rig()
    dmMemory('owner-mem-1', 'ana')
    dmMemory('owner-mem-2', 'mel', 'A loja fecha na segunda-feira.', 'Lembra que a loja fecha na segunda-feira.')
    expect(() => preview('owner-mem-1', 'gus')).toThrow('memory-not-found')
    expect(() => promote('owner-mem-2', {}, 'ana')).toThrow('memory-not-found')
    expect(() => preview('owner-mem-2', 'mel')).toThrow('forbidden')
    expect(vault.getRecord('owner-mem-1')?.visibility).toEqual({ kind: 'persona', personaId: 'bia' })
    expect(vault.getRecord('owner-mem-2')?.visibility).toEqual({ kind: 'persona', personaId: 'bia' })
  })

  it('o que nunca sobe: segredo e dado de terceiros são recusados na prévia E na promoção; o dono edita o texto e o texto editado, que passa pelos mesmos filtros, sobe', async () => {
    const { vault, dmMemory, preview, promote } = await rig()
    dmMemory('s1', 'ana', 'A senha do wifi é padaria123.')
    dmMemory('t1', 'ana', 'O contato do fornecedor é joao.silva@fornecedor.com.br, tel (11) 91234-5678.')
    for (const [id, code] of [['s1', 'secret'], ['t1', 'third-party']] as const) {
      expect(preview(id).blocked?.code).toBe(code)
      expect(preview(id).blocked?.message).toMatch(/Cofre|pessoa de fora/u)
      expect(() => promote(id)).toThrow(code)
      expect(vault.getRecord(id)?.visibility).toEqual({ kind: 'persona', personaId: 'bia' })
    }
    expect(() => promote('t1', { text: 'O contato é maria@loja.com.br' })).toThrow('third-party')
    promote('t1', { text: 'O fornecedor entrega às terças.' })
    expect(vault.getRecord('t1')).toMatchObject({ body: 'O fornecedor entrega às terças.', visibility: { kind: 'workspace' } })
  })

  it('D-116 / segredo no JSON: token bruto (sk- / Bearer / JWT / ghp_) nunca entra no time nem vaza no JSON público, mesmo após editar e promover', async () => {
    const { vault, dmMemory, preview, promote, teamViewJson } = await rig()
    const rawToken = 'sk-proj-secret-json-0123456789abcdef'
    const bearer = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456'
    dmMemory('tok-1', 'ana', `Configuração externa: ${rawToken}`, `Na DM mandei ${rawToken} e ${bearer}`)
    dmMemory('tok-2', 'ana', 'A loja aceita encomenda até 17h.', `Pode anotar ${rawToken}, e a loja aceita encomenda até 17h.`)

    expect(preview('tok-1').blocked?.code).toBe('secret')
    expect(() => promote('tok-1')).toThrow('secret')
    expect(() => promote('tok-1', { text: bearer })).toThrow('secret')
    expect(vault.getRecord('tok-1')?.visibility).toEqual({ kind: 'persona', personaId: 'bia' })
    expect(teamViewJson()).not.toContain(rawToken)
    expect(teamViewJson()).not.toContain(bearer)

    // Mesmo editando para texto limpo e promovendo, o JSON visível ao time não carrega o segredo nem a citação original da DM.
    promote('tok-1', { text: 'A chave de integração externa fica guardada no Cofre.' })
    promote('tok-2')
    const json = teamViewJson()
    expect(json).toContain('A chave de integração externa fica guardada no Cofre.')
    expect(json).toContain('A loja aceita encomenda até 17h.')
    expect(json).not.toContain(rawToken)
    expect(json).not.toContain(bearer)
  })

  it('uma REGRA que estoura o teto das regras da casa é recusada inteira; um fato do mesmo tamanho não tem esse teto', async () => {
    const { vault, dmMemory, preview, promote } = await rig()
    for (const id of ['team-rule-1', 'team-rule-2']) {
      vault.createRecord({ id, ...SCOPE, kind: 'constraint', body: 'a'.repeat(4000), authorId: 'ana', visibility: { kind: 'workspace' } })
    }
    dmMemory('rule-dm', 'ana', 'Nunca prometer entrega no mesmo dia.', 'Regra da casa: nunca prometer entrega no mesmo dia.', 'constraint')
    expect(preview('rule-dm')).toMatchObject({ rule: true, blocked: { code: 'rules-too-big' } })
    expect(() => promote('rule-dm')).toThrow('rules-too-big')
    expect(vault.getRecord('rule-dm')?.visibility).toEqual({ kind: 'persona', personaId: 'bia' })
    dmMemory('fact-dm', 'ana', 'Nunca prometer entrega no mesmo dia, é a regra.', FULL)
    expect(() => promote('fact-dm')).not.toThrow()
  })

  it('desfazer: "Deixar só da Bia" volta a visibilidade privada, devolve a mensagem original à prova e a trilha guarda as duas mudanças', async () => {
    const { vault, screens, stores, dmMemory, promote, trail } = await rig()
    dmMemory('owner-mem-1', 'ana')
    promote('owner-mem-1')
    expect(demoteToPersona(stores, { ...SCOPE, id: 'owner-mem-1' }, 'ana', { now: () => '2026-11-12T11:00:00.000Z' })).toEqual({ id: 'owner-mem-1' })
    expect(vault.getRecord('owner-mem-1')?.visibility).toEqual({ kind: 'persona', personaId: 'bia' })
    expect(memoryProofOf(screens, 'pp', 'owner-mem-1')).toMatchObject({ quote: FULL, scope: 'persona', where: 'dm' })
    expect(trail().map(row => row.direction)).toEqual(['to-team', 'to-persona'])
    expect(vault.getRecord('owner-mem-1')?.revision).toBe(3)
  })

  it('promover duas vezes é uma vez só (sem segunda linha na trilha)', async () => {
    const { dmMemory, promote, trail } = await rig()
    dmMemory('owner-mem-1', 'ana')
    promote('owner-mem-1')
    expect(promote('owner-mem-1')).toEqual({ id: 'owner-mem-1', body: FACT })
    expect(trail().filter(row => row.direction === 'to-team')).toHaveLength(1)
  })
})

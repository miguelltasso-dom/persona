/**
 * `purgeMemory`: apagar uma memória de verdade (registro, versões, provas, trilha de promoção, propostas, JSON, bytes do `.db` e `-wal`, e backups).
 * Diferente de `forgetMemory` (que apenas revoga em `vault_record`), nada do conteúdo apagado sobra em claro.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProductRepos, ScreenRepos, VaultRepos, openTempStore, type TempStore } from '@deepseek-ai/dsh-persona-store'
import { VAULT_TELEGRAM } from '@deepseek-ai/dsh-persona-vault'
import { MEMORY_PROMOTION_KIND } from '../src/memory-promotion.ts'
import { MEMORY_PROOF_KIND, type MemoryProof } from '../src/owner-memory.ts'
import { purgeMemoryRecord } from '../src/purge-memory.ts'

const temps: TempStore[] = []
afterEach(async () => { await Promise.all(temps.splice(0).map(temp => temp.dispose())) })

const SCOPE = { workspaceId: 'ws', projectId: 'pp' } as const
const AT = '2026-11-12T10:00:00.000Z'

function diskBytes(dbPath: string, backupDir: string): Buffer[] {
  const files: string[] = [dbPath, `${dbPath}-wal`]
  if (existsSync(backupDir)) {
    for (const name of readdirSync(backupDir)) {
      if (name.endsWith('.db')) files.push(join(backupDir, name))
    }
  }
  return files.filter(file => existsSync(file)).map(file => readFileSync(file))
}

function containsText(buffers: readonly Buffer[], needle: string): boolean {
  const bytes = Buffer.from(needle, 'utf8')
  return buffers.some(buf => buf.includes(bytes))
}

async function rig() {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store)
  product.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  product.createProject({ id: 'other-proj', workspaceId: 'ws', name: 'Outro', rootPath: '/tmp/other' })
  product.createMember({ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
  product.createMember({ id: 'gus', workspaceId: 'ws', displayName: 'Gus', handle: 'gus', role: 'owner' })
  product.createPersona({
    id: 'bia', workspaceId: 'ws', name: 'Bia', avatar: { kind: 'gallery', ref: 'bia' }, title: 'Texto', description: 'x', personality: 'x', instructions: 'x',
    runner: { kind: 'cli', cli: 'claude', model: 'm' }, tools: {}, skills: [], limits: {}, systemRoles: [], canRecruit: false, createdAt: AT, updatedAt: AT, createdBy: 'ana',
  }, 'pp')
  const vault = new VaultRepos(handle.store)
  const screens = new ScreenRepos(handle.store)
  const memoryJson = (): string => JSON.stringify({
    records: vault.listRecords('pp'),
    pending: screens.list('pp', 'memory_proposal'),
    proofs: vault.listRecords('pp').map(record => screens.get('pp', MEMORY_PROOF_KIND, record.id)),
  })
  return { store: handle.store, dbPath: handle.path, backupDir: handle.store.backupDir, product, vault, screens, memoryJson }
}

describe('purgeMemory: apagamento real de memória (registro, versões, provas, JSON, bytes em .db/-wal/backups)', () => {
  it('apaga registro, todas as revisões, memory_proof, memory_promotion, vault_proposal e zera os bytes do segredo em .db, -wal e backup sem checkpoint manual', async () => {
    const { store, dbPath, backupDir, vault, screens, memoryJson } = await rig()
    const v1Secret = 'sk-purge-v1-alpha-9876543210abcd'
    const v2Secret = 'sk-purge-v2-bravo-555555555555ef'
    const quoteSecret = 'Na DM eu disse sk-purge-quote-444444444444gh'
    const proposalSecret = 'sk-purge-proposal-next-333333333333ij'
    const controlBody = 'A padaria entrega pão quente às 8h.'

    vault.createRecord({
      id: 'mem-secret', ...SCOPE, kind: 'memory', body: v1Secret, authorId: 'ana',
      visibility: { kind: 'persona', personaId: 'bia' }, sourceIds: ['m1'], factKey: 'owner:m1',
    })
    vault.updateRecord('mem-secret', v2Secret, 'ana')
    screens.put('pp', MEMORY_PROOF_KIND, 'mem-secret', {
      quote: quoteSecret, messageId: 'm1', by: 'Ana', byId: 'ana', at: AT, where: 'dm', place: '', scope: 'persona',
    } satisfies MemoryProof)
    screens.put('pp', MEMORY_PROMOTION_KIND, 'promo:mem-secret:t1', {
      id: 'promo:mem-secret:t1', recordId: 'mem-secret', byId: 'ana', at: AT, direction: 'to-team', fromPersonaId: 'bia',
      textShown: v2Secret, before: { quote: quoteSecret, messageId: 'm1', by: 'Ana', byId: 'ana', at: AT, where: 'dm', place: '', scope: 'persona' },
    })
    screens.put('pp', 'vault_proposal', 'vp-secret', {
      id: 'vp-secret', creatorPersonaId: 'bia', recordId: 'mem-secret', nextBody: proposalSecret, status: 'pending', createdAt: AT,
    })
    vault.createRecord({
      id: 'mem-keep', ...SCOPE, kind: 'memory', body: controlBody, authorId: 'ana',
      visibility: { kind: 'workspace' }, sourceIds: [],
    })
    store.backupNow()

    // CONTROLE: antes do purge, os textos em claro existem realmente nos bytes de disco e no JSON de listMemory.
    const beforeBuffers = diskBytes(dbPath, backupDir)
    expect(containsText(beforeBuffers, v1Secret)).toBe(true)
    expect(containsText(beforeBuffers, v2Secret)).toBe(true)
    expect(containsText(beforeBuffers, quoteSecret)).toBe(true)
    expect(memoryJson()).toContain(v2Secret)

    const result = purgeMemoryRecord({ vault, screens }, { ...SCOPE, id: 'mem-secret' }, 'ana')
    expect(result).toEqual({ id: 'mem-secret', purged: true })

    // Metadados e JSON sumiram; memória não relacionada permanece intacta.
    expect(vault.getRecord('mem-secret')).toBeUndefined()
    expect(vault.listVersions('record', 'mem-secret')).toEqual([])
    expect(screens.get('pp', MEMORY_PROOF_KIND, 'mem-secret')).toBeUndefined()
    expect(screens.list('pp', MEMORY_PROMOTION_KIND)).toEqual([])
    expect(screens.get('pp', 'vault_proposal', 'vp-secret')).toBeUndefined()
    const listJson = memoryJson()
    expect(listJson).not.toContain('mem-secret')
    expect(listJson).toContain(controlBody)
    expect(vault.getRecord('mem-keep')?.body).toBe(controlBody)

    // Sem checkpoint manual: os bytes em claro dos segredos sumiram de .db, -wal e backups.
    const afterBuffers = diskBytes(dbPath, backupDir)
    for (const secret of [v1Secret, v2Secret, quoteSecret, proposalSecret]) {
      expect(containsText(afterBuffers, secret), `resíduo encontrado para ${secret}`).toBe(false)
    }
  })

  it('apaga proposta pendente (memory_proposal) sem vault_record e limpa os bytes do disco', async () => {
    const { dbPath, backupDir, vault, screens, memoryJson } = await rig()
    const pendingSecret = 'sk-purge-pending-777777777777kl'
    screens.put('pp', 'memory_proposal', 'pending-1', { id: 'pending-1', body: pendingSecret, authorId: 'ana' })
    expect(containsText(diskBytes(dbPath, backupDir), pendingSecret)).toBe(true)

    const result = purgeMemoryRecord({ vault, screens }, { ...SCOPE, id: 'pending-1' }, 'ana')
    expect(result).toEqual({ id: 'pending-1', purged: true })
    expect(screens.get('pp', 'memory_proposal', 'pending-1')).toBeUndefined()
    expect(memoryJson()).not.toContain('pending-1')
    expect(containsText(diskBytes(dbPath, backupDir), pendingSecret)).toBe(false)
  })

  it('R2-04 / R2-04b: recusa memória privada de DM alheia, outro projeto, brief, decision ou fato reservado do Cofre', async () => {
    const { vault, screens } = await rig()
    vault.createRecord({
      id: 'dm-ana', ...SCOPE, kind: 'memory', body: 'Segredo privado da Ana.', authorId: 'ana',
      visibility: { kind: 'persona', personaId: 'bia' }, sourceIds: [], factKey: 'owner:dm-ana',
    })
    screens.put('pp', MEMORY_PROOF_KIND, 'dm-ana', {
      quote: 'Lembra que segredo privado da Ana.', messageId: 'm1', by: 'Ana', byId: 'ana', at: AT, where: 'dm', place: '', scope: 'persona',
    } satisfies MemoryProof)
    vault.createRecord({ id: 'brief-1', ...SCOPE, kind: 'brief', body: 'Briefing.', authorId: 'ana', visibility: { kind: 'workspace' } })
    vault.createRecord({ id: 'dec-1', ...SCOPE, kind: 'decision', body: 'Decisão.', authorId: 'ana', visibility: { kind: 'workspace' } })
    vault.createRecord({ id: 'tg-1', ...SCOPE, kind: 'memory', body: 'token-secreto', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: VAULT_TELEGRAM })

    expect(() => purgeMemoryRecord({ vault, screens }, { ...SCOPE, id: 'dm-ana' }, 'gus')).toThrow('memory-not-found')
    expect(() => purgeMemoryRecord({ vault, screens }, { workspaceId: 'ws', projectId: 'other-proj', id: 'dm-ana' }, 'ana')).toThrow('memory-not-found')
    expect(() => purgeMemoryRecord({ vault, screens }, { ...SCOPE, id: 'brief-1' }, 'ana')).toThrow('memory-not-found')
    expect(() => purgeMemoryRecord({ vault, screens }, { ...SCOPE, id: 'dec-1' }, 'ana')).toThrow('memory-not-found')
    expect(() => purgeMemoryRecord({ vault, screens }, { ...SCOPE, id: 'tg-1' }, 'ana')).toThrow('memory-not-found')

    expect(vault.getRecord('dm-ana')?.body).toBe('Segredo privado da Ana.')
    expect(vault.getRecord('brief-1')?.body).toBe('Briefing.')
    expect(vault.getRecord('tg-1')?.body).toBe('token-secreto')
  })

  it('controle de regressão: `forgetMemory` (`revokeRecord`) mantém histórico revogado, enquanto `purgeMemoryRecord` remove por completo', async () => {
    const { vault, screens } = await rig()
    vault.createRecord({ id: 'mem-rev', ...SCOPE, kind: 'memory', body: 'Usar papel reciclado.', authorId: 'ana', visibility: { kind: 'workspace' } })
    expect(vault.revokeRecord('mem-rev').status).toBe('revoked')
    expect(vault.getRecord('mem-rev')?.status).toBe('revoked')

    purgeMemoryRecord({ vault, screens }, { ...SCOPE, id: 'mem-rev' }, 'ana')
    expect(vault.getRecord('mem-rev')).toBeUndefined()
  })
})

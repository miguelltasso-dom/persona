/**
 * BYC-6 (BRING-YOUR-CONTEXT.md §Aceite) — host-level acceptance against the REAL PersonaHost (in-memory SQLite):
 * paste → typed proposals → review → Cofre, vault folder walk, reimport, privacy, dedup/conflict, local-only.
 * No browser, no AI. UI/app layer: {@link ./mandatory-bring-your-context.spec.ts}.
 */
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import PersonaHost from '../../persona-host/src/index.ts'
import { bindHostFile, it } from '../../persona-host/tests/host-harness.ts'
import {
  createVaultFixture,
  readBringFixture,
  SAMPLE_VAULT_FILES,
  syntheticSecretLine,
} from '../src/bring-context-fixtures.ts'

const { host } = bindHostFile('2026-11-03T15:00:00.000Z')

const SCOPE = { workspaceId: 'ws', projectId: 'pp' } as const
/** Shared project: plain members only reach `kind: 'shared'` projects (auth.ts), the personal one is owner-only. */
const SHARED = { workspaceId: 'ws', projectId: 'team' } as const
const DAY = /^colado do (ChatGPT|Claude|Gemini|outra IA) em \d{2}\/\d{2}$/u

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Padaria Lua', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...SCOPE, displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createProject({ id: 'team', workspaceId: 'ws', name: 'Equipe', description: 'Projeto compartilhado' })
  h.sessionMemberId = 'ana'
}

function paste(
  h: PersonaHost,
  provider: 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'other',
  text: string,
  scope: { workspaceId: string; projectId: string } = SCOPE,
) {
  return h.previewBringContextPaste({ ...scope, provider, text })
}

const cofreBodies = (h: PersonaHost, scope: { workspaceId: string; projectId: string } = SCOPE): string[] =>
  h.listVaultRecords(scope).map(row => row.body)

describe('BYC-2 — colar resposta (§Aceite 1)', () => {
  it('[BYC-2a] a resposta no formato do prompt vira propostas tipadas com proveniência', () => {
    const h = host()
    seed(h)
    const preview = paste(h, 'chatgpt', readBringFixture('paste-chatgpt.md'))
    expect(preview.source).toBe('paste')
    const kindsBySection = new Map(preview.proposals.map(row => [row.section, row.kind]))
    expect(kindsBySection.get('Sobre mim')).toBe('brief')
    expect(kindsBySection.get('Empresa e projetos')).toBe('brief')
    expect(kindsBySection.get('Regras e restrições')).toBe('constraint')
    expect(kindsBySection.get('Decisões já tomadas')).toBe('decision')
    expect(kindsBySection.get('Ferramentas e processos')).toBe('memory')
    expect(kindsBySection.get('Pessoas e contatos de trabalho')).toBe('memory')
    expect(kindsBySection.get('O que ainda está em aberto')).toBe('memory')
    expect(preview.proposals.every(row => DAY.test(row.provenance) && row.provenance.includes('ChatGPT'))).toBe(true)
    // "não sei" is an empty answer, not knowledge.
    expect(preview.proposals.some(row => /^n[aã]o sei/iu.test(row.body))).toBe(false)
    // Nothing is written by organizing.
    expect(cofreBodies(h)).toEqual([])
  })

  it('[BYC-2b] (incerto) fica destacado; CPF, cartão e chave ficam bloqueados e nunca gravam', () => {
    const h = host()
    seed(h)
    const text = `${readBringFixture('paste-chatgpt.md')}\n- ${syntheticSecretLine()}\n`
    const preview = paste(h, 'chatgpt', text)
    const uncertain = preview.proposals.filter(row => row.uncertain)
    expect(uncertain.length).toBeGreaterThanOrEqual(1)
    expect(uncertain.every(row => row.status === 'uncertain' || row.status === 'blocked')).toBe(true)
    expect(uncertain.some(row => /site de encomendas/u.test(row.body))).toBe(true)

    const blocked = preview.proposals.filter(row => row.blocked)
    const why = blocked.map(row => row.sensitiveWhy).join(' | ')
    expect(why).toMatch(/CPF/u)
    expect(why).toMatch(/cartão/u)
    expect(why).toMatch(/senha, token ou chave/u)
    expect(blocked.length).toBeGreaterThanOrEqual(3)
    expect(blocked.every(row => row.status === 'blocked' && row.sensitive)).toBe(true)

    // Even an explicit accept of every row never writes a blocked one.
    const result = h.applyContextProposals({
      ...SCOPE,
      preview,
      items: preview.proposals.map(row => ({ id: row.id, action: 'accept' as const })),
    })
    const stored = cofreBodies(h).join('\n')
    expect(stored).not.toMatch(/123\.456\.789-00/u)
    expect(stored).not.toMatch(/4111 1111 1111 1111/u)
    expect(stored).not.toMatch(/sk-live/u)
    expect(result.written).toBe(preview.proposals.length - blocked.length)
  })

  it('[BYC-2b] editar a linha para tirar o dado sensível a libera; manter o dado continua bloqueado', () => {
    const h = host()
    seed(h)
    const preview = paste(h, 'chatgpt', readBringFixture('paste-chatgpt.md'))
    const cpf = preview.proposals.find(row => row.sensitiveWhy.includes('CPF'))!
    const stillBad = h.applyContextProposals({
      ...SCOPE, preview, items: [{ id: cpf.id, action: 'edit', body: 'Ana, contadora. CPF 123.456.789-00.' }],
    })
    expect(stillBad.written).toBe(0)
    const cleaned = h.applyContextProposals({
      ...SCOPE, preview, items: [{ id: cpf.id, action: 'edit', body: 'Ana, contadora.' }],
    })
    expect(cleaned.written).toBe(1)
    expect(cofreBodies(h).join('\n')).not.toMatch(/123\.456/u)
  })

  it('[BYC-2c] várias colagens (uma por IA) acumulam, cada uma com a sua proveniência', () => {
    const h = host()
    seed(h)
    const first = paste(h, 'chatgpt', readBringFixture('paste-chatgpt.md'))
    const second = paste(h, 'claude', readBringFixture('paste-claude.md'))
    const firstOk = first.proposals.filter(row => !row.blocked)
    const secondOk = second.proposals.filter(row => !row.blocked)
    expect(secondOk.length).toBeGreaterThan(0)
    expect(new Set([...first.proposals, ...second.proposals].map(row => row.id)).size)
      .toBe(first.proposals.length + second.proposals.length)

    const a = h.applyContextProposals({ ...SCOPE, preview: first, items: firstOk.map(row => ({ id: row.id, action: 'accept' as const })) })
    const b = h.applyContextProposals({ ...SCOPE, preview: second, items: secondOk.map(row => ({ id: row.id, action: 'accept' as const })) })
    expect(a.written).toBe(firstOk.length)
    expect(b.written).toBe(secondOk.length)
    const bodies = cofreBodies(h)
    expect(bodies.length).toBe(a.written + b.written)
    expect(bodies.filter(body => body.includes('colado do ChatGPT')).length).toBe(a.written)
    expect(bodies.filter(body => body.includes('colado do Claude')).length).toBe(b.written)
    expect(bodies.some(body => body.includes('Pinheiros'))).toBe(true)
  })
})

describe('BYC-3 — pasta do vault (§Aceite 2)', () => {
  let vault: ReturnType<typeof createVaultFixture>
  beforeEach(() => { vault = createVaultFixture() })
  afterEach(() => { vault.cleanup() })

  it('[BYC-3a] só .md entram; .obsidian, .trash e anexos binários são listados como ignorados', () => {
    const h = host()
    seed(h)
    const preview = h.previewBringContextVaultFolder({ ...SCOPE, rootPath: vault.root })
    expect(preview.source).toBe('vault')
    const paths = preview.proposals.map(row => row.path).sort()
    expect(paths).toEqual(['fornecedores.md', 'notas/clientes.md', 'notas/regras.md'])
    expect(preview.proposals.every(row => row.provenance === `vault: ${row.path}`)).toBe(true)
    const clientes = preview.proposals.find(row => row.path === 'notas/clientes.md')!
    expect(clientes.body).toMatch(/Padaria Lua/u)
    expect(clientes.body).toMatch(/Fornecedores/u) // [[link]] text survives

    const ignored = preview.ignored.map(row => row.path.replace(/\\/gu, '/'))
    expect(ignored.some(path => path.startsWith('.obsidian'))).toBe(true)
    expect(ignored.some(path => path.startsWith('.trash'))).toBe(true)
    expect(ignored).toContain('anexos/logo.png')
    expect(ignored).toContain('anexos/contrato.pdf')
    // Ignored rows never become proposals, and each carries a human reason.
    expect(preview.proposals.some(row => /Rascunho velho|lixeira/iu.test(row.body))).toBe(false)
    expect(preview.ignored.every(row => row.why.length > 0)).toBe(true)
    expect(cofreBodies(h)).toEqual([])
  })

  it('[BYC-3b] reimportar a mesma pasta não duplica itens no Cofre', () => {
    const h = host()
    seed(h)
    const first = h.previewBringContextVaultFolder({ ...SCOPE, rootPath: vault.root })
    h.applyContextProposals({ ...SCOPE, preview: first, items: first.proposals.map(row => ({ id: row.id, action: 'accept' as const })) })
    const before = cofreBodies(h)
    expect(before.length).toBe(3)

    const again = h.previewBringContextVaultFolder({ ...SCOPE, rootPath: vault.root })
    const written = h.applyContextProposals({ ...SCOPE, preview: again, items: again.proposals.map(row => ({ id: row.id, action: 'accept' as const })) })
    expect(written.written).toBe(0)
    expect(cofreBodies(h)).toEqual(before)
  })

  it('[BYC-3b] reimportar reprocessa SÓ o arquivo alterado e grava a versão nova (path + hash)', () => {
    const h = host()
    seed(h)
    const first = h.previewBringContextVaultFolder({ ...SCOPE, rootPath: vault.root })
    h.applyContextProposals({ ...SCOPE, preview: first, items: first.proposals.map(row => ({ id: row.id, action: 'accept' as const })) })

    vault.write('notas/regras.md', '---\ntags: [regras]\n---\n# Regras da casa\nNunca vender fiado. Fechar o caixa às 20h. Domingo só até meio-dia.\n')
    const again = h.previewBringContextVaultFolder({ ...SCOPE, rootPath: vault.root })
    const actionable = again.proposals.filter(row => row.status !== 'duplicate')
    // Only the changed note is proposed as something to do (the two untouched notes are not re-proposed as new).
    expect(actionable.map(row => row.path)).toEqual(['notas/regras.md'])
    const result = h.applyContextProposals({ ...SCOPE, preview: again, items: actionable.map(row => ({ id: row.id, action: 'accept' as const })) })
    expect(result.written).toBe(1)
    expect(cofreBodies(h).join('\n')).toMatch(/Domingo só até meio-dia/u)
    expect(cofreBodies(h).length).toBeGreaterThanOrEqual(3)
  })

  it('[BYC-3a] pasta inexistente ou arquivo no lugar da pasta falham com erro tipado (sem travar o Organizar)', () => {
    const h = host()
    seed(h)
    expect(() => h.previewBringContextVaultFolder({ ...SCOPE, rootPath: `${vault.root}-nao-existe` })).toThrow(/vault-root-missing/u)
    vault.write('so-um-arquivo.md', '# x')
    expect(() => h.previewBringContextVaultFolder({ ...SCOPE, rootPath: `${vault.root}/so-um-arquivo.md` })).toThrow(/vault-root-not-directory/u)
  })

  it('[BYC-3a] nota acima do limite (200 KB) é ignorada com aviso, não importada', () => {
    const h = host()
    seed(h)
    vault.write('notas/gigante.md', `# Gigante\n${'palavra '.repeat(40_000)}`)
    const preview = h.previewBringContextVaultFolder({ ...SCOPE, rootPath: vault.root })
    expect(preview.proposals.some(row => row.path === 'notas/gigante.md')).toBe(false)
    expect(preview.ignored.some(row => /gigante/u.test(row.path) && /grande|limite/iu.test(row.why))).toBe(true)
  })
})

describe('BYC-4 — revisão e Cofre (§Aceite 3 + §Organização)', () => {
  it('[BYC-4a] aceitar grava; descartar não persiste; editar grava o texto editado', () => {
    const h = host()
    seed(h)
    const preview = paste(h, 'gemini', '## Sobre mim\n- Miguel, dono.\n\n## Regras e restrições\n- Nunca inventar preços.\n\n## Ferramentas e processos\n- Usa planilhas.\n')
    const [me, rule, tool] = preview.proposals
    const result = h.applyContextProposals({
      ...SCOPE,
      preview,
      items: [
        { id: me!.id, action: 'accept' },
        { id: rule!.id, action: 'discard' },
        { id: tool!.id, action: 'edit', body: 'Usa planilhas e WhatsApp.' },
      ],
    })
    expect(result.written).toBe(2)
    const records = h.listVaultRecords(SCOPE)
    expect(records.find(row => row.id === me!.id)?.body).toContain('Miguel, dono.')
    expect(records.find(row => row.id === tool!.id)?.body).toContain('Usa planilhas e WhatsApp.')
    expect(records.some(row => row.id === rule!.id)).toBe(false)
    expect(cofreBodies(h).join('\n')).not.toMatch(/Nunca inventar preços/u)
    // The record keeps its typed kind and provenance.
    expect(records.find(row => row.id === me!.id)?.kind).toBe('brief')
    expect(records.find(row => row.id === me!.id)?.body).toMatch(/colado do Gemini em \d{2}\/\d{2}/u)
  })

  it('[BYC-4b] "só para mim" não aparece para outro membro do workspace', () => {
    const h = host()
    seed(h)
    const preview = paste(h, 'claude', '## Sobre mim\n- Prefiro conversar por áudio, só comigo.\n\n## Empresa e projetos\n- A Lua abre aos domingos.\n', SHARED)
    const [mine, shared] = preview.proposals
    h.applyContextProposals({
      ...SHARED,
      preview,
      items: [{ id: mine!.id, action: 'private' }, { id: shared!.id, action: 'accept' }],
    })
    expect(h.vault.getRecord(mine!.id)?.visibility).toEqual({ kind: 'members', memberIds: ['ana'] })
    expect(h.vault.getRecord(shared!.id)?.visibility).toEqual({ kind: 'workspace' })

    h.sessionMemberId = 'bia'
    const biaSees = cofreBodies(h, SHARED).join('\n')
    expect(biaSees).toMatch(/domingos/u)
    expect(biaSees, 'item privado da Ana vazou na lista do Cofre da Bia').not.toMatch(/áudio/u)

    h.sessionMemberId = 'ana'
    expect(cofreBodies(h, SHARED).join('\n')).toMatch(/áudio/u)
  })

  it('[BYC-4b] a prévia de outro membro não vaza o texto de um item privado (duplicado/conflito)', () => {
    const h = host()
    seed(h)
    // A private decision exactly as the Cofre stores it (no provenance suffix) so the clash detector can see it.
    h.vault.createRecord({
      id: 'dec-private', workspaceId: 'ws', projectId: 'team', kind: 'decision',
      body: 'O reajuste de preço fica para janeiro.', authorId: 'ana',
      visibility: { kind: 'members', memberIds: ['ana'] },
    })
    const text = '## Decisões já tomadas\n- O reajuste de preço não fica para janeiro.\n'
    const owner = paste(h, 'claude', text, SHARED).proposals[0]!
    expect(owner.status, 'controle: a dona do item vê o conflito').toBe('conflict')

    h.sessionMemberId = 'bia'
    const hers = paste(h, 'claude', text, SHARED).proposals[0]!
    const leaked = `${hers.conflictQuestion} ${hers.duplicateOf}`
    expect(leaked, `a prévia da Bia citou a decisão privada da Ana: ${hers.conflictQuestion}`)
      .not.toMatch(/fica para janeiro|dec-private/u)
  })

  it('[BYC-4c] a mesma frase vinda de outra IA depois de já importada é marcada como duplicada', () => {
    const h = host()
    seed(h)
    const first = paste(h, 'chatgpt', '## Empresa e projetos\n- A Padaria Lua abre às seis da manhã de terça a sábado.\n')
    h.applyContextProposals({ ...SCOPE, preview: first, items: [{ id: first.proposals[0]!.id, action: 'accept' }] })
    // Another AI repeats it, in a different position (different proposal id).
    const second = paste(h, 'claude', '## Sobre mim\n- Miguel.\n\n## Empresa e projetos\n- A Padaria Lua abre às seis da manhã de terça a sábado.\n')
    const again = second.proposals.find(row => row.body.startsWith('A Padaria Lua'))!
    expect(again.status, 'duplicata do que o próprio BYC gravou antes').toBe('duplicate')
    const written = h.applyContextProposals({
      ...SCOPE, preview: second, items: second.proposals.map(row => ({ id: row.id, action: 'accept' as const })),
    })
    expect(cofreBodies(h).filter(body => body.includes('abre às seis')).length).toBe(1)
    expect(written.written).toBe(1) // só "Miguel."
  })

  it('[BYC-4c] duplicata do Cofre não regrava; conflito com decisão fixada vira pergunta e não sobrescreve', () => {
    const h = host()
    seed(h)
    h.createVaultRecord({ ...SCOPE, id: 'dec-1', kind: 'decision', body: 'O site usa lilás.', authorId: 'ana' })
    h.createVaultRecord({ ...SCOPE, id: 'brief-1', kind: 'brief', body: 'Padaria Lua, pão e café em São Paulo.', authorId: 'ana' })
    const preview = paste(h, 'chatgpt', '## Empresa e projetos\n- Padaria Lua, pão e café em São Paulo.\n\n## Decisões já tomadas\n- O site não usa lilás.\n')
    const dup = preview.proposals.find(row => row.kind === 'brief')!
    const clash = preview.proposals.find(row => row.kind === 'decision')!
    expect(dup.status).toBe('duplicate')
    expect(dup.duplicateOf).toBe('brief-1')
    expect(clash.status).toBe('conflict')
    expect(clash.conflictQuestion).toMatch(/O Cofre já tem.*O site usa lilás.*Qual vale\?/su)

    const result = h.applyContextProposals({
      ...SCOPE,
      preview,
      items: preview.proposals.map(row => ({ id: row.id, action: 'accept' as const })),
    })
    expect(result.written).toBe(0)
    const bodies = cofreBodies(h)
    expect(bodies).toHaveLength(2)
    expect(bodies).toContain('O site usa lilás.')
    expect(bodies.some(body => /não usa lilás/u.test(body))).toBe(false)
  })

  it('[BYC-4d] nada vira regra obrigatória sem aceite explícito; organizar não grava e tudo roda local', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('rede proibida no BYC'))
    try {
      const h = host()
      seed(h)
      const preview = paste(h, 'chatgpt', '## Regras e restrições\n- Nunca responder cliente sem conferir o pedido.\n')
      expect(preview.proposals[0]?.kind).toBe('constraint')
      expect(cofreBodies(h)).toEqual([])

      // No decision at all → nothing is written, not even by an empty apply.
      const none = h.applyContextProposals({ ...SCOPE, preview, items: [] })
      expect(none.written).toBe(0)
      expect(cofreBodies(h)).toEqual([])

      // A rule exists only after an explicit accept.
      const accepted = h.applyContextProposals({ ...SCOPE, preview, items: [{ id: preview.proposals[0]!.id, action: 'accept' }] })
      expect(accepted.written).toBe(1)
      expect(h.listVaultRecords(SCOPE)[0]?.kind).toBe('constraint')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('[BYC-4d] sem permissão de escrita (membro de outro projeto) o apply é recusado e nada é gravado', () => {
    const h = host()
    seed(h)
    const preview = paste(h, 'chatgpt', '## Sobre mim\n- Miguel.\n')
    h.sessionMemberId = 'ghost'
    expect(() => h.applyContextProposals({
      ...SCOPE, preview, items: [{ id: preview.proposals[0]!.id, action: 'accept' }],
    })).toThrow(/forbidden/u)
    h.sessionMemberId = 'ana'
    expect(cofreBodies(h)).toEqual([])
  })

  it('o vault de exemplo tem o que o aceite descreve (guarda da própria fixture)', () => {
    const names = Object.keys(SAMPLE_VAULT_FILES)
    expect(names.filter(name => name.endsWith('.md') && !name.startsWith('.'))).toHaveLength(3)
    expect(names.some(name => name.startsWith('.obsidian/'))).toBe(true)
    expect(names.some(name => name.startsWith('.trash/'))).toBe(true)
    expect(names.some(name => name.endsWith('.png'))).toBe(true)
  })
})

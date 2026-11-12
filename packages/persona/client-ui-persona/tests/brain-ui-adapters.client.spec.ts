import { describe, expect, it } from 'vitest'
import { brainKindBrandIcon, brainPageTitle, brainSourceDisplay, brainSourceLabel, countPagesByKind, feedEditorDisplay, grantActionLabel, grantIsActive, grantTargetLabel, grantUsageLabel, pageExcerpt, pageLead, pageToChangeItem, topBrainPages } from '../src/client/second-brain/brain-ui-adapters.ts'
import { en, pt } from '../src/client/locale/second-brain/locales.ts'
import type { BrainGrantView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'

const page = (partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'kind' | 'title'>): BrainPageView => ({
  body: partial.body ?? 'Corpo',
  slug: partial.slug ?? partial.id,
  revision: 1,
  links: [],
  sources: [],
  editorHint: '',
  updatedAt: partial.updatedAt ?? '2026-11-04T12:00:00.000Z',
  restricted: false,
  ...partial,
})

describe('brain-ui-adapters', () => {
  it('maps brain kinds to Brush brand icons', () => {
    expect(brainKindBrandIcon('company')).toBe('empresa')
    expect(brainKindBrandIcon('learning')).toBe('aprendizado')
  })

  it('counts pages by kind', () => {
    const counts = countPagesByKind([
      page({ id: 'a', kind: 'rule', title: 'A' }),
      page({ id: 'b', kind: 'rule', title: 'B' }),
      page({ id: 'c', kind: 'decision', title: 'C' }),
    ])
    expect(counts.rule).toBe(2)
    expect(counts.decision).toBe(1)
  })

  it('topBrainPages sorts by updatedAt', () => {
    const top = topBrainPages([
      page({ id: 'old', kind: 'company', title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      page({ id: 'new', kind: 'company', title: 'New', updatedAt: '2026-11-04T00:00:00.000Z' }),
    ], 1)
    expect(top[0]?.id).toBe('new')
  })

  it('grantIsActive respects expiry', () => {
    const grant: BrainGrantView = {
      id: 'g1',
      pageId: 'p1',
      personaId: 'sol',
      action: 'send',
      target: 'clients',
      validity: '7d',
      expiresAt: '2020-01-01T00:00:00.000Z',
      useCount: 0,
    }
    expect(grantIsActive(grant, Date.now())).toBe(false)
  })

  it('pageExcerpt trims long lines', () => {
    expect(pageExcerpt('hello\nworld', 8)).toBe('hello')
  })

  it('feedEditorDisplay: person:system is the persona holding the librarian role, never a fixed Atlas', () => {
    const system = page({ id: 'x', kind: 'company', title: 'T', editorHint: 'person:system' })
    // No librarian in this team: a neutral label and no borrowed portrait.
    const none = feedEditorDisplay(pt, system)
    expect(none.who).toBe('A equipe')
    expect(none.whoAvatar).toBeUndefined()
    // With one, her name (and her portrait when she has one).
    const named = feedEditorDisplay(pt, system, {}, { system: 'Atlas' })
    expect(named.who).toBe('Atlas')
    expect(named.whoAvatar).toBeTruthy()
    expect(feedEditorDisplay(pt, system, {}, { system: 'Coordenação' }).who).toBe('Coordenação')
  })

  it('brainSourceLabel localizes derived-index', () => {
    expect(brainSourceLabel(pt, 'derived-index')).toBe(pt['feed.sourceDerivedIndex'])
    expect(brainSourceLabel(pt, 'vault:notas.md')).toBe('vault:notas.md')
  })

  it('pageToChangeItem: the automatic index reads "A equipe atualizou …" and drops its own source line (it would only repeat it)', () => {
    const item = pageToChangeItem(pt, page({
      id: 'x',
      kind: 'rule',
      title: 'Regra',
      editorHint: 'person:system',
      sources: ['derived-index'],
    }))
    expect(item.source).toBeUndefined()
    expect(item.who).toBe('A equipe')
  })
})

describe('readable Second Brain text (SB-5, Muse sweep)', () => {
  const grantPage = page({ id: 'g', kind: 'permission', title: 'reply-whatsapp · clientes-aprovados', editorHint: 'person:owner', sources: ['grant:owner'] })

  it('a member id is never shown: "Você" for the viewer, "Alguém da equipe" for the rest', () => {
    expect(feedEditorDisplay(pt, grantPage, {}, { owner: 'Você' }).who).toBe('Você')
    expect(feedEditorDisplay(pt, grantPage, {}, {}).who).toBe('Alguém da equipe')
    expect(feedEditorDisplay(pt, page({ id: 'x', kind: 'rule', title: 'T', editorHint: 'grant:abc' })).who).not.toMatch(/grant:/u)
  })

  it('a permission page reads as a sentence, not as two slugs', () => {
    expect(brainPageTitle(pt, grantPage)).toBe('Responder no WhatsApp: clientes aprovados')
    expect(grantActionLabel(pt, 'send-invoice')).toBe('Ação (send invoice)') // Ember 12:34: an unknown verb never reads as loose English ("Send invoice"): it says it is an action
    expect(grantTargetLabel(pt, 'clientes-aprovados')).toBe('clientes aprovados')
    // Only permission pages are re-titled; a page called "a-b" by a person stays as written.
    expect(brainPageTitle(pt, page({ id: 'r', kind: 'rule', title: 'reply-whatsapp · x' }))).toBe('reply-whatsapp · x')
  })

  it('Ember 12:34: every action the host remembers has a human label in Portuguese (and English), and a dotted unknown one still falls back to words', () => {
    expect(grantActionLabel(pt, 'send-email')).toBe('Enviar e-mail')
    expect(grantActionLabel(pt, 'action.send')).toBe('Enviar')
    expect(grantActionLabel(pt, 'action.post')).toBe('Publicar')
    expect(grantActionLabel(pt, 'connector.release')).toBe('Liberar um serviço conectado')
    expect(grantActionLabel(pt, 'skill.activate')).toBe('Ativar uma habilidade')
    expect(grantActionLabel(pt, 'vault.update')).toBe('Atualizar uma memória')
    expect(grantActionLabel(en, 'send-email')).toBe('Send email')
    expect(grantActionLabel(en, 'skill.activate')).toBe('Activate a skill')
    expect(grantActionLabel(pt, 'action.pay')).toBe('Ação (action pay)')
    expect(grantActionLabel(en, 'send-invoice')).toBe('Action (send invoice)')
    expect(brainPageTitle(pt, page({ id: 'g2', kind: 'permission', title: 'send-email · fornecedores' }))).toBe('Enviar e-mail: fornecedores')
  })

  it('Ember 12:34: a target never prints a URL (an account connector id is the proxy URL WITH ITS KEY) and an opaque id becomes words', () => {
    const key = '0f'.repeat(24)
    expect(grantTargetLabel(pt, `claude:https://proxy.example.test/v1/mcp/${key}`)).toBe('um serviço conectado')
    expect(grantTargetLabel(pt, `https://proxy.example.test/v1/mcp/${key}`)).toBe('um serviço conectado')
    expect(grantTargetLabel(pt, `claude:https://proxy.example.test/v1/mcp/${key}`)).not.toContain(key)
    expect(grantTargetLabel(en, 'https://proxy.example.test/x')).toBe('a connected service')
    expect(grantTargetLabel(pt, 'skill:abc123')).toBe('uma habilidade')
    expect(grantTargetLabel(pt, 'vault:rec-77')).toBe('uma memória')
    expect(grantTargetLabel(pt, 'fornecedores')).toBe('fornecedores')
    expect(grantTargetLabel(pt, 'claude:mail-mcp')).toBe('claude:mail-mcp') // a local connector is named, not secret
  })

  it('Ember 12:34: the usage line is singular for one use ("Usada 1 vez", never "Usada 1 vezes")', () => {
    expect(grantUsageLabel(pt, 1)).toBe('Usada 1 vez')
    expect(grantUsageLabel(pt, 2)).toBe('Usada 2 vezes')
    expect(grantUsageLabel(pt, 14)).toBe('Usada 14 vezes')
    expect(grantUsageLabel(en, 1)).toBe('Used once')
    expect(grantUsageLabel(en, 3)).toBe('Used 3 times')
  })

  it('the feed row drops a source that is only an id, and says "atualizado sozinho" for the automatic index', () => {
    expect(brainSourceDisplay(pt, 'grant:owner')).toBeUndefined()
    expect(brainSourceDisplay(pt, 'person:owner')).toBeUndefined()
    expect(brainSourceDisplay(pt, 'derived-index')).toBe('atualizado sozinho')
    expect(brainSourceDisplay(pt, 'vault:notas.md')).toBe('vault:notas.md')
    const item = pageToChangeItem(pt, grantPage, {}, undefined, { owner: 'Você' })
    expect(item.who).toBe('Você')
    expect(item.pageTitle).toBe('Responder no WhatsApp: clientes aprovados')
    expect(item.source).toBeUndefined()
  })

  it('pageLead is the start of the page without its own title, bullets or [[links]]', () => {
    expect(pageLead('# Comece aqui\n\nAtualizado sozinho a partir das páginas.\n\n- [[Cardápio]] (empresa)\n- [[Preços|Tabela]]')).toBe('Atualizado sozinho a partir das páginas.\nCardápio (empresa)')
    expect(pageLead('# So um título')).toBe('')
    expect(pageLead('a'.repeat(300), 1, 20)).toHaveLength(20)
  })
})

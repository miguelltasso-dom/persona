// @vitest-environment jsdom
// Carbon, lote fio-d103 (veredito AJUSTES, 8 itens; persona-spec/carbon/lotes/fio-d103.md): a 2ª leitura visual do Fio real.
// (1) raster: a moldura ABRAÇA a imagem; (2) pílula recolhida sem lascas nos cantos; (3) chip de referência com chevron que gira; (4) entrega com arte em 2 colunas
// e retratos com contorno no escuro; (5) pílula do motor com chevron e tinta cheia; (6) diálogo do EFF-1: radio temado, linhas compactas, a opção ativa à vista, sem blur no scrim;
// (7) fila: "Mandar agora" secundário, "Editar"/"Tirar" ghost. (O 8 é recaptura.)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import { ChannelComposer, WHO_RESPONDS_HINT_KEY } from '../src/client/chat/ChannelComposer.tsx'
import { DeliveryCard } from '../src/client/chat/DeliveryCard.tsx'
import type { DraftFileUi } from '../src/client/chat/draft-files/draft-files-model.ts'
import { OpinionBlock } from '../src/client/chat/opinion/OpinionBlock.tsx'
import { buildOpinionBlocks, type OpinionUi } from '../src/client/chat/opinion/opinion-model.ts'
import { QueuedMessageBubble } from '../src/client/chat/QueuedMessageBubble.tsx'
import { ENGINE_EFFORT_FLAG_KEY } from '../src/client/profile/engine-effort-flag.ts'
import { PersonaEngineOverlay } from '../src/client/profile/PersonaEngineOverlay.tsx'
import type { ChannelMessageUi, DeliveryCardUi } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const src = (...parts: string[]): string => readFileSync(join(__dirname, '..', 'src', 'client', ...parts), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')
const rule = (css: string, selector: string): string => {
  const escaped = selector.replace(/[.[\]()*+?^$|\\]/gu, '\\$&')
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css)?.[1] ?? ''
}

beforeEach(() => { localStorage.clear(); localStorage.setItem(WHO_RESPONDS_HINT_KEY, '1'); localStorage.setItem(ENGINE_EFFORT_FLAG_KEY, '1') })
afterEach(() => { cleanup(); localStorage.clear() })

describe('(1) raster: a moldura abraça a imagem (sem caixa dentro de caixa)', () => {
  const thumb = src('chat', 'draft-files', 'DraftFileThumb.module.css')
  it('hero e entrega em raster: fit-content, no máximo 320/240, sem altura mínima', () => {
    const hero = rule(thumb, ".hero[data-thumb='raster']")
    const delivery = rule(thumb, ".delivery[data-thumb='raster']")
    expect(hero).toMatch(/width:\s*fit-content/u)
    expect(hero).toMatch(/max-width:\s*min\(320px,\s*100%\)/u)
    expect(delivery).toMatch(/width:\s*fit-content/u)
    expect(delivery).toMatch(/max-width:\s*min\(240px,\s*100%\)/u)
    expect(hero).not.toMatch(/min-height/u)
    expect(delivery).not.toMatch(/min-height/u)
    expect(thumb).not.toMatch(/min-height:\s*160px/u)
  })
})

describe('(2)(3) a pílula sem lascas e o chip de referência que indica expandir', () => {
  const css = src('chat', 'opinion', 'OpinionBlock.module.css')
  const ART: DraftFileUi = { path: 'arte/cartaz.svg', name: 'cartaz.svg', mime: 'image/svg+xml', taskId: 'tk-1', personaId: 'teo', type: 'image', thumb: 'data:image/png;base64,AAAA' }
  const ui = (over: Partial<OpinionUi> = {}): OpinionUi => ({ kind: 'request', requestId: 'req-1', taskId: 'tk-1', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [], ...over })
  const msg = (id: string, authorId: string, authorName: string, opinion: OpinionUi): ChannelMessageUi => ({ id, authorId, authorName, body: `${authorName} opinou`, timeLabel: '10:00', reactions: [], opinion })
  const block = (rows: readonly ChannelMessageUi[]) => {
    const model = buildOpinionBlocks(rows).get('req-1')
    if (model === undefined) throw new Error('sem bloco')
    return model
  }
  const team = { personas: [{ id: 'teo', name: 'Téo', avatarRef: 'bento' }] } as unknown as TeamView

  it('o card recolhido leva o fundo da pílula e a pílula usa o raio interno do card (nada vaza nos 4 cantos)', () => {
    expect(rule(css, '.card[data-collapsed]')).toMatch(/background:\s*var\(--persona-wash\)/u)
    expect(rule(css, '.pill')).toMatch(/border-radius:\s*calc\(var\(--persona-radius-l\)\s*-\s*var\(--persona-border-width\)\)/u)
  })

  it('o chip "Referência do pedido" tem o chevron (que gira ao abrir) e o estado aberto muda de borda, fundo e tinta', () => {
    const rows = [msg('r', 'teo', 'Téo', ui({ files: [ART], imageIds: ['att-1'], alt: 'Foto' }))]
    render(<OpinionBlock t={t} block={block(rows)} team={team} resolveImage={() => Promise.resolve('data:image/png;base64,AAAA')} />)
    const chip = document.querySelector('[data-persona-opinion-reference] button') as HTMLElement
    expect(chip.querySelectorAll('svg')).toHaveLength(2)
    expect(chip.querySelector('[class*="referenceChevron"]')).not.toBeNull()
    expect(rule(css, '.referenceChevron')).toMatch(/transition:[^;]*var\(--motion-fast\)[^;]*var\(--ease-standard\)/u)
    expect(rule(css, ".referenceChip[aria-expanded='true'] .referenceChevron")).toMatch(/transform:\s*rotate\(180deg\)/u)
    const open = rule(css, ".referenceChip[aria-expanded='true']")
    expect(open).toMatch(/border-color:\s*var\(--persona-outline-control\)/u)
    expect(open).toMatch(/background:\s*var\(--persona-wash\)/u)
    expect(open).toMatch(/color:\s*var\(--persona-ink\)/u)
  })

  it('a foto de referência aberta tem o contorno do tema (1,5 px outline-control), não o aro claro do escuro', () => {
    expect(rule(css, '.referenceImages .imageButton')).toMatch(/border:\s*1\.5px solid var\(--persona-outline-control\)/u)
  })

  it('os retratos das respostas ganham contorno no escuro', () => {
    expect(css).toMatch(/body\[data-ds-dark-theme='true'\]\)\s*\.face\s*\{[^}]*border-color:\s*var\(--persona-outline-control\)/u)
  })
})

describe('(4) a entrega com arte: 2 colunas a partir de 600 px', () => {
  const DELIVERY: DeliveryCardUi = { requestId: 'req-1', title: 'Cartaz', parts: [{ taskId: 't-1', title: 'Texto', personaName: 'Bia' }, { taskId: 't-2', title: 'Arte', personaName: 'Téo' }], approvalId: 'approval-1', reviewedByName: 'Lia' }
  const ART: DraftFileUi = { path: 'arte/cartaz.svg', name: 'cartaz.svg', mime: 'image/svg+xml', taskId: 't-2', personaId: 'p-teo', type: 'image', thumb: 'data:image/png;base64,AAAA' }

  it('com arte: a miniatura e o lado (partes + rodapé) ficam num grid; sem arte, nenhum invólucro novo', () => {
    const withArt = render(<DeliveryCard t={t} delivery={DELIVERY} art={ART} onOpenApproval={vi.fn()} />)
    const grid = withArt.container.querySelector('[data-delivery-with-art]') as HTMLElement
    expect(grid).not.toBeNull()
    const side = grid.querySelector('[data-delivery-side]') as HTMLElement
    expect(within(side).getByText('Texto (Bia)')).toBeTruthy()
    expect(within(side).getByRole('button', { name: 'Revisar e aplicar' })).toBeTruthy()
    expect(grid.querySelector('[data-delivery-art]')).not.toBeNull()
    withArt.unmount()
    const plain = render(<DeliveryCard t={t} delivery={DELIVERY} onOpenApproval={vi.fn()} />)
    expect(plain.container.querySelector('[data-delivery-with-art]')).toBeNull()
    expect(plain.container.querySelector('[data-delivery-side]')).toBeNull()
  })

  it('o CSS: empilhado no estreito; miniatura à esquerda e partes + rodapé à direita a partir de 600 px; retratos com contorno no escuro', () => {
    const css = src('chat', 'DeliveryCard.module.css')
    // a largura do CARTÃO decide (container query): a 200% a janela tem 640 px mas o cartão fica estreito (rail), e a media query dava rolagem lateral
    expect(css).toMatch(/@container\s*\(min-width:\s*600px\)\s*\{[^}]*\.withArt\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/u)
    expect(rule(css, '.row')).toMatch(/container-type:\s*inline-size/u)
    expect(css).toMatch(/body\[data-ds-dark-theme='true'\]\)\s*\.partFace\s*\{[^}]*border-color:\s*var\(--persona-outline-control\)/u)
  })

  it('os retratos das partes levam a classe do contorno', () => {
    const { container } = render(<DeliveryCard t={t} delivery={DELIVERY} art={ART} onOpenApproval={vi.fn()} />)
    expect(container.querySelectorAll('[data-delivery-side] [class*="partFace"]').length).toBeGreaterThanOrEqual(1)
  })
})

describe('(5) a pílula Modelo · Esforço parece um botão e a DM não cita o #geral', () => {
  const NINA: ChannelPersonaMember = { id: 'nina' as never, name: 'Nina', role: 'Pesquisa', state: 'resting' }
  it('ela traz o chevron ▾ e a tinta cheia (ink), com o fundo da lavanda e o contorno do escuro', () => {
    render(<ChannelComposer t={t} members={[NINA]} responderHidden responderEngine={{ label: () => 'Sonnet · high', onOpen: vi.fn() }} />)
    const pill = document.querySelector('[data-persona-composer-engine]') as HTMLElement
    expect(pill.querySelector('svg')).not.toBeNull()
    const css = src('chat', 'ChannelComposer.module.css')
    const base = rule(css, '.enginePill')
    expect(base).toMatch(/color:\s*var\(--persona-ink\)/u)
    expect(base).toMatch(/background:\s*var\(--persona-wash\)/u)
    expect(css).toMatch(/body\[data-ds-dark-theme='true'\]\)\s*\.enginePill\s*\{[^}]*border-color:\s*var\(--persona-outline-control\)/u)
  })

  it('o placeholder da DM é o da conversa (a DM real o passa; o composer sem placeholder cai no do canal, por isso o DM o define)', () => {
    const dm = src('chat', 'DirectMessagesView.tsx')
    expect(dm).toMatch(/placeholder=\{composerSubjectPlaceholder \?\? t\('dm\.composerPlaceholder', \{ name: selected\.peerName \}\)\}/u)
  })
})

describe('(6) o diálogo do EFF-1: radio temado, linhas compactas, a opção ativa à vista, scrim sem blur', () => {
  const css = src('profile', 'PersonaEngineOverlay.module.css')
  const CLAUDE: ConnectionView = {
    id: 'conn-claude', kind: 'claude', available: true, loggedIn: true, loginHint: '', phase: 'ready', defaultEffortLevels: ['low', 'medium', 'high'],
    models: [{ id: 'sonnet', label: 'Sonnet', effortLevels: ['low', 'medium', 'high'] }],
  } as unknown as ConnectionView

  it('o radio nativo vira um círculo do tema (appearance: none), com o marcado preenchido', () => {
    const radio = rule(css, '.modelRadio')
    expect(radio).toMatch(/appearance:\s*none/u)
    expect(radio).toMatch(/border:\s*1\.5px solid var\(--persona-outline-control\)/u)
    expect(rule(css, '.modelRadio:checked')).toMatch(/background:\s*var\(--persona-brand\)/u)
  })

  it('as linhas são compactas (36 px, nome e dica na mesma linha) para o Modelo e o Esforço caberem sem rolar', () => {
    expect(rule(css, '.modelRow')).toMatch(/min-height:\s*36px/u)
    expect(rule(css, '.modelText')).toMatch(/flex-direction:\s*row/u)
  })

  it('ao abrir, a opção ATIVA do esforço ("high") é trazida à vista (scrollIntoView), em vez de ficar sob o fade', async () => {
    const seen: Element[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scroll(this: Element) { seen.push(this) }
    try {
      render(
        <PersonaEngineOverlay
          dict={profilePt}
          persona={{
            listConnections: async () => ({ ok: true as const, value: [CLAUDE] }),
            listPersonas: async () => ({ ok: true as const, value: [{ id: 'p-nina', name: 'Nina', engine: { runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'sonnet', runnerEffort: 'high' } }] }),
            setPersonaEngine: vi.fn(),
          } as never}
          cardBridge={{ invalidate: vi.fn(), revision: { getSnapshot: () => ({ n: 0 }), subscribe: () => () => {} }, cardInfo: () => undefined, prefetch: () => {}, togglePause: async () => {} }}
          useShell={selector => selector({ enginePersonaId: 'p-nina' } as never)}
          scope={() => ({ workspaceId: 'ws-1', projectId: 'proj-1' })}
          closeEngineEditor={vi.fn()}
        />,
      )
      await waitFor(() => { expect(seen.some(node => node.getAttribute('data-effort-id') === 'high' && node.getAttribute('data-checked') === 'true')).toBe(true) })
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('o scrim não usa backdrop-filter (regra de GPU da Muse): só a cor do token', () => {
    expect(src('primitives', 'Overlays.module.css')).not.toMatch(/backdrop-filter/u)
  })
})

describe('(7) a fila: a ação principal tem peso', () => {
  it('"Mandar agora" é secundário (com contorno); "Editar" e "Tirar" seguem ghost', () => {
    render(<QueuedMessageBubble t={t} item={{ id: 'q1', text: 'Atualiza o cardápio', targetPersonaName: 'Nina' }} isOnlyItem onSendNow={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} />)
    const send = document.querySelector('[data-persona-queued-message] button[aria-label*="Mandar agora"]') as HTMLElement
    expect(send.className).toContain('secondary')
    expect((document.querySelector('[data-persona-queued-message] button[aria-label*="Editar"]') as HTMLElement).className).toContain('ghost')
    expect((document.querySelector('[data-persona-queued-message] button[aria-label*="Tirar"]') as HTMLElement).className).toContain('ghost')
    fireEvent.click(send)
  })
})

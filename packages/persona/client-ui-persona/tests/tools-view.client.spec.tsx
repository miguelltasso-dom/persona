// @vitest-environment jsdom
// Item 26 · Configurações › Ferramentas (Muse COLHEITA-MUSE §26): "Ferramentas do seu negócio". Ligadas com saúde, os filtros, a grade "Para ligar",
// "Em breve" recolhido, o vazio do filtro. Nenhuma palavra técnica, nenhum logotipo, nenhum controle morto.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pt as toolsPt } from '../src/client/locale/tools/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { NAV_PLACES } from '../src/client/shell/nav-places.ts'
import { ToolsView, type ToolsActions } from '../src/client/tools/ToolsView.tsx'
import { countsOf, gridOf, linkedToolsOf, readCatalog, readHealth, sameTool, type ToolCatalog, type ToolHealthLine } from '../src/client/tools/tools-model.ts'
import { FLAGS, setFlagDefaults } from '../src/client/flags.ts'
import { TOOLS_CATALOG_FLAG_KEY } from '../src/client/tools/tools-flag.ts'

/** Todas as ações: a tela sabe ligar qualquer cartão (como será com o 26.5). */
const ALL_ACTIONS: ToolsActions = { onConnect: () => undefined, onClaude: () => undefined }

installPreviewTheme()
afterEach(cleanup)

const CATEGORIES = [
  { id: 'sales', name: 'Vendas e loja' }, { id: 'payments', name: 'Pagamentos' }, { id: 'support', name: 'Atendimento' }, { id: 'agenda', name: 'Agenda e e-mail' },
  { id: 'documents', name: 'Documentos' }, { id: 'social', name: 'Redes sociais' }, { id: 'management', name: 'Gestão' },
] as const

const card = (id: string, name: string, category: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, name, category, sentence: `A equipe usa ${name} por você.`, via: 'official', promised: true, linked: false, ...over,
})

const CATALOG: ToolCatalog = readCatalog({
  categories: CATEGORIES,
  cards: [
    card('mp', 'Mercado Pago', 'payments', { linked: true }),
    card('ml', 'Mercado Livre', 'sales', { linked: true }),
    card('gm', 'Gmail', 'agenda', { linked: true, via: 'claude-account' }),
    card('bl', 'Bling', 'management', { via: 'token' }),
    card('ig', 'Instagram', 'social', { via: 'claude-account' }),
    card('dr', 'Google Drive', 'documents'),
    card('zp', 'Zap do Futuro', 'support', { promised: false, via: 'unconfirmed' }),
    card('ct', 'Contabilizei', 'management', { promised: false, via: 'unconfirmed' }),
  ],
})!

const HEALTH: readonly ToolHealthLine[] = readHealth([
  { id: 'h1', name: 'Mercado Pago', personaId: 'p1', state: 'reconnect', action: 'reconnect', sentence: 'Nina não conseguiu ler as vendas: o Mercado Pago pediu para você entrar de novo.' },
  { id: 'h2', name: 'Mercado Pago', personaId: 'p2', state: 'ok', action: 'none', sentence: 'Bento pode usar Mercado Pago.' },
  { id: 'h3', name: 'Mercado Livre', state: 'offline', action: 'retry', sentence: 'Fora do ar.' },
  { id: 'h4', name: 'Gmail', state: 'ok', action: 'none', sentence: '' },
  { id: 'h5', name: 'E-mail da empresa', state: 'reconnect', action: 'reconnect', sentence: 'Entre de novo.' }, // not a catalog tool: it lives in Conexões
])

function mount(extra: Partial<React.ComponentProps<typeof ToolsView>> = {}): void {
  render(
    <PreviewFrame brandLabel="Persona">
      <ToolsView catalog={CATALOG} health={HEALTH} {...extra} />
    </PreviewFrame>,
  )
}

describe('o que a tela lê do host (puro)', () => {
  it('lê o catálogo e descarta o que não entende (um host mais novo ou mais antigo não quebra a tela)', () => {
    const read = readCatalog({ categories: [{ id: 'sales', name: 'Vendas' }, { id: 'x', name: 'Y' }], cards: [card('a', 'A', 'sales'), card('b', 'B', 'nope'), { id: 'c' }, 'lixo'] })
    expect(read?.categories).toEqual([{ id: 'sales', name: 'Vendas' }])
    expect(read?.cards.map(item => item.id)).toEqual(['a'])
    expect(readCatalog(undefined)).toBeUndefined()
    expect(readCatalog({ categories: [] })).toBeUndefined()
    expect(readHealth('x')).toEqual([])
    expect(readHealth([{ id: 'h', name: 'N', state: 'weird' }])).toEqual([])
  })
  it('os nomes casam como no host: um contém o outro, sem acento e sem caixa', () => {
    expect(sameTool('claude.ai Gmail', 'Gmail')).toBe(true)
    expect(sameTool('Mercado Pago', 'mercado pago')).toBe(true)
    expect(sameTool('Mercado Livre', 'Mercado Pago')).toBe(false)
    expect(sameTool('', 'Gmail')).toBe(false)
  })
  it('cada ferramenta ligada mostra a PIOR linha de saúde que a cita; sem linha, funciona', () => {
    const linked = linkedToolsOf(CATALOG, HEALTH)
    expect(linked.map(item => [item.card.id, item.state])).toEqual([['mp', 'reconnect'], ['ml', 'offline'], ['gm', 'ok']])
    expect(linked[0]?.sentence).toMatch(/pediu para você entrar de novo/u)
    expect(linkedToolsOf(CATALOG, []).every(item => item.state === 'ok')).toBe(true)
  })
  it('a grade tem SÓ o que ainda não está ligado: o que dá para ligar hoje (e a tela sabe ligar) vai para "Para ligar", o resto para "Em breve"; o filtro corta os dois', () => {
    const all = gridOf(CATALOG, 'all', () => true)
    expect(all.ready.map(item => item.id)).toEqual(['bl', 'ig', 'dr']) // mp, ml e gm estão em Ligadas: nunca de novo na grade
    expect(all.soon.map(item => item.id)).toEqual(['zp', 'ct'])
    expect(gridOf(CATALOG, 'management', () => true)).toMatchObject({ ready: [{ id: 'bl' }], soon: [{ id: 'ct' }] })
  })
  it('sem um jeito de ligar (nenhuma ação), nenhum cartão fica "Para ligar": todos esperam em "Em breve" (nunca um cartão morto)', () => {
    const none = gridOf(CATALOG, 'all')
    expect(none.ready).toEqual([])
    expect(none.soon.map(item => item.id)).toEqual(['bl', 'ig', 'dr', 'zp', 'ct'])
    expect(gridOf(CATALOG, 'all', item => item.via === 'official').ready.map(item => item.id)).toEqual(['dr'])
  })
  it('a conta dos filtros é a do que ainda falta ligar (o mesmo que a grade mostra)', () => {
    expect(countsOf(CATALOG)).toMatchObject({ all: 5, payments: 0, sales: 0, agenda: 0, management: 2, social: 1, documents: 1, support: 1 })
  })
})

describe('a tela', () => {
  it('o cabeçalho e o subtítulo são os da Muse, sem palavra técnica e sem logotipo', () => {
    mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Ferramentas do seu negócio' })).toBeTruthy()
    expect(screen.getByText(/Ligue as ferramentas que a sua empresa já usa/u)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\b(MCP|OAuth|stdio|token|servidor)\b/iu)
    // Só a arte da CATEGORIA (a do Brush), nunca o logotipo de um terceiro: toda imagem é de uma categoria e tem o nome dela.
    const images = [...document.querySelectorAll('img')]
    expect(images.length).toBeGreaterThan(0)
    expect(images.every(image => image.hasAttribute('data-category') && CATEGORIES.some(category => category.name === image.getAttribute('alt')))).toBe(true)
  })

  it('a arte da categoria: 40 px na linha de Ligadas e 64 px no cartão', () => {
    mount({ actions: ALL_ACTIONS })
    const row = document.querySelector('[data-tool="mp"][data-health]') as HTMLElement
    expect(row.querySelector('img')?.getAttribute('width')).toBe('40')
    const cardMp = screen.getByRole('heading', { name: 'Bling' }).closest('[data-tool]') as HTMLElement
    expect(cardMp.querySelector('img')?.getAttribute('width')).toBe('64')
    expect(cardMp.querySelector('img')?.getAttribute('src')).toMatch(/categoria-gestao-96/u)
  })

  it('Ligadas · 3: o nome, a arte da categoria e a saúde (a bolinha verde só diz "Funcionando"; os outros estados têm a palavra)', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Ligadas · 3' })).toBeTruthy()
    const rows = [...document.querySelectorAll('[data-tool][data-health]')]
    expect(rows.map(row => row.getAttribute('data-tool'))).toEqual(['mp', 'ml', 'gm'])
    expect(within(rows[0] as HTMLElement).getByText('Entrar de novo')).toBeTruthy()
    expect(within(rows[1] as HTMLElement).getByText('Fora do ar agora')).toBeTruthy()
    expect(within(rows[2] as HTMLElement).getByRole('img', { name: 'Funcionando: Gmail' })).toBeTruthy()
    expect(within(rows[2] as HTMLElement).queryByText('Funcionando')).toBeNull() // só a bolinha
    expect(within(rows[0] as HTMLElement).getByRole('img', { name: 'Pagamentos' })).toBeTruthy() // a arte tem o nome da categoria
  })

  it('os 5 estados da saúde: precisa entrar de novo e falta permissão são âmbar; fora do ar e não encontrado, neutros', () => {
    const states = ['reconnect', 'permission', 'offline', 'missing', 'ok'] as const
    const cards = states.map((state, index) => card(`t${String(index)}`, `Ferramenta ${state}`, 'sales', { linked: true }))
    const catalog = readCatalog({ categories: CATEGORIES, cards })!
    const health = readHealth(states.map((state, index) => ({ id: `h${String(index)}`, name: `Ferramenta ${state}`, state, action: 'none', sentence: '' })))
    mount({ catalog, health })
    expect(screen.getByText('Entrar de novo')).toBeTruthy()
    expect(screen.getByText('Falta permissão')).toBeTruthy()
    expect(screen.getByText('Fora do ar agora')).toBeTruthy()
    expect(screen.getByText('Não encontrado')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Funcionando: Ferramenta ok' })).toBeTruthy()
    expect(screen.getByText('Entrar de novo').className).toMatch(/warning/u)
    expect(screen.getByText('Falta permissão').className).toMatch(/warning/u)
    expect(screen.getByText('Fora do ar agora').className).toMatch(/neutral/u)
  })

  it('a frase honesta do host fica no chip (nunca o texto cru do fornecedor)', () => {
    mount()
    expect(screen.getByText('Entrar de novo').getAttribute('title')).toMatch(/pediu para você entrar de novo/u)
  })

  it('os filtros: "Tudo" + as 7 categorias, com a conta; clicar corta a grade; uma categoria sem nada diz "Nada nesta categoria ainda."; só "Em breve" diz que não há o que ligar', () => {
    mount({ actions: ALL_ACTIONS })
    const group = screen.getByRole('group', { name: 'Filtrar ferramentas por tipo' })
    expect(within(group).getAllByRole('button')).toHaveLength(8)
    expect(within(group).getByRole('button', { name: /Tudo/u }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: /Tudo/u }).textContent).toMatch(/5/u) // o que ainda falta ligar
    fireEvent.click(within(group).getByRole('button', { name: /Gestão/u }))
    expect(screen.getByRole('heading', { name: 'Bling' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Instagram' })).toBeNull()
    fireEvent.click(within(group).getByRole('button', { name: /Atendimento/u })) // só um "Em breve": nada para ligar agora
    expect(screen.getByText(/Nenhuma ferramenta para ligar por enquanto/u)).toBeTruthy()
    fireEvent.click(within(group).getByRole('button', { name: /Pagamentos/u })) // só o que já está ligado: nada mesmo
    expect(screen.getByText('Nada nesta categoria ainda.')).toBeTruthy()
  })

  it('"Para ligar" mostra SÓ o que não está ligado: o que está em Ligadas não volta na grade, e não existe o chip "Já ligado"', () => {
    mount({ actions: ALL_ACTIONS })
    const grid = document.querySelector('section ul[class*="grid"]') as HTMLElement
    for (const name of ['Mercado Pago', 'Mercado Livre', 'Gmail']) expect(within(grid).queryByRole('heading', { name })).toBeNull()
    expect([...grid.querySelectorAll('h3')].map(heading => heading.textContent)).toEqual(['Bling', 'Instagram', 'Google Drive'])
    expect(screen.queryByText(/Já ligado/u)).toBeNull()
  })

  it('o rodapé do cartão: "Ligar na sua conta do Claude" é um botão secundário, "Conectar" também; sem a ação, o cartão espera em "Em breve" (nenhum botão morto)', () => {
    mount()
    expect(screen.queryByRole('button', { name: /^(Conectar|Ligar)/u })).toBeNull() // sem ação, sem botão
    expect(document.querySelector('section ul[class*="grid"]')).toBeNull() // nada em "Para ligar": tudo espera em "Em breve"
    expect(screen.getByText(/Nenhuma ferramenta para ligar por enquanto/u)).toBeTruthy()
    cleanup()
    const onConnect = vi.fn()
    const onClaude = vi.fn()
    mount({ actions: { onConnect, onClaude } satisfies ToolsActions })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar Bling' }))
    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ id: 'bl' }))
    const claude = screen.getByRole('button', { name: 'Ligar Instagram na sua conta do Claude' })
    expect(claude.textContent).toBe('Ligar na sua conta do Claude')
    expect(claude.className).toMatch(/secondary/u)
    expect(claude.className).not.toMatch(/\bs\b/u) // o tamanho de 40 px (m), não o de 32
    fireEvent.click(claude)
    expect(onClaude).toHaveBeenCalledWith(expect.objectContaining({ id: 'ig' }))
    expect(screen.queryByRole('button', { name: 'Conectar Gmail' })).toBeNull() // já ligado
    expect(screen.queryByRole('button', { name: 'Conectar Instagram' })).toBeNull() // entra pela conta do Claude
    cleanup()
    mount({ actions: { onConnect: vi.fn() } }) // só "Conectar": o do Claude espera em "Em breve"
    expect(screen.getByRole('button', { name: 'Conectar Bling' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Instagram/u })).toBeNull()
    expect(within(document.querySelector('details') as HTMLElement).getByRole('heading', { name: 'Instagram' })).toBeTruthy()
  })

  it('"Em breve" fica recolhido, no fim, com a conta e o chip neutro, sem botão, e nunca misturado com os prontos', () => {
    mount({ actions: ALL_ACTIONS })
    const soon = document.querySelector('details') as HTMLDetailsElement
    expect(soon.open).toBe(false)
    expect(within(soon).getByText('Em breve · 2')).toBeTruthy()
    expect(within(soon).getAllByText('Em breve')).toHaveLength(2)
    expect(within(soon).queryByRole('button')).toBeNull()
    expect(document.querySelector('section [data-soon]')).toBeNull() // the ready grid is in a section; the "Em breve" ones live only in the details
    expect(soon.compareDocumentPosition(screen.getByRole('heading', { name: 'Para ligar' })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy() // vem depois
    cleanup()
    mount() // sem nenhuma ação: os 5 que faltam ligar esperam aqui
    expect(within(document.querySelector('details') as HTMLElement).getByText('Em breve · 5')).toBeTruthy()
  })

  it('o menu ⋯ só existe com ação: Quem pode usar, Testar agora e Desligar', () => {
    mount()
    expect(screen.queryByRole('button', { name: /Mais ações de/u })).toBeNull()
    cleanup()
    const onWho = vi.fn()
    mount({ actions: { onWho, onOff: () => Promise.resolve() } })
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações de Mercado Pago' }))
    expect(screen.getByRole('menuitem', { name: 'Quem pode usar' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Desligar' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Testar agora' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Quem pode usar' }))
    expect(onWho).toHaveBeenCalledWith(expect.objectContaining({ id: 'mp' }))
  })

  it('nada ligado: a frase diz para escolher uma abaixo; carregando e erro usam as telas de sempre', () => {
    mount({ catalog: readCatalog({ categories: CATEGORIES, cards: [card('dr', 'Google Drive', 'documents')] })!, health: [] })
    expect(screen.getByText('Nenhuma ferramenta ligada ainda. Escolha uma abaixo.')).toBeTruthy()
    cleanup()
    const onRetry = vi.fn()
    mount({ state: 'error', catalog: undefined, onRetry })
    expect(screen.getByText('Não deu para carregar as ferramentas agora.')).toBeTruthy() // sem "eu" (Muse)
    const retry = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(retry.querySelector('svg')).toBeNull() // a seta é "ir para": o "Tentar de novo" não leva seta
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    cleanup()
    mount({ state: 'loading', catalog: undefined })
    expect(screen.getByText('Carregando as ferramentas…')).toBeTruthy()
  })
})

describe('a flag toolsCatalog: DESLIGADA por padrão, o app é o de hoje (decisão do Keel e da Muse, 12/11)', () => {
  afterEach(() => { setFlagDefaults(false); localStorage.clear(); vi.resetModules() })

  it('a flag nasce desligada com a chave persona.flag.toolsCatalog', () => {
    expect(FLAGS.toolsCatalog).toEqual({ key: 'persona.flag.toolsCatalog', defaultOn: false })
    expect(TOOLS_CATALOG_FLAG_KEY).toBe('persona.flag.toolsCatalog')
  })

  it('desligada (o padrão de produção): nem a aba em Configurações, nem o item do menu antigo, e a tela continua alcançável só por quem a liga', async () => {
    setFlagDefaults(undefined)
    vi.resetModules()
    const places = await import('../src/client/shell/nav-places.ts')
    const groups = await import('../src/client/shell/nav-groups.ts')
    setFlagDefaults(false)
    expect(places.NAV_PLACES.find(place => place.id === 'settings')!.tabs.map(tab => tab.panel)).not.toContain('tools')
    expect(places.placeOfPanel('tools')).toBeUndefined()
    expect(places.panelsReachableFromPlaces()).not.toContain('tools')
    expect(groups.NAV_GROUPS.flatMap(group => group.items.map(item => item.panel))).not.toContain('tools')
  })

  it('ligada (localStorage): Ferramentas é a aba logo depois de Conexões e entra no menu antigo', async () => {
    localStorage.setItem(TOOLS_CATALOG_FLAG_KEY, '1')
    vi.resetModules()
    const places = await import('../src/client/shell/nav-places.ts')
    const groups = await import('../src/client/shell/nav-groups.ts')
    const tabs = places.NAV_PLACES.find(place => place.id === 'settings')!.tabs.map(tab => tab.panel)
    expect(tabs.indexOf('tools')).toBe(tabs.indexOf('connections') + 1)
    expect(places.placeOfPanel('tools')?.id).toBe('settings')
    expect(groups.NAV_GROUPS.flatMap(group => group.items.map(item => item.panel))).toContain('tools')
  })
})

describe('onde a aba mora e a régua do CSS', () => {
  it('a faixa de testes (flag desligada): Configurações é a de hoje, sem "Ferramentas"', () => {
    const tabs = NAV_PLACES.find(place => place.id === 'settings')!.tabs.map(tab => tab.panel)
    expect(tabs).not.toContain('tools')
    expect(tabs.indexOf('cofre')).toBe(tabs.indexOf('connections') + 1)
  })
  it('o locale tem os textos da Muse', () => {
    expect(toolsPt.title).toBe('Ferramentas do seu negócio')
    expect(toolsPt['grid.empty']).toBe('Nada nesta categoria ainda.')
    expect(toolsPt['soon.chip']).toBe('Em breve')
  })
  const css = readFileSync(join(__dirname, '..', 'src', 'client', 'tools', 'Tools.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replaceAll('\r\n', '\n')
  it('a linha de Ligadas tem 64 px, a arte 40 e 64, a grade 260 px com 16 de vão, a frase 13 px', () => {
    expect(/\n\.linkedRow \{([^}]*)\}/u.exec(css)?.[1] ?? '').toMatch(/min-height:\s*64px/u)
    const rules = (name: string): string => [...css.matchAll(new RegExp(`(?:^|\\n)\\.${name} \\{([^}]*)\\}`, 'gu'))].map(found => found[1] ?? '').join('\n')
    expect(rules('artSmall')).toMatch(/width:\s*40px/u)
    expect(rules('artLarge')).toMatch(/width:\s*64px/u)
    expect(rules('artImgSmall')).toMatch(/width:\s*40px/u)
    expect(rules('artImgLarge')).toMatch(/width:\s*64px/u)
    expect(/\n\.grid \{([^}]*)\}/u.exec(css)?.[1] ?? '').toMatch(/minmax\(260px,\s*1fr\)/u)
    expect(/\n\.grid \{([^}]*)\}/u.exec(css)?.[1] ?? '').toMatch(/gap:\s*var\(--persona-space-4\)/u)
    expect(/\n\.cardSentence \{([^}]*)\}/u.exec(css)?.[1] ?? '').toMatch(/font-size:\s*13px/u)
  })
  it('nenhum movimento solto (só token) e o "Em breve" fica a 70 %', () => {
    expect(css).not.toMatch(/\b\d+ms\b/u)
    expect(css).toMatch(/\.cardSoon \.artLarge,\n\.cardSoon \.artImgLarge,\n\.cardSoon \.cardName,\n\.cardSoon \.cardSentence \{[^}]*opacity:\s*0\.7/u) // art, name and sentence at 70 %; the chip stays whole (contrast)
  })
})

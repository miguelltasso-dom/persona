// @vitest-environment jsdom
/**
 * Ember + Muse (12/11, app real, stills-claro/08-Memória-da-empresa.png): o cartão "Permissões ativas" da Memória › Visão geral tem ~300 px e cada permissão punha o rosto, o texto e
 * "Tirar permissão" LADO A LADO: o texto ficava numa coluna de ~80 px e quebrava uma palavra por linha ("Responder / no / WhatsApp"). A regra de empilhar era `@media (max-width: 720px)`, que olha a
 * JANELA e não o cartão. Desenho da Muse: abaixo de 420 px do CARTÃO empilha (1: rosto de 24 + a frase, até 2 linhas com o texto inteiro no title; 2: o selo e "Concedida por você" em 13 px muted;
 * 3: "Tirar permissão" à esquerda); acima disso o lado a lado de hoje. Ajustes dela: o Avatar mede 24 SEMPRE (nada de scale) e a frase é a MESMA nos dois layouts, texto real (nada de ::before).
 * Régua CSS (o jsdom não mede layout) + o que o DOM tem de dar ao CSS.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PermissionRow } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

const PKG = 'packages/persona/client-ui-persona'
const read = (path: string): string => readFileSync(resolve(process.cwd(), PKG, path), 'utf8').replace(/\r/gu, '')
const BRAIN_CSS = read('src/client/primitives/Brain.module.css')
const SECOND_BRAIN_CSS = read('src/client/second-brain/SecondBrain.module.css')

/** The text between the braces that open after `header` (balanced), or '' when the header is absent. */
function blockAfter(css: string, header: string): string {
  const start = css.indexOf(header)
  if (start < 0) return ''
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') { depth -= 1; if (depth === 0) return css.slice(open + 1, i) }
  }
  return ''
}

/** The declarations of the FIRST rule whose selector is exactly `selector` inside `css`. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css)?.[1] ?? ''
}

const SCOPE = { persona: 'Atlas', action: 'Responder no WhatsApp', target: 'clientes aprovados' }
const LABELS = { revoke: 'Tirar permissão', confirmRevoke: 'Tirar agora', cancel: 'Cancelar', revoked: 'Revogada' }
const SENTENCE = 'Atlas · Responder no WhatsApp: clientes aprovados'

describe('o cartão estreito empilha a permissão (container query, não a janela)', () => {
  const narrow = blockAfter(BRAIN_CSS, '@container (max-width: 420px)')

  it('o contêiner existe: o .permissionList do Segundo Cérebro declara container-type: inline-size, SEM nome (o nome seria localizado por arquivo e a query não casaria no bundle real)', () => {
    const list = rule(SECOND_BRAIN_CSS, '.permissionList')
    expect(list).toMatch(/container-type:\s*inline-size/u)
    expect(list).not.toMatch(/container(?:-name)?:\s*[a-z][\w-]*/u)
  })

  it('abaixo de 420 px do CARTÃO: rosto de 24 + frase na largura que sobra (a coluna do texto nunca fica em ~80 px)', () => {
    expect(narrow, 'a regra @container (max-width: 420px) existe').not.toBe('')
    expect(rule(narrow, '.permission')).toMatch(/grid-template-columns:\s*24px\s+minmax\(0,\s*1fr\)/u)
    expect(rule(narrow, '.permissionMain'), 'os filhos do bloco de texto viram itens da grade').toMatch(/display:\s*contents/u)
  })

  it('a frase tem até 2 linhas e depois reticências, na coluna 2, ao lado do rosto', () => {
    const title = rule(narrow, '.permissionTitle')
    expect(title).toMatch(/-webkit-line-clamp:\s*2/u)
    expect(title).toMatch(/overflow:\s*hidden/u)
    expect(title).toMatch(/grid-column:\s*2/u)
    expect(title).toMatch(/grid-row:\s*1/u)
  })

  it('o selo e "Concedida por você" ficam na largura toda, em 13 px muted; o botão vai para a linha de baixo, à esquerda', () => {
    const meta = rule(narrow, '.permissionMeta')
    expect(meta).toMatch(/grid-column:\s*1\s*\/\s*-1/u)
    expect(meta).toMatch(/font:\s*400\s+13px/u)
    expect(meta).toMatch(/color:\s*var\(--persona-ink-soft\)/u)
    const last = rule(narrow, '.permission > :last-child')
    expect(last).toMatch(/grid-column:\s*1\s*\/\s*-1/u)
    expect(last).toMatch(/justify-self:\s*start/u)
  })

  it('nunca uma palavra por linha, e nada de scale nem de conteúdo de CSS na frase (a Muse: texto real, caixa de layout de verdade)', () => {
    for (const selector of ['.permissionTitle', '.permissionScope', '.permissionMeta']) {
      expect(rule(BRAIN_CSS, selector), selector).not.toMatch(/word-break:\s*(?:break-all|break-word)|overflow-wrap:\s*anywhere/u)
      expect(rule(narrow, selector), `${selector} (estreito)`).not.toMatch(/word-break:\s*(?:break-all|break-word)|overflow-wrap:\s*anywhere/u)
    }
    expect(narrow).not.toMatch(/transform:\s*scale/u)
    expect(narrow).not.toMatch(/::before|::after|content:/u)
  })

  it('acima de 420 px o lado a lado de hoje segue valendo: a grade base continua com 3 colunas (rosto, texto, botão)', () => {
    expect(rule(BRAIN_CSS, '.permission')).toMatch(/grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/u)
  })

  it('a Visão geral põe as permissões DENTRO do contêiner (a lista é o .permissionList)', () => {
    const home = read('src/client/second-brain/SecondBrainHome.tsx')
    const list = home.indexOf('className={styles.permissionList}')
    expect(list).toBeGreaterThan(0)
    expect(home.indexOf('<PermissionRow', list)).toBeGreaterThan(list)
  })
})

/** WCAG relative luminance contrast of two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r = 0, g = 0, bl = 0] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi = 0, lo = 0] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('Ember 12:34: o link "Início" da tela de Permissões tem contraste AA no tema claro (axe color-contrast SERIOUS em 960 e 200%)', () => {
  const palette = read('src/client/theme/persona-palette.css')
  const hexOf = (token: string): string => new RegExp(`--persona-${token}:\\s*(#[0-9a-fA-F]{6})`, 'u').exec(palette)?.[1] ?? ''

  it('os links de texto do Segundo Cérebro usam o token de TEXTO do acento, não o acento de preenchimento (âmbar claro ~1,8:1 sobre o creme)', () => {
    const group = /(\.backLink,\s*\.contradictionLink,\s*\.typeRow,\s*\.pageRowButton)\s*\{([^}]*)\}/u.exec(SECOND_BRAIN_CSS)
    expect(group, 'o grupo .backLink existe').not.toBeNull()
    expect(group?.[2]).toMatch(/color:\s*var\(--persona-accent-text\)/u)
    expect(group?.[2]).not.toMatch(/color:\s*var\(--persona-accent\)/u)
  })

  it('o token de texto do acento (tema claro) passa de 4,5:1 sobre os três cremes em que a tela se apoia', () => {
    const light = /--persona-accent-text:\s*var\(--persona-([a-z0-9-]+)\)/u.exec(palette)?.[1] ?? ''
    expect(light).not.toBe('')
    const ink = hexOf(light)
    expect(ink).toMatch(/^#[0-9a-f]{6}$/iu)
    for (const surface of ['cream-50', 'cream-100', 'cream-200']) {
      expect(contrast(ink, hexOf(surface)), `${light} sobre ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
    // o acento de preenchimento NÃO serve para texto: é o motivo do achado
    expect(contrast(hexOf('amber-400'), hexOf('cream-100'))).toBeLessThan(3)
  })
})

describe('o que o DOM dá ao CSS', () => {
  it('a frase é UM texto real nos dois layouts ("Atlas · Responder no WhatsApp: clientes aprovados") e a frase inteira vai no title', () => {
    const { container } = render(<ul><PermissionRow scope={SCOPE} grantedBy="Concedida por você" validityText="Até você revogar" labels={LABELS} onRevoke={vi.fn()} /></ul>)
    const title = container.querySelector('[class*="permissionTitle"]')
    expect(title?.textContent).toBe(SENTENCE)
    expect(title?.getAttribute('title')).toBe(SENTENCE)
  })

  it('o rosto mede 24 sempre, num único Avatar (nada de segundo rosto, nada de 40)', () => {
    const { container } = render(<ul><PermissionRow scope={SCOPE} grantedBy="Concedida por você" validityText="Até você revogar" labels={LABELS} /></ul>)
    expect(container.querySelectorAll('[style*="width: 24px"]').length).toBe(1)
    expect(container.querySelectorAll('[style*="width: 40px"]').length).toBe(0)
  })

  it('sem alvo nem limite não há texto sobrando: a frase é só "persona · ação" e não há <p> vazio', () => {
    const { container } = render(<ul><PermissionRow scope={{ persona: 'Atlas', action: 'Responder no WhatsApp' }} grantedBy="Concedida por você" validityText="Até você revogar" labels={LABELS} /></ul>)
    const title = container.querySelector('[class*="permissionTitle"]')
    expect(title?.textContent).toBe('Atlas · Responder no WhatsApp')
    expect(title?.getAttribute('title')).toBe('Atlas · Responder no WhatsApp')
    expect(container.querySelectorAll('p').length).toBe(2) // a frase e a meta
  })

  it('o rosto, o bloco (frase + meta) e o botão são os 3 filhos da linha, nessa ordem, e o botão segue revogando em duas etapas', () => {
    const revoke = vi.fn()
    const { container } = render(<ul><PermissionRow scope={SCOPE} grantedBy="Concedida por você" validityText="Até você revogar" labels={LABELS} onRevoke={revoke} /></ul>)
    const row = container.querySelector('li')!
    expect(row.children.length).toBe(3)
    expect(row.children[1]?.className).toMatch(/permissionMain/u)
    expect(row.querySelector('[class*="permissionMeta"]')?.textContent).toContain('Concedida por você')
    expect(row.lastElementChild?.tagName).toBe('BUTTON')
    fireEvent.click(screen.getByRole('button', { name: 'Tirar permissão' }))
    expect(revoke).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Tirar agora' }))
    expect(revoke).toHaveBeenCalledTimes(1)
  })
})

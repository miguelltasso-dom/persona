// @vitest-environment jsdom
// Carbon, lote fio-d103-r2 (veredito AJUSTES, 2 itens; persona-spec/carbon/lotes/fio-d103-r2.md):
// (1) a 200% a frase "Téo ouviu Bia e Lia · 2 ajustes" nunca pode sumir (container query: abaixo de 560 px as marcas descem para a 2ª linha, alinhadas ao texto)
//     e a miniatura paisagem da pílula cobre os 36x36 (cover, sem faixas no escuro);
// (2) o diálogo do EFF-1 em janela curta (max-height 520px): menos margem no cabeçalho/rodapé do Modal, degradê de 20 px (Overlays.module.css é COMPARTILHADO: só dentro do @media).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OpinionBlock } from '../src/client/chat/opinion/OpinionBlock.tsx'
import { buildOpinionBlocks, type OpinionUi } from '../src/client/chat/opinion/opinion-model.ts'
import type { DraftFileUi } from '../src/client/chat/draft-files/draft-files-model.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { clearAttachmentImageCache } from '../src/client/remote/attachment-image.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'

installPreviewTheme()

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => { localStorage.clear(); clearAttachmentImageCache() })
afterEach(() => { cleanup(); localStorage.clear() })

const src = (...parts: string[]): string => readFileSync(join(__dirname, '..', 'src', 'client', ...parts), 'utf8').replace(/\r\n/gu, '\n').replace(/\/\*[\s\S]*?\*\//gu, '')
const rule = (css: string, selector: string): string => {
  const escaped = selector.replace(/[.[\]()*+?^$|\\]/gu, '\\$&')
  // junta TODAS as regras com esse seletor (o mesmo seletor pode aparecer num grupo `a, b { ... }` e sozinho)
  return [...css.matchAll(new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`, 'gu'))].map(m => m[1] ?? '').join('\n')
}
/** O corpo de um at-rule com chaves aninhadas (`@container (...)`, `@media (...)`): do `{` que abre até o `}` que casa. */
function atRule(css: string, header: RegExp): string {
  const match = header.exec(css)
  if (match === null) return ''
  let depth = 0
  for (let i = match.index + match[0].length - 1; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(match.index + match[0].length, i)
    }
  }
  return ''
}

const TEAM = { personas: [{ id: 'teo', name: 'Téo', avatarRef: 'bento' }] } as unknown as TeamView
const ui = (over: Partial<OpinionUi> = {}): OpinionUi => ({ kind: 'request', requestId: 'req-1', taskId: 'tk-1', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [], ...over })
const msg = (id: string, authorId: string, authorName: string, body: string, opinion: OpinionUi): ChannelMessageUi => ({ id, authorId, authorName, body, timeLabel: '10:00', reactions: [], opinion })
const ART: DraftFileUi = { path: 'arte/cartaz.svg', name: 'cartaz.svg', mime: 'image/svg+xml', taskId: 'tk-1', personaId: 'teo', type: 'image', thumb: 'data:image/png;base64,AAAA' }
const request = (over: Partial<OpinionUi> = {}) => msg('m-req', 'teo', 'Téo', 'Qual cartaz funciona melhor?', ui(over))
const reply = (id: string, authorId: string, authorName: string, mark: OpinionUi['mark']) => msg(id, authorId, authorName, `${authorName} opinou`, ui({ kind: 'reply', ...(mark === undefined ? {} : { mark }) }))
const fin = () => msg('m-fin', 'teo', 'Téo', 'Juntei os ajustes', ui({ kind: 'consolidated' }))
function block(rows: readonly ChannelMessageUi[]) {
  const model = buildOpinionBlocks(rows).get('req-1')
  if (model === undefined) throw new Error('sem bloco')
  return model
}
const pill = (): HTMLElement => document.querySelector('[data-persona-opinion-pill]') as HTMLElement

describe('(1) pílula recolhida a 200%: a frase nunca some e a miniatura não deixa faixas', () => {
  const css = src('chat', 'opinion', 'OpinionBlock.module.css')
  const thumb = src('chat', 'draft-files', 'DraftFileThumb.module.css')

  it('a pílula está dentro de um wrapper que é o CONTAINER (container-type: inline-size)', () => {
    render(<OpinionBlock t={t as never} block={block([request({ files: [ART] }), reply('r1', 'bia', 'Bia', 'suggestion'), reply('r2', 'lia', 'Lia', 'attention'), fin()])} team={TEAM} />)
    const box = pill().parentElement as HTMLElement
    expect(box.className).toMatch(/pillBox/u)
    expect(rule(css, '.pillBox')).toMatch(/container-type:\s*inline-size/u)
    // dentro do wrapper só a pílula: o resto do cartão (a legenda) fica fora do container
    expect(box.children).toHaveLength(1)
  })

  it('abaixo de 560 px: as marcas descem para a 2ª linha alinhadas ao texto e a frase quebra (nunca 0 px)', () => {
    const narrow = atRule(css, /@container\s*\(max-width:\s*559px\)\s*\{/u)
    expect(narrow).not.toBe('')
    expect(rule(narrow, '.pill')).toMatch(/flex-wrap:\s*wrap/u)
    const text = rule(narrow, '.pillText')
    expect(text).toMatch(/min-width:\s*14ch/u)
    expect(text).toMatch(/white-space:\s*normal/u)
    expect(text).toMatch(/flex:\s*1 1 14ch/u)
    const marks = rule(narrow, '.pillMarks')
    expect(marks).toMatch(/flex:\s*1 0 100%/u)
    expect(marks).toMatch(/order:\s*2/u)
    // border-box: o `flex-basis: 100%` + o recuo de 48 px em content-box estouravam a linha (rolagem lateral de 3 px a 200%, achada na recaptura)
    expect(marks).toMatch(/box-sizing:\s*border-box/u)
    expect(rule(narrow, '.pillChevron')).toMatch(/order:\s*1/u)
    // alinhadas ao texto: o recuo é a miniatura (36 px) + o vão; sem miniatura não há recuo
    expect(rule(narrow, '.pillWithThumb .pillMarks')).toMatch(/padding-inline-start:\s*calc\(36px\s*\+\s*var\(--persona-space-3\)\)/u)
  })

  it('a classe do recuo só existe quando a pílula tem miniatura', () => {
    const withArt = render(<OpinionBlock t={t as never} block={block([request({ files: [ART] }), reply('r1', 'bia', 'Bia', 'suggestion'), fin()])} team={TEAM} />)
    expect(pill().className).toMatch(/pillWithThumb/u)
    withArt.unmount()
    render(<OpinionBlock t={t as never} block={block([request(), reply('r1', 'bia', 'Bia', 'suggestion'), fin()])} team={TEAM} />)
    expect(pill().className).not.toMatch(/pillWithThumb/u)
  })

  it('a frase e as marcas continuam todas no DOM (só a disposição muda)', () => {
    render(<OpinionBlock t={t as never} block={block([request({ files: [ART] }), reply('r1', 'bia', 'Bia', 'suggestion'), reply('r2', 'lia', 'Lia', 'attention'), fin()])} team={TEAM} />)
    expect(pill().textContent).toContain('Téo ouviu Bia e Lia · 2 ajustes')
    expect(pill().textContent).toContain('1 Sugestão')
    expect(pill().textContent).toContain('1 Ponto de atenção')
  })

  it('a miniatura paisagem cobre os 36x36 (cover): sem faixas em cima e embaixo no escuro', () => {
    expect(rule(thumb, '.pill .image')).toMatch(/object-fit:\s*cover/u)
    expect(rule(thumb, '.pill .image')).not.toMatch(/object-fit:\s*contain/u)
    // as outras variantes seguem sem corte: o chip da linha do fio e as miniaturas grandes
    expect(rule(thumb, '.chip .image')).toMatch(/object-fit:\s*contain/u)
  })
})

describe('(2) diálogo em janela curta (200%): o corpo ganha altura', () => {
  const css = src('primitives', 'Overlays.module.css')
  const short = atRule(css, /@media\s*\(max-height:\s*520px\)\s*\{/u)

  it('dentro do @media (max-height: 520px): margem de 8 px no corpo e no rodapé, respiro do rodapé de 12 px e degradê de 20 px', () => {
    expect(short).not.toBe('')
    expect(rule(short, '.modalBody,\n  .modalFooter')).toMatch(/margin-top:\s*var\(--persona-space-2\)/u)
    expect(rule(short, '.modalFooter')).toMatch(/padding-top:\s*var\(--persona-space-3\)/u)
    const mask = rule(short, '.modalBody[data-more]')
    expect(mask).toMatch(/mask-image:\s*linear-gradient\(to bottom,\s*black calc\(100% - 20px\),\s*transparent\)/u)
    expect(mask).toMatch(/-webkit-mask-image:\s*linear-gradient\(to bottom,\s*black calc\(100% - 20px\),\s*transparent\)/u)
  })

  it('FORA do @media nada mudou (arquivo compartilhado): margens de 24 px, rodapé de 16 px e degradê de 40 px', () => {
    const outside = css.replace(short, '')
    expect(rule(outside, '.modalBody')).toMatch(/margin-top:\s*var\(--persona-space-6\)/u)
    const footer = rule(outside, '.modalFooter')
    expect(footer).toMatch(/margin-top:\s*var\(--persona-space-6\)/u)
    expect(footer).toMatch(/padding:\s*var\(--persona-space-4\)\s+var\(--persona-space-8\)\s+0/u)
    expect(rule(outside, '.modalBody[data-more]')).toMatch(/black calc\(100% - 40px\)/u)
  })
})

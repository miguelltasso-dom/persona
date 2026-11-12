// @vitest-environment jsdom
// DESIGN-01 (Muse, 11/11) "Fio real" (a) e (b): a opinião consolidada recolhe numa pílula de 48 px "Téo ouviu Bia e Lia · 2 ajustes" que
// reabre com 1 clique; a imagem de REFERÊNCIA (o que a pessoa anexou) aparece pequena (96 px) atrás de um chip com o ícone `attach` (sem emoji)
// e a ARTE da persona fica grande (até 320 px). "Um fato tipado nunca some": o que a pílula esconde está a 1 clique (respostas, versão
// Antes · Depois, a frase da consolidação), e o teto de rodadas continua à vista.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
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

const TEAM = { personas: [{ id: 'teo', name: 'Téo', avatarRef: 'bento' }] } as unknown as TeamView
const ui = (over: Partial<OpinionUi> = {}): OpinionUi => ({ kind: 'request', requestId: 'req-1', taskId: 'tk-1', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [], ...over })
const msg = (id: string, authorId: string, authorName: string, body: string, opinion: OpinionUi): ChannelMessageUi => ({ id, authorId, authorName, body, timeLabel: '10:00', reactions: [], opinion })
const ART: DraftFileUi = { path: 'arte/cartaz.svg', name: 'cartaz.svg', mime: 'image/svg+xml', taskId: 'tk-1', personaId: 'teo', type: 'image', thumb: 'data:image/png;base64,AAAA' }
const request = (over: Partial<OpinionUi> = {}) => msg('m-req', 'teo', 'Téo', 'Qual cartaz funciona melhor?', ui(over))
const reply = (id: string, authorId: string, authorName: string, mark: OpinionUi['mark']) => msg(id, authorId, authorName, `${authorName} opinou`, ui({ kind: 'reply', ...(mark === undefined ? {} : { mark }) }))
const fin = (over: Partial<OpinionUi> = {}) => msg('m-fin', 'teo', 'Téo', 'Juntei os ajustes', ui({ kind: 'consolidated', ...over }))

function block(rows: readonly ChannelMessageUi[]) {
  const model = buildOpinionBlocks(rows).get('req-1')
  if (model === undefined) throw new Error('sem bloco')
  return model
}
const card = (): HTMLElement => document.querySelector('[data-persona-opinion]') as HTMLElement
const pill = (): HTMLElement | null => document.querySelector('[data-persona-opinion-pill]')
const css = (name: string): string => readFileSync(join(__dirname, '..', 'src', 'client', 'chat', name), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')

describe('(a) a opinião consolidada recolhe numa pílula de 48 px', () => {
  const rows = [request({ files: [ART] }), reply('r1', 'bia', 'Bia', 'suggestion'), reply('r2', 'lia', 'Lia', 'attention'), fin()]

  it('mostra UMA linha: "Téo ouviu Bia e Lia · 2 ajustes", com a miniatura da arte, e nada das respostas', () => {
    render(<OpinionBlock t={t as never} block={block(rows)} team={TEAM} />)
    expect(card().getAttribute('data-collapsed')).toBe('')
    const button = pill()
    expect(button).not.toBeNull()
    expect(button?.textContent).toContain('Téo ouviu Bia e Lia · 2 ajustes')
    expect(button?.getAttribute('aria-expanded')).toBe('false')
    expect(button?.querySelector('[data-draft-file]')).not.toBeNull()
    expect(card().textContent).not.toContain('Bia opinou')
    expect(card().textContent).not.toContain('Qual cartaz funciona melhor?')
  })

  it('reabre com 1 clique: as respostas, a pergunta e a frase da consolidação voltam; um clique recolhe de novo', () => {
    render(<OpinionBlock t={t as never} block={block(rows)} team={TEAM} />)
    fireEvent.click(pill() as HTMLElement)
    expect(card().getAttribute('data-collapsed')).toBeNull()
    expect(card().textContent).toContain('Bia opinou')
    expect(card().textContent).toContain('Lia opinou')
    expect(card().textContent).toContain('Qual cartaz funciona melhor?')
    expect(card().textContent).toContain('Téo juntou as opiniões: Juntei os ajustes')
    fireEvent.click(within(card()).getByRole('button', { name: 'Ocultar respostas' }))
    expect(pill()).not.toBeNull()
  })

  it('o singular e os nomes: 1 ajuste; 1 pessoa; 3 pessoas viram "A, B e mais 1"; sem ajuste, sem o trecho', () => {
    const one = render(<OpinionBlock t={t as never} block={block([request(), reply('r1', 'bia', 'Bia', 'suggestion'), reply('r2', 'lia', 'Lia', 'liked'), fin()])} team={TEAM} />)
    expect(pill()?.textContent).toContain('Téo ouviu Bia e Lia · 1 ajuste')
    expect(pill()?.textContent).not.toContain('1 ajustes')
    one.unmount()
    const solo = render(<OpinionBlock t={t as never} block={block([request(), reply('r1', 'bia', 'Bia', 'liked'), fin()])} team={TEAM} />)
    expect(pill()?.textContent).toContain('Téo ouviu Bia')
    expect(pill()?.textContent).not.toContain('ajuste')
    solo.unmount()
    render(<OpinionBlock t={t as never} block={block([request(), reply('r1', 'bia', 'Bia', 'liked'), reply('r2', 'lia', 'Lia', 'liked'), reply('r3', 'nina', 'Nina', 'liked'), fin()])} team={TEAM} />)
    expect(pill()?.textContent).toContain('Téo ouviu Bia, Lia e mais 1')
  })

  it('sem ninguém que tenha opinado, a pílula diz só que juntou as opiniões (nunca inventa nomes)', () => {
    render(<OpinionBlock t={t as never} block={block([request(), fin()])} team={TEAM} />)
    expect(pill()?.textContent).toContain('Téo juntou as opiniões')
    expect(pill()?.textContent).not.toContain('ouviu')
  })

  it('um fato tipado nunca some: os chips das marcas ficam na pílula e o teto de rodadas segue à vista', () => {
    render(<OpinionBlock t={t as never} block={block([request({ capReached: true }), reply('r1', 'bia', 'Bia', 'suggestion'), fin()])} team={TEAM} />)
    expect(pill()?.textContent).toContain('1 Sugestão')
    expect(card().textContent).toContain('Téo já usou as 2 rodadas de opinião desta tarefa e segue com o que tem.')
  })

  it('a pílula é um botão de 48 px e o recolher/abrir anima só com os tokens do movimento (sem valor solto)', () => {
    const style = css('opinion/OpinionBlock.module.css')
    const rule = /\.pill\s*\{([^}]*)\}/u.exec(style)?.[1] ?? ''
    expect(rule).toMatch(/min-height:\s*48px/u)
    expect(rule).toMatch(/var\(--motion-(?:fast|base)\)/u)
    expect(rule).toMatch(/var\(--ease-standard\)/u)
    expect(rule).not.toMatch(/\d+ms/u)
  })
})

describe('(b) a imagem de referência é pequena e a arte da persona é a protagonista', () => {
  const rows = [request({ files: [ART], imageIds: ['att-1'], alt: 'Foto antiga' })]
  const resolveImage = () => Promise.resolve('data:image/png;base64,AAAA')

  it('com arte: a arte aparece grande (classe "hero") e a foto do pedido fica atrás do chip "Referência do pedido" com o ícone attach (sem emoji)', () => {
    render(<OpinionBlock t={t as never} block={block(rows)} team={TEAM} resolveImage={resolveImage} />)
    expect(card().querySelector('[data-persona-opinion-art] [data-draft-file][class*="hero"]')).not.toBeNull()
    const chip = card().querySelector('[data-persona-opinion-reference] button') as HTMLElement
    expect(chip.textContent).toContain('Referência do pedido')
    expect(chip.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(chip.querySelector('svg')).not.toBeNull()
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    // a foto NÃO está inline enquanto o chip está fechado
    expect(card().querySelector('img[class*="thumb"]')).toBeNull()
  })

  it('o chip abre a foto em miniatura de 96 px (classe própria) e fecha de novo', async () => {
    render(<OpinionBlock t={t as never} block={block(rows)} team={TEAM} resolveImage={resolveImage} />)
    const chip = card().querySelector('[data-persona-opinion-reference] button') as HTMLElement
    fireEvent.click(chip)
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => { expect(card().querySelector('img[class*="thumbReference"]')).not.toBeNull() })
    fireEvent.click(chip)
    expect(card().querySelector('img[class*="thumbReference"]')).toBeNull()
  })

  it('sem arte, o que a pessoa anexou é o assunto: continua inline, em tamanho normal (nada some)', async () => {
    render(<OpinionBlock t={t as never} block={block([request({ imageIds: ['att-1'], alt: 'Capa azul' })])} team={TEAM} resolveImage={resolveImage} />)
    expect(card().querySelector('[data-persona-opinion-reference]')).toBeNull()
    await waitFor(() => { expect(card().querySelector('img[class*="thumb"]')).not.toBeNull() })
    expect((card().querySelector('img[class*="thumb"]') as HTMLImageElement).className).not.toContain('thumbReference')
  })

  it('os tamanhos: referência 96 px; arte hero até 320 px; pílula 36 px', () => {
    const opinion = css('opinion/OpinionBlock.module.css')
    expect(/\.thumbReference\s*\{([^}]*)\}/u.exec(opinion)?.[1] ?? '').toMatch(/max-width:\s*96px[\s\S]*max-height:\s*96px|max-height:\s*96px[\s\S]*max-width:\s*96px/u)
    const thumb = css('draft-files/DraftFileThumb.module.css')
    expect(thumb).toMatch(/\.hero\s*\{[^}]*(?:^|[\s;])width:\s*320px/u)
    expect(thumb).toMatch(/\.hero\[data-thumb='vector'\] \.image\s*\{[^}]*max-height:\s*320px/u)
    expect(thumb).toMatch(/\.pill\s*\{[^}]*width:\s*36px[^}]*height:\s*36px/u)
  })
})

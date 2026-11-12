// @vitest-environment jsdom
// DESIGN-01 (Muse, 11/11) "Fio real" (d): o DeliveryCard traz a miniatura de 240 px da ARTE FINAL e o botão "Revisar e aplicar".
// A arte vem dos arquivos que o fio já tem (as linhas "salvou … no rascunho" e o rascunho da opinião) das Tarefas da entrega: nada novo do host.
// Um fato tipado nunca some: sem arte o cartão é o de sempre; o selo, as partes e a linha de revisão que não rodou continuam.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeliveryCard } from '../src/client/chat/DeliveryCard.tsx'
import { deliveryArt } from '../src/client/chat/delivery-art.ts'
import type { DraftFileUi } from '../src/client/chat/draft-files/draft-files-model.ts'
import type { ChannelMessageUi, DeliveryCardUi } from '../src/client/remote/map-host-ui.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const file = (over: Partial<DraftFileUi> = {}): DraftFileUi => ({ path: 'arte/cartaz.svg', name: 'cartaz.svg', mime: 'image/svg+xml', taskId: 't-2', personaId: 'p-teo', type: 'image', thumb: 'data:image/png;base64,AAAA', ...over })
const DELIVERY: DeliveryCardUi = {
  requestId: 'req-1',
  title: 'Campanha de lançamento',
  parts: [{ taskId: 't-1', title: 'Texto', personaName: 'Bia' }, { taskId: 't-2', title: 'Arte', personaName: 'Téo' }],
  approvalId: 'approval-77',
}
const row = (id: string, extra: Partial<ChannelMessageUi> = {}): ChannelMessageUi => ({ id, authorId: 'p-teo', authorName: 'Téo', body: '', timeLabel: '10:00', reactions: [], ...extra })
const saved = (id: string, ...files: DraftFileUi[]): ChannelMessageUi => row(id, { filesSaved: { files } })
const css = (name: string): string => readFileSync(join(__dirname, '..', 'src', 'client', 'chat', name), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '')

describe('DeliveryCard: miniatura da arte final + "Revisar e aplicar" (Fio real d)', () => {
  it('com a arte: a miniatura aparece no cartão, sem emoji, com o nome do arquivo para o leitor de tela', () => {
    const { container } = render(<DeliveryCard t={t} delivery={DELIVERY} art={file()} onOpenApproval={vi.fn()} />)
    const art = container.querySelector('[data-delivery-art]') as HTMLElement
    expect(art).not.toBeNull()
    expect(art.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(art.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('o botão agora diz o que faz: "Revisar e aplicar" (e abre a entrega em Aprovações)', () => {
    const onOpenApproval = vi.fn()
    render(<DeliveryCard t={t} delivery={DELIVERY} art={file()} onOpenApproval={onOpenApproval} />)
    fireEvent.click(screen.getByRole('button', { name: 'Revisar e aplicar' }))
    expect(onOpenApproval).toHaveBeenCalledWith('approval-77')
    expect(screen.queryByRole('button', { name: 'Revisar' })).toBeNull()
  })

  it('clicar na miniatura abre a MESMA entrega (um destino só)', () => {
    const onOpenApproval = vi.fn()
    const { container } = render(<DeliveryCard t={t} delivery={DELIVERY} art={file()} onOpenApproval={onOpenApproval} />)
    fireEvent.click(container.querySelector('[data-delivery-art] button') as HTMLElement)
    expect(onOpenApproval).toHaveBeenCalledWith('approval-77')
  })

  it('sem destino (sem approvalId) a miniatura é só a figura: nada de botão morto', () => {
    const { container } = render(<DeliveryCard t={t} delivery={{ ...DELIVERY, approvalId: undefined as never }} art={file()} onOpenApproval={vi.fn()} />)
    expect(container.querySelector('[data-delivery-art]')).not.toBeNull()
    expect(container.querySelector('[data-delivery-art] button')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revisar e aplicar' })).toBeNull()
  })

  it('sem arte, o cartão é o de sempre (as partes e o botão ficam)', () => {
    const { container } = render(<DeliveryCard t={t} delivery={DELIVERY} onOpenApproval={vi.fn()} />)
    expect(container.querySelector('[data-delivery-art]')).toBeNull()
    expect(screen.getByText('Texto (Bia)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revisar e aplicar' })).toBeTruthy()
  })

  it('a miniatura tem 240 px (e nunca estoura a coluna)', () => {
    const thumb = css('draft-files/DraftFileThumb.module.css')
    expect(thumb).toMatch(/\.delivery\s*\{[^}]*width:\s*min\(240px,\s*100%\)/u)
    expect(thumb).toMatch(/\.delivery\[data-thumb='vector'\] \.image\s*\{[^}]*max-height:\s*240px/u)
  })
})

describe('deliveryArt: a arte final vem dos arquivos que o fio já tem', () => {
  it('pega o arquivo de imagem MAIS NOVO das Tarefas da entrega (o último do fio)', () => {
    const older = file({ path: 'arte/v1.svg', name: 'v1.svg', thumb: 'data:image/png;base64,OLD' })
    const newer = file({ path: 'arte/v2.svg', name: 'v2.svg', thumb: 'data:image/png;base64,NEW' })
    expect(deliveryArt([saved('a', older), saved('b', newer)], DELIVERY)?.name).toBe('v2.svg')
  })

  it('ignora o que não é da entrega, o que não é imagem e o que não tem miniatura', () => {
    const { thumb: _semMiniatura, ...withoutThumb } = file({ name: 'sem-miniatura.svg' })
    const rows = [
      saved('a', file({ taskId: 't-OUTRA', name: 'alheia.svg' })),
      saved('b', file({ type: 'text', name: 'texto.md', mime: 'text/markdown' })),
      saved('c', withoutThumb),
    ]
    expect(deliveryArt(rows, DELIVERY)).toBeUndefined()
  })

  it('também enxerga a arte do rascunho em opinião e junta o .svg com o .png irmão em UM item', () => {
    const svg = file({ path: 'arte/cartaz.svg', pngPath: 'arte/cartaz.png' })
    const png = file({ path: 'arte/cartaz.png', name: 'cartaz.png', mime: 'image/png' })
    const opinion = row('o', { opinion: { kind: 'request', requestId: 'r', taskId: 't-2', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [], files: [svg, png] } })
    expect(deliveryArt([opinion], DELIVERY)?.path).toBe('arte/cartaz.svg')
  })

  it('sem arquivos no fio: nada (o cartão não inventa imagem)', () => {
    expect(deliveryArt([row('x')], DELIVERY)).toBeUndefined()
    expect(deliveryArt([], DELIVERY)).toBeUndefined()
  })
})

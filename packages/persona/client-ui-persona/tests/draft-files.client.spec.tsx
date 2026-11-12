// @vitest-environment jsdom
// EQUIPE-REAL-SPEC §(e) (Muse 07/11 15:25; contrato do Forge 15:47 e do Bolt 15:44): os ARQUIVOS que a persona gravou no rascunho. Prova: o mapa do fio é cuidadoso (item inválido some, a miniatura passa
// pela porta única das imagens do Revisar), "{name} salvou {file} no rascunho" UMA por turno, vários = "{count} arquivos" + até 3 miniaturas + "+n" (singular no 1), a imagem é `<img src>` e nunca inline,
// o clique abre o Revisar naquele arquivo, a linha QUEBRA o grupo e só existe com a flag do time; no cartão de opinião a arte aparece (UMA miniatura por arte: o .svg e o .png irmão viram um item só).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { breaksGroup } from '../src/client/chat/group-breakers.ts'
import { DraftFilesLine, draftFilesSentence } from '../src/client/chat/draft-files/DraftFilesLine.tsx'
import { groupArt, mapDraftFiles } from '../src/client/chat/draft-files/draft-files-model.ts'
import { OpinionBlock } from '../src/client/chat/opinion/OpinionBlock.tsx'
import { buildOpinionBlocks, mapOpinion, type OpinionUi } from '../src/client/chat/opinion/opinion-model.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { mapMessage, type ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => { localStorage.clear(); localStorage.setItem('persona.hint.whoResponds', '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const TEAM = { members: [], personas: [
  { id: 'persona-teo', name: 'Teo', avatarRef: 'teo' },
  { id: 'persona-nina', name: 'Nina', avatarRef: 'nina' },
] } as unknown as TeamView

/** Um PNG de 1×1 px: o `thumb` do host é um `data:image/png;base64,…` pequeno. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const wireFile = (path: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  path, name: path.split('/').pop(), mime: path.endsWith('.png') ? 'image/png' : 'image/svg+xml', taskId: 'tk-1', personaId: 'persona-teo', ...over,
})
const files = (...paths: string[]) => mapDraftFiles(paths.map(path => wireFile(path, { thumb: PNG })))

describe('mapDraftFiles (o fio do host, com cuidado)', () => {
  it('item inválido, sem caminho ou repetido some; o nome cai no último trecho do caminho; a ordem do host fica', () => {
    const mapped = mapDraftFiles([
      wireFile('arte/cartaz.svg'),
      null,
      'texto solto',
      { name: 'sem-caminho.svg' },
      wireFile('arte/cartaz.svg', { name: 'repetido' }),
      { path: 'docs/proposta.pdf', mime: 'application/pdf', taskId: 'tk-2', personaId: 'persona-nina' },
    ])
    expect(mapped.map(file => file.path)).toEqual(['arte/cartaz.svg', 'docs/proposta.pdf'])
    expect(mapped[1]).toMatchObject({ name: 'proposta.pdf', type: 'pdf', taskId: 'tk-2', personaId: 'persona-nina' })
    expect(mapped[0]).toMatchObject({ name: 'cartaz.svg', type: 'image' })
    expect(mapDraftFiles(undefined)).toEqual([])
    expect(mapDraftFiles({ path: 'x' })).toEqual([])
  })

  it('a miniatura passa pela porta única do Revisar: PNG em data: entra; URL de fora, javascript: e HTML em data: nunca chegam', () => {
    const [ok, remote, script, html, big] = mapDraftFiles([
      wireFile('a.svg', { thumb: PNG }),
      wireFile('b.svg', { thumb: 'https://exemplo.com/a.png' }),
      wireFile('c.svg', { thumb: 'javascript:alert(1)' }),
      wireFile('d.svg', { thumb: 'data:text/html;base64,PGgxPm9pPC9oMT4=' }),
      wireFile('e.svg', { thumb: `data:image/png;base64,${'A'.repeat(300_000)}` }),
    ])
    expect(ok?.thumb).toBe(PNG)
    expect(remote?.thumb).toBeUndefined()
    expect(script?.thumb).toBeUndefined()
    expect(html?.thumb).toBeUndefined()
    expect(big?.thumb).toBeUndefined()
  })
})

describe('groupArt (UMA miniatura por arte)', () => {
  it('o .svg e o .png irmão (pelo pngPath) viram UM item: o .svg, com a miniatura do png quando ele não tem a sua', () => {
    const list = mapDraftFiles([wireFile('arte/cartaz.svg', { pngPath: 'arte/cartaz.png' }), wireFile('arte/cartaz.png', { thumb: PNG })])
    const grouped = groupArt(list)
    expect(grouped.map(file => file.path)).toEqual(['arte/cartaz.svg'])
    expect(grouped[0]?.thumb).toBe(PNG)
  })

  it('sem pngPath o irmão é o de mesmo nome sem a extensão; artes de nomes diferentes ficam as duas', () => {
    expect(groupArt(files('a/logo.svg', 'a/logo.png')).map(file => file.path)).toEqual(['a/logo.svg'])
    expect(groupArt(files('a/logo.svg', 'a/capa.png')).map(file => file.path)).toEqual(['a/logo.svg', 'a/capa.png'])
    expect(groupArt(files('a/foto.png', 'b/foto.jpg')).map(file => file.path)).toEqual(['a/foto.png', 'b/foto.jpg'])
  })
})

describe('MessageView.filesSaved → a mensagem da tela', () => {
  const event = (extra: Record<string, unknown>): MessageView => ({
    ...hostMessage({ id: 'm-files', seq: 5, actorId: 'persona-teo', body: 'Teo salvou cartaz.svg no rascunho', subjectId: '', occurredAt: '2026-11-07T13:00:00.000Z' }),
    ...extra,
  } as MessageView)

  it('vira `filesSaved` e a mensagem QUEBRA o grupo de balões', () => {
    const message = mapMessage(event({ filesSaved: { files: [wireFile('cartaz.svg', { thumb: PNG })] } }), TEAM, 'owner')
    expect(message.filesSaved?.files).toHaveLength(1)
    expect(message.filesSaved?.files[0]).toMatchObject({ path: 'cartaz.svg', thumb: PNG, taskId: 'tk-1' })
    expect(breaksGroup(message)).toBe(true)
  })

  it('sem arquivo válido o campo não existe e a mensagem é comum (não quebra o grupo)', () => {
    const none = mapMessage(event({ filesSaved: { files: [{ name: 'sem-caminho' }] } }), TEAM, 'owner')
    expect(none.filesSaved).toBeUndefined()
    expect(breaksGroup(none)).toBe(false)
    expect(mapMessage(event({}), TEAM, 'owner').filesSaved).toBeUndefined()
  })
})

describe('DraftFilesLine (a linha tipada no fio)', () => {
  const line = (list: ReturnType<typeof files>, props: Partial<Parameters<typeof DraftFilesLine>[0]> = {}) => (
    <ol><DraftFilesLine t={t as never} files={list} personaName="Teo" timeLabel="10:05" {...props} /></ol>
  )
  const row = () => document.querySelector('[data-draft-files-line]') as HTMLElement

  it('um arquivo: "Teo salvou cartaz.svg no rascunho", a miniatura é <img src> do thumb (nunca inline) e o clique abre o Revisar naquele arquivo', () => {
    const onOpen = vi.fn()
    render(line(files('arte/cartaz.svg'), { onOpenDraftFile: onOpen }))
    expect(row().getAttribute('data-draft-files-line')).toBe('one')
    expect(row().textContent).toContain('Teo salvou cartaz.svg no rascunho')
    expect(row().textContent).toContain('10:05')
    const thumb = within(row()).getByRole('button', { name: 'Abrir cartaz.svg em Revisar mudanças' })
    expect(thumb.querySelector('img')?.getAttribute('src')).toBe(PNG)
    expect(row().querySelectorAll('svg')).toHaveLength(0)
    fireEvent.click(thumb)
    expect(onOpen).toHaveBeenCalledWith({ taskId: 'tk-1', path: 'arte/cartaz.svg' })
  })

  it('a frase também é alvo do clique (abre o primeiro arquivo) e é lida inteira', () => {
    const onOpen = vi.fn()
    render(line(files('a/um.svg', 'a/dois.svg'), { onOpenDraftFile: onOpen }))
    fireEvent.click(within(row()).getByRole('button', { name: 'Teo salvou 2 arquivos no rascunho' }))
    expect(onOpen).toHaveBeenCalledWith({ taskId: 'tk-1', path: 'a/um.svg' })
  })

  it('vários: "{count} arquivos", até 3 miniaturas e "+{n} arquivos"; com 4, o singular "+1 arquivo"', () => {
    const { unmount } = render(line(files('a/1.svg', 'a/2.svg', 'a/3.svg', 'a/4.png', 'a/5.png'), { onOpenDraftFile: vi.fn() }))
    expect(row().getAttribute('data-draft-files-line')).toBe('many')
    expect(row().textContent).toContain('Teo salvou 5 arquivos no rascunho')
    expect(within(row()).getAllByRole('button', { name: /^Abrir / })).toHaveLength(3)
    expect(within(row()).getByText('+2 arquivos')).toBeTruthy()
    unmount()
    render(line(files('a/1.svg', 'a/2.svg', 'a/3.svg', 'a/4.png'), { onOpenDraftFile: vi.fn() }))
    expect(within(row()).getByText('+1 arquivo')).toBeTruthy()
    expect(within(row()).queryByText('+1 arquivos')).toBeNull()
  })

  it('sem o destino do clique não há botão morto: só as figuras, com o nome', () => {
    render(line(files('a/1.svg', 'a/2.svg')))
    expect(within(row()).queryAllByRole('button')).toHaveLength(0)
    expect(within(row()).getByRole('img', { name: 'a/1.svg'.split('/')[1] as string })).toBeTruthy()
  })

  it('sem miniatura (não é imagem, ou o host não conseguiu): o ícone do tipo, sem <img>, e o nome no rótulo; `thumb` hostil nunca chega à tela', () => {
    const list = mapDraftFiles([wireFile('docs/proposta.pdf', { mime: 'application/pdf' }), wireFile('arte/x.svg', { thumb: 'javascript:alert(1)' })])
    render(line(list, { onOpenDraftFile: vi.fn() }))
    const pdf = within(row()).getByRole('button', { name: 'Abrir proposta.pdf em Revisar mudanças' })
    expect(pdf.querySelector('img')).toBeNull()
    expect(pdf.querySelector('svg')).not.toBeNull()
    expect(row().innerHTML).not.toContain('javascript:')
    expect(row().querySelectorAll('img[src]:not([src^="data:image/"])')).toHaveLength(0)
  })

  it('sem arquivos não desenha nada; a frase de um só ou de vários vem da Muse', () => {
    render(line([]))
    expect(document.querySelector('[data-draft-files-line]')).toBeNull()
    expect(draftFilesSentence(t as never, 'Teo', files('a/cartaz.svg'))).toBe('Teo salvou cartaz.svg no rascunho')
    expect(draftFilesSentence(t as never, 'Teo', files('a/1.svg', 'a/2.png', 'a/3.png'))).toBe('Teo salvou 3 arquivos no rascunho')
    expect(draftFilesSentence(t as never, 'Teo', [])).toBeUndefined()
  })
})

describe('no fio (GeneralChannelView)', () => {
  const plain: ChannelMessageUi = { id: 'm0', authorId: 'persona-teo', authorName: 'Teo', body: 'Fiz o cartaz.', timeLabel: '10:00', reactions: [] }
  const saved: ChannelMessageUi = {
    id: 'm1', authorId: 'persona-teo', authorName: 'Teo', body: 'Teo salvou cartaz.svg no rascunho', timeLabel: '10:01', reactions: [],
    filesSaved: { files: files('arte/cartaz.svg') },
  }
  const after: ChannelMessageUi = { id: 'm2', authorId: 'persona-teo', authorName: 'Teo', body: 'Pode olhar quando puder.', timeLabel: '10:02', reactions: [] }
  const view = (props: Record<string, unknown> = {}) => (
    <GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={[]} messages={[plain, saved, after]} team={TEAM} {...props} />
  )

  it('sem a flag do time a frase simples do host aparece como mensagem comum (nada de linha tipada)', () => {
    render(view())
    expect(document.querySelector('[data-draft-files-line]')).toBeNull()
    expect(screen.getByText('Teo salvou cartaz.svg no rascunho')).toBeTruthy()
  })

  it('com a flag: a linha tipada no lugar da mensagem; o clique abre a Tarefa do arquivo na placa (o ticket do Revisar)', () => {
    localStorage.setItem('persona.flag.teamwork', '1')
    const onOpenTaskOnBoard = vi.fn()
    render(view({ onOpenTaskOnBoard }))
    const rowEl = document.querySelector('[data-draft-files-line]') as HTMLElement
    expect(rowEl).not.toBeNull()
    expect(rowEl.tagName).toBe('LI')
    expect(screen.queryByText('Teo salvou cartaz.svg no rascunho', { selector: 'p:not([class*="text"])' })).toBeNull()
    fireEvent.click(within(rowEl).getByRole('button', { name: 'Abrir cartaz.svg em Revisar mudanças' }))
    expect(onOpenTaskOnBoard).toHaveBeenCalledWith('tk-1')
  })
})

describe('no cartão de opinião: a ARTE salva como arquivo (Atlas: opinar sobre a IMAGEM)', () => {
  const ui = (over: Partial<OpinionUi> = {}): OpinionUi => ({ kind: 'request', requestId: 'req-1', taskId: 'tk-1', round: 1, maxRounds: 2, imageIds: [], audience: 'team', noVision: [], ...over })
  const msg = (id: string, body: string, opinion: OpinionUi): ChannelMessageUi => ({ id, authorId: 'persona-teo', authorName: 'Teo', body, timeLabel: '10:00', reactions: [], opinion })
  const block = (...messages: ChannelMessageUi[]) => buildOpinionBlocks(messages).get('req-1')!
  const card = () => document.querySelector('[data-persona-opinion]') as HTMLElement

  it('mapOpinion lê opinion.files do host (e ignora o que não presta); sem files, o campo não existe', () => {
    const base = { ...hostMessage({ id: 'm', seq: 1, actorId: 'persona-teo', body: 'O que acha do cartaz?', subjectId: '', occurredAt: '2026-11-07T13:00:00.000Z' }) }
    const mapped = mapOpinion({ ...base, opinion: { kind: 'request', requestId: 'req-1', taskId: 'tk-1', round: 1, maxRounds: 2, files: [wireFile('arte/cartaz.svg', { thumb: PNG, pngPath: 'arte/cartaz.png' }), { nome: 'lixo' }] } } as unknown as MessageView)
    expect(mapped?.files).toHaveLength(1)
    expect(mapped?.files?.[0]).toMatchObject({ path: 'arte/cartaz.svg', thumb: PNG, pngPath: 'arte/cartaz.png' })
    expect(mapOpinion({ ...base, opinion: { kind: 'request', requestId: 'req-1', taskId: 'tk-1', round: 1, maxRounds: 2 } } as unknown as MessageView)?.files).toBeUndefined()
  })

  it('aberto: a miniatura da arte (<img src> do thumb) com o nome do arquivo; o clique abre o Revisar naquele arquivo', () => {
    const onOpen = vi.fn()
    render(<OpinionBlock t={t as never} block={block(msg('m-req', 'O que acha do cartaz?', ui({ files: files('arte/cartaz.svg') })))} team={TEAM} onOpenDraftFile={onOpen} />)
    const art = card().querySelector('[data-persona-opinion-art]') as HTMLElement
    expect(art).not.toBeNull()
    expect(art.textContent).toContain('cartaz.svg')
    const button = within(art).getByRole('button', { name: 'Abrir cartaz.svg em Revisar mudanças' })
    expect(button.querySelector('img')?.getAttribute('src')).toBe(PNG)
    expect(art.querySelector('svg')).toBeNull()
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledWith({ taskId: 'tk-1', path: 'arte/cartaz.svg' })
  })

  it('o .svg e o .png irmão viram UMA miniatura; sem o destino do clique é só a figura', () => {
    const list = mapDraftFiles([wireFile('arte/cartaz.svg', { thumb: PNG, pngPath: 'arte/cartaz.png' }), wireFile('arte/cartaz.png', { thumb: PNG })])
    render(<OpinionBlock t={t as never} block={block(msg('m-req', 'O que acha?', ui({ files: list })))} team={TEAM} />)
    const art = card().querySelector('[data-persona-opinion-art]') as HTMLElement
    expect(art.querySelectorAll('figure')).toHaveLength(1)
    expect(within(art).queryAllByRole('button')).toHaveLength(0)
    expect(within(art).getByRole('img', { name: 'cartaz.svg' })).toBeTruthy()
  })

  it('recolhido (depois da consolidação): a pílula leva a miniatura de 36 px da ARTE nova, tenha a pessoa anexado imagem ou não (o anexo vira só referência)', () => {
    const fin = msg('m-fin', 'Escureci o subtítulo e mantive o azul.', ui({ kind: 'consolidated' }))
    const { unmount } = render(<OpinionBlock t={t as never} block={block(msg('m-req', 'O que acha do cartaz?', ui({ files: files('arte/cartaz.svg') })), fin)} team={TEAM} />)
    const thumb = card().querySelector('[data-persona-opinion-pill] [data-draft-file]') as HTMLElement
    expect(thumb).not.toBeNull()
    expect(thumb.className).toContain('pill')
    expect(thumb.querySelector('img')?.getAttribute('src')).toBe(PNG)
    unmount()
    render(<OpinionBlock t={t as never} block={block(msg('m-req', 'O que acha da capa?', ui({ imageIds: ['att-1'], files: files('arte/cartaz.svg') })), fin)} team={TEAM} />)
    expect(card().querySelector('[data-persona-opinion-pill] [data-draft-file]')).not.toBeNull()
  })

  it('sem files nada muda: nenhum bloco de arte no cartão', () => {
    render(<OpinionBlock t={t as never} block={block(msg('m-req', 'Qual capa?', ui()))} team={TEAM} />)
    expect(card().querySelector('[data-persona-opinion-art]')).toBeNull()
    expect(card().querySelector('[data-draft-file]')).toBeNull()
  })
})

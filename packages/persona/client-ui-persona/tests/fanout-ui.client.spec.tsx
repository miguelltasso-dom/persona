// @vitest-environment jsdom
// CV-8 UI (CONVERSAS-SPEC §A; host behind Config.fanout): the card "Respostas da equipe de {x}", the estimate chip with the
// inline confirmation for more than 5 personas, and the typed line the host sends. No data from the host = nothing on screen.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageView } from '@deepseek-ai/dsh-persona-host/types'
import { buildFanoutBlocks } from '../src/client/chat/fanout/fanout-block-model.ts'
import { FanoutBlock } from '../src/client/chat/fanout/FanoutBlock.tsx'
import { FanoutChip } from '../src/client/chat/fanout/FanoutChip.tsx'
import { fanoutCallsLabel, fanoutEstimateFromWire, needsFanoutConfirm } from '../src/client/chat/fanout/fanout-rules.ts'
import { GeneralChannelView, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { mapFanoutLine, type ChannelMessageUi, type FanoutLineUi } from '../src/client/remote/map-host-ui.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']

function line(index: number, personaId: string, name: string, extra: Partial<FanoutLineUi> = {}, body = `Resposta de ${name}`, more: Partial<ChannelMessageUi> = {}): ChannelMessageUi {
  return {
    id: `coord-m1-fan-${personaId}`,
    authorId: personaId,
    authorName: name,
    body,
    timeLabel: '10:00',
    reactions: [],
    fanout: { id: 'fan-m1', source: 'everyone', total: 5, index, personaId, kind: 'reply', ...extra },
    ...more,
  }
}

const COMPLETE: readonly ChannelMessageUi[] = [
  line(1, 'nina', 'Nina', {}, 'Eu cuido do contrato.\nPosso mandar hoje.\nE também reviso o anexo.\nTudo isso até as 17h.'),
  line(2, 'bento', 'Bento'),
  line(3, 'sol', 'Sol', { kind: 'nothing' }),
  line(4, 'luna', 'Luna', { kind: 'nothing' }),
  line(5, 'atlas', 'Atlas', { kind: 'limit', until: '2026-11-04T17:30:00' }),
]

function block(lines: readonly ChannelMessageUi[], teamName: string | null = 'Marketing') {
  const model = [...buildFanoutBlocks(lines).values()][0]!
  return render(<ol><FanoutBlock t={t} block={model} teamName={teamName ?? undefined} /></ol>)
}

describe('the typed line from the host', () => {
  const event = (fanout: unknown) => ({ fanout }) as unknown as MessageView

  it('a valid line reaches the UI as typed fields', () => {
    expect(mapFanoutLine(event({ id: 'fan-1', source: 'relevant', total: 3, index: 2, personaId: 'nina', kind: 'limit', until: '2026-11-04T17:30:00' }))).toEqual({
      id: 'fan-1', source: 'relevant', total: 3, index: 2, personaId: 'nina', kind: 'limit', until: '2026-11-04T17:30:00',
    })
    expect(mapFanoutLine(event({ id: 'fan-1', source: 'relevant', total: 1, index: 1, personaId: 'coord', kind: 'nothing', nobody: true }))?.nobody).toBe(true)
  })

  it('a line that does not say who or what is never drawn as a block (its body stays an ordinary message)', () => {
    expect(mapFanoutLine(event(undefined))).toBeUndefined()
    expect(mapFanoutLine(event({ id: 'fan-1', source: 'everyone', total: 3, index: 1, personaId: '', kind: 'reply' }))).toBeUndefined()
    expect(mapFanoutLine(event({ id: 'fan-1', source: 'everyone', total: 3, index: 1, personaId: 'x', kind: 'weird' }))).toBeUndefined()
    expect(mapFanoutLine(event({ id: 'fan-1', source: 'nobody', total: 3, index: 1, personaId: 'x', kind: 'reply' }))).toBeUndefined()
    expect(mapFanoutLine(event({ id: 'fan-1', source: 'everyone', total: 0, index: 1, personaId: 'x', kind: 'reply' }))).toBeUndefined()
  })
})

describe('grouping the lines of one block', () => {
  it('one block per fanout id, at the place of its first line, in the host order; the latest copy of a line wins', () => {
    const mixed: ChannelMessageUi[] = [
      { id: 'u1', authorId: 'user', authorName: 'Você', body: 'Pessoal, opiniões?', timeLabel: '09:59', reactions: [] },
      line(2, 'bento', 'Bento'),
      line(1, 'nina', 'Nina'),
      { ...line(2, 'bento', 'Bento'), body: 'Resposta de Bento (mais completa)' },
    ]
    const blocks = buildFanoutBlocks(mixed)
    expect(blocks.size).toBe(1)
    const only = blocks.get('fan-m1')!
    expect(only.firstIndex).toBe(1)
    expect(only.lines.map(row => row.authorName)).toEqual(['Nina', 'Bento'])
    expect(only.lines[1]?.body).toBe('Resposta de Bento (mais completa)')
  })

  it('no fanout lines = no blocks (a host without Config.fanout)', () => {
    expect(buildFanoutBlocks([{ id: 'u1', authorId: 'user', authorName: 'Você', body: 'oi', timeLabel: '09:59', reactions: [] }]).size).toBe(0)
  })
})

describe('the card "Respostas da equipe de {x}"', () => {
  it('is titled by the team; replies show face, name and the start of the answer; "Ler tudo" opens the rest', () => {
    block(COMPLETE)
    expect(screen.getByRole('heading', { name: 'Respostas da equipe de Marketing' })).toBeTruthy()
    expect(screen.getByText('Nina')).toBeTruthy()
    expect(screen.getByText('Resposta de Bento')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: 'Ler tudo' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Ler menos' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('without a team name the title is just "Respostas da equipe"', () => {
    block(COMPLETE, null)
    expect(screen.getByRole('heading', { name: 'Respostas da equipe' })).toBeTruthy()
  })

  it('who has nothing to add is ONE collapsed line at the end; opening it lists them', () => {
    block(COMPLETE)
    expect(screen.queryByText('Sol: nada a acrescentar')).toBeNull()
    const more = screen.getByRole('button', { name: 'e mais 2 sem nada a acrescentar' })
    fireEvent.click(more)
    expect(screen.getByText('Sol: nada a acrescentar')).toBeTruthy()
    expect(screen.getByText('Luna: nada a acrescentar')).toBeTruthy()
  })

  it('at its limit: "{persona} está no limite até {hora}" (no call); a failed line has no retry button, only the honest sentence', () => {
    block([
      ...COMPLETE.slice(0, 2),
      line(3, 'sol', 'Sol', { kind: 'failed', message: 'Houve um problema ao responder. Tente de novo em instantes.' }),
      COMPLETE[4]!,
    ])
    expect(screen.getByText(/Atlas está no limite até \d{2}:\d{2}/)).toBeTruthy()
    const failed = screen.getByText('Sol não conseguiu responder agora.')
    expect(failed.closest('li')?.getAttribute('title')).toBe('Houve um problema ao responder. Tente de novo em instantes.')
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).toBeNull()
  })

  it('"Quem tiver algo a dizer" with nobody picked: the one honest line', () => {
    block([line(1, 'coord', 'Atlas', { source: 'relevant', total: 1, kind: 'nothing', nobody: true })])
    expect(screen.getByText('Ninguém tem algo a acrescentar agora.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /sem nada a acrescentar/ })).toBeNull()
  })

  it('while lines are still arriving it says "{k} de {n} responderam"; when all are in, the line is gone', () => {
    const { unmount } = block(COMPLETE.slice(0, 2))
    expect(screen.getByRole('status').textContent).toBe('2 de 5 responderam')
    unmount()
    block(COMPLETE)
    expect(screen.queryByText(/de 5 responderam/)).toBeNull()
  })

  it('a line that is still being written counts as not arrived yet', () => {
    block([...COMPLETE.slice(0, 4), line(5, 'atlas', 'Atlas', {}, 'Escrevendo…', { streaming: true })])
    expect(screen.getByRole('status').textContent).toBe('4 de 5 responderam')
  })
})

describe('in the thread', () => {
  it('the host\'s separate lines are drawn as ONE card; an ordinary message stays an ordinary message', () => {
    const messages: ChannelMessageUi[] = [
      { id: 'u1', authorId: 'user', authorName: 'Você', body: 'Pessoal, o que acham do plano?', timeLabel: '09:59', reactions: [] },
      ...COMPLETE,
    ]
    const { container } = render(<GeneralChannelView t={t} shellT={((key: string) => key) as GeneralChannelViewProps['shellT']} members={[]} messages={messages} createdForTeam="Marketing" />)
    expect(container.querySelectorAll('[data-fanout-block]')).toHaveLength(1)
    expect(screen.getByText('Pessoal, o que acham do plano?')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Respostas da equipe de Marketing' })).toBeTruthy()
    // the "nothing to add" lines are not separate rows of the thread
    expect(screen.queryByText('Resposta de Sol')).toBeNull()
  })

  it('a thread with no fanout line has no block at all', () => {
    const { container } = render(<GeneralChannelView t={t} shellT={((key: string) => key) as GeneralChannelViewProps['shellT']} members={[]} messages={[{ id: 'u1', authorId: 'user', authorName: 'Você', body: 'oi', timeLabel: '09:59', reactions: [] }]} />)
    expect(container.querySelector('[data-fanout-block]')).toBeNull()
  })
})

describe('the estimate chip and the inline confirmation', () => {
  it('"Toda a equipe · n respostas · ≈ c chamadas" only with MEASURED calls; without, just the replies', () => {
    const { unmount } = render(<FanoutChip t={t} choice="everyone" teamCount={4} estimate={{ replies: 4, calls: { min: 4, max: 4 } }} />)
    expect(screen.getByRole('status').textContent).toBe('Toda a equipe · 4 respostas · ≈ 4 chamadas da sua IA')
    unmount()
    render(<FanoutChip t={t} choice="everyone" teamCount={4} />)
    expect(screen.getByRole('status').textContent).toBe('Toda a equipe · 4 respostas')
  })

  it('"Quem tiver algo a dizer" and no choice show no chip', () => {
    const { container, unmount } = render(<FanoutChip t={t} choice="relevant" teamCount={30} />)
    expect(container.innerHTML).toBe('')
    unmount()
    expect(render(<FanoutChip t={t} choice={undefined} teamCount={30} />).container.innerHTML).toBe('')
  })

  it('with more than 5 the chip asks "Enviar para as {n}?" with the two ways out', () => {
    const onConfirm = vi.fn()
    const onRelevantOnly = vi.fn()
    render(<FanoutChip t={t} choice="everyone" teamCount={30} confirming onConfirm={onConfirm} onRelevantOnly={onRelevantOnly} />)
    const group = screen.getByRole('group', { name: 'Confirmar o envio para toda a equipe' })
    expect(within(group).getByText('Enviar para as 30?')).toBeTruthy()
    fireEvent.click(within(group).getByRole('button', { name: 'Enviar' }))
    fireEvent.click(within(group).getByRole('button', { name: 'Só quem tiver algo a dizer' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onRelevantOnly).toHaveBeenCalledTimes(1)
  })

  it('the threshold is "more than 5", and only for the whole team', () => {
    expect(needsFanoutConfirm('everyone', 6)).toBe(true)
    expect(needsFanoutConfirm('everyone', 5)).toBe(false)
    expect(needsFanoutConfirm('relevant', 30)).toBe(false)
    expect(needsFanoutConfirm(undefined, 30)).toBe(false)
  })

  it('reads the host estimate and nothing else', () => {
    expect(fanoutEstimateFromWire({ fanout: { replies: 7, chamadas: { min: 7, max: 7 } } })).toEqual({ replies: 7, calls: { min: 7, max: 7 } })
    expect(fanoutEstimateFromWire({ fanout: { replies: 7, chamadas: { min: 1, max: 6 } } })?.calls).toEqual({ min: 1, max: 6 })
    expect(fanoutEstimateFromWire({ fanout: { replies: 7 } })).toEqual({ replies: 7 })
    expect(fanoutEstimateFromWire({ fanout: { replies: 0 } })).toBeUndefined()
    expect(fanoutEstimateFromWire({})).toBeUndefined()
    expect(fanoutEstimateFromWire(null)).toBeUndefined()
    expect(fanoutCallsLabel({ min: 1, max: 6 })).toBe('1–6')
    expect(fanoutCallsLabel({ min: 4, max: 4 })).toBe('4')
  })
})

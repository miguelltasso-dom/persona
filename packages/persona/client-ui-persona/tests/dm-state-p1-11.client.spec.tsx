// @vitest-environment jsdom
// Carbon P1-11 (DM sem estado): the conversation row dropped `paused`, `quiet`, `draftFiles` and `step` (it copied only the activity), so a persona paused on
// purpose read "Disponível" in the DM header, one inside a Janela de silêncio never "Descansando", and the step of her work never reached the line under the
// typing balloon. The row is built by `dmRowOf` (the strip's facts → the row); the header reads it through the one state vocabulary.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import type { HostTurnControls } from '../src/client/chat/host-turn.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import { dmRowOf } from '../src/client/remote/dm-rows.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

const t = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never
const ROW = { id: 'dm-nina', peerId: 'nina', peerName: 'Nina' }
const NINA: ChannelPersonaMember = { id: 'nina' as never, name: 'Nina', role: 'Pesquisa', state: 'resting' }
const ask: ChannelMessageUi = { id: 'm1', authorId: 'user', authorName: 'Ana', body: 'Explique o plano', timeLabel: '10:00', reactions: [] }
const turn = { stoppable: null, stop: vi.fn(), steer: vi.fn(), stoppedPersona: null, error: null, clearError: vi.fn() } as unknown as HostTurnControls

function show(member: ChannelPersonaMember, extra: Partial<React.ComponentProps<typeof DirectMessagesView>> = {}): void {
  const row = dmRowOf(ROW, member, undefined, shellTranslate)
  render(<DirectMessagesView t={t} shellT={shellTranslate} loading={false} dms={[row]} selectedId="dm-nina" messages={[ask]} onSelect={() => undefined} onSend={() => undefined} {...extra} />)
}
const chip = (): string | undefined => document.querySelector('[data-persona-state]:not(img)')?.textContent ?? undefined

describe('the DM row carries what the strip knows', () => {
  it('a persona paused on purpose reads "Pausada" in the header, not "Disponível"', () => {
    show({ ...NINA, paused: true })
    expect(chip()).toBe('Pausada')
  })

  it('an idle persona inside a Janela de silêncio reads "Descansando"; awake, "Disponível"', () => {
    show({ ...NINA, quiet: true })
    expect(chip()).toBe('Descansando')
    cleanup()
    show(NINA)
    expect(chip()).toBe('Disponível')
  })

  it('a working persona with files in her draft reads "Num rascunho"; without, "Trabalhando"', () => {
    show({ ...NINA, state: 'working', draftFiles: 2 })
    expect(chip()).toBe('Num rascunho')
    cleanup()
    show({ ...NINA, state: 'working' })
    expect(chip()).toBe('Trabalhando')
  })

  it('the row keeps only the facts that are there (nothing invented for a persona that has none)', () => {
    expect(dmRowOf(ROW, NINA, undefined, shellTranslate)).toEqual({
      id: 'dm-nina', peerId: 'nina', peerName: 'Nina', characterId: 'nina', role: 'Pesquisa', stateLabel: 'Disponível', stateTone: 'neutral', state: 'resting',
    })
    expect(dmRowOf(ROW, undefined, undefined, shellTranslate)).toEqual(ROW)
  })

  it('the step of her work reaches the line under the typing balloon, after the delay: "Nina · Procurando fotos da padaria"', () => {
    show({ ...NINA, state: 'working', step: 'Procurando fotos da padaria' }, { turnControls: turn })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('Nina · Procurando fotos da padaria')).toBeTruthy()
  })
})

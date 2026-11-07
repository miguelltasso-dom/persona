// @vitest-environment jsdom
// HT-3 · "{nome} começou agora" no cartão do quadro (Muse 01:31): só quando a tarefa ATUAL da persona é o PRÓPRIO cartão movido pela pessoa nesta
// sessão e ela começou em até 2 min; some sozinho depois de 8 s; nunca afirma o que não é verdade. Atrás de persona.flag.teamwork.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import {
  findStarter,
  STARTED_NOW_POLL_MS,
  STARTED_NOW_VISIBLE_MS,
  STARTED_NOW_WINDOW_MS,
  useStartedNow,
  type NowPersonaRow,
  type StartedNowApi,
} from '../src/client/kanban/started-now.ts'
import { StartedNowNote, StartedNowProvider } from '../src/client/kanban/StartedNowNote.tsx'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

const row = (extra: Partial<NowPersonaRow> = {}): NowPersonaRow => ({ personaId: 'p-nina', name: 'Nina', state: 'working', currentTaskId: 'tk-1', ...extra })

describe('a trava 1: a tarefa ATUAL da persona é o próprio cartão', () => {
  it('trabalhando no cartão movido = começou; trabalhando em OUTRA tarefa, parada ou sem nome = não', () => {
    expect(findStarter([row()], 'tk-1')?.name).toBe('Nina')
    expect(findStarter([row({ currentTaskId: 'tk-9' })], 'tk-1')).toBeUndefined()
    expect(findStarter([row({ state: 'resting' })], 'tk-1')).toBeUndefined()
    expect(findStarter([row({ state: 'waiting' })], 'tk-1')).toBeUndefined()
    expect(findStarter([row({ name: '  ' })], 'tk-1')).toBeUndefined()
    expect(findStarter([row({ currentTaskId: '' })], '')).toBeUndefined()
    expect(findStarter([], 'tk-1')).toBeUndefined()
  })
})

function Harness({ enabled, readNow, now, apiRef }: { readonly enabled: boolean; readonly readNow: () => Promise<readonly NowPersonaRow[]>; readonly now: () => number; readonly apiRef: { current?: StartedNowApi } }): ReactNode {
  const api = useStartedNow({ enabled, readNow, now })
  apiRef.current = api
  return (
    <StartedNowProvider value={api}>
      <StartedNowNote cardId="tk-1" label={name => bindLocale(kanbanPt, 'card.startedNow', { name })} />
      <StartedNowNote cardId="tk-2" label={name => bindLocale(kanbanPt, 'card.startedNow', { name })} />
    </StartedNowProvider>
  )
}

async function tick(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('a trava 2 e o ciclo de vida', () => {
  function mount(rows: () => readonly NowPersonaRow[], enabled = true) {
    let clock = 1_000_000
    const apiRef: { current?: StartedNowApi } = {}
    const readNow = vi.fn(async () => rows())
    const now = (): number => clock
    render(<Harness enabled={enabled} readNow={readNow} now={now} apiRef={apiRef} />)
    return { apiRef, readNow, advance: (ms: number) => { clock += ms } }
  }

  it('a pessoa moveu e a persona começou NO cartão: "Nina começou agora"; some sozinho depois de 8 s', async () => {
    let started = false
    const { apiRef } = mount(() => (started ? [row()] : [row({ state: 'resting', currentTaskId: '' })]))
    expect(screen.queryByText('Nina começou agora')).toBeNull()
    act(() => { apiRef.current!.watch('tk-1') })
    await tick(STARTED_NOW_POLL_MS)
    expect(screen.queryByText('Nina começou agora')).toBeNull()
    started = true
    await tick(STARTED_NOW_POLL_MS)
    expect(screen.getByText('Nina começou agora')).toBeTruthy()
    expect(screen.getByRole('status').getAttribute('data-started-now')).toBe('p-nina')
    await tick(STARTED_NOW_VISIBLE_MS - 100)
    expect(screen.queryByText('Nina começou agora')).not.toBeNull()
    await tick(200)
    expect(screen.queryByText('Nina começou agora')).toBeNull()
  })

  it('sem a pessoa ter movido nesta sessão (ninguém chamou watch), nada aparece mesmo com a persona trabalhando no cartão', async () => {
    const { readNow } = mount(() => [row()])
    await tick(STARTED_NOW_POLL_MS * 3)
    expect(screen.queryByText('Nina começou agora')).toBeNull()
    expect(readNow).not.toHaveBeenCalled()
  })

  it('se a persona trabalha em OUTRA tarefa, ou o host segura (pausa/silêncio/entrega pendente), não afirma nada; depois de 2 min o movimento é esquecido', async () => {
    const { apiRef, readNow, advance } = mount(() => [row({ currentTaskId: 'tk-9' })])
    act(() => { apiRef.current!.watch('tk-1') })
    await tick(STARTED_NOW_POLL_MS * 3)
    expect(screen.queryByText('Nina começou agora')).toBeNull()
    advance(STARTED_NOW_WINDOW_MS + 1000)
    await tick(STARTED_NOW_POLL_MS)
    const calls = readNow.mock.calls.length
    await tick(STARTED_NOW_POLL_MS * 5)
    expect(readNow.mock.calls.length).toBe(calls)
    expect(screen.queryByText('Nina começou agora')).toBeNull()
  })

  it('começar DEPOIS dos 2 min não vale (a janela já fechou)', async () => {
    let started = false
    const { apiRef, advance } = mount(() => (started ? [row()] : []))
    act(() => { apiRef.current!.watch('tk-1') })
    advance(STARTED_NOW_WINDOW_MS + 1000)
    await tick(STARTED_NOW_POLL_MS)
    started = true
    await tick(STARTED_NOW_POLL_MS * 3)
    expect(screen.queryByText('Nina começou agora')).toBeNull()
  })

  it('sem a flag teamwork nada é observado nem desenhado', async () => {
    const { apiRef, readNow } = mount(() => [row()], false)
    act(() => { apiRef.current!.watch('tk-1') })
    await tick(STARTED_NOW_POLL_MS * 3)
    expect(readNow).not.toHaveBeenCalled()
    expect(screen.queryByText('Nina começou agora')).toBeNull()
  })

  it('o host falhou ao responder: tenta de novo no próximo ciclo, sem quebrar nem afirmar nada', async () => {
    let calls = 0
    const apiRef: { current?: StartedNowApi } = {}
    const readNow = vi.fn(async () => { calls += 1; if (calls === 1) throw new Error('host down'); return [row()] })
    render(<Harness enabled readNow={readNow} now={() => 1_000_000} apiRef={apiRef} />)
    act(() => { apiRef.current!.watch('tk-1') })
    await tick(STARTED_NOW_POLL_MS * 2)
    expect(screen.getByText('Nina começou agora')).toBeTruthy()
  })

  it('o aviso é só do cartão movido (o outro cartão não ganha nada)', async () => {
    const { apiRef } = mount(() => [row()])
    act(() => { apiRef.current!.watch('tk-1') })
    await tick(STARTED_NOW_POLL_MS)
    expect(screen.getAllByText('Nina começou agora')).toHaveLength(1)
  })

  it('sair do quadro (desmontar) apaga o aviso e os temporizadores', async () => {
    const apiRef: { current?: StartedNowApi } = {}
    const view = render(<Harness enabled readNow={async () => [row()]} now={() => 1_000_000} apiRef={apiRef} />)
    act(() => { apiRef.current!.watch('tk-1') })
    await tick(STARTED_NOW_POLL_MS)
    expect(screen.getByText('Nina começou agora')).toBeTruthy()
    view.unmount()
    await tick(STARTED_NOW_VISIBLE_MS * 2)
    expect(screen.queryByText('Nina começou agora')).toBeNull()
  })
})

describe('o cartão fora do provedor', () => {
  it('não desenha nada (telas sem o quadro conectado)', () => {
    render(<StartedNowNote cardId="tk-1" label={name => `${name} começou agora`} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

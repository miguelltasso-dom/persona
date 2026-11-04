// @vitest-environment jsdom
// Gauge GOV-10: "Estou fora" precisa chegar ao host (organograma "Fora", aprovações) e o popover do rail precisa fechar
// com Esc / clique fora, sem alargar nem deslocar a barra lateral.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonaSidebar } from '../src/client/shell/PersonaSidebar.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { availabilityRequest, readStoredAway, syncAvailability, AWAY_STORAGE_KEY } from '../src/client/shell/availability-sync.ts'
import type { UserAwayState } from '../src/client/shell/UserAwayControl.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never
const TENANT = { workspaceId: 'ws', memberId: 'm-owner' }

describe('availabilityRequest / syncAvailability', () => {
  const now = new Date(2026, 10, 4, 10, 0, 0).getTime()

  it('ligado: janela "away" do agora até o prazo real', () => {
    const until = new Date(2026, 10, 4, 18, 0, 0).getTime()
    const state: UserAwayState = { isAway: true, untilChoice: 'today18', untilAt: until }
    expect(availabilityRequest(TENANT, state, now)).toEqual({
      workspaceId: 'ws', humanId: 'm-owner', kind: 'away', from: new Date(now).toISOString(), until: new Date(until).toISOString(),
    })
  })

  it('estado antigo sem prazo: janela de 24 h (nunca "fora" para sempre no host)', () => {
    const req = availabilityRequest(TENANT, { isAway: true, untilChoice: 'tomorrow' }, now)
    expect(req.kind).toBe('away')
    expect(new Date(req.until).getTime() - now).toBe(24 * 60 * 60 * 1000)
  })

  it('desligado ou expirado: "available"', () => {
    expect(availabilityRequest(TENANT, { isAway: false, untilChoice: 'today18' }, now).kind).toBe('available')
    const expired = availabilityRequest(TENANT, { isAway: true, untilChoice: 'today18', untilAt: now - 1 }, now)
    // prazo no passado vira a janela padrão; quem decide voltar é o rail (efeito de expiração), que manda "available"
    expect(expired.kind).toBe('away')
  })

  it('manda ao host; sem tenant, sem método (host antigo) ou com falha não lança', async () => {
    const setAvailability = vi.fn(() => Promise.resolve({ ok: true }))
    const state: UserAwayState = { isAway: true, untilChoice: 'today18', untilAt: now + 1000 }
    expect(await syncAvailability({ setAvailability }, TENANT, state, now)).toBe(true)
    expect(setAvailability).toHaveBeenCalledWith(expect.objectContaining({ humanId: 'm-owner', kind: 'away' }))
    expect(await syncAvailability({ setAvailability }, null, state, now)).toBe(false)
    expect(await syncAvailability({}, TENANT, state, now)).toBe(false)
    expect(await syncAvailability(undefined, TENANT, state, now)).toBe(false)
    expect(await syncAvailability({ setAvailability: () => Promise.reject(new Error('forbidden')) }, TENANT, state, now)).toBe(false)
    expect(await syncAvailability({ setAvailability: () => ({ ok: false, error: { code: 'forbidden' } }) }, TENANT, state, now)).toBe(false)
  })

  it('lê o estado guardado sem lançar (storage bloqueado / lixo)', () => {
    expect(readStoredAway()).toBeNull()
    localStorage.setItem(AWAY_STORAGE_KEY, 'não é json')
    expect(readStoredAway()).toBeNull()
    localStorage.setItem(AWAY_STORAGE_KEY, JSON.stringify({ isAway: true, untilChoice: 'today18', untilAt: 5 }))
    expect(readStoredAway()).toMatchObject({ isAway: true, untilAt: 5 })
  })
})

describe('rail: "Estou fora"', () => {
  function rail(onAwayChange?: (state: UserAwayState) => void) {
    const { store } = createShellStore()
    const approvals = createSnapshotStore({ pending: 0 })
    const team = createSnapshotStore<readonly never[]>([])
    const revision = createSnapshotStore({ n: 0 })
    return render(
      <div>
        <button type="button">fora do rail</button>
        <PersonaSidebar
          t={t}
          useShell={bindObservableForTest(store)}
          useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
          usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
          useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
          selectPanel={() => {}}
          renderSlot={(() => null) as never}
          {...(onAwayChange === undefined ? {} : { onAwayChange })}
        />
      </div>,
    )
  }

  const chip = (): HTMLElement => document.querySelector('button[aria-haspopup="dialog"]') as HTMLElement

  it('ligar e desligar chegam ao host com o prazo; o chip diz "Fora até 18h"', () => {
    const onAwayChange = vi.fn()
    rail(onAwayChange)
    fireEvent.click(chip())
    fireEvent.click(screen.getByRole('switch', { name: 'Estou fora' }))
    expect(onAwayChange).toHaveBeenCalledTimes(1)
    const on = onAwayChange.mock.calls[0]![0] as UserAwayState
    expect(on.isAway).toBe(true)
    expect(typeof on.untilAt).toBe('number')
    expect(screen.getByRole('button', { name: 'Fora até 18h' })).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Estou fora' }))
    expect((onAwayChange.mock.calls[1]![0] as UserAwayState).isAway).toBe(false)
  })

  it('Esc fecha o popover e devolve o foco ao chip', () => {
    rail()
    fireEvent.click(chip())
    expect(screen.getByRole('dialog', { name: 'Estou fora' })).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Estou fora' })).toBeNull()
    expect(document.activeElement).toBe(chip())
  })

  it('clique fora fecha; clique dentro não', () => {
    rail()
    fireEvent.click(chip())
    const dialog = screen.getByRole('dialog', { name: 'Estou fora' })
    fireEvent.pointerDown(dialog)
    expect(screen.getByRole('dialog', { name: 'Estou fora' })).toBeTruthy()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'fora do rail' }))
    expect(screen.queryByRole('dialog', { name: 'Estou fora' })).toBeNull()
  })
})

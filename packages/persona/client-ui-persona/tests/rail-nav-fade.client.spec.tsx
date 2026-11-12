// @vitest-environment jsdom
// Muse (axe color-contrast, prova do Quill): o esmaecido do fim da lista do rail só existe enquanto HÁ mais lista embaixo.
// Lista que cabe inteira, ou já rolada até o fim, não tem esmaecido: nenhum item fica apagado sem ter mais nada abaixo.
// O jsdom não calcula layout: as medidas de rolagem são simuladas nos getters.
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonaSidebar } from '../src/client/shell/PersonaSidebar.tsx'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

let metrics = { scrollHeight: 400, clientHeight: 400 }

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute('data-scrolls') ? metrics.scrollHeight : 0 },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute('data-scrolls') ? metrics.clientHeight : 0 },
  })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
})

function mount(): HTMLElement {
  const shell = createShellStore()
  const approvals = createSnapshotStore({ pending: 0 })
  const team = createSnapshotStore<readonly never[]>([])
  const revision = createSnapshotStore({ n: 0 })
  render(
    <PersonaSidebar
      t={t}
      useShell={bindObservableForTest(shell.store)}
      useTeam={bindObservableForTest({ getSnapshot: () => team.getSnapshot(), subscribe: l => team.subscribe(l) }) as never}
      usePersonaCardRevision={bindObservableForTest({ getSnapshot: () => revision.getSnapshot(), subscribe: l => revision.subscribe(l) })}
      useApprovals={bindObservableForTest({ getSnapshot: () => approvals.getSnapshot(), subscribe: l => approvals.subscribe(l) })}
      selectPanel={vi.fn()}
      renderSlot={(() => null) as never}
    />,
  )
  return document.querySelector('[data-scrolls]') as HTMLElement
}

describe('esmaecido do fim da lista do rail', () => {
  it('a lista cabe inteira: não rola e não há esmaecido (nenhum item apagado)', () => {
    metrics = { scrollHeight: 400, clientHeight: 400 }
    const list = mount()
    expect(list.getAttribute('data-scrolls')).toBe('false')
    expect(list.getAttribute('data-more')).toBe('false')
  })

  it('a lista rola e há mais embaixo: o esmaecido existe', () => {
    metrics = { scrollHeight: 800, clientHeight: 400 }
    const list = mount()
    expect(list.getAttribute('data-scrolls')).toBe('true')
    expect(list.getAttribute('data-more')).toBe('true')
  })

  it('rolada até o fim: o esmaecido some; ao voltar para cima, volta', () => {
    metrics = { scrollHeight: 800, clientHeight: 400 }
    const list = mount()
    list.scrollTop = 400
    act(() => { fireEvent.scroll(list) })
    expect(list.getAttribute('data-scrolls')).toBe('true')
    expect(list.getAttribute('data-more')).toBe('false')
    list.scrollTop = 120
    act(() => { fireEvent.scroll(list) })
    expect(list.getAttribute('data-more')).toBe('true')
  })

  it('rolada para baixo: o esmaecido também aparece no topo (a linha que sai não corta seca)', () => {
    metrics = { scrollHeight: 800, clientHeight: 400 }
    const list = mount()
    expect(list.getAttribute('data-above')).toBe('false')
    list.scrollTop = 120
    act(() => { fireEvent.scroll(list) })
    expect(list.getAttribute('data-above')).toBe('true')
    list.scrollTop = 0
    act(() => { fireEvent.scroll(list) })
    expect(list.getAttribute('data-above')).toBe('false')
  })
})

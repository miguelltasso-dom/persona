// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createOnboardingStore } from '../src/client/onboarding/create-onboarding-store.ts'
import { OnboardingWizard } from '../src/client/onboarding/OnboardingWizard.tsx'
import { ConversationRunErrorCard } from '../src/client/chat/ConversationRunErrorCard.tsx'
import { pt } from '../src/client/locale/onboarding/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

function wizardAt(step: 1 | 2 | 3 | 4 | 5, harnessReady: boolean) {
  const { store, actions } = createOnboardingStore()
  store.set({ ...store.getSnapshot(), step, displayName: 'Miguel' })
  return render(
    <OnboardingWizard
      dict={pt}
      structureDict={pt}
      store={store}
      actions={actions}
      harnesses={[{ id: 'claude', label: 'Claude', ready: harnessReady }]}
      firstDelivery={{
        shellT: key => shellPt[key as keyof typeof shellPt] as string,
        phase: 'intro',
        onRequest: () => undefined,
        onEnterApp: () => undefined,
        onCelebrateContinue: () => undefined,
      }}
    />,
  )
}

/** axe `list`/`listitem`: um <ul> só tem <li> como filho direto, e todo <li> tem <ul>/<ol> como pai. */
function expectValidLists(root: HTMLElement): void {
  for (const list of root.querySelectorAll('ul, ol')) {
    for (const child of Array.from(list.children)) expect(child.tagName).toBe('LI')
  }
  for (const item of root.querySelectorAll('li')) {
    expect(['UL', 'OL']).toContain(item.parentElement?.tagName)
  }
}

describe('onboarding a11y (FR-6, medido no app instalado)', () => {
  it('passo 3: o aviso "Conecte pelo menos uma IA" fica FORA da lista de harnesses', () => {
    const { container } = wizardAt(3, false)
    const notice = screen.getByRole('note')
    expect(notice.closest('ul')).toBeNull()
    expectValidLists(container)
  })

  it('passo 5: cada apresentação é um <li> direto da lista, e a lista tem rótulo próprio (não só o nome da pessoa)', () => {
    const { container } = wizardAt(5, true)
    const list = container.querySelector('ul[aria-label]')
    expect(list).not.toBeNull()
    expect(list?.getAttribute('aria-label')).toBe(pt['step5.introLabel'])
    expect(list?.getAttribute('aria-label')).not.toBe('Miguel')
    expect(list?.children.length).toBeGreaterThan(0)
    expectValidLists(container)
  })
})

describe('FR-5: cartão de erro no fio mostra o retrato da persona', () => {
  it('passa avatarSrc ao cartão (antes caía na inicial "A")', () => {
    const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
    const { container } = render(
      <ConversationRunErrorCard
        t={t}
        personaName="Atlas"
        payload={{ code: 'engine_unavailable' }}
        avatarSrc="/portraits/atlas.png"
        handlers={{} as never}
      />,
    )
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/portraits/atlas.png')
  })
})

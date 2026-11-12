// @vitest-environment jsdom
// "Acordando o time" (COLHEITA-MUSE §30): the waiting scene of the static boot overlay, driven by facts (phase, failure, paint)
// and, only for delay warnings, by the clock. The real overlay markup and script run here with fake timers.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const FACES_KEY = 'persona.boot.faces.v1'

interface Bridge {
  retry: ReturnType<typeof vi.fn>
  diagnostic: ReturnType<typeof vi.fn>
  fail(detail: { code: string; message: string }): void
  phase(value: string): void
}

function open(query = 'lang=pt-BR&first=0', options: { withPhase?: boolean } = {}): { shadow: ShadowRoot; overlay: HTMLElement; bridge: Bridge } {
  const template = readFileSync(resolve('apps/desktop/renderer/persona-boot/boot.html'), 'utf8')
  document.body.innerHTML = `${template}<div id="root"><p>HARNESS Loading plugins…</p></div>`
  const overlay = document.getElementById('persona-boot-overlay')!
  const shadow = overlay.attachShadow({ mode: 'open' })
  shadow.append(overlay.querySelector('template')!.content)
  let fail: ((detail: { code: string; message: string }) => void) | undefined
  let phase: ((value: string) => void) | undefined
  const bridge: Bridge = {
    retry: vi.fn(async () => {}),
    diagnostic: vi.fn(async () => 'Persona 1.0 · boot_timeout · C:\\logs'),
    fail: (detail) => { fail!(detail) },
    phase: (value) => { phase!(value) },
  }
  Object.defineProperty(window, 'personaBoot', { configurable: true, value: {
    retry: bridge.retry, diagnostic: bridge.diagnostic,
    subscribe: (listener: typeof fail) => { fail = listener; return () => {} },
    ...(options.withPhase === false ? {} : { onPhase: (listener: typeof phase) => { phase = listener; return () => {} } }),
  } })
  Object.defineProperty(document, 'currentScript', { configurable: true, value: { src: `https://persona.local/boot.js?${query}` } })
  window.eval(readFileSync(resolve('apps/desktop/renderer/persona-boot/boot.js'), 'utf8'))
  return { shadow, overlay, bridge }
}
const status = (shadow: ShadowRoot): string => shadow.getElementById('boot-status')!.textContent!
const hint = (shadow: ShadowRoot): string => shadow.getElementById('boot-hint')!.hidden ? '' : shadow.getElementById('boot-hint')!.textContent!
const faces = (shadow: ShadowRoot): string[] => [...shadow.querySelectorAll<HTMLImageElement>('.face img')].map(img => /faces\/(.+)\.webp$/u.exec(img.getAttribute('src')!)![1]!)
const sceneOf = (shadow: ShadowRoot): string => shadow.querySelector<HTMLElement>('.boot')!.dataset.scene!
function paintApp(): void { document.getElementById('root')!.innerHTML = '<main data-persona-shell="">Sua equipe</main>' }

beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear() })
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.useRealTimers(); document.body.replaceChildren() })

it('shows the static rail at once and keeps the scene out of the first 400 ms', async () => {
  const { shadow } = open()
  await vi.advanceTimersByTimeAsync(0)
  expect([...shadow.querySelectorAll('.place')].map(li => li.textContent)).toEqual(['Visão geral', 'Projetos', 'Aprovações', 'Equipe', 'Memória da empresa'])
  expect([...shadow.querySelectorAll('.place')].every(li => li.getAttribute('aria-disabled') === 'true')).toBe(true)
  expect(shadow.querySelector('.rail')!.getAttribute('aria-hidden')).toBe('true')
  expect(sceneOf(shadow)).toBe('off')
  expect(status(shadow)).toBe('')
  await vi.advanceTimersByTimeAsync(399)
  expect(sceneOf(shadow)).toBe('off')
  await vi.advanceTimersByTimeAsync(2)
  expect(sceneOf(shadow)).toBe('on')
  expect(status(shadow)).toBe('Acordando o time…')
  // Nothing is focusable until the honest error.
  expect([...shadow.querySelectorAll('button, a[href], input, summary')].filter(el => el.closest('[hidden]') === null)).toEqual([])
  expect(shadow.querySelector<HTMLElement>('.error')!.hidden).toBe(true)
})

it('never shows the scene when the host answers within 400 ms', async () => {
  const { shadow, overlay } = open()
  await vi.advanceTimersByTimeAsync(150)
  paintApp()
  await vi.advanceTimersByTimeAsync(50)
  expect(sceneOf(shadow)).toBe('off')
  expect(shadow.querySelectorAll('.face').length).toBe(0)
  expect(overlay.classList.contains('leaving')).toBe(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(sceneOf(shadow)).toBe('off')
})

it('arrives with the onboarding trio on the first open and with the last session faces afterwards', async () => {
  const first = open()
  await vi.advanceTimersByTimeAsync(450)
  expect(faces(first.shadow)).toEqual(['atlas', 'bento', 'nina'])
  window.dispatchEvent(new Event('pagehide'))
  window.localStorage.setItem(FACES_KEY, JSON.stringify(['capivara', 'nina', 'nina', 'lobo-guara', '../../evil', 'tucano', 'coelho', 'panda']))
  const next = open()
  await vi.advanceTimersByTimeAsync(450)
  // Duplicates and ids that are not shipped faces are dropped; at most 5 stay.
  expect(faces(next.shadow)).toEqual(['capivara', 'nina', 'lobo-guara', 'tucano', 'coelho'])
})

it('falls back to the trio when the remembered faces are unusable', async () => {
  window.localStorage.setItem(FACES_KEY, '{"not":"a list"}')
  const a = open()
  await vi.advanceTimersByTimeAsync(450)
  expect(faces(a.shadow)).toEqual(['atlas', 'bento', 'nina'])
  window.dispatchEvent(new Event('pagehide'))
  window.localStorage.setItem(FACES_KEY, JSON.stringify(['x', 7, null]))
  const b = open()
  await vi.advanceTimersByTimeAsync(450)
  expect(faces(b.shadow)).toEqual(['atlas', 'bento', 'nina'])
})

it('changes the phrase with the facts: host answered → "Arrumando a casa…"', async () => {
  const { shadow, bridge } = open()
  await vi.advanceTimersByTimeAsync(500)
  expect(status(shadow)).toBe('Acordando o time…')
  bridge.phase('host-ready')
  expect(status(shadow)).toBe('Arrumando a casa…')
  bridge.phase('nonsense')
  expect(status(shadow)).toBe('Arrumando a casa…')
  bridge.phase('starting')
  expect(status(shadow)).toBe('Acordando o time…')
})

it('uses the clock only for the delay warning, and a late host answer still changes the phrase', async () => {
  const { shadow, bridge } = open()
  await vi.advanceTimersByTimeAsync(5900)
  expect(status(shadow)).toBe('Acordando o time…')
  expect(hint(shadow)).toBe('')
  await vi.advanceTimersByTimeAsync(200)
  expect(status(shadow)).toBe('Ainda abrindo.')
  expect(hint(shadow)).toBe('O computador está ocupado, já já termina.')
  bridge.phase('host-ready')
  expect(status(shadow)).toBe('Arrumando a casa…')
  expect(hint(shadow)).toBe('O computador está ocupado, já já termina.')
})

it('works without the phase channel (clock only)', async () => {
  const { shadow } = open('lang=pt-BR&first=0', { withPhase: false })
  await vi.advanceTimersByTimeAsync(7000)
  expect(status(shadow)).toBe('Ainda abrindo.')
})

it('on the first run the slow line says the first time takes up to a minute, and the honest error comes at 60 s', async () => {
  const { shadow } = open('lang=pt-BR&first=1')
  await vi.advanceTimersByTimeAsync(7000)
  expect(hint(shadow)).toBe('Na primeira vez leva até um minuto.')
  await vi.advanceTimersByTimeAsync(40_000)
  expect(shadow.querySelector<HTMLElement>('.error')!.hidden).toBe(true)
  await vi.advanceTimersByTimeAsync(14_000)
  expect(shadow.querySelector<HTMLElement>('.error')!.hidden).toBe(false)
})

it('shows the honest error after 25 s with focus on "Tentar de novo", and Retry goes back to the scene', async () => {
  const { shadow, bridge } = open()
  await vi.advanceTimersByTimeAsync(24_900)
  expect(shadow.querySelector<HTMLElement>('.error')!.hidden).toBe(true)
  await vi.advanceTimersByTimeAsync(200)
  expect(shadow.querySelector<HTMLElement>('.error')!.hidden).toBe(false)
  expect(shadow.getElementById('boot-error-title')!.textContent).toBe('Não deu para abrir a casa agora.')
  const retry = shadow.getElementById('boot-retry') as HTMLButtonElement
  expect(retry.textContent).toBe('Tentar de novo')
  expect(shadow.activeElement).toBe(retry)
  retry.click()
  expect(bridge.retry).toHaveBeenCalledOnce()
  expect(shadow.querySelector<HTMLElement>('.splash')!.hidden).toBe(false)
  expect(shadow.querySelector<HTMLElement>('.error')!.hidden).toBe(true)
  expect(status(shadow)).toBe('Acordando o time…')
})

it('"Ver o que aconteceu" opens the support details with the diagnostic', async () => {
  const { shadow, bridge } = open()
  await vi.advanceTimersByTimeAsync(26_000)
  const button = shadow.getElementById('boot-copy') as HTMLButtonElement
  expect(button.textContent).toBe('Ver o que aconteceu')
  button.click()
  await vi.advanceTimersByTimeAsync(0)
  expect(bridge.diagnostic).toHaveBeenCalledOnce()
  expect(shadow.getElementById('boot-diag')!.textContent).toBe('Persona 1.0 · boot_timeout · C:\\logs')
  expect((shadow.getElementById('boot-details') as HTMLDetailsElement).open).toBe(true)
})

it('a timeout is not a verdict: when the app paints after the error, it takes over', async () => {
  const { shadow, overlay } = open()
  await vi.advanceTimersByTimeAsync(26_000)
  expect(shadow.querySelector<HTMLElement>('.error')!.hidden).toBe(false)
  paintApp()
  await vi.advanceTimersByTimeAsync(1000)
  expect(overlay.classList.contains('leaving')).toBe(true)
  expect(document.getElementById('root')!.hidden).toBe(false)
})

it('a host failure is a verdict: painting never hides it', async () => {
  const { shadow, overlay, bridge } = open()
  await vi.advanceTimersByTimeAsync(500)
  bridge.fail({ code: 'boot_failed', message: 'Forced startup failure' })
  expect(shadow.getElementById('boot-error-title')!.textContent).toBe('Não conseguimos abrir a Persona')
  expect(shadow.getElementById('boot-diag')!.textContent).toBe('boot_failed · Forced startup failure')
  paintApp()
  await vi.advanceTimersByTimeAsync(2000)
  expect(overlay.classList.contains('leaving')).toBe(false)
  expect(shadow.querySelector<HTMLElement>('.error')!.hidden).toBe(false)
})

it('once the scene started it stays until the last face has arrived, then crossfades out', async () => {
  const { shadow, overlay } = open()
  await vi.advanceTimersByTimeAsync(500) // scene started at 400 ms with 3 faces: min stay = 2 × 120 + 360 + 60 = 660 ms
  paintApp()
  await vi.advanceTimersByTimeAsync(300) // 800 ms
  expect(overlay.classList.contains('leaving')).toBe(false)
  expect(sceneOf(shadow)).toBe('on')
  await vi.advanceTimersByTimeAsync(300) // 1100 ms
  expect(overlay.classList.contains('leaving')).toBe(true)
  expect(document.getElementById('root')!.hidden).toBe(false)
  overlay.dispatchEvent(new Event('transitionend'))
  expect(overlay.isConnected).toBe(false)
})

it('speaks English when the shell language is not Portuguese', async () => {
  const { shadow, bridge } = open('lang=en-US&first=0')
  await vi.advanceTimersByTimeAsync(500)
  expect(status(shadow)).toBe('Waking up the team…')
  bridge.phase('host-ready')
  expect(status(shadow)).toBe('Getting the house ready…')
  await vi.advanceTimersByTimeAsync(7000)
  expect(hint(shadow)).toBe('Your computer is busy, it’ll be done soon.')
  expect([...shadow.querySelectorAll('.place')].map(li => li.textContent)).toEqual(['Overview', 'Projects', 'Approvals', 'Team', 'Company memory'])
  await vi.advanceTimersByTimeAsync(20_000)
  expect(shadow.getElementById('boot-error-title')!.textContent).toBe('We couldn’t open the house right now.')
})

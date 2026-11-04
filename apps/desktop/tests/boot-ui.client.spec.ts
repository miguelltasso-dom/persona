// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.useRealTimers(); document.body.replaceChildren() })

it('keeps recovery visible over the upstream loader until Persona has painted', async () => {
  vi.useFakeTimers()
  const template = readFileSync(resolve('apps/desktop/renderer/persona-boot/boot.html'), 'utf8')
  document.body.innerHTML = template + '<div id="root"><p>HARNESS Loading plugins…</p></div>'
  const overlay = document.getElementById('persona-boot-overlay')!
  const content = overlay.querySelector('template')!.content
  const shadow = overlay.attachShadow({ mode: 'open' })
  shadow.append(content)
  const retry = vi.fn(async () => {})
  let publish: ((detail: { code: string; message: string }) => void) | undefined
  Object.defineProperty(window, 'personaBoot', { configurable: true, value: {
    retry, diagnostic: async () => 'Persona · boot_failed',
    subscribe: (listener: typeof publish) => { publish = listener; return () => {} },
  } })
  Object.defineProperty(document, 'currentScript', { configurable: true, value: { src: 'https://persona.local/boot.js?lang=pt-BR&first=1' } })
  window.eval(readFileSync(resolve('apps/desktop/renderer/persona-boot/boot.js'), 'utf8'))
  await vi.advanceTimersByTimeAsync(100)
  expect(overlay.classList.contains('leaving')).toBe(false)
  expect(document.getElementById('root')!.hidden).toBe(true)
  expect(document.getElementById('root')!.getAttribute('aria-hidden')).toBe('true')
  expect(shadow.getElementById('boot-status')!.textContent).toBe('Abrindo a Persona…')
  publish!({ code: 'boot_failed', message: 'Forced startup failure' })
  expect(shadow.querySelector<HTMLElement>('.error')!.hidden).toBe(false)
  const button = shadow.getElementById('boot-retry') as HTMLButtonElement
  expect(shadow.activeElement).toBe(button)
  button.click()
  expect(retry).toHaveBeenCalledOnce()
  document.getElementById('root')!.innerHTML = '<main data-persona-root="">Sua equipe</main>'
  await vi.advanceTimersByTimeAsync(100)
  expect(overlay.classList.contains('leaving')).toBe(true)
  expect(document.getElementById('root')!.hidden).toBe(false)
  expect(document.getElementById('root')!.hasAttribute('aria-hidden')).toBe(false)
  overlay.dispatchEvent(new Event('transitionend'))
  expect(overlay.isConnected).toBe(false)
})

import { createHash } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import {
  TEACH_PILL_HOST, TEACH_PILL_SIZE, createTeachPill, parseTeachPillAction, teachPillCopy, teachPillDocumentUrl, teachPillHref,
  teachPillHtml, teachPillMessages, teachPillScriptHash, type TeachPillAction, type TeachPillWindow,
} from '../src/teach-pill.ts'

describe('pill action links', () => {
  it('round-trips the three actions', () => {
    for (const action of ['pause', 'resume', 'stop'] as const) {
      expect(parseTeachPillAction(teachPillHref(action))).toBe(action)
    }
    expect(teachPillHref('stop')).toBe(`https://${TEACH_PILL_HOST}/stop`)
  })

  it.each([
    'https://teach-action.persona.invalid/',
    'https://teach-action.persona.invalid/start',
    'https://teach-action.persona.invalid/pause/',
    'https://teach-action.persona.invalid/Pause',
    'https://teach-action.persona.invalid/pause?x=1',
    'https://teach-action.persona.invalid/pause#x',
    'https://teach-action.persona.invalid:8443/pause',
    'https://user:pw@teach-action.persona.invalid/pause',
    'http://teach-action.persona.invalid/pause',
    'https://teach-action.persona.invalid.evil.example/pause',
    'https://evil.example/pause',
    'https://example.com/',
    'javascript:alert(1)',
    'persona://task/t-1',
    'data:text/html,<p>x</p>',
    '/pause',
    '',
    'not a url',
  ])('refuses %j', (url) => {
    expect(parseTeachPillAction(url)).toBeUndefined()
  })
})

describe('pill document', () => {
  const scriptOf = (html: string): string => /<script>([\s\S]*?)<\/script>/u.exec(html)![1]!

  it('has a CSP whose script hash is the hash of the one inline script it carries', () => {
    const html = teachPillHtml({ phase: 'recording', elapsedMs: 0 }, teachPillMessages.pt, 1000)
    const hash = `sha256-${createHash('sha256').update(scriptOf(html)).digest('base64')}`
    expect(hash).toBe(teachPillScriptHash())
    expect(html).toContain(`script-src '${hash}'`)
    expect(html).toContain("default-src 'none'")
    expect(html.match(/<script/gu)).toHaveLength(1)
  })

  it('reaches nothing outside the three action links and takes no frame pixels', () => {
    const html = teachPillHtml({ phase: 'paused', elapsedMs: 5000 }, teachPillMessages.en, 1000)
    const urls = [...html.matchAll(/https?:\/\/[^"'\s<>]+/gu)].map(match => match[0])
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(parseTeachPillAction(url)).toBeDefined()
    expect(html).not.toMatch(/data:image|<img|<iframe|src=|url\(/u)
  })

  it('offers Pausar while recording and Retomar while paused, always Parar, in the app language', () => {
    const recording = teachPillHtml({ phase: 'recording', elapsedMs: 0 }, teachPillCopy('pt'), 0)
    expect(recording).toContain('>Pausar<')
    expect(recording).toContain('>Parar<')
    expect(recording).toContain('/pause"')
    expect(recording).not.toContain('/resume"')
    const paused = teachPillHtml({ phase: 'paused', elapsedMs: 0 }, teachPillCopy('pt'), 0)
    expect(paused).toContain('>Retomar<')
    expect(paused).toContain('/resume"')
    expect(paused).not.toContain('/pause"')
    const english = teachPillHtml({ phase: 'recording', elapsedMs: 0 }, teachPillCopy('en'), 0)
    expect(english).toContain('>Pause<')
    expect(english).toContain('>Stop<')
    expect(teachPillCopy('zh')).toBe(teachPillMessages.en)
    expect(teachPillCopy(undefined)).toBe(teachPillMessages.en)
  })

  it('tells the person the bar is not in the recording', () => {
    expect(teachPillHtml({ phase: 'recording', elapsedMs: 0 }, teachPillMessages.pt, 0)).toContain('Esta barra não aparece na gravação')
  })

  it('escapes the phase and sanitizes the elapsed time', () => {
    const html = teachPillHtml({ phase: '"><img src=x>' as never, elapsedMs: Number.NaN }, teachPillMessages.en, 5.7)
    expect(html).not.toContain('<img')
    expect(html).toContain('data-elapsed="0"')
    expect(html).toContain('data-base="5"')
    expect(teachPillHtml({ phase: 'recording', elapsedMs: -9 }, teachPillMessages.en, 0)).toContain('data-elapsed="0"')
    expect(teachPillHtml({ phase: 'recording', elapsedMs: 1999.9 }, teachPillMessages.en, 0)).toContain('data-elapsed="1999"')
  })

  it('serves the document as a data: URL', () => {
    expect(teachPillDocumentUrl({ phase: 'recording', elapsedMs: 0 }, teachPillMessages.en, 0)).toMatch(/^data:text\/html;charset=utf-8,/u)
  })

  describe('the inline clock', () => {
    function run(data: { phase: string; base: number; elapsed: number }, now: number) {
      const label = { textContent: '' }
      const ticks: number[] = []
      runInNewContext(scriptOf(teachPillHtml({ phase: 'recording', elapsedMs: 0 }, teachPillMessages.en, 0)), {
        document: {
          body: { dataset: { phase: data.phase, base: String(data.base), elapsed: String(data.elapsed) } },
          getElementById: () => label,
        },
        Date: { now: () => now },
        Number, Math,
        setInterval: (_fn: () => void, ms: number) => ticks.push(ms),
      })
      return { text: label.textContent, ticks }
    }

    it('keeps counting from the elapsed time it was given while recording', () => {
      expect(run({ phase: 'recording', base: 1_000, elapsed: 65_000 }, 3_000)).toEqual({ text: '01:07', ticks: [500] })
      expect(run({ phase: 'recording', base: 0, elapsed: 0 }, 0).text).toBe('00:00')
      expect(run({ phase: 'recording', base: 0, elapsed: 599_000 }, 1_999).text).toBe('10:00')
    })

    it('freezes while paused and never schedules a tick', () => {
      expect(run({ phase: 'paused', base: 1_000, elapsed: 65_000 }, 999_999)).toEqual({ text: '01:05', ticks: [] })
    })
  })
})

function fakeWindow() {
  const calls: string[] = []
  const navigate: Array<(event: { preventDefault(): void }, url: string) => void> = []
  let openHandler: (() => { action: 'deny' }) | undefined
  let destroyed = false
  const window: TeachPillWindow = {
    loadURL: (url) => { calls.push(`load:${url.slice(0, 20)}`) },
    setContentProtection: (enable) => { calls.push(`protect:${String(enable)}`) },
    setAlwaysOnTop: (flag, level) => { calls.push(`top:${String(flag)}:${String(level)}`) },
    setPosition: (x, y) => { calls.push(`pos:${String(x)},${String(y)}`) },
    showInactive: () => { calls.push('showInactive') },
    close: () => { destroyed = true; calls.push('close') },
    isDestroyed: () => destroyed,
    webContents: {
      on: (_event, listener) => { navigate.push(listener) },
      setWindowOpenHandler: (handler) => { openHandler = handler },
    },
  }
  return { window, calls, navigate, openHandler: () => openHandler, destroy: () => { destroyed = true } }
}

function pillWith(workArea = { x: 0, y: 0, width: 1920, height: 1040 }) {
  const fakes: Array<ReturnType<typeof fakeWindow>> = []
  const actions: TeachPillAction[] = []
  const sizes: Array<{ width: number; height: number }> = []
  const pill = createTeachPill({
    createWindow: (size) => { sizes.push(size); const fake = fakeWindow(); fakes.push(fake); return fake.window },
    workArea: () => workArea,
    localeId: () => 'pt',
    now: () => 10_000,
    onAction: (action) => { actions.push(action) },
  })
  return { pill, fakes, actions, sizes }
}

describe('createTeachPill', () => {
  it('opens a content-protected, always-on-top, inactive window at the top centre of the work area', () => {
    const { pill, fakes, sizes } = pillWith({ x: 100, y: 40, width: 1920, height: 1040 })
    pill.show({ phase: 'recording', elapsedMs: 0 })
    expect(sizes).toEqual([{ ...TEACH_PILL_SIZE }])
    expect(fakes[0]?.calls).toEqual([
      'protect:true',
      'top:true:screen-saver',
      `pos:${String(100 + (1920 - TEACH_PILL_SIZE.width) / 2)},52`,
      expect.stringMatching(/^load:data:text\/html/u),
      'showInactive',
    ])
    expect(pill.visible).toBe(true)
  })

  it('reuses the window, and reloads the page only when the phase changes', () => {
    const { pill, fakes } = pillWith()
    pill.show({ phase: 'recording', elapsedMs: 0 })
    pill.update({ phase: 'recording', elapsedMs: 5000 })
    pill.update({ phase: 'recording', elapsedMs: 6000 })
    expect(fakes).toHaveLength(1)
    expect(fakes[0]?.calls.filter(call => call.startsWith('load:'))).toHaveLength(1)
    pill.update({ phase: 'paused', elapsedMs: 6000 })
    expect(fakes[0]?.calls.filter(call => call.startsWith('load:'))).toHaveLength(2)
    pill.show({ phase: 'recording', elapsedMs: 7000 })
    expect(fakes).toHaveLength(1)
    expect(fakes[0]?.calls.filter(call => call.startsWith('load:'))).toHaveLength(3)
  })

  it('runs an action link and cancels the navigation; every other navigation is cancelled and ignored', () => {
    const { pill, fakes, actions } = pillWith()
    pill.show({ phase: 'recording', elapsedMs: 0 })
    const navigate = fakes[0]!.navigate[0]!
    const urls = [teachPillHref('pause'), teachPillHref('stop'), 'https://example.com/', 'javascript:alert(1)', 'https://teach-action.persona.invalid/x']
    const prevented: boolean[] = []
    for (const url of urls) navigate({ preventDefault: () => { prevented.push(true) } }, url)
    expect(prevented).toHaveLength(urls.length)
    expect(actions).toEqual(['pause', 'stop'])
  })

  it('refuses to open new windows', () => {
    const { pill, fakes } = pillWith()
    pill.show({ phase: 'recording', elapsedMs: 0 })
    expect(fakes[0]?.openHandler()?.()).toEqual({ action: 'deny' })
  })

  it('hides by closing, is safe to hide twice, and opens a fresh window next time', () => {
    const { pill, fakes } = pillWith()
    pill.show({ phase: 'recording', elapsedMs: 0 })
    pill.hide()
    pill.hide()
    expect(fakes[0]?.calls.filter(call => call === 'close')).toHaveLength(1)
    expect(pill.visible).toBe(false)
    pill.update({ phase: 'paused', elapsedMs: 0 })
    expect(fakes).toHaveLength(1)
    pill.show({ phase: 'recording', elapsedMs: 0 })
    expect(fakes).toHaveLength(2)
  })

  it('survives a window the system already destroyed', () => {
    const { pill, fakes } = pillWith()
    pill.show({ phase: 'recording', elapsedMs: 0 })
    fakes[0]!.destroy()
    expect(pill.visible).toBe(false)
    expect(() => { pill.update({ phase: 'paused', elapsedMs: 0 }); pill.hide() }).not.toThrow()
    pill.show({ phase: 'recording', elapsedMs: 0 })
    expect(fakes).toHaveLength(2)
  })

  it('shows the app language', () => {
    const urls: string[] = []
    const window = fakeWindow()
    window.window.loadURL = (url) => { urls.push(decodeURIComponent(url)) }
    createTeachPill({
      createWindow: () => window.window, workArea: () => ({ x: 0, y: 0, width: 800, height: 600 }), localeId: () => 'pt', onAction: vi.fn(),
    }).show({ phase: 'recording', elapsedMs: 0 })
    expect(urls[0]).toContain('Pausar')
  })
})

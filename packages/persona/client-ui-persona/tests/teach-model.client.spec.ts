// @vitest-environment jsdom
// W2-10: modelo puro da revisão do "Ensinar" e o gravador do renderer (ponte do desktop, exemplo e detecção).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TEACH_MAX_STEPS,
  addStep,
  blankStepCount,
  canSaveCandidate,
  moveStep,
  removeStep,
  stepsFromDraft,
  stepsToWire,
  teachFailureKind,
  thumbnailSrc,
  updateStep,
} from '../src/client/teach/teach-model.ts'
import {
  TEACH_CONSENT,
  createDesktopRecorder,
  createSyntheticRecorder,
  detectTeachRecorder,
  parseTeachSources,
  parseTeachStop,
  type TeachBridge,
} from '../src/client/teach/teach-recorder.ts'
import { clearTeachHandoff, setTeachHandoff, takeTeachHandoff } from '../src/client/teach/teach-handoff.ts'

afterEach(() => {
  clearTeachHandoff()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('review model', () => {
  it('sorts the host draft by order and carries the optional fields', () => {
    const rows = stepsFromDraft([
      { order: 2, instruction: 'Conferir o valor', verifyHint: 'Valor igual ao pedido' },
      { order: 1, instruction: 'Abrir o pedido', thumbnailAssetId: 'file:///a.png' },
    ])
    expect(rows.map(row => row.instruction)).toEqual(['Abrir o pedido', 'Conferir o valor'])
    expect(rows[0]?.thumbnailRef).toBe('file:///a.png')
    expect(rows[1]?.verifyHint).toBe('Valor igual ao pedido')
    expect(new Set(rows.map(row => row.key)).size).toBe(2)
  })

  it('saves trimmed, drops blank steps, renumbers 1..n and omits empty optional keys', () => {
    let rows = stepsFromDraft([{ order: 1, instruction: '  Abrir  ' }, { order: 2, instruction: 'Aprovar', verifyHint: ' ok ' }])
    rows = addStep(rows) // blank on purpose
    rows = updateStep(rows, rows[0]!.key, { instruction: '  Abrir o pedido  ' })
    expect(blankStepCount(rows)).toBe(1)
    expect(stepsToWire(rows)).toEqual([
      { order: 1, instruction: 'Abrir o pedido' },
      { order: 2, instruction: 'Aprovar', verifyHint: 'ok' },
    ])
  })

  it('reorders without losing text and ignores moves past the ends', () => {
    const rows = stepsFromDraft([{ order: 1, instruction: 'A' }, { order: 2, instruction: 'B' }, { order: 3, instruction: 'C' }])
    const down = moveStep(rows, rows[0]!.key, 1)
    expect(down.map(row => row.instruction)).toEqual(['B', 'A', 'C'])
    expect(moveStep(down, down[2]!.key, 1)).toBe(down)
    expect(moveStep(down, down[0]!.key, -1)).toBe(down)
    expect(removeStep(down, down[1]!.key).map(row => row.instruction)).toEqual(['B', 'C'])
  })

  it('a candidate needs at least one step with words, and the list has a ceiling', () => {
    expect(canSaveCandidate([])).toBe(false)
    expect(canSaveCandidate(addStep([]))).toBe(false)
    expect(canSaveCandidate(stepsFromDraft([{ order: 1, instruction: 'Fazer' }]))).toBe(true)
    let rows = stepsFromDraft([])
    for (let i = 0; i < TEACH_MAX_STEPS + 5; i += 1) rows = addStep(rows)
    expect(rows).toHaveLength(TEACH_MAX_STEPS)
  })

  it('only shows images the page can load; a redacted frame has no thumbnail', () => {
    expect(thumbnailSrc('file:///C:/p/teach-frame-000.png')).toBe('file:///C:/p/teach-frame-000.png')
    expect(thumbnailSrc('data:image/svg+xml;charset=utf-8,x')).toBeDefined()
    expect(thumbnailSrc('redacted')).toBeUndefined()
    expect(thumbnailSrc('')).toBeUndefined()
    expect(thumbnailSrc('C:\\p\\a.png')).toBeUndefined()
  })

  it('maps host errors to what the person can act on', () => {
    expect(teachFailureKind(new Error('ACCESS_ESCALATION: tool'))).toBe('tools')
    expect(teachFailureKind({ code: 'forbidden' })).toBe('forbidden')
    expect(teachFailureKind(new Error('not-found'))).toBe('notFound')
    expect(teachFailureKind(new Error('boom'))).toBe('generic')
  })
})

describe('desktop bridge parsing', () => {
  it('keeps only well-formed sources and frames', () => {
    expect(parseTeachSources([{ id: 's1', name: 'Tela 1', kind: 'screen' }, { id: 'w1', name: 'Planilha', kind: 'window' }, { id: '', name: 'x' }, 7, null]))
      .toEqual([{ id: 's1', name: 'Tela 1', kind: 'screen' }, { id: 'w1', name: 'Planilha', kind: 'window' }])
    expect(parseTeachSources('nope')).toEqual([])
    expect(parseTeachStop({ frames: [{ atMs: 10, imageRef: 'file:///a.png', changeScore: 0.5 }, { atMs: 'x' }], transcript: 'oi' }))
      .toEqual({ frames: [{ atMs: 10, imageRef: 'file:///a.png', changeScore: 0.5 }], transcript: 'oi' })
    expect(parseTeachStop(undefined)).toEqual({ frames: [], transcript: '' })
  })
})

function fakeBridge(): TeachBridge & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    listSources: async () => [{ id: 's1', name: 'Tela 1', kind: 'screen' }],
    start: async (sourceId, microphone, consent) => { calls.push(`start:${sourceId}:${String(microphone)}:${JSON.stringify(consent)}`) },
    pause: async () => { calls.push('pause') },
    resume: async () => { calls.push('resume') },
    ingestFrame: async (png) => { calls.push(`frame:${png}`); return true },
    stop: async (typed) => { calls.push(`stop:${JSON.stringify(typed)}`); return { frames: [{ atMs: 1, imageRef: 'file:///f.png', changeScore: 1 }], transcript: 'texto' } },
  }
}

describe('desktop recorder', () => {
  it('opens the stream, samples frames one at a time, never while paused, and stops the stream', async () => {
    vi.useFakeTimers()
    const bridge = fakeBridge()
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track] }
    let handler: (() => void) | undefined
    const recorder = createDesktopRecorder(bridge, {
      openStream: async () => stream,
      grabFrame: () => 'PNG',
      setInterval: (fn) => { handler = fn; return 1 },
      clearInterval: vi.fn(),
    })
    await recorder.start('s1', false)
    expect(bridge.calls[0]).toBe(`start:s1:false:${JSON.stringify(TEACH_CONSENT)}`)
    handler?.()
    await Promise.resolve()
    expect(bridge.calls).toContain('frame:PNG')
    await recorder.pause()
    const before = bridge.calls.length
    handler?.()
    await Promise.resolve()
    expect(bridge.calls.length).toBe(before + 0) // paused: no new frame
    await recorder.resume()
    const result = await recorder.stop({ typed: 'o que fiz', discardImages: false })
    expect(track.stop).toHaveBeenCalled()
    expect(result.transcript).toBe('texto')
    expect(bridge.calls.at(-1)).toBe('stop:"o que fiz"')
    vi.useRealTimers()
  })

  it('a refused start closes the screen stream instead of leaving it open', async () => {
    const bridge = { ...fakeBridge(), start: async () => { throw new Error('consent') } }
    const track = { stop: vi.fn() }
    const recorder = createDesktopRecorder(bridge, {
      openStream: async () => ({ getTracks: () => [track] }),
      grabFrame: () => null,
      setInterval: () => 1,
      clearInterval: () => {},
    })
    await expect(recorder.start('s1', false)).rejects.toThrow('consent')
    expect(track.stop).toHaveBeenCalledTimes(1)
  })

  it('"não guardar as imagens" asks the desktop to redact', async () => {
    const bridge = fakeBridge()
    const recorder = createDesktopRecorder(bridge, {
      openStream: async () => ({ getTracks: () => [] }),
      grabFrame: () => null,
      setInterval: () => 1,
      clearInterval: () => {},
    })
    await recorder.start('s1', false)
    await recorder.stop({ typed: 'x', discardImages: true })
    expect(bridge.calls.at(-1)).toBe(`stop:${JSON.stringify({ typed: 'x', redact: true })}`)
  })
})

describe('detection and the example recorder', () => {
  it('plain browser without the example flag: nothing to record with', () => {
    expect(detectTeachRecorder()).toBeNull()
  })

  it('the example recorder (dev flag) lists pretend sources, returns 4 frames and records nothing', async () => {
    localStorage.setItem('persona.teach.synthetic', '1')
    const recorder = detectTeachRecorder()
    expect(recorder?.kind).toBe('synthetic')
    expect((await recorder?.listSources())?.map(row => row.kind)).toEqual(['screen', 'window'])
    const kept = await createSyntheticRecorder().stop({ typed: 'conto', discardImages: false })
    expect(kept.frames).toHaveLength(4)
    expect(kept.transcript).toBe('conto')
    expect(kept.frames.every(frame => frame.imageRef.startsWith('data:image/svg+xml'))).toBe(true)
    const redacted = await createSyntheticRecorder().stop({ typed: '', discardImages: true })
    expect(redacted.frames.every(frame => frame.imageRef === 'redacted')).toBe(true)
  })

  it('the handoff slot is taken exactly once', () => {
    const recorder = createSyntheticRecorder()
    setTeachHandoff({ recorder, sourceId: 'synthetic:screen' })
    expect(takeTeachHandoff()?.sourceId).toBe('synthetic:screen')
    expect(takeTeachHandoff()).toBeNull()
  })
})

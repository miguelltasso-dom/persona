import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyTeachRetention,
  createTeachSession,
  detectWhisperCpp,
  isKeyframe,
  projectTeachFrames,
  redactProjectedFrames,
  blurTeachPixels,
  measureTeachSpike,
  redactTeachArtifacts,
  teachClockView,
  teachConsentOk,
  teachDraftStatus,
  teachOverlayDocumentUrl,
  teachOverlayHtml,
  teachPublicPublishOk,
  teachTranscript,
} from '../src/teach-capture.ts'

describe('teach capture spike', () => {
  it('records, pauses, samples changed frames, and writes a private artifact', () => {
    let t = 1_000
    const writes: Array<[string, number]> = []
    const session = createTeachSession({
      now: () => t,
      write: (path, bytes) => { writes.push([path, bytes.length]) },
      mkdir: () => undefined,
      listSources: async () => [{ id: 'screen:0', name: 'Tela 1', kind: 'screen' }],
    })
    session.start('screen:0', true)
    expect(session.state().elapsedMs).toBe(0)
    expect(session.ingestFrame(Buffer.from('frame-a'))).toBe(true)
    t += 200
    expect(session.state().elapsedMs).toBe(200)
    expect(session.ingestFrame(Buffer.from('frame-a'))).toBe(false)
    t += 200
    expect(session.ingestFrame(Buffer.from('frame-b-changed'))).toBe(true)
    session.pause()
    t += 5_000
    expect(session.ingestFrame(Buffer.from('frame-c'))).toBe(false)
    session.resume()
    t += 200
    expect(session.ingestFrame(Buffer.from('frame-c'))).toBe(true)
    const stopped = session.stop('C:/persona/teach', Buffer.from('webm'))
    expect(stopped.frames).toHaveLength(3)
    expect(writes[0]?.[0]).toMatch(/teach-1000\.webm$/u)
    expect(session.state().phase).toBe('stopped')
    expect(session.state().mic).toBe(true)
  })

  it('prefers whisper text then typed, and retains only teach-* files', () => {
    expect(teachTranscript({ whisperText: ' clique em salvar ', typed: 'ignore' })).toBe('clique em salvar')
    expect(teachTranscript({ typed: '  o botão âmbar  ' })).toBe('o botão âmbar')
    expect(isKeyframe(undefined, Buffer.from('x'))).toBe(true)
    const dir = mkdtempSync(join(tmpdir(), 'persona-teach-'))
    const fresh = join(dir, 'teach-fresh.webm')
    const stale = join(dir, 'teach-stale.webm')
    const other = join(dir, 'notes.txt')
    writeFileSync(fresh, 'a')
    writeFileSync(stale, 'b')
    writeFileSync(other, 'c')
    const now = Date.now()
    const removed = applyTeachRetention(dir, 60_000, () => now + 120_000)
    expect(removed).toBe(2)
    expect(detectWhisperCpp({ PERSONA_WHISPER_CPP: '' })).toBeUndefined()
  })

  it('projects keyframes as atMs/imageRef/changeScore for the host draft', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-teach-frames-'))
    const writes: string[] = []
    const projected = projectTeachFrames(dir, [
      { atMs: 0, png: Buffer.from('frame-a') },
      { atMs: 400, png: Buffer.from('frame-b-changed') },
    ], (path, bytes) => { writes.push(path); writeFileSync(path, bytes) })
    expect(projected).toHaveLength(2)
    expect(projected[0]?.atMs).toBe(0)
    expect(projected[0]?.changeScore).toBe(1)
    expect(projected[0]?.imageRef).toMatch(/^file:/u)
    expect(projected[1]?.atMs).toBe(400)
    expect(projected[1]?.changeScore).toBeGreaterThan(0)
    expect(writes[0]).toMatch(/teach-frame-000\.png$/u)
  })

  it('redacts projected frames and deletes teach-frame PNGs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-teach-redact-'))
    const projected = projectTeachFrames(dir, [{ atMs: 10, png: Buffer.from('secret') }])
    expect(projected[0]?.imageRef).toMatch(/^file:/u)
    redactTeachArtifacts(dir)
    expect(existsSync(join(dir, 'teach-frame-000.png'))).toBe(false)
    expect(redactProjectedFrames(projected)).toEqual([{
      atMs: 10,
      imageRef: 'redacted',
      changeScore: 1,
    }])
    const rgba = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    const blurred = blurTeachPixels(rgba, 2, 2, { x: 1, y: 0, width: 1, height: 1 })
    expect([...blurred.subarray(4, 8)]).toEqual([0, 0, 0, 0])
    expect([...blurred.subarray(0, 4)]).toEqual([1, 2, 3, 4])
    expect(teachDraftStatus()).toBe('candidate')
    expect(teachPublicPublishOk('dm', true)).toBe(false)
    expect(teachPublicPublishOk('project', true)).toBe(false)
    expect(teachPublicPublishOk('public', false)).toBe(false)
    expect(teachPublicPublishOk('public', true)).toBe(true)
    expect(teachConsentOk({ accepted: true, storesLocally: true, notUploaded: true, avoidPasswords: true })).toBe(true)
    expect(teachConsentOk({ accepted: true })).toBe(false)
    expect(measureTeachSpike({
      frames: 3,
      bytes: 1_024,
      startedAt: 1_000,
      stoppedAt: 1_008,
    })).toEqual({ frames: 3, bytes: 1_024, ms: 8, whisper: 'no-go' })
    expect(teachClockView({
      phase: 'recording',
      mic: true,
      pausedMs: 0,
      frames: [],
      blurRects: [],
      elapsedMs: 8,
    })).toEqual({ phase: 'recording', elapsedMs: 8, mic: true, frameCount: 0, blurCount: 0 })
    const session = createTeachSession({ now: () => 1_000, write: () => undefined, mkdir: () => undefined })
    session.start('screen:0', false)
    expect(session.addBlur({ x: 1, y: 2, width: 3, height: 4 })).toBe(true)
    expect(session.state().blurRects).toEqual([{ x: 1, y: 2, width: 3, height: 4 }])
    const chrome = teachOverlayHtml({
      phase: 'recording', elapsedMs: 8_000, mic: true, frameCount: 2, blurCount: 1,
    })
    expect(chrome).toContain('00:08')
    expect(chrome).toContain('1 borrões')
    expect(chrome).toContain('Pausar')
    expect(chrome).toContain('Parar')
    expect(chrome).toContain('Evite senhas')
    expect(chrome).not.toMatch(/data:image|imageRef|\.png/u)
    expect(teachOverlayDocumentUrl({
      phase: 'recording', elapsedMs: 8_000, mic: true, frameCount: 2, blurCount: 1,
    })).toMatch(/^data:text\/html/u)
  })
})

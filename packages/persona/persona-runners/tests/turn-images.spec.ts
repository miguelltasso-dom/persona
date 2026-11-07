/**
 * TEAM-5: images travel with a turn so the persona really sees them. The check (count, size, type, readable, engine reads images) happens
 * BEFORE a session is opened and refuses the whole turn in human words; what passes goes to OAR as its native image input, never in the
 * prompt text, and is not sticky. The same transport is proven on the real CLI by scripts/team5-image-dry.ts (reports/team5-image-dry.json).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Runtime } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { createClaudeRunner, createCodexRunner, ImagesRefusedError, MAX_IMAGE_BYTES, MAX_TURN_IMAGES, checkTurnImages, type RunEvent, type StartTurnInput } from '../src/index.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function files(): string {
  const dir = mkdtempSync(join(tmpdir(), 'team5-spec-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'a.png'), Buffer.from([1, 2, 3]))
  writeFileSync(join(dir, 'b.JPG'), Buffer.from([4, 5]))
  writeFileSync(join(dir, 'c.webp'), Buffer.from([6]))
  writeFileSync(join(dir, 'note.txt'), 'x')
  return dir
}

const fixed = (size: number, isFile = true) => () => ({ size, isFile })

describe('checkTurnImages: the whole turn is refused, never a partial list', () => {
  it('accepts png/jpg/jpeg/gif/webp, takes the type from the extension, keeps the order', () => {
    const ready = checkTurnImages([{ path: '/x/a.png' }, { path: '/x/b.JPG' }, { path: '/x/c.webp' }, { path: '/x/d.gif' }, { path: '/x/e.jpeg', mediaType: 'image/jpeg' }].slice(0, MAX_TURN_IMAGES), true, fixed(10))
    expect(ready.map(row => row.mediaType)).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    expect(ready.map(row => row.path)).toEqual(['/x/a.png', '/x/b.JPG', '/x/c.webp', '/x/d.gif'])
  })

  const reason = (run: () => unknown): string | undefined => {
    try { run() } catch (error) { return error instanceof ImagesRefusedError ? error.reason : `other:${String(error)}` }
    return undefined
  }

  it('refuses, with the reason, an engine that does not read images / too many / too big / not an image / unreadable', () => {
    expect(reason(() => checkTurnImages([{ path: '/x/a.png' }], false, fixed(1)))).toBe('engine')
    expect(reason(() => checkTurnImages(Array.from({ length: MAX_TURN_IMAGES + 1 }, () => ({ path: '/x/a.png' })), true, fixed(1)))).toBe('count')
    expect(reason(() => checkTurnImages([{ path: '/x/a.png' }, { path: '/x/b.png' }], true, path => ({ size: path.endsWith('b.png') ? MAX_IMAGE_BYTES + 1 : 1, isFile: true })))).toBe('size')
    expect(reason(() => checkTurnImages([{ path: '/x/note.txt' }], true, fixed(1)))).toBe('type')
    expect(reason(() => checkTurnImages([{ path: '/x/a.png', mediaType: 'image/jpeg' }], true, fixed(1)))).toBe('type')
    expect(reason(() => checkTurnImages([{ path: '/x/a.png', mediaType: 'application/pdf' }], true, fixed(1)))).toBe('type')
    expect(reason(() => checkTurnImages([{ path: '/x/a.png' }], true, () => { throw new Error('ENOENT') }))).toBe('unreadable')
    expect(reason(() => checkTurnImages([{ path: '/x/dir.png' }], true, fixed(0, false)))).toBe('unreadable')
  })

  it('exactly at the limits is fine', () => {
    expect(checkTurnImages(Array.from({ length: MAX_TURN_IMAGES }, () => ({ path: '/x/a.png' })), true, fixed(MAX_IMAGE_BYTES))).toHaveLength(MAX_TURN_IMAGES)
  })

  it('the message is for the person: pt-BR, no path, no internals', () => {
    for (const code of ['engine', 'count', 'size', 'type', 'unreadable'] as const) {
      const message = new ImagesRefusedError(code).message
      expect(message).toMatch(/[a-zãéç]/u)
      expect(message).not.toMatch(/[/\\]|prompt|tool|stderr|\.ts\b/iu)
    }
  })
})

interface Seen { opened: number; prompts: unknown[] }

/** A scripted runtime whose session says whether it reads images, and records the options each prompt is sent with. */
function runtimeWith(reads: boolean, seen: Seen): Runtime {
  const base = scriptedRuntime({ id: 'fake-cli', turn: (turn) => { turn.say('ok') } })
  const openOriginal = base.session.bind(base)
  return Object.assign(base, {
    session: async (installation: unknown, options: unknown) => {
      seen.opened += 1
      const session = await openOriginal(installation as never, options as never)
      return new Proxy(session, {
        get(target, key) {
          if (key === 'capabilities') return { ...target.capabilities, images: reads }
          if (key === 'prompt') return (text: string, promptOptions?: unknown) => { seen.prompts.push(promptOptions); return target.prompt(text) }
          const value: unknown = Reflect.get(target, key)
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
        },
      })
    },
  }) as unknown as Runtime
}

const input = (extra: Partial<StartTurnInput> = {}): StartTurnInput => ({
  ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd: 'C:/tmp/c', prompt: 'Dê sua opinião', model: 'haiku', permissionMode: 'deny', ...extra,
})

async function drain(runner: ReturnType<typeof createClaudeRunner>, handle: Awaited<ReturnType<ReturnType<typeof createClaudeRunner>['start']>>): Promise<RunEvent[]> {
  const events: RunEvent[] = []
  for await (const event of runner.stream(handle)) events.push(event)
  return events
}

describe('the Claude runner sends the images as OAR image input', () => {
  it('hands OAR the path and type (never the bytes, never prose), in order, and a turn without images sends no options at all', async () => {
    const dir = files()
    const seen: Seen = { opened: 0, prompts: [] }
    const runner = createClaudeRunner({ runtime: runtimeWith(true, seen) })
    const first = await runner.start(input({ images: [{ path: join(dir, 'a.png') }, { path: join(dir, 'b.JPG') }] }))
    await drain(runner, first)
    expect(seen.prompts[0]).toEqual({ images: [{ path: join(dir, 'a.png'), mediaType: 'image/png' }, { path: join(dir, 'b.JPG'), mediaType: 'image/jpeg' }] })
    // not sticky: the next turn carries only its own
    const second = await runner.start(input({ assignmentId: 'b' }))
    await drain(runner, second)
    expect(seen.prompts[1]).toBeUndefined()
    await runner.dispose?.()
  })

  it('refuses before opening any session when the files are bad; the engine is never asked', async () => {
    const dir = files()
    const seen: Seen = { opened: 0, prompts: [] }
    const runner = createClaudeRunner({ runtime: runtimeWith(true, seen) })
    await expect(runner.start(input({ images: [{ path: join(dir, 'note.txt') }] }))).rejects.toMatchObject({ code: 'images_refused', reason: 'type' })
    await expect(runner.start(input({ images: [{ path: join(dir, 'missing.png') }] }))).rejects.toMatchObject({ reason: 'unreadable' })
    expect(seen.opened).toBe(0)
    expect(seen.prompts).toHaveLength(0)
  })

  it('a session that says it cannot read images is refused honestly instead of answering about an image it never saw', async () => {
    const dir = files()
    const seen: Seen = { opened: 0, prompts: [] }
    const runner = createClaudeRunner({ runtime: runtimeWith(false, seen) })
    await expect(runner.start(input({ images: [{ path: join(dir, 'a.png') }] }))).rejects.toMatchObject({ code: 'images_refused', reason: 'engine' })
    expect(seen.prompts).toHaveLength(0)
    await runner.dispose?.()
  })

  it('an empty list is the same as no images', async () => {
    const seen: Seen = { opened: 0, prompts: [] }
    const runner = createClaudeRunner({ runtime: runtimeWith(true, seen) })
    await drain(runner, await runner.start(input({ images: [] })))
    expect(seen.prompts[0]).toBeUndefined()
    await runner.dispose?.()
  })
})

describe('engines not proven to read images say so up front', () => {
  it('Codex advertises no image input and refuses the turn without opening a session', async () => {
    const dir = files()
    const seen: Seen = { opened: 0, prompts: [] }
    const runner = createCodexRunner({ runtime: runtimeWith(true, seen) })
    expect(runner.capabilities().images).not.toBe('available')
    await expect(runner.start(input({ images: [{ path: join(dir, 'a.png') }] }))).rejects.toMatchObject({ code: 'images_refused', reason: 'engine' })
    expect(seen.opened).toBe(0)
  })

  it('Claude advertises it', () => {
    expect(createClaudeRunner({ runtime: runtimeWith(true, { opened: 0, prompts: [] }) }).capabilities().images).toBe('available')
  })
})

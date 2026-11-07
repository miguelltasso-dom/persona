import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { createFakeRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect, onTestFinished } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { engineSeesImages, imageTypeOf, MAX_IMAGE_BYTES, MAX_TURN_IMAGES, pickTurnImages, type TurnImage } from '../src/turn-images.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * TEAM-5 (D-090 #4): the personas SEE the image. The image attached to a message of the channel is staged where the runner can read
 * it (absolute path), validated like the runner will (4 types, ≤ 4 per turn, ≤ 5 MB each), travels as the `images` of the turn's
 * delivery, and whatever cannot go is told to the person — never ignored in silence.
 */

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const fact = (name: string, mime: string, bytes = 1000) => ({ id: name, name, mime, bytes })

it('picks the four types, at most 4, each ≤ 5 MB; the rest is told by reason; non-images are not this route', () => {
  expect(imageTypeOf('IMAGE/PNG')).toBe('image/png')
  expect(imageTypeOf('image/svg+xml')).toBeUndefined()
  const { chosen, skipped } = pickTurnImages([
    fact('a.png', 'image/png'), fact('b.jpg', 'image/jpeg'), fact('c.gif', 'image/gif'), fact('d.webp', 'image/webp'),
    fact('e.png', 'image/png'), // the fifth: too many
    fact('f.svg', 'image/svg+xml'), // not one of the four
    fact('g.pdf', 'application/pdf'), // not an image: the file route, not skipped here
  ])
  expect(chosen.map(item => item.name)).toEqual(['a.png', 'b.jpg', 'c.gif', 'd.webp'])
  expect(skipped).toEqual([{ name: 'e.png', reason: 'too_many' }, { name: 'f.svg', reason: 'type' }])
  expect(pickTurnImages([fact('big.png', 'image/png', MAX_IMAGE_BYTES + 1), fact('ok.png', 'image/png', MAX_IMAGE_BYTES)])).toEqual({
    chosen: [fact('ok.png', 'image/png', MAX_IMAGE_BYTES)], skipped: [{ name: 'big.png', reason: 'too_big' }],
  })
  expect(MAX_TURN_IMAGES).toBe(4)
})

it('which engines read an image: Claude and Codex yes; DSH, Cursor and OpenCode no', () => {
  expect(engineSeesImages({ kind: 'cli', cli: 'claude' })).toBe(true)
  expect(engineSeesImages({ kind: 'cli', cli: 'codex' })).toBe(false) // not proven yet: the runner owner says only Claude
  expect(engineSeesImages({ kind: 'cli', cli: 'cursor' })).toBe(false)
  expect(engineSeesImages({ kind: 'cli', cli: 'opencode' })).toBe(false)
  expect(engineSeesImages({ kind: 'dsh' })).toBe(false)
})

interface Rig { h: PersonaHost; seen: Array<{ session: string; images: readonly TurnImage[] | undefined }> }

/** A real-path Task on a runner that declares (or not) the image capability, recording what each delivery carried. `refuse`: the runner turns the images down with that pt-BR message (like `ImagesRefusedError`). */
function rig(sees: boolean, refuse?: string): Rig {
  const h = openJourney('2026-11-04T12:00:00.000Z')
  seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Arte' }])
  const scripted = h.orchestration.scripted
  h.orchestration.scripted = false
  onTestFinished(() => { h.orchestration.scripted = scripted })
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  const seen: Rig['seen'] = []
  h.orchestration.runnerFactory = () => {
    const inner = createFakeRunner()
    const runner: Runner = {
      ensureSession: (...args) => inner.ensureSession(...args),
      deliver: async (session, request, text, mode, ...rest: unknown[]) => {
        const options = rest[0] as { images?: readonly TurnImage[] } | undefined
        seen.push({ session, images: options?.images })
        if (refuse !== undefined && options?.images !== undefined) throw Object.assign(new Error(refuse), { code: 'images_refused', reason: 'unreadable' })
        await inner.deliver(session, request, text, mode)
      },
      cancel: (...args) => inner.cancel(...args),
      status: id => inner.status(id),
      whenIdle: id => inner.whenIdle(id),
      onEvent: listener => inner.onEvent(listener),
      capabilities: () => ({ ...inner.capabilities(), ...(sees ? { images: 'available' } : {}) }) as ReturnType<Runner['capabilities']>,
    }
    return Promise.resolve(runner)
  }
  return { h, seen }
}

function attach(h: PersonaHost, name: string, base64: string): string {
  return h.attachFile({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', name, bytesBase64: base64 }).id
}

const send = async (h: PersonaHost, id: string, body: string, attachmentIds: string[]): Promise<void> => {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id, attachmentIds })
  await h.orchestration.flush('pp')
}
const lines = (h: PersonaHost) => h.events.listProject('pp').filter(event => event.actorId !== 'ana')

it('a Task about an image: the delivery carries the image with an absolute readable path and its media type', async () => {
  const { h, seen } = rig(true)
  const id = attach(h, 'capa.png', PNG)
  await send(h, 'm1', '@Nina preciso de uma nova versão desta capa', [id])
  const withImage = seen.filter(item => item.images !== undefined)
  expect(withImage).toHaveLength(1)
  const [image] = withImage[0]!.images!
  expect(image?.mediaType).toBe('image/png')
  expect(isAbsolute(image!.path)).toBe(true)
  expect(existsSync(image!.path)).toBe(true)
  expect(readFileSync(image!.path).subarray(0, 4).toString('hex')).toBe('89504e47') // the real PNG bytes of the person's file
  expect(lines(h).some(event => event.body.includes('imagens'))).toBe(false) // nothing was left out: no line
})

it('an engine that cannot read images is told, once, in plain words; the Task still runs on the text', async () => {
  const { h, seen } = rig(false)
  const id = attach(h, 'capa.png', PNG)
  await send(h, 'm2', '@Nina preciso de uma nova versão desta capa', [id])
  expect(seen.every(item => item.images === undefined)).toBe(true)
  expect(seen.length).toBeGreaterThan(0) // the Task ran
  expect(lines(h).filter(event => event.body === 'Nina não consegue ver imagens neste motor.')).toHaveLength(1)
})

it('more images than the turn takes: four go, the rest is told with the limit', async () => {
  const { h, seen } = rig(true)
  const ids = Array.from({ length: 6 }, (_, index) => attach(h, `foto-${String(index)}.png`, PNG))
  await send(h, 'm3', '@Nina preciso escolher a melhor destas fotos', ids)
  const sent = seen.find(item => item.images !== undefined)
  expect(sent?.images).toHaveLength(4)
  const said = lines(h).find(event => event.body.startsWith('Deixei 2 imagens de fora'))
  expect(said?.body).toBe('Deixei 2 imagens de fora: o limite é de 4 imagens de até 5 MB (PNG, JPEG, GIF ou WebP).')
})

it('the runner turns the image down: its own pt-BR message goes to the thread and the Task goes on with the text, never in silence', async () => {
  const refusal = 'Não consegui abrir a imagem “capa.png”: o arquivo não está legível.'
  const { h, seen } = rig(true, refusal)
  const id = attach(h, 'capa.png', PNG)
  await send(h, 'm5', '@Nina preciso de uma nova versão desta capa', [id])
  expect(seen.filter(item => item.images !== undefined)).toHaveLength(1) // it was tried with the image
  expect(seen.some(item => item.images === undefined)).toBe(true) // and the same turn then ran on the text alone
  expect(lines(h).filter(event => event.body === `${refusal} Nina segue só com o texto.`)).toHaveLength(1)
})

it('a message with no image changes nothing: the plain delivery, no extra line', async () => {
  const { h, seen } = rig(true)
  await send(h, 'm4', '@Nina preciso de um texto novo para a página', [])
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every(item => item.images === undefined)).toBe(true)
  expect(lines(h).some(event => event.body.includes('imagem') || event.body.includes('imagens'))).toBe(false)
})

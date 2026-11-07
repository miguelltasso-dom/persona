/**
 * P0-C2 (Atlas 07/11: o time opina sobre as IMAGENS): `ask_team_opinion` takes `draft.files`, the ART the asker saved in the draft folder of HER Task. The host reads it
 * inside that folder only, draws an SVG as a PNG (models read only raster), hands the PNG to the colleagues' turns and puts the files (with a thumbnail) on the card of the
 * thread. The round engine is a fake that records what it was asked; the real one has its own spec.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { ScreenRepos, openTempStore } from '@deepseek-ai/dsh-persona-store'
import type { HarnessCall } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, describe, expect, it } from 'vitest'
import { OpinionTool, type OpinionToolDeps } from '../src/opinion-host.ts'
import type { OpinionResult, OpinionRunInput } from '../src/opinion-run.ts'
import { svgToPng } from '../src/svg-to-png.ts'

const NOW = '2026-11-07T16:00:00.000Z'
const PNG_MAGIC = '89504e470d0a1a0a'
const claude = { cli: 'claude', connected: true, readsImages: true }
const persona = (id: string, name: string, title: string): StoredPersona => ({ id, name, title, personality: 'Clara.', instructions: 'Ajude.', projectId: 'pp', runner: { kind: 'cli', cli: 'claude', model: 'haiku' }, systemRoles: [] }) as unknown as StoredPersona
const TEAM = [persona('lia', 'Lia', 'Coordenação'), persona('teo', 'Teo', 'Arte'), persona('bia', 'Bia', 'Redação')]
const OK: OpinionResult = { state: 'done', replies: [{ personaId: 'lia', name: 'Lia', mark: 'liked', text: 'Gostei do azul.' }], noVision: [], ignoredAttachmentIds: [] }
const poster = (extra = ''): string => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect width="100%" height="100%" fill="#1e63b5"/><circle cx="300" cy="150" r="75" fill="#e02020"/>${extra}</svg>`

const closers: Array<() => void> = []
afterEach(() => { for (const close of closers.splice(0)) close() })

async function rig(root: string | undefined, over: Partial<OpinionToolDeps> = {}): Promise<{ tool: OpinionTool; runs: OpinionRunInput[] }> {
  const handle = await openTempStore()
  closers.push(() => { handle.store.close() })
  const screens = new ScreenRepos(handle.store, () => NOW)
  const runs: OpinionRunInput[] = []
  const tool = new OpinionTool({
    enabled: () => true,
    now: () => NOW,
    product: { getPersona: id => TEAM.find(row => row.id === id), listPersonas: () => TEAM },
    screens,
    opinions: { run: async (input) => { runs.push(input); return OK } },
    limitsOf: () => ({ canAskColleagues: true, askCapPerDay: 6, maxOpinionRounds: 2 }),
    otherAsksToday: () => 0,
    isRunning: () => true,
    gateOf: () => ({ paused: false, limited: false }),
    motorOf: () => claude,
    ...(root === undefined ? {} : { draftRootOf: () => root }),
    ...over,
  })
  return { tool, runs }
}

const draftDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'opinion-draft-'))
  closers.push(() => { rmSync(dir, { recursive: true, force: true }) })
  return dir
}
const call = (draft: Record<string, unknown>, callId = 'c1'): HarnessCall => ({
  tool: 'ask_team_opinion', run: { personaId: 'teo', ticketId: 't-1', assignmentId: 'a-1' }, args: { question: 'O que acham do cartaz?', draft }, callId,
})
const parse = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>

describe('ask_team_opinion with draft.files', () => {
  it('Teo shows the SVG he saved: the colleagues get it as a PNG, the card gets the file with a thumbnail, and it is NOT an attachment of the person', async () => {
    const dir = draftDir()
    mkdirSync(join(dir, 'arte'))
    writeFileSync(join(dir, 'arte', 'cartaz.svg'), poster())
    const { tool, runs } = await rig(dir)
    const answer = parse(await tool.ask(call({ text: 'Cartaz do sábado', files: ['arte/cartaz.svg'] })))
    expect(answer).toMatchObject({ ok: true, round: 1 })
    expect(answer.art).toBeUndefined()
    expect(runs).toHaveLength(1)
    const draft = runs[0]!.draft
    expect(draft.art).toHaveLength(1)
    expect(draft.art![0]).toMatchObject({ name: 'cartaz.png', mime: 'image/png' })
    expect(draft.art![0]!.bytes.subarray(0, 8).toString('hex')).toBe(PNG_MAGIC)
    expect(draft.attachmentIds).toBeUndefined()
    expect(draft.files).toHaveLength(1)
    expect(draft.files![0]).toMatchObject({ path: 'arte/cartaz.svg', name: 'cartaz.svg', mime: 'image/svg+xml', taskId: 't-1', personaId: 'teo' })
    expect(draft.files![0]!.thumb?.startsWith('data:image/png;base64,')).toBe(true)
    expect(draft.text).toBe('Cartaz do sábado')
  }, 30_000)

  it('the model writes a NAME, in any case, without the folder: the file of the draft with that name is the one', async () => {
    const dir = draftDir()
    mkdirSync(join(dir, 'arte'))
    writeFileSync(join(dir, 'arte', 'Cartaz.svg'), poster())
    const { tool, runs } = await rig(dir)
    expect(parse(await tool.ask(call({ files: ['CARTAZ.svg'] })))).toMatchObject({ ok: true })
    expect(runs[0]!.draft.files?.[0]?.path).toBe('arte/Cartaz.svg')
    expect(runs[0]!.draft.art).toHaveLength(1)
  }, 30_000)

  it('a raster file goes as it is, next to an SVG; at most 4 images per round, the person\'s attachments counted', async () => {
    const dir = draftDir()
    const png = await svgToPng(poster())
    if (!png.ok) throw new Error('no PNG')
    writeFileSync(join(dir, 'foto.png'), png.png)
    writeFileSync(join(dir, 'logo.svg'), poster())
    const { tool, runs } = await rig(dir)
    expect(parse(await tool.ask(call({ files: ['foto.png', 'logo.svg'] })))).toMatchObject({ ok: true })
    expect(runs[0]!.draft.art?.map(item => item.name)).toEqual(['foto.png', 'logo.png'])
    const crowded = parse(await tool.ask(call({ attachmentIds: ['a', 'b', 'c'], files: ['foto.png', 'logo.svg'] }, 'c2')))
    expect(crowded).toMatchObject({ ok: false, code: 'invalid' })
    expect(runs).toHaveLength(1)
  }, 30_000)

  it('an SVG the host will not draw (external resource) goes to the team as TEXT, and the model is told', async () => {
    const dir = draftDir()
    writeFileSync(join(dir, 'ruim.svg'), poster('<image href="https://example.com/x.png" width="5" height="5"/>'))
    const { tool, runs } = await rig(dir)
    const answer = parse(await tool.ask(call({ text: 'Veja a arte', files: ['ruim.svg'] })))
    expect(answer).toMatchObject({ ok: true })
    expect(String(answer.art)).toContain('ruim.svg usa um recurso de fora')
    expect(String(answer.art)).toContain('TEXTO')
    expect(runs[0]!.draft.art).toBeUndefined()
    expect(runs[0]!.draft.text).toContain('[ruim.svg, desenho em SVG]')
    expect(runs[0]!.draft.text).toContain('<svg')
    expect(runs[0]!.draft.files).toHaveLength(1)
  }, 30_000)

  it('never reads outside the draft of the Task: `..`, an absolute path and a drive are told "fora do rascunho"; with text the round goes on, without it nothing is called', async () => {
    const dir = draftDir()
    const outside = draftDir()
    writeFileSync(join(outside, 'segredo.png'), 'x')
    const { tool, runs } = await rig(dir)
    const withText = parse(await tool.ask(call({ text: 'Cartaz', files: ['../segredo.png', join(outside, 'segredo.png'), 'C:/Windows/win.ini'] })))
    expect(withText).toMatchObject({ ok: true })
    expect(String(withText.art)).toContain('fora do rascunho')
    expect(runs[0]!.draft.art).toBeUndefined()
    expect(runs[0]!.draft.files).toBeUndefined()
    const alone = parse(await tool.ask(call({ files: ['../segredo.png'] }, 'c2')))
    expect(alone).toMatchObject({ ok: false, code: 'files' })
    expect(String(alone.message)).toContain('fora do rascunho')
    expect(runs).toHaveLength(1)
  })

  it('a file that is not an image is left out with a sentence (the text goes in `text`); a missing one is told', async () => {
    const dir = draftDir()
    writeFileSync(join(dir, 'texto.md'), '# Padaria Lua')
    writeFileSync(join(dir, 'logo.svg'), poster())
    const { tool, runs } = await rig(dir)
    const answer = parse(await tool.ask(call({ files: ['texto.md', 'logo.svg', 'sumiu.svg'] })))
    expect(answer).toMatchObject({ ok: true })
    expect(String(answer.art)).toContain('texto.md não é imagem')
    expect(String(answer.art)).toContain('Não achei "sumiu.svg"')
    expect(runs[0]!.draft.art?.map(item => item.name)).toEqual(['logo.png'])
  }, 30_000)

  it('a Task without a draft folder: `draft.files` is refused with the way forward; without `files` nothing changes', async () => {
    const { tool, runs } = await rig(undefined)
    const refused = parse(await tool.ask(call({ files: ['cartaz.svg'] })))
    expect(refused).toMatchObject({ ok: false, code: 'no-draft' })
    expect(runs).toHaveLength(0)
    expect(parse(await tool.ask(call({ text: 'Só o texto' }, 'c2')))).toMatchObject({ ok: true })
    expect(runs).toHaveLength(1)
    expect(runs[0]!.draft.art).toBeUndefined()
    expect(runs[0]!.draft.files).toBeUndefined()
  })

  it('bad `files` are refused in Portuguese before anything is read', async () => {
    const dir = draftDir()
    const { tool, runs } = await rig(dir)
    expect(parse(await tool.ask(call({ files: 'cartaz.svg' })))).toMatchObject({ ok: false, code: 'invalid' })
    expect(parse(await tool.ask(call({ files: [''] }, 'c2')))).toMatchObject({ ok: false, code: 'invalid' })
    expect(runs).toHaveLength(0)
  })
})

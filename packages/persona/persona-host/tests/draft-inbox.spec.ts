import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Runner, Ticket } from '@deepseek-ai/dsh-persona-engine'
import { afterEach, expect, onTestFinished } from 'vitest'
import { carryFile, carryFiles, filesNamedIn, savedSince } from '../src/draft-inbox.ts'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * P0-1 "o rascunho de quem recebe tem os arquivos" (Keel, 09/11, real round: Bia did not find Teo's poster, Teo did not find the person's foto.png, Lia RE-CREATED the file).
 * Every Task has a draft of ITS OWN (nothing reaches the person's folder before Aplicar). So what a colleague needs is COPIED into her draft, with the SAME relative path:
 *   - the attachments of the person's request (`inputs/<name>`), for every Task of the chain and for every part of a split;
 *   - the files the sender cited in the bilhete / her words, and the ones she saved in her turn (the art), when the work passes on, comes back to the asker or goes to a reviewer.
 * Copy only from inside a draft (no `..`, no absolute path, no symlink out, no dot-file), never over a file that is already there, never to the real project.
 */

const exec = promisify(execFile)
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const tmp = (name: string): string => {
  const dir = mkdtempSync(join(tmpdir(), `persona-inbox-${name}-`))
  dirs.push(dir)
  return dir
}
const put = (root: string, rel: string, text: string | Buffer): void => {
  mkdirSync(join(root, ...rel.split('/').slice(0, -1)), { recursive: true })
  writeFileSync(join(root, ...rel.split('/')), text)
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#d22"/></svg>'
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// ── the pure copy ─────────────────────────────────────────────────────────────────────────────────────────────────────────

it('carryFile copies a file of a draft into another draft with the SAME relative path (folders made as needed)', () => {
  const from = tmp('from')
  const to = tmp('to')
  put(from, 'arte/cartaz.svg', SVG)
  expect(carryFile(from, 'arte/cartaz.svg', to, 'Teo')).toMatchObject({ ok: true, at: 'arte/cartaz.svg', moved: false })
  expect(readFileSync(join(to, 'arte', 'cartaz.svg'), 'utf8')).toBe(SVG)
  expect(carryFile(from, 'arte\\cartaz.svg', to, 'Teo')).toMatchObject({ ok: true, at: 'arte/cartaz.svg', same: true }) // twice = the same file, nothing breaks
})

it('carryFile finds a file the model cited by its NAME only (the file of the draft with that name)', () => {
  const from = tmp('from')
  const to = tmp('to')
  put(from, 'saidas/cartaz.svg', SVG)
  expect(carryFile(from, 'cartaz.svg', to, 'Teo')).toMatchObject({ ok: true, at: 'saidas/cartaz.svg' })
  expect(existsSync(join(to, 'saidas', 'cartaz.svg'))).toBe(true)
})

it('carryFile NEVER overwrites a file that is already in the receiving draft: the colleague\'s copy goes to recebidos/<name>/ and the result says so', () => {
  const from = tmp('from')
  const to = tmp('to')
  put(from, 'cartaz.svg', SVG)
  put(to, 'cartaz.svg', 'MEU-RASCUNHO')
  const result = carryFile(from, 'cartaz.svg', to, 'Teo')
  expect(result).toMatchObject({ ok: true, at: 'recebidos/Teo/cartaz.svg', moved: true })
  expect(readFileSync(join(to, 'cartaz.svg'), 'utf8')).toBe('MEU-RASCUNHO') // hers, untouched
  expect(readFileSync(join(to, 'recebidos', 'Teo', 'cartaz.svg'), 'utf8')).toBe(SVG)
  put(to, 'igual.svg', SVG) // the same bytes already there: nothing to move, nothing to warn
  put(from, 'igual.svg', SVG)
  expect(carryFile(from, 'igual.svg', to, 'Teo')).toMatchObject({ ok: true, at: 'igual.svg', same: true, moved: false })
})

it('carryFile keeps the copy OLD: the time of the original (never later than 2 s ago), so a copy is never taken for what the receiver wrote in her turn', () => {
  const from = tmp('from')
  const to = tmp('to')
  put(from, 'novo.svg', SVG) // written just now
  put(from, 'velho.svg', SVG)
  const old = new Date(Date.now() - 3_600_000)
  utimesSync(join(from, 'velho.svg'), old, old)
  expect(carryFile(from, 'novo.svg', to, 'Teo').ok).toBe(true)
  expect(carryFile(from, 'velho.svg', to, 'Teo').ok).toBe(true)
  expect(statSync(join(to, 'novo.svg')).mtimeMs).toBeLessThan(Date.now() - 1_500)
  expect(Math.abs(statSync(join(to, 'velho.svg')).mtimeMs - old.getTime())).toBeLessThan(2_000)
  expect(savedSince(to, Date.now() - 500)).toEqual([]) // a turn that starts now: nothing "saved" in the receiving draft
})

it('carryFile reads only INSIDE a draft: no "..", no absolute path, no dot-file, no symlink out, no "." destination', () => {
  const base = tmp('base')
  const from = join(base, 'from')
  const to = join(base, 'to')
  mkdirSync(from)
  mkdirSync(to)
  writeFileSync(join(base, 'segredo.txt'), 'SEGREDO')
  put(from, '.env', 'TOKEN=1')
  put(from, '.git/config', 'x')
  put(from, 'ok.txt', 'ok')
  for (const wanted of ['../segredo.txt', join(base, 'segredo.txt'), 'C:\\Windows\\win.ini', '.env', '.git/config', 'a/../../segredo.txt', '']) {
    expect(carryFile(from, wanted, to, 'Teo').ok, wanted).toBe(false)
  }
  try {
    symlinkSync(join(base, 'segredo.txt'), join(from, 'atalho.txt'))
    expect(carryFile(from, 'atalho.txt', to, 'Teo').ok).toBe(false)
  } catch (error) { void error } // no symlink right on this machine: the other cases already prove the rule
  expect(existsSync(join(to, 'segredo.txt'))).toBe(false)
  expect(carryFile(from, 'ok.txt', '.', 'Teo').ok).toBe(false) // a Task with no draft folder gets nothing
  expect(carryFile(from, 'ok.txt', '', 'Teo').ok).toBe(false)
  expect(carryFile(from, 'ok.txt', join(base, 'nao-existe'), 'Teo').ok).toBe(false)
  expect(carryFile(from, 'ok.txt', to, '../../fora')).toMatchObject({ ok: true }) // a bad "owner" name cannot walk out either: it is a single safe segment
  expect(existsSync(join(base, 'fora'))).toBe(false)
})

it('carryFiles: at most 12 files, a missing one is reported (not an error), the same file twice counts once', () => {
  const from = tmp('from')
  const to = tmp('to')
  for (let index = 0; index < 15; index += 1) put(from, `f${String(index)}.txt`, `n${String(index)}`)
  const many = carryFiles({ from, to, owner: 'Teo', wanted: Array.from({ length: 15 }, (_, index) => `f${String(index)}.txt`) })
  expect(many.carried).toHaveLength(12)
  const some = carryFiles({ from, to: tmp('to2'), owner: 'Teo', wanted: ['f1.txt', 'f1.txt', 'nao-existe.txt'] })
  expect(some.carried.map(item => item.at)).toEqual(['f1.txt'])
  expect(some.missed).toEqual(['nao-existe.txt'])
})

it('filesNamedIn: the file names a text cites (with a known extension), no URLs, no duplicates', () => {
  expect(filesNamedIn('Salvei cartaz.svg e o PNG (arte/cartaz.png). Veja https://x.com/a.png e "inputs/foto.jpg", cartaz.svg.')).toEqual(['cartaz.svg', 'arte/cartaz.png', 'inputs/foto.jpg'])
  expect(filesNamedIn('nada aqui, só 3.5 e v1.2')).toEqual([])
})

it('savedSince: what was written after a moment, never the staged inputs/, recebidos/ or hidden files', () => {
  const root = tmp('root')
  put(root, 'velho.txt', 'x')
  const past = Date.now() + 5_000
  put(root, 'novo.txt', 'x')
  put(root, 'inputs/foto.png', 'x')
  put(root, 'recebidos/Teo/a.svg', 'x')
  put(root, '.segredo', 'x')
  expect(savedSince(root, 0).sort()).toEqual(['novo.txt', 'velho.txt'])
  expect(savedSince(root, past)).toEqual([])
})

// ── the host: who gets what, and when ─────────────────────────────────────────────────────────────────────────────────────

function open(review = false): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
    { id: 'caio', name: 'Caio', title: 'Mídia' },
  ])
  h.teamworkEnabled = true
  if (!review) h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } }) // a new project reviews every delivery by default
  return h
}

/** What `prepareReview` does for a Task with a project folder: a draft folder of its own (a copy), the attachments of its own message in `inputs/`. Here: a temp folder per Task. */
function drafts(h: PersonaHost, seed: Record<string, Record<string, string>> = {}): Map<string, string> {
  const made = new Map<string, string>()
  h.orchestration.prepareReview = async (projectId: string, ticketId: string): Promise<undefined> => {
    const rt = h.orchestration.runtime(projectId)
    const ticket = rt.repo.tickets.get(ticketId)
    if (ticket === undefined || (ticket.execution?.directory ?? '.') !== '.') return undefined
    const name = ticket.execution?.name ?? ''
    const dir = tmp(name.toLowerCase() || 'x')
    for (const [rel, text] of Object.entries(seed[name] ?? {})) put(dir, rel, text)
    made.set(name, dir)
    h.orchestration.stageAttachments?.(ticket.origin.triggerId, dir, false)
    rt.repo.tickets.save({ ...ticket, execution: { name, directory: dir, assignment: ticket.execution?.assignment ?? ticket.title } })
    return undefined
  }
  return made
}

/** What every run says, in the order the runs end. */
function script(h: PersonaHost, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift() ?? 'Feito.', set: () => undefined })
}

/** The words every Assignment's launch carried to a runner; `onLaunch` lets a test write a file DURING a turn (what a persona does with her tools). */
function launches(h: PersonaHost, onLaunch?: (prompt: string) => void): string[] {
  const prompts: string[] = []
  const original = h.orchestration.runnerFactory
  h.orchestration.runnerFactory = async (request) => {
    const runner: Runner = await original(request)
    const deliver = runner.deliver.bind(runner)
    Object.assign(runner, {
      deliver: async (...args: Parameters<Runner['deliver']>): ReturnType<Runner['deliver']> => {
        if (args[1].startsWith('launch:')) {
          prompts.push(args[2])
          if (onLaunch !== undefined) {
            await new Promise(done => setTimeout(done, 40)) // a real turn writes its files well after it started: never in the same clock tick
            onLaunch(args[2])
          }
        }
        return deliver(...args)
      },
    })
    return runner
  }
  return prompts
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(ticket => ticket.execution?.name === name)
const mine = (made: Map<string, string>, name: string): string => {
  const dir = made.get(name)
  if (dir === undefined) throw new Error(`no draft for ${name}`)
  return dir
}

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

const say2 = (h: PersonaHost, id: string, body: string, attachmentIds: string[] = []): void => {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id, occurredAt: '2026-11-03T15:00:00.000Z', ...(attachmentIds.length === 0 ? {} : { attachmentIds }) })
}
const attach = (h: PersonaHost, name = 'foto.png'): string => h.attachFile({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', name, bytesBase64: PNG_B64 }).id

it('HELP: Bia asks Teo, Teo SAVES cartaz.svg in his draft; when Bia is woken with his delivery the poster is in HER draft (same path) and her prompt says where', async () => {
  const h = open()
  const made = drafts(h)
  const prompts = launches(h, (prompt) => {
    if (prompt.includes('Arte do cartaz') && prompt.includes('<bilhete>')) put(mine(made, 'Teo'), 'cartaz.svg', SVG) // Teo's turn writes the art in his draft
  })
  script(h, ['Pedi o cartaz ao Teo.', 'Pronto.', 'Recebi o cartaz.'])
  say(h, 'u1', '@Bia escreva o texto do cartaz')
  const bia = ticketOf(h, 'Bia')!
  expect(h.handoffs.ask({ projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte do cartaz', note: { done: ['Texto pronto'], needed: ['Arte do cartaz'], files: [], decisions: [] }, callId: 'h1' })).toMatchObject({ ok: true })
  await settle(h)
  expect(existsSync(join(mine(made, 'Teo'), 'cartaz.svg'))).toBe(true)
  expect(readFileSync(join(mine(made, 'Bia'), 'cartaz.svg'), 'utf8')).toBe(SVG) // the very same art, in her draft
  const woken = prompts.find(prompt => prompt.includes('Teo entregou o que você pediu'))
  expect(woken, 'the prompt of the resumed Assignment of Bia').toBeDefined()
  expect(woken).toContain('cartaz.svg')
  expect(woken).toMatch(/seu rascunho/u)
})

it('HELP: the file Teo CITES in his delivery words comes too, even when the turn wrote it before the clock the host keeps', async () => {
  const h = open()
  const made = drafts(h, { Teo: { 'arte/capa-final.png': 'PNG-FALSO' } })
  const prompts = launches(h)
  script(h, ['Pedi a capa ao Teo.', 'A capa está em arte/capa-final.png, pronta.', 'Recebi.'])
  say(h, 'u1', '@Bia escreva o texto da capa')
  const bia = ticketOf(h, 'Bia')!
  h.handoffs.ask({ projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Capa', note: { done: ['Texto'], needed: ['Capa'], files: [], decisions: [] }, callId: 'h2' })
  await settle(h)
  expect(readFileSync(join(mine(made, 'Bia'), 'arte', 'capa-final.png'), 'utf8')).toBe('PNG-FALSO')
  expect(prompts.some(prompt => prompt.includes('Teo entregou o que você pediu') && prompt.includes('arte/capa-final.png'))).toBe(true)
})

it('PASS_FORWARD: the files the sender cites in the bilhete are in the receiver\'s draft, same path; a file she already has is NOT overwritten and the prompt says where the colleague\'s copy is', async () => {
  const h = open()
  const made = drafts(h, { Teo: { 'cartaz.svg': SVG, 'notas.md': 'NOTAS-DO-TEO' }, Bia: { 'notas.md': 'NOTAS-DA-BIA' } })
  const prompts = launches(h)
  script(h, ['Fiz a arte.', 'Recebi.'])
  say(h, 'u1', '@Teo faça o cartaz')
  const teo = ticketOf(h, 'Teo')!
  const result = h.handoffs.ask({
    projectId: 'pp', fromTicketId: teo.id, fromPersonaId: 'teo', toPersonaId: 'bia', title: 'Texto do cartaz', kind: 'next', callId: 'p1',
    note: { done: ['Arte pronta'], needed: ['Texto do cartaz'], files: ['cartaz.svg', 'notas.md', '.env', 'nao-existe.png'], decisions: [] },
  })
  expect(result).toMatchObject({ ok: true })
  await settle(h)
  const bia = mine(made, 'Bia')
  expect(readFileSync(join(bia, 'cartaz.svg'), 'utf8')).toBe(SVG)
  expect(readFileSync(join(bia, 'notas.md'), 'utf8')).toBe('NOTAS-DA-BIA') // hers, untouched
  expect(readFileSync(join(bia, 'recebidos', 'Teo', 'notas.md'), 'utf8')).toBe('NOTAS-DO-TEO')
  expect(existsSync(join(bia, '.env'))).toBe(false) // a dot-file is never carried (the engine already refuses ".." and absolute paths in a bilhete)
  expect(existsSync(join(bia, 'nao-existe.png'))).toBe(false)
  const hers = prompts.find(prompt => prompt.includes('Texto do cartaz') && prompt.includes('<bilhete>'))
  expect(hers, 'Bia\'s launch prompt').toBeDefined()
  expect(hers).toContain('cartaz.svg')
  expect(hers).toContain('recebidos/Teo/notas.md')
  expect(hers).toMatch(/seu rascunho/u)
})

it('the person\'s ATTACHMENT follows the work: foto.png of the request is in `inputs/` of the colleague the work is passed to, same name, and her prompt names it', async () => {
  const h = open()
  const made = drafts(h)
  const prompts = launches(h)
  script(h, ['Texto pronto.', 'Recebi.'])
  say2(h, 'u1', '@Bia escreva o texto do cartaz com esta foto', [attach(h)])
  const bia = ticketOf(h, 'Bia')!
  expect(h.handoffs.ask({ projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte do cartaz', kind: 'next', callId: 'a1', note: { done: ['Texto'], needed: ['Arte do cartaz com a foto'], files: [], decisions: [] } })).toMatchObject({ ok: true })
  await settle(h)
  const photo = join(mine(made, 'Teo'), 'inputs', 'foto.png')
  expect(existsSync(photo), 'inputs/foto.png in Teo\'s draft').toBe(true)
  expect(readFileSync(photo).subarray(0, 4).toString('hex')).toBe('89504e47') // the real bytes
  const his = prompts.find(prompt => prompt.includes('Arte do cartaz') && prompt.includes('<bilhete>'))
  expect(his).toContain('inputs/foto.png')
  // and it is a copy: Bia's own file is still there, untouched
  expect(existsSync(join(mine(made, 'Bia'), 'inputs', 'foto.png'))).toBe(true)
})

it('a part of a SPLIT request: every part\'s draft has the attachment of the ORIGINAL message (the split line carries none)', async () => {
  const h = open()
  const made = drafts(h)
  launches(h)
  say2(h, 'u1', 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts, com esta foto', [attach(h)])
  await settle(h)
  const parts = tickets(h).filter(ticket => ticket.origin.triggerId.startsWith('split:u1:'))
  expect(parts.length).toBeGreaterThanOrEqual(2)
  for (const part of parts) {
    const name = part.execution?.name ?? ''
    expect(existsSync(join(mine(made, name), 'inputs', 'foto.png')), `inputs/foto.png in the draft of ${name}`).toBe(true)
    // the part is told the REAL path of the file in its draft (the fake of the Probe checks that every cited path exists)
    expect(part.execution?.assignment, `assignment of ${name}`).toContain('Anexos do pedido: inputs/foto.png.')
  }
})

const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

it('the thread line "X salvou N arquivos no rascunho" counts only what the AUTHOR\'s turn wrote: what the host copied into a draft (inputs/, the files of the bilhete) is not hers', async () => {
  const h = open()
  const made = drafts(h)
  launches(h, (prompt) => {
    if (prompt.includes('escreva o texto da capa')) put(mine(made, 'Bia'), 'capa.svg', SVG) // only Bia's turn writes a file
  })
  script(h, ['Texto e arte prontos: capa.svg.', 'Recebi.'])
  say2(h, 'u1', '@Bia escreva o texto da capa com esta foto', [attach(h)])
  const bia = ticketOf(h, 'Bia')!
  expect(h.handoffs.ask({ projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte da capa', kind: 'next', callId: 's1', note: { done: ['Texto e arte'], needed: ['Finalizar a capa'], files: ['capa.svg'], decisions: [] } })).toMatchObject({ ok: true })
  await settle(h)
  expect(existsSync(join(mine(made, 'Teo'), 'capa.svg'))).toBe(true) // the copies are there...
  expect(existsSync(join(mine(made, 'Teo'), 'inputs', 'foto.png'))).toBe(true)
  const lines = thread(h).filter(row => row.filesSaved !== undefined)
  expect(lines.map(line => `${line.actorId}:${line.filesSaved!.files.map(file => file.path).join(',')}`)).toEqual(['bia:capa.svg']) // ...but only Bia "saved" anything
})

it('the work goes on: what Bia RECEIVED from Teo (not written by her) goes on to Caio too, since her draft keeps the old time of the copy', async () => {
  const h = open()
  const made = drafts(h, { Teo: { 'cartaz.svg': SVG } })
  launches(h)
  script(h, ['Arte pronta.', 'Texto pronto.', 'Posts prontos.'])
  say(h, 'u1', '@Teo faça o cartaz')
  const teo = ticketOf(h, 'Teo')!
  expect(h.handoffs.ask({ projectId: 'pp', fromTicketId: teo.id, fromPersonaId: 'teo', toPersonaId: 'bia', title: 'Texto do cartaz', kind: 'next', callId: 'n1', note: { done: ['Arte'], needed: ['Texto'], files: ['cartaz.svg'], decisions: [] } })).toMatchObject({ ok: true })
  const bia = ticketOf(h, 'Bia')!
  expect(h.handoffs.ask({ projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'caio', title: 'Posts do cartaz', kind: 'next', callId: 'n2', note: { done: ['Texto'], needed: ['Posts'], files: [], decisions: [] } })).toMatchObject({ ok: true })
  await settle(h)
  expect(existsSync(join(mine(made, 'Bia'), 'cartaz.svg'))).toBe(true)
  expect(readFileSync(join(mine(made, 'Caio'), 'cartaz.svg'), 'utf8')).toBe(SVG) // Bia cited nothing; she only RECEIVED it
})

it('REVIEW: the reviewer\'s draft has the files the author saved (she reviews the work, not a description of it)', async () => {
  const h = open(true)
  const made = drafts(h)
  const prompts = launches(h, (prompt) => {
    if (prompt.includes('escreva o post') && !prompt.includes('pediu a sua revisão')) put(mine(made, 'Bia'), 'post.md', 'POST-DA-BIA') // the author's turn saves her work
  })
  script(h, ['Post pronto em post.md.', 'APROVADO\nTudo certo.'])
  say(h, 'u1', '@Bia escreva o post')
  await settle(h)
  const reviewer = [...made.entries()].find(([name]) => name !== 'Bia')
  expect(reviewer, 'a reviewer\'s draft').toBeDefined()
  expect(readFileSync(join(reviewer![1], 'post.md'), 'utf8')).toBe('POST-DA-BIA')
  expect(prompts.find(prompt => prompt.includes('pediu a sua revisão'))).toContain('post.md')
})

it('with the team switch OFF nothing is copied anywhere', async () => {
  const h = open()
  h.teamworkEnabled = false
  const made = drafts(h)
  launches(h)
  say2(h, 'u1', '@Bia escreva o texto do cartaz com esta foto', [attach(h)])
  await settle(h)
  expect([...made.keys()]).toEqual(['Bia'])
  expect(existsSync(join(mine(made, 'Bia'), 'recebidos'))).toBe(false)
})

// ── the real thing: real drafts (git worktrees of a real folder), the real staging of the person's attachment ──────────────

async function gitFolder(): Promise<string> {
  const home = mkdtempSync(join(tmpdir(), 'persona-home-'))
  const previous = process.env.PERSONA_HOME
  process.env.PERSONA_HOME = home
  const root = mkdtempSync(join(tmpdir(), 'persona-inbox-git-'))
  onTestFinished(() => {
    if (previous === undefined) delete process.env.PERSONA_HOME
    else process.env.PERSONA_HOME = previous
    rmSync(home, { recursive: true, force: true })
    rmSync(root, { recursive: true, force: true })
  })
  await exec('git', ['init', '-b', 'main', root])
  await exec('git', ['-C', root, 'config', 'user.email', 'bolt@persona.test'])
  await exec('git', ['-C', root, 'config', 'user.name', 'Bolt'])
  writeFileSync(join(root, 'README'), 'base\n')
  await exec('git', ['-C', root, 'add', '.'])
  await exec('git', ['-C', root, 'commit', '-m', 'init'])
  return root
}

it('REAL drafts: Bia saves capa.svg and the person attached foto.png; the work passes to Teo — his OWN git worktree gets both, and the real project folder gets NOTHING (that is Aplicar)', async () => {
  const h = open()
  const project = await gitFolder()
  h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: project })
  const prompts = launches(h, (prompt) => {
    if (prompt.includes('escreva o texto da capa')) {
      const bia = ticketOf(h, 'Bia')?.execution?.directory
      if (bia !== undefined && bia !== '.') put(bia, 'capa.svg', SVG) // Bia's turn writes her art in HER draft
    }
  })
  script(h, ['Texto e arte prontos: capa.svg.', 'Recebi.'])
  say2(h, 'u1', '@Bia escreva o texto da capa com esta foto', [attach(h)])
  await h.orchestration.flush('pp')
  const bia = ticketOf(h, 'Bia')!
  const biaDraft = bia.execution?.directory ?? '.'
  expect(biaDraft, 'a REAL draft for Bia').not.toBe('.')
  expect(existsSync(join(biaDraft, 'inputs', 'foto.png'))).toBe(true) // the real staging of her own message
  expect(h.handoffs.ask({ projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte da capa', kind: 'next', callId: 'r1', note: { done: ['Texto e arte'], needed: ['Finalizar a capa'], files: ['capa.svg'], decisions: [] } })).toMatchObject({ ok: true })
  await settle(h)
  const teoDraft = ticketOf(h, 'Teo')?.execution?.directory ?? '.'
  expect(teoDraft, 'a REAL draft for Teo').not.toBe('.')
  expect(teoDraft).not.toBe(biaDraft) // a draft of his own
  expect(readFileSync(join(teoDraft, 'capa.svg'), 'utf8')).toBe(SVG)
  expect(readFileSync(join(teoDraft, 'inputs', 'foto.png')).subarray(0, 4).toString('hex')).toBe('89504e47')
  expect(existsSync(join(biaDraft, 'capa.svg'))).toBe(true) // hers is still hers
  const his = prompts.find(prompt => prompt.includes('Arte da capa') && prompt.includes('<bilhete>'))
  expect(his).toContain('capa.svg')
  expect(his).toContain('inputs/foto.png')
  expect(his).toMatch(/seu rascunho/u)
  // nothing reached the person's real folder: that only happens at Aplicar
  expect(existsSync(join(project, 'capa.svg'))).toBe(false)
  expect(existsSync(join(project, 'inputs'))).toBe(false)
})

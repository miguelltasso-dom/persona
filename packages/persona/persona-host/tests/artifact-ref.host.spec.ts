import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Runner, Ticket } from '@deepseek-ai/dsh-persona-engine'
import { afterEach, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * Item 9b "artefato grande por referência" (Tally, 11/11), the host path: the `<entrega>` block of the receiver used to carry the sender's SVG whole (up to 24 000 characters,
 * every receiving turn). Now a big SVG/code block of her words is written as a file in HER draft, copied into the receiver's draft by the P0-1 carry, and the block carries ONE line
 * saying where it is, only when it really arrived and the receiver can open files. The text of the bilhete / the producer stays WHOLE. Anything else keeps the block inline.
 */
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

function script(h: PersonaHost, texts: readonly string[]): void {
  const queue = [...texts]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
}

function launchPrompts(h: PersonaHost): string[] {
  const prompts: string[] = []
  const original = h.orchestration.runnerFactory
  h.orchestration.runnerFactory = async (request) => {
    const runner: Runner = await original(request)
    const deliver = runner.deliver.bind(runner)
    Object.assign(runner, {
      deliver: (...args: Parameters<Runner['deliver']>): ReturnType<Runner['deliver']> => {
        if (args[1].startsWith('launch:')) prompts.push(args[2])
        return deliver(...args)
      },
    })
    return runner
  }
  return prompts
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(ticket => ticket.execution?.name === name)
const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

/** An SVG as long as the one of a real round: a few thousand tokens, with its own lines and indentation. */
const svg = (rects: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">\n${'  <rect x="10" y="10" width="90" height="90" fill="#d22"/>\n'.repeat(rects)}</svg>`

const NOTE = { done: ['Texto pronto'], needed: ['Arte do cartaz'], files: [], decisions: ['Vertical 1080x1350'] }
const TEXT = 'Texto do cartaz: 2 por R$ 9, de sexta a domingo, na Padaria Lua.'

function draftFor(h: PersonaHost, name: string): string {
  const draft = mkdtempSync(join(tmpdir(), `persona-art-${name.toLowerCase()}-`))
  dirs.push(draft)
  const ticket = ticketOf(h, name)!
  h.orchestration.runtime('pp').repo.tickets.save({ ...ticket, execution: { ...ticket.execution!, directory: draft } })
  return draft
}

/** Bia writes TEXT + a big SVG + FIM and passes the work to Teo; returns what Teo's launch prompt carried and both drafts. */
async function flow(options: { receiverDraft: boolean; receiverTools?: Record<string, 'none' | 'read' | 'write'> }): Promise<{ teo: string; bia: string; teoDraft: string | undefined; h: PersonaHost }> {
  const h = open()
  const prompts = launchPrompts(h)
  const art = svg(400) // ~ 22k characters
  script(h, [`${TEXT}\n${art}\nFIM-DA-ENTREGA`, 'Recebi.'])
  say(h, 'u1', '@Bia escreva o texto do cartaz')
  const biaDraft = draftFor(h, 'Bia')
  expect(h.handoffs.ask({ projectId: 'pp', fromTicketId: ticketOf(h, 'Bia')!.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte do cartaz', note: NOTE, callId: 'pf1', kind: 'next' })).toMatchObject({ ok: true })
  const teoDraft = options.receiverDraft ? draftFor(h, 'Teo') : undefined
  if (options.receiverTools !== undefined) {
    const teo = h.product.getPersona('teo')!
    h.product.updatePersona({ ...teo, tools: options.receiverTools }, 'pp')
  }
  await settle(h)
  const teo = prompts.find(prompt => prompt.includes('Arte do cartaz') && prompt.includes('<bilhete>'))
  expect(teo, 'the colleague\'s launch prompt').toBeDefined()
  return { teo: teo!, bia: biaDraft, teoDraft, h }
}

it('with both drafts: the receiver reads the producer\'s text WHOLE and ONE line for the big SVG; the file reached HER draft and holds all of it', async () => {
  const { teo, bia, teoDraft, h } = await flow({ receiverDraft: true })
  expect(teo).toContain('<entrega>')
  expect(teo).toContain(TEXT) // the text of the producer stays whole
  expect(teo).toContain('FIM-DA-ENTREGA')
  expect(teo).not.toContain('<rect x="10"') // the art is not pasted
  expect(teo).toMatch(/\[Arte 1 \(SVG, [\d,]+ KB\): está no arquivo (?:recebidos\/Bia\/)?entrega-\w+-arte-1\.svg do seu rascunho/u)
  const spilled = readdirSync(bia).filter(name => /^entrega-\w+-arte-1\.svg$/u.test(name))
  expect(spilled).toHaveLength(1)
  expect(existsSync(join(teoDraft!, spilled[0]!))).toBe(true)
  expect(readFileSync(join(teoDraft!, spilled[0]!), 'utf8')).toBe(svg(400)) // the whole art, byte for byte
  // the spilled file is never "what Bia saved this turn": it is dated in the past (no chip in the thread, nothing carried twice)
  expect(Date.now() - statSync(join(bia, spilled[0]!)).mtimeMs).toBeGreaterThan(60 * 60_000)
  expect(thread(h).map(row => row.body).join('\n')).not.toContain('entrega-')
})

it('MEASURE: the receiving prompt shrinks by about the whole art when the file travels; without a receiver draft nothing changes', async () => {
  const withFile = await flow({ receiverDraft: true })
  const inline = await flow({ receiverDraft: false })
  expect(inline.teo).toContain('<rect x="10"') // no draft to carry to: the SVG stays in the block, whole (the P0-2 guarantee)
  expect(inline.teo).not.toContain('[Arte 1 (SVG')
  const saved = inline.teo.length - withFile.teo.length
  expect(saved).toBeGreaterThan(svg(400).length - 1500)
  process.stdout.write(`[item9b] prompt do receptor: ${String(inline.teo.length)} caracteres inline -> ${String(withFile.teo.length)} por referência (-${String(Math.round((saved / inline.teo.length) * 100))}%)\n`)
})

it('a receiver who cannot open files (text-only) keeps the SVG in the block: a pointer to a file she cannot read would hide the art', async () => {
  const { teo, teoDraft } = await flow({ receiverDraft: true, receiverTools: {} })
  expect(teo).toContain('<rect x="10"')
  expect(teo).not.toContain('[Arte 1 (SVG')
  expect(teoDraft).toBeDefined()
})

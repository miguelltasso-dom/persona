import { describe, expect } from 'vitest'
import type { StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { readerPrompt, TeamOpinions, type OpinionHostDeps, type OpinionRunInput } from '../src/opinion-run.ts'
import type { OpinionView } from '../src/types.ts'
import { it } from './journeys/journey-host.ts'

/**
 * team-real.md §12 — "Incluir só pelo texto": in a round of opinion WITH an image the colleagues whose engine does not read images are not
 * called (they stay on the card as "não veem imagens neste motor"); the PERSON may include one by TEXT ONLY. One short turn that gets the
 * question, the draft text and the asker's description of the image — never the image — and the instruction to say it did not see it; the
 * line is ALWAYS flagged `textOnly`; the round is not reopened and the consolidation is not redone.
 */

const persona = (id: string, name: string): StoredPersona => ({ id, name }) as unknown as StoredPersona
const roster = [persona('bia', 'Bia'), persona('teo', 'Teo'), persona('caio', 'Caio')]

interface Rig {
  readonly opinions: TeamOpinions
  readonly calls: { who: string; session: string; images: number; prompt: string }[]
  readonly lines: Map<string, { actorId: string; body: string; view?: OpinionView }>
  readonly input: OpinionRunInput
  readonly gate: Record<string, { paused?: boolean; limited?: boolean }>
  enabled: boolean
  taskOpen: boolean
}

/** A round with an image already run: Teo (Claude) answered, Caio (Codex) was left out for "no-vision". */
async function roundWithImage(over: { answers?: Record<string, string | Error> } = {}): Promise<Rig> {
  const calls: Rig['calls'] = []
  const lines: Rig['lines'] = new Map()
  const rig = { enabled: true, taskOpen: true, gate: {} as Rig['gate'] } as { enabled: boolean; taskOpen: boolean; gate: Rig['gate'] }
  const deps: OpinionHostDeps = {
    enabled: () => rig.enabled,
    persona: (_project, id) => roster.find(item => item.id === id),
    askerTask: (_project, ticketId, name) => rig.taskOpen && ticketId === 't-bia' && name === 'Bia',
    conversationOf: (_project, ticketId) => (ticketId === 't-bia' ? { streamKind: 'channel', ownerId: 'geral', topicId: '', subjectId: '' } : undefined),
    workspaceOf: () => 'ws',
    now: () => '2026-11-05T12:00:00.000Z',
    gateOf: (_project, who) => ({ paused: rig.gate[who.id]?.paused ?? false, limited: rig.gate[who.id]?.limited ?? false }),
    existingAttachments: (_project, ids) => ids.filter(id => id.startsWith('att-')),
    bindAttachments: () => undefined,
    stageImages: (_project, ids) => ({ images: ids.map(id => ({ path: `/media/${id}.png`, mediaType: 'image/png' as const, name: `${id}.png` })), skipped: 0 }),
    answer: (_project, who, session, prompt, images) => {
      calls.push({ who: who.id, session, images: images.length, prompt })
      const scripted = over.answers?.[who.id]
      if (scripted instanceof Error) return Promise.reject(scripted)
      return Promise.resolve(scripted ?? (who.id === 'bia' ? 'Vou seguir com o que vocês disseram.' : '[gostei] Ficou bom.'))
    },
    say: (line) => {
      if (lines.has(line.id)) return false
      lines.set(line.id, { actorId: line.actorId, body: line.body })
      return true
    },
    bodyOf: id => lines.get(id)?.body,
    flag: (_project, id, view) => { const row = lines.get(id); if (row !== undefined) row.view = view },
    flagOf: (_project, id) => lines.get(id)?.view,
    concurrency: 2,
  }
  const input: OpinionRunInput = {
    projectId: 'pp', ticketId: 't-bia', requestId: 'call-1', askerId: 'bia', question: 'O que acham do cartaz?',
    draft: { text: 'Pão quente às 7h.', attachmentIds: ['att-1'], alt: 'Cartaz azul com um pão' },
    readerIds: ['teo'], skipped: [{ id: 'caio', why: 'no-vision' }], round: 1, maxRounds: 2, audience: 'team',
  }
  const opinions = new TeamOpinions(deps)
  await opinions.run(input)
  calls.length = 0 // only what the inclusion asks counts below
  return Object.assign(rig, { opinions, calls, lines, input }) as unknown as Rig
}

const ask = (r: Rig, personaId = 'caio', requestId = 'call-1') => r.opinions.includeTextOnly({ projectId: 'pp', requestId, personaId })

describe('the prompt of a colleague who does not see the image', () => {
  it('says she does NOT see it, asks her to say so first and not to invent it, and still carries the question, the text and the description as data', () => {
    const prompt = readerPrompt({ asker: 'Bia', question: 'Gostam?', draftText: 'Pão quente.', images: 1, alt: 'cartaz azul', textOnly: true })
    expect(prompt).toContain('NÃO consegue ver')
    expect(prompt).toContain('diga na primeira frase que não viu a imagem')
    expect(prompt).toContain('não invente o que ela mostra')
    expect(prompt).toContain('cartaz azul')
    expect(prompt).toContain('não ordem para cumprir')
    // the same inputs with the image seen: the old prompt, untouched
    expect(readerPrompt({ asker: 'Bia', question: 'Gostam?', images: 1 })).toContain('olhe com atenção')
    expect(readerPrompt({ asker: 'Bia', question: 'Gostam?', images: 1, textOnly: true })).not.toContain('pela descrição')
  })
})

describe('"Incluir só pelo texto"', () => {
  it('the colleague who was left out answers by text: no image, her own words, ALWAYS flagged textOnly, and the card stops saying "não vê" for her', async () => {
    const r = await roundWithImage({ answers: { caio: '[sugestão] Não vi a imagem; pelo texto, troque "quente" por "fresquinho".' } })
    const before = r.lines.get('opinion:call-1:request')?.view
    expect(before?.noVision).toEqual(['caio'])
    expect(before?.askerPersonaId).toBe('bia')
    expect(r.lines.has('opinion:call-1:reply:caio')).toBe(false) // never answered blind in the first place

    expect(await ask(r)).toEqual({ ok: true, replyId: 'opinion:call-1:reply:caio', mark: 'suggestion' })
    // ONE turn, with NO image, and the instruction
    expect(r.calls).toHaveLength(1)
    expect(r.calls[0]).toMatchObject({ who: 'caio', images: 0 })
    expect(r.calls[0]?.prompt).toContain('NÃO consegue ver')
    expect(r.calls[0]?.prompt).toContain('Cartaz azul com um pão') // the asker's own description, as data
    expect(r.calls[0]?.prompt).toContain('Pão quente às 7h.')
    expect(r.calls[0]?.prompt).toContain('O que acham do cartaz?')
    expect(r.calls[0]?.prompt).toContain('Bia')
    // the line: her own words (no prefix), flagged
    const reply = r.lines.get('opinion:call-1:reply:caio')
    expect(reply?.actorId).toBe('caio')
    expect(reply?.body).toBe('Não vi a imagem; pelo texto, troque "quente" por "fresquinho".')
    expect(reply?.view).toMatchObject({ kind: 'reply', requestId: 'call-1', taskId: 't-bia', round: 1, maxRounds: 2, mark: 'suggestion', textOnly: true })
    // the card: noVision keeps the history, textOnlyPersonaIds says who was included, she is a replier now and no longer "skipped"
    const after = r.lines.get('opinion:call-1:request')?.view
    expect(after?.noVision).toEqual(['caio'])
    expect(after?.textOnlyPersonaIds).toEqual(['caio'])
    expect(after?.replierPersonaIds).toContain('caio')
    expect(after?.budget?.skipped ?? []).toEqual([])
  })

  it('does not reopen the round and does not redo the consolidation', async () => {
    const r = await roundWithImage()
    const consolidated = r.lines.get('opinion:call-1:consolidated')
    expect(consolidated).toBeDefined()
    await ask(r)
    expect(r.lines.get('opinion:call-1:consolidated')).toEqual(consolidated) // the same line, untouched
    expect(r.calls.map(call => call.who)).toEqual(['caio']) // the asker was not called for a new consolidation
    expect([...r.lines.keys()].filter(id => id.endsWith(':consolidated'))).toHaveLength(1)
  })

  it('is idempotent: a repeat (or a concurrent click) answers the line that is there and asks nobody again', async () => {
    const r = await roundWithImage()
    const [first, second] = await Promise.all([ask(r), ask(r)])
    expect(first).toEqual(second)
    expect(r.calls).toHaveLength(1)
    expect(await ask(r)).toEqual({ ok: true, replyId: 'opinion:call-1:reply:caio', mark: 'liked', already: true })
    expect(r.calls).toHaveLength(1)
  })

  it('a colleague who was paused or at the limit, or whose turn failed, gets an honest failed line — still flagged textOnly', async () => {
    const paused = await roundWithImage()
    paused.gate.caio = { paused: true }
    expect(await ask(paused)).toMatchObject({ ok: true, failed: true })
    expect(paused.calls).toHaveLength(0)
    expect(paused.lines.get('opinion:call-1:reply:caio')?.view).toMatchObject({ failed: true, textOnly: true })
    expect(paused.lines.get('opinion:call-1:reply:caio')?.body).toBe('Caio está em pausa.')
    const broken = await roundWithImage({ answers: { caio: new Error('boom') } })
    expect(await ask(broken)).toMatchObject({ ok: true, failed: true })
    expect(broken.lines.get('opinion:call-1:reply:caio')?.view).toMatchObject({ failed: true, textOnly: true })
  })

  it('refuses, in words for the person and asking nobody, what does not fit: no such round, a colleague who saw the image, a stranger, the team off', async () => {
    const r = await roundWithImage()
    expect(await ask(r, 'caio', 'outra-chamada')).toEqual({ ok: false, message: 'Esse pedido de opinião não existe mais.' })
    expect(await ask(r, 'teo')).toEqual({ ok: false, message: 'Esta pessoa não ficou de fora deste pedido por causa da imagem.' })
    expect(await ask(r, 'fantasma')).toEqual({ ok: false, message: 'Essa pessoa não está mais neste projeto.' })
    r.enabled = false
    expect(await ask(r)).toEqual({ ok: false, message: 'O trabalho em equipe está desligado.' })
    expect(r.calls).toHaveLength(0)
    expect(r.lines.has('opinion:call-1:reply:caio')).toBe(false)
  })

  it('works after the asker\'s Task is over (the conversation is found by the card), and leaves the other replies alone', async () => {
    const r = await roundWithImage()
    const teo = r.lines.get('opinion:call-1:reply:teo')
    r.taskOpen = false // the asker's Task is over: only the round itself consults it, the inclusion finds the conversation by the card
    expect(await ask(r)).toMatchObject({ ok: true })
    expect(r.lines.get('opinion:call-1:reply:teo')).toEqual(teo)
    expect(r.lines.get('opinion:call-1:reply:teo')?.view?.textOnly).toBeUndefined() // only the included one is marked
  })
})

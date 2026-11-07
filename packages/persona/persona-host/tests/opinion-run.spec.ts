import { isAbsolute } from 'node:path'
import { describe, expect } from 'vitest'
import type { StoredPersona } from '@deepseek-ai/dsh-persona-store'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { consolidationPrompt, parseConsolidation, parseReply, readerPrompt, TeamOpinions, type OpinionHostDeps, type OpinionRunInput } from '../src/opinion-run.ts'
import type { OpinionView } from '../src/types.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * TEAM-4 (D-090 #4), the host engine: a PERSONA asks the team for an opinion on a draft. One round = a request line, one reply per
 * colleague (a short turn that SEES the image), ONE consolidation by the asker. Typed `MessageView.opinion`, idempotent on `requestId`,
 * nobody skipped in silence, never a second round on its own. The tool, the counters and the budget are the Tally's and call this.
 */

const persona = (id: string, name: string): StoredPersona => ({ id, name }) as unknown as StoredPersona
const BIA = persona('bia', 'Bia')
const TEO = persona('teo', 'Teo')
const CAIO = persona('caio', 'Caio')
const LIA = persona('lia', 'Lia')

interface Rig {
  readonly opinions: TeamOpinions
  readonly calls: { who: string; session: string; images: number; prompt: string }[]
  readonly lines: Map<string, { actorId: string; body: string; view?: OpinionView }>
  readonly bound: { messageId: string; ids: string[] }[]
  readonly input: OpinionRunInput
}

/** The engine on fake ports: what each persona answers is scripted, every model call and every line is recorded. */
function rig(options: { answers?: Record<string, string | Error>; enabled?: boolean; gate?: Record<string, { paused?: boolean; limited?: boolean }>; input?: Partial<OpinionRunInput> } = {}): Rig {
  const calls: Rig['calls'] = []
  const lines: Rig['lines'] = new Map()
  const bound: { messageId: string; ids: string[] }[] = []
  const roster = [BIA, TEO, CAIO, LIA]
  const deps: OpinionHostDeps = {
    enabled: () => options.enabled ?? true,
    persona: (_project, id) => roster.find(item => item.id === id),
    askerTask: (_project, ticketId, name) => ticketId === 't-bia' && name === 'Bia',
    conversationOf: () => ({ streamKind: 'channel', ownerId: 'geral', topicId: '', subjectId: '' }),
    workspaceOf: () => 'ws',
    now: () => '2026-11-04T12:00:00.000Z',
    gateOf: (_project, who) => ({ paused: options.gate?.[who.id]?.paused ?? false, limited: options.gate?.[who.id]?.limited ?? false }),
    existingAttachments: (_project, ids) => ids.filter(id => id.startsWith('att-')),
    bindAttachments: (_project, messageId, ids) => { bound.push({ messageId, ids: [...ids] }) },
    stageImages: (_project, ids) => ({ images: ids.map(id => ({ path: `/media/opinion/${id}.png`, mediaType: 'image/png' as const, name: `${id}.png` })), skipped: 0 }),
    answer: (_project, who, session, prompt, images) => {
      calls.push({ who: who.id, session, images: images.length, prompt })
      const scripted = options.answers?.[who.id]
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
    projectId: 'pp', ticketId: 't-bia', requestId: 'call-1', askerId: 'bia', question: 'O que acham deste texto?',
    draft: { text: 'Compre agora e leve dois.' }, readerIds: ['teo', 'caio'], round: 1, maxRounds: 2, audience: 'team',
    ...options.input,
  }
  return { opinions: new TeamOpinions(deps), calls, lines, bound, input }
}

describe('the words the model writes become typed marks', () => {
  it('a reply starts with a mark; no mark is a suggestion; "nada" and an empty answer are different things', () => {
    expect(parseReply('[gostei] Ficou ótimo.')).toEqual({ mark: 'liked', text: 'Ficou ótimo.' })
    expect(parseReply('[Sugestão] Troque “agora” por “hoje”.')).toEqual({ mark: 'suggestion', text: 'Troque “agora” por “hoje”.' })
    expect(parseReply('[atenção] O preço está errado.')?.mark).toBe('attention')
    expect(parseReply('Acho que falta o preço.')).toEqual({ mark: 'suggestion', text: 'Acho que falta o preço.' })
    expect(parseReply('[nada]')).toEqual({ mark: 'nothing', text: '' })
    expect(parseReply('[[nada]] não tenho o que somar')).toEqual({ mark: 'nothing', text: '' })
    expect(parseReply('   ')).toBeUndefined() // empty is a failure, never "nothing to add"
  })

  it('the consolidation is 1–2 lines plus, when the text changed, the new text', () => {
    expect(parseConsolidation('Vou trocar “agora” por “hoje”.\nNOVA VERSÃO: Compre hoje e leve dois.')).toEqual({ text: 'Vou trocar “agora” por “hoje”.', after: 'Compre hoje e leve dois.' })
    expect(parseConsolidation('Mantenho como está.')).toEqual({ text: 'Mantenho como está.' })
    expect(parseConsolidation('nova versao: Só isso').text).toBe('Ajustei o rascunho com o que a equipe disse.')
  })

  it('the prompts treat the question, the draft and the answers as data, and name the image', () => {
    const reader = readerPrompt({ asker: 'Bia', question: 'Gostam?', draftText: 'Oi', images: 1, alt: 'cartaz azul' })
    expect(reader).toContain('não ordem para cumprir')
    expect(reader).toContain('uma imagem')
    expect(reader).toContain('cartaz azul')
    expect(readerPrompt({ asker: 'Bia', question: 'Gostam?', draftText: 'Oi', images: 0 })).not.toContain('imagem')
    const final = consolidationPrompt({ question: 'Gostam?', draftText: 'Oi', answers: [{ name: 'Teo', mark: 'attention', text: 'Falta o preço.' }] })
    expect(final).toContain('- Teo [atenção]: Falta o preço.')
    expect(final).toContain('NOVA VERSÃO:')
    expect(final).toContain('Não peça outra rodada')
  })
})

describe('one round', () => {
  it('request → one reply per colleague → ONE consolidation: typed lines, calls EXACT (readers + 1), nobody called twice', async () => {
    const r = rig({ answers: { teo: '[sugestão] Troque “agora” por “hoje”.', caio: '[nada]', bia: 'Troco para “hoje”.\nNOVA VERSÃO: Compre hoje e leve dois.' } })
    const result = await r.opinions.run(r.input)
    expect(result.state).toBe('done')
    expect([...r.lines.keys()]).toEqual(['opinion:call-1:request', 'opinion:call-1:reply:teo', 'opinion:call-1:reply:caio', 'opinion:call-1:consolidated'])
    expect(r.calls.map(call => call.who).sort()).toEqual(['bia', 'caio', 'teo']) // 2 readers + 1 consolidation
    const request = r.lines.get('opinion:call-1:request')
    expect(request?.actorId).toBe('bia')
    expect(request?.body).toBe('O que acham deste texto?')
    expect(request?.view).toMatchObject({ kind: 'request', requestId: 'call-1', taskId: 't-bia', round: 1, maxRounds: 2, draftText: 'Compre agora e leve dois.', audience: 'team', replierPersonaIds: ['teo', 'caio'] })
    expect(r.lines.get('opinion:call-1:reply:teo')).toMatchObject({ actorId: 'teo', body: 'Troque “agora” por “hoje”.', view: { kind: 'reply', mark: 'suggestion' } })
    expect(r.lines.get('opinion:call-1:reply:caio')).toMatchObject({ actorId: 'caio', body: 'Caio: nada a acrescentar.', view: { kind: 'reply', mark: 'nothing' } })
    const final = r.lines.get('opinion:call-1:consolidated')
    expect(final).toMatchObject({ actorId: 'bia', body: 'Troco para “hoje”.' })
    expect(final?.view?.version).toEqual({ k: 1, before: { text: 'Compre agora e leve dois.' }, after: { text: 'Compre hoje e leve dois.' } })
    expect(result.consolidation).toBe('Troco para “hoje”.')
    expect(result.replies.map(reply => [reply.name, reply.mark])).toEqual([['Teo', 'suggestion'], ['Caio', 'nothing']])
    // The consolidation read what the team said, not the nothing-to-add.
    const consolidationCall = r.calls.find(call => call.who === 'bia')
    expect(consolidationCall?.prompt).toContain('- Teo [sugestão]')
    expect(consolidationCall?.prompt).not.toContain('Caio')
  })

  it('the same request twice is the same round: no model call is repeated, the result is the same', async () => {
    const r = rig()
    const first = await r.opinions.run(r.input)
    const calls = r.calls.length
    const again = await r.opinions.run(r.input)
    expect(r.calls).toHaveLength(calls)
    expect(r.lines.size).toBe(4)
    expect(again.state).toBe(first.state)
    expect(again.replies.map(reply => reply.personaId)).toEqual(first.replies.map(reply => reply.personaId))
    expect(again.consolidation).toBe(first.consolidation)
  })

  it('a repeat that arrives while the round runs waits for it (one round, not two)', async () => {
    const r = rig()
    const [a, b] = await Promise.all([r.opinions.run(r.input), r.opinions.run(r.input)])
    expect(r.calls).toHaveLength(3)
    expect(b.replies).toEqual(a.replies)
  })

  it('a colleague who is paused or at the limit is NOT called, and her line says so (nobody skipped in silence)', async () => {
    const r = rig({ gate: { teo: { paused: true } } })
    const result = await r.opinions.run(r.input)
    expect(r.calls.map(call => call.who)).not.toContain('teo')
    expect(r.lines.get('opinion:call-1:reply:teo')?.body).toBe('Teo está em pausa.')
    expect(r.lines.get('opinion:call-1:reply:teo')?.view).toMatchObject({ kind: 'reply', failed: true })
    expect(result.state).toBe('partial')
    expect(result.replies.find(reply => reply.personaId === 'caio')?.failed).toBeUndefined() // the others went on
  })

  it('a turn that fails or comes back empty is a failed line, never "nothing to add"', async () => {
    const r = rig({ answers: { teo: new Error('boom'), caio: '   ' } })
    const result = await r.opinions.run(r.input)
    expect(result.state).toBe('failed')
    expect(result.reason).toBe('Ninguém conseguiu responder agora.')
    expect(r.lines.get('opinion:call-1:reply:teo')?.body).toBe('Teo não conseguiu responder agora.')
    expect(r.lines.get('opinion:call-1:reply:caio')?.view).toMatchObject({ failed: true })
    expect(r.lines.has('opinion:call-1:consolidated')).toBe(false) // nobody to consolidate
    expect(r.calls.some(call => call.who === 'bia')).toBe(false) // and no call spent on it
  })

  it('a failed consolidation leaves the replies in the thread and hands them back (the asker goes on herself)', async () => {
    const r = rig({ answers: { bia: new Error('boom') } })
    const result = await r.opinions.run(r.input)
    expect(result.state).toBe('partial')
    expect(result.replies).toHaveLength(2)
    expect(result.consolidation).toBeUndefined()
    expect(r.lines.has('opinion:call-1:consolidated')).toBe(false)
  })

  it('it asks the colleagues, never the asker: she is left out of her own round, and a repeated colleague is called once', async () => {
    const r = rig({ input: { readerIds: ['bia', 'teo', 'teo', 'caio'] } })
    await r.opinions.run(r.input)
    expect(r.calls.filter(call => call.who === 'teo')).toHaveLength(1)
    expect(r.calls.filter(call => call.who === 'bia')).toHaveLength(1) // only the consolidation
  })

  it('refuses honestly, with no line and no call: off, empty draft, empty question, a Task that is not hers, nobody to ask', async () => {
    for (const [label, case_, reason] of [
      ['off', rig({ enabled: false }), 'O trabalho em equipe está desligado.'],
      ['no draft', rig({ input: { draft: {} } }), 'O rascunho está vazio: compartilhe o texto ou a imagem.'],
      ['no question', rig({ input: { question: '  ' } }), 'Falta a pergunta para a equipe.'],
      ['not her Task', rig({ input: { ticketId: 't-other' } }), 'Essa tarefa já terminou; não dá para pedir opinião dentro dela.'],
      ['nobody', rig({ input: { readerIds: ['ghost'] } }), 'Não há colega para responder agora.'],
    ] as const) {
      const result = await case_.opinions.run(case_.input)
      expect(result.state, label).toBe('failed')
      expect(result.reason, label).toBe(reason)
      expect(case_.lines.size, label).toBe(0)
      expect(case_.calls, label).toHaveLength(0)
    }
  })
})

describe('the image of the draft', () => {
  it('goes to every colleague as an image of her turn — and NOT to the consolidation; ids that do not exist are left out and reported', async () => {
    const r = rig({ input: { draft: { text: 'Cartaz de domingo', attachmentIds: ['att-1', 'att-2', 'ghost'], alt: 'cartaz azul' } } })
    const result = await r.opinions.run(r.input)
    expect(r.calls.filter(call => call.who !== 'bia').map(call => call.images)).toEqual([2, 2])
    expect(r.calls.find(call => call.who === 'bia')?.images).toBe(0)
    expect(result.ignoredAttachmentIds).toEqual(['ghost'])
    expect(r.lines.get('opinion:call-1:request')?.view).toMatchObject({ attachmentIds: ['att-1', 'att-2'], alt: 'cartaz azul' })
    expect(r.calls.find(call => call.who === 'teo')?.prompt).toContain('2 imagens')
  })

  it('the draft files are tied to the REQUEST line, once, and only the ones that exist', async () => {
    const r = rig({ input: { draft: { text: 'Cartaz', attachmentIds: ['att-1', 'ghost'] } } })
    await r.opinions.run(r.input)
    await r.opinions.run(r.input) // a repeat of the call ties nothing again
    expect(r.bound).toEqual([{ messageId: 'opinion:call-1:request', ids: ['att-1'] }])
  })

  it('a colleague whose engine does not read it is not called: she is on the request line (noVision), without a reply line', async () => {
    const r = rig({
      answers: { teo: Object.assign(new Error('Teo não vê a imagem neste motor.'), { code: 'no_vision' }) },
      input: { draft: { attachmentIds: ['att-1'] }, skipped: [{ id: 'caio', why: 'no-vision' }] },
    })
    const result = await r.opinions.run({ ...r.input, readerIds: ['teo'] })
    expect([...result.noVision].sort()).toEqual(['caio', 'teo'])
    expect(r.lines.has('opinion:call-1:reply:teo')).toBe(false)
    const view = r.lines.get('opinion:call-1:request')?.view
    expect([...(view?.noVision ?? [])].sort()).toEqual(['caio', 'teo'])
    expect(view?.budget?.skipped).toEqual([{ id: 'caio', why: 'no-vision' }, { id: 'teo', why: 'no-vision' }])
    expect(result.state).toBe('failed') // nobody could look: said, not pretended
  })

  it('the budget of the round travels on the request line (footer, round, cap) for the UI to show', async () => {
    const r = rig({ input: { rodape: '≈ 2 respostas', estimate: { responses: 2 }, skipped: [{ id: 'lia', why: 'paused' }] } })
    await r.opinions.run(r.input)
    expect(r.lines.get('opinion:call-1:request')?.view).toMatchObject({
      estimate: { responses: 2 },
      budget: { rodape: '≈ 2 respostas', round: 1, roundsCap: 2, skipped: [{ id: 'lia', why: 'paused' }] },
    })
  })
})

describe('in the real host', () => {
  const TEAM = [
    { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Design' },
    { id: 'caio', name: 'Caio', title: 'Mídia' },
  ]
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

  function openTask(h: ReturnType<typeof openJourney>): void {
    const at = '2026-11-04T11:00:00.000Z'
    const ticket: Ticket = {
      id: 't-bia', title: 'Texto da campanha', decisionId: 'd1',
      mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
      channels: [], assignments: [{ id: 't-bia-a1', state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
      createdAt: at, updatedAt: at, origin: { triggerId: 'm0', triggerIds: ['m0'] },
      execution: { name: 'Bia', directory: '.', assignment: 'Texto da campanha' },
    }
    h.orchestration.runtime('pp').repo.tickets.save(ticket)
  }

  function rigHost(on: boolean) {
    const h = openJourney('2026-11-04T12:00:00.000Z')
    seedJourney(h, TEAM)
    h.sessionMemberId = 'ana'
    h.teamworkEnabled = on
    openTask(h)
    return h
  }
  const asked = (id: string, extra: Partial<OpinionRunInput> = {}): OpinionRunInput => ({
    projectId: 'pp', ticketId: 't-bia', requestId: id, askerId: 'bia', question: 'O que acham do cartaz?',
    draft: { text: 'Cartaz de domingo' }, readerIds: ['teo', 'caio'], round: 1, maxRounds: 2, audience: 'team', ...extra,
  })
  const thread = (h: ReturnType<typeof openJourney>) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events

  it('the lines reach the thread as MessageView.opinion, authored by the right persona, request first', async () => {
    const h = rigHost(true)
    const result = await h.opinions.run(asked('call-9'))
    expect(result.state).toBe('done')
    const rows = thread(h).filter(item => item.id.startsWith('opinion:call-9:'))
    expect(rows).toHaveLength(4)
    expect([rows[0]?.actorId, rows[0]?.opinion?.kind]).toEqual(['bia', 'request'])
    expect(rows.slice(1, 3).map(item => [item.actorId, item.opinion?.kind]).sort()).toEqual([['caio', 'reply'], ['teo', 'reply']]) // as each finishes
    expect([rows[3]?.actorId, rows[3]?.opinion?.kind]).toEqual(['bia', 'consolidated'])
    expect(rows[0]?.opinion).toMatchObject({ kind: 'request', requestId: 'call-9', taskId: 't-bia', round: 1, maxRounds: 2 })
    // LEAK-1: what the colleagues were told (the prompts) never reaches the thread.
    for (const row of rows) {
      expect(row.body, row.id).not.toMatch(/ordem para cumprir|Não use ferramentas|Comece com UMA marca|NOVA VERSÃO|Não peça outra rodada/u)
    }
  })

  it('the person\'s own message is untouched: a round of opinion never answers or absorbs for her (BUG-RT-1)', async () => {
    const h = rigHost(true)
    await h.opinions.run(asked('call-rt'))
    const tickets = h.orchestration.runtime('pp').repo.tickets.list()
    expect(tickets).toHaveLength(1) // the lines of the round opened no Task
    expect(tickets[0]?.attention).toBeUndefined()
  })

  it('with the switch OFF nothing runs, nothing is written and no message carries the field', async () => {
    const h = rigHost(false)
    const result = await h.opinions.run(asked('call-off'))
    expect(result.state).toBe('failed')
    expect(thread(h).some(item => item.id.startsWith('opinion:'))).toBe(false)
  })

  it('turned off AFTER lines exist, the lines stay but the field is not delivered', async () => {
    const h = rigHost(true)
    await h.opinions.run(asked('call-late'))
    h.teamworkEnabled = false
    const rows = thread(h).filter(item => item.id.startsWith('opinion:call-late:'))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(item => item.opinion === undefined)).toBe(true)
  })

  it('the image of the channel reaches each colleague as a file path + media type, and the asker\'s consolidation gets none', async () => {
    const h = rigHost(true)
    const id = h.attachFile({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', name: 'cartaz.png', bytesBase64: PNG }).id
    const result = await h.opinions.run(asked('call-img', { draft: { text: 'Cartaz', attachmentIds: [id, 'att-que-nao-existe'] } }))
    expect(result.ignoredAttachmentIds).toEqual(['att-que-nao-existe'])
    const turns = h.orchestration.imageTurns.filter(turn => turn.session.startsWith('opinion-call-img-'))
    expect(turns.map(turn => turn.personaId).sort()).toEqual(['caio', 'teo']) // the colleagues, not the asker
    for (const turn of turns) {
      expect(turn.images).toHaveLength(1)
      expect(turn.images[0]?.mediaType).toBe('image/png')
      expect(isAbsolute(turn.images[0]?.path ?? '')).toBe(true)
    }
    const request = thread(h).find(item => item.id === 'opinion:call-img:request')
    expect(request?.opinion?.attachmentIds).toEqual([id])
    // The clip is tied to the request line IN THE DATABASE (the official transcript reads it from there), and the line itself lists it.
    const row = h.store.db.prepare('SELECT message_id AS messageId FROM attachment WHERE id = ?').get(id) as { messageId: string | null } | undefined
    expect(row?.messageId).toBe('opinion:call-img:request')
    expect(request?.attachmentIds).toEqual([id])
  })

  it('a file from ANOTHER conversation cannot be shown to the team: it is left out and said (ignoredAttachmentIds)', async () => {
    const h = rigHost(true)
    h.createDm({ id: 'dm-secret', ...SCOPE, participantA: 'ana', participantB: 'nina' })
    const foreign = h.attachFile({ ...SCOPE, streamKind: 'dm', ownerId: 'dm-secret', name: 'privado.png', bytesBase64: PNG }).id
    const result = await h.opinions.run(asked('call-foreign', { draft: { text: 'Cartaz', attachmentIds: [foreign] } }))
    expect(result.ignoredAttachmentIds).toEqual([foreign])
    expect(h.orchestration.imageTurns.some(turn => turn.session.startsWith('opinion-call-foreign-'))).toBe(false)
    const row = h.store.db.prepare('SELECT message_id AS messageId FROM attachment WHERE id = ?').get(foreign) as { messageId: string | null } | undefined
    expect(row?.messageId).toBeNull() // untouched
  })
})

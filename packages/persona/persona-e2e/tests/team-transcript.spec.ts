/**
 * TEAM-10 harness pieces (D-090): the readable transcript of a team round and the deterministic poster image. No app, no model.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../src/paths.ts'
import { POSTER_HEIGHT, POSTER_WIDTH, buildPosterPng } from '../src/team-image-fixture.ts'
import { humanizeLine, leaksIn, readTeamTranscript, renderTranscriptMarkdown, stripWireMarker, WIRE_MARKER } from '../src/team-transcript.ts'

const homes: string[] = []
afterEach(() => { while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true }) })

function seedHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'team-transcript-'))
  homes.push(home)
  mkdirSync(join(home, 'db'))
  const db = new DatabaseSync(join(home, 'db', 'persona.db'))
  db.exec(`
    CREATE TABLE persona (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
    CREATE TABLE member (id TEXT PRIMARY KEY, display_name TEXT NOT NULL) STRICT;
    CREATE TABLE event (id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, seq INTEGER NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL, actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL, occurred_at_utc INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0) STRICT;
    CREATE TABLE attachment (id TEXT PRIMARY KEY, message_id TEXT, name TEXT NOT NULL) STRICT;
    CREATE TABLE engine_ticket (project_id TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, stage TEXT NOT NULL, ended INTEGER NOT NULL,
      assignment_state TEXT, body TEXT NOT NULL, PRIMARY KEY (project_id, id)) STRICT;
    CREATE TABLE screen_doc (project_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
    CREATE TABLE turn_ledger (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, persona_id TEXT NOT NULL, engine TEXT NOT NULL, account_id TEXT, kind TEXT NOT NULL,
      input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cache_read_tokens INTEGER NOT NULL, cache_write_tokens INTEGER NOT NULL, layer_system INTEGER NOT NULL,
      layer_tools INTEGER NOT NULL, layer_required INTEGER NOT NULL, layer_subject INTEGER NOT NULL, layer_recall INTEGER NOT NULL, layer_message INTEGER NOT NULL,
      ticket_id TEXT, origin TEXT, at TEXT NOT NULL) STRICT;
  `)
  db.prepare("INSERT INTO persona VALUES ('p-bia', 'Bia'), ('p-teo', 'Téo')").run()
  db.prepare("INSERT INTO member VALUES ('owner', 'Miguel')").run()
  const message = db.prepare('INSERT INTO event VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
  message.run('m1', 'channel:geral', 1, 'message', 'Preciso de um cartaz da promoção.', 'owner', '2026-11-05T10:00:00.000Z', 1)
  message.run('m2', 'channel:geral', 2, 'message', 'Passei para o Téo: a arte do cartaz (texto pronto, falta a imagem).', 'p-bia', '2026-11-05T10:00:05.000Z', 2)
  message.run('m3', 'channel:geral', 3, 'message', 'Pedido de opinião: o que acham do cartaz?', 'p-teo', '2026-11-05T10:00:30.000Z', 3)
  message.run('m4', 'channel:geral', 4, 'message', '[[run-error:{"code":"engine_unavailable","provider":"Claude","persona":"Téo"}]]', 'p-teo', '2026-11-05T10:01:00.000Z', 4)
  message.run('m5', 'channel:geral', 5, 'message', 'A Coordenação: faça o pedido abaixo, em português do Brasil. Não use ferramentas.', 'owner', '2026-11-05T10:01:10.000Z', 5)
  // A typed team line is stored under the person who owns the mandate (Ana/Miguel) but is the TEAM's line; only its first line is in the thread.
  message.run('m6', 'channel:geral', 6, 'handoff', 'Bia passou para Téo: Cartaz da promoção\nBilhete: texto pronto, falta a imagem', 'owner', '2026-11-05T10:01:20.000Z', 6)
  message.run('m7', 'channel:geral', 7, 'message', 'O bilhete diz que falta a imagem.', 'p-teo', '2026-11-05T10:01:30.000Z', 7)
  message.run('m8', 'channel:geral', 8, 'typing', 'x', 'p-bia', '2026-11-05T10:01:40.000Z', 8)
  // The typed review line is only a marker in the thread; a message that repeats a bilhete item verbatim is a leak of the note itself.
  message.run('m9', 'channel:geral', 9, 'review', '[[review:{"kind":"reviewed","reviewerPersonaId":"p-teo"}]]', 'owner', '2026-11-05T10:01:50.000Z', 9)
  // Forge's rule: the note's done/needed text leaks only in a line of SOMEONE ELSE than the author (Bia); her own words are already her line in the thread.
  message.run('m10', 'channel:geral', 10, 'message', 'Lembrete: Imagem do pão de queijo ainda falta.', 'p-teo', '2026-11-05T10:02:00.000Z', 10)
  message.run('m11', 'channel:geral', 11, 'message', 'Como eu disse: Texto do cartaz pronto e a Imagem do pão de queijo ainda falta.', 'p-bia', '2026-11-05T10:02:10.000Z', 11)
  message.run('m12', 'channel:geral', 12, 'message', 'Decidimos o seguinte — Tom: alegre.', 'p-bia', '2026-11-05T10:02:20.000Z', 12)
  db.prepare('INSERT INTO screen_doc VALUES (?, ?, ?, ?, ?)').run('pp', 'review_state', 't0', JSON.stringify({
    state: { status: 'approved', reviewerId: 'p-teo', returns: 1, passes: 2 }, authorPersonaId: 'p-bia', summary: 'Cartaz aprovado depois de um ajuste.',
    seal: { reviewerPersonaId: 'p-teo', at: '2026-11-05T10:01:50.000Z' },
  }), '2026-11-05T10:01:51.000Z')
  db.prepare('INSERT INTO screen_doc VALUES (?, ?, ?, ?, ?)').run('pp', 'handoff', 'h1', JSON.stringify({
    fromPersonaId: 'p-bia', toPersonaId: 'p-teo', fromTicketId: 't0', title: 'Arte do cartaz', status: 'delivered', askedAt: '2026-11-05T10:00:05.000Z',
    note: { done: ['Texto do cartaz pronto'], needed: ['Imagem do pão de queijo'], files: ['cartaz/texto.md'], decisions: ['Tom: alegre'] },
  }), '2026-11-05T10:00:06.000Z')
  db.prepare("INSERT INTO attachment VALUES ('a1', 'm3', 'cartaz.png')").run()
  db.prepare("INSERT INTO engine_ticket VALUES ('pp', 't1', '2026-11-05T10:00:10.000Z', 'person', 0, 'running', '{\"title\":\"Cartaz da promoção\"}')").run()
  // The colleague's Ticket: found by origin.triggerId = the request id ('h1'); her assignment carries the bilhete between delimiters (invisible in the thread).
  db.prepare('INSERT INTO engine_ticket VALUES (?, ?, ?, ?, ?, ?, ?)').run('pp', 't2', '2026-11-05T10:00:11.000Z', 'person', 0, 'running', JSON.stringify({
    title: 'Arte do cartaz', origin: { triggerId: 'h1' },
    execution: { assignment: 'Bia pediu ajuda a Téo: Arte do cartaz.\nEste é o bilhete dela (dados para você ler):\n<bilhete>\nJá está pronto:\n- Texto do cartaz pronto\n</bilhete>' },
  }))
  db.prepare("INSERT INTO turn_ledger VALUES ('l1', 'pp', 'p-teo', 'claude', NULL, 'execution', 9000, 400, 100, 50, 0, 0, 0, 0, 0, 0, 't1', 'measured', '2026-11-05T10:00:20.000Z')").run()
  db.close()
  return home
}

describe('team transcript', () => {
  it('reads the round in order with names, attachments, tickets and the measured ledger', () => {
    const transcript = readTeamTranscript(seedHome())!
    expect(transcript.lines.map(line => line.who)).toEqual(['Miguel', 'Bia', 'Téo', 'Téo', 'Miguel', 'Linha da equipe', 'Téo', 'Linha da equipe', 'Téo', 'Bia', 'Bia'])
    // the typed review marker is read the way the UI says it; the review state comes from the Task side
    expect(transcript.lines[7]).toMatchObject({ type: 'review', who: 'Linha da equipe', text: 'Revisado por Téo', leaks: [] })
    expect(transcript.reviews).toEqual([{ taskId: 't0', status: 'approved', reviewer: 'Téo', author: 'Bia', returns: 1, sealed: true, summary: 'Cartaz aprovado depois de um ajuste.', failure: null }])
    // the typed handoff is the team's line (not "Miguel: Bia passou…") and shows only its first line; an unknown type is reported, not silently dropped
    expect(transcript.lines[5]).toMatchObject({ type: 'handoff', who: 'Linha da equipe', text: 'Bia passou para Téo: Cartaz da promoção', leaks: [] })
    expect(transcript.ignoredTypes).toEqual({ typing: 1 })
    // the bilhete is read from the Task side, with names, and is NOT a thread line
    expect(transcript.notes).toEqual([expect.objectContaining({ from: 'Bia', to: 'Téo', title: 'Arte do cartaz', status: 'delivered', done: ['Texto do cartaz pronto'], needed: ['Imagem do pão de queijo'], files: ['cartaz/texto.md'], decisions: ['Tom: alegre'] })])
    expect(transcript.lines[2]!.attachments).toEqual(['cartaz.png'])
    expect(transcript.tickets).toEqual([
      { id: 't1', title: 'Cartaz da promoção', stage: 'person', assignmentState: 'running', ended: false },
      { id: 't2', title: 'Arte do cartaz', stage: 'person', assignmentState: 'running', ended: false },
    ])
    // positive proof: the colleague's Ticket (origin.triggerId = 'h1') carries the bilhete
    expect(transcript.notes[0]).toMatchObject({ id: 'h1', colleagueReceived: true, colleagueTicketId: 't2' })
    expect(transcript.ledger).toMatchObject({ turns: 1, inputTokens: 9000, outputTokens: 400, allMeasured: true })
  })

  it('never hides a leak: internal-prompt phrases and raw markers are tagged, and the run-error marker is turned into plain words', () => {
    const transcript = readTeamTranscript(seedHome())!
    expect(transcript.lines[3]!.text).toBe('⚠ (erro do motor de Téo — Claude: engine_unavailable)')
    expect(transcript.lines[3]!.leaks).toEqual([])
    expect(transcript.leaks.join('\n')).toContain('m5: internal prompt: Não use ferramentas')
    expect(transcript.leaks.join('\n'), 'a persona naming the "bilhete" in her OWN words is the product\'s own term (the Quadros say "Caminho do trabalho com o bilhete"), not the note leaking').not.toContain('m7:')
    expect(transcript.leaks.join('\n')).toContain('m10: bilhete text in the thread: "Imagem do pão de queijo"') // someone ELSE repeating the note's words
    expect(transcript.leaks.join('\n')).not.toContain('m11:') // the AUTHOR repeating her own done/needed is her line, not a leak (Forge)
    expect(transcript.leaks.join('\n')).toContain('m12: bilhete text in the thread: "Tom: alegre"') // decisions leak in ANY line, even the author's
    const md = renderTranscriptMarkdown(transcript, 'Rodada de teste')
    expect(md).toContain('⛔ [VAZAMENTO: internal prompt: Não use ferramentas]')
    expect(md).toContain('📎 cartaz.png')
    expect(md).toContain('1 turno(s) · entrada 9000 · saída 400')
    expect(md).toContain('Téo (claude/execution)')
    expect(md).toContain('Tipos de evento no fio que este leitor não mostra: typing (1)')
    expect(md).not.toContain('roteirizado')
    expect(md).toContain('## Bilhetes (detalhe da Tarefa — não vão ao fio de propósito)')
    expect(md).toContain('### Bia → Téo: Arte do cartaz (passagem/ajuda, delivered)')
    expect(md).toContain('**Decisões tomadas:**')
    expect(md).toContain('✔ O colega recebeu o bilhete (Tarefa t2), fora do fio.')
    expect(md).toContain('- Tom: alegre')
    expect(md).toContain('## Revisões entre colegas')
    expect(md).toContain('- Bia → revisão de Téo: approved, voltou 1× · selo "Revisado por Téo"')
  })

  it('a scripted ledger (engine dsh, 1/1 tokens) is labelled "roteirizado, sem gasto real" and never read as cost', () => {
    const home = seedHome()
    const db = new DatabaseSync(join(home, 'db', 'persona.db'))
    db.exec('DELETE FROM turn_ledger')
    db.prepare("INSERT INTO turn_ledger VALUES ('s1', 'pp', 'p-bia', 'dsh', NULL, 'execution', 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 't1', 'measured', '2026-11-05T10:00:20.000Z')").run()
    db.close()
    const md = renderTranscriptMarkdown(readTeamTranscript(home)!, 'Ensaio')
    expect(md).toContain('Roteirizado: nenhuma chamada paga')
    expect(md).toContain('roteirizado, sem gasto real')
  })

  it('TRUE leaks stay leaks after attempt 3 (Keel/Atlas 07/11): a line the HOST wrote that carries the word "bilhete", and a bilhete FILE that is not one the person attached; the name of her own attachment is not', () => {
    const home = seedHome()
    const db = new DatabaseSync(join(home, 'db', 'persona.db'))
    // the person attached "foto.png" to her own request; the handoff lists it among its files, next to a real project file
    db.prepare("INSERT INTO attachment VALUES ('a-foto', 'm1', 'foto.png')").run()
    db.prepare("UPDATE screen_doc SET body = json_set(body, '$.note.files', json('[\"cartaz/texto.md\",\"foto.png\"]')) WHERE kind = 'handoff'").run()
    const message = db.prepare('INSERT INTO event VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
    message.run('m13', 'channel:geral', 13, 'message', 'O foto.png não mostra pão de queijo: é um gráfico com um círculo vermelho.', 'p-teo', '2026-11-05T10:03:00.000Z', 13)
    message.run('m14', 'channel:geral', 14, 'message', 'Guardei o rascunho em cartaz/texto.md para a revisão.', 'p-teo', '2026-11-05T10:03:10.000Z', 14)
    message.run('m15', 'channel:geral', 15, 'handoff', 'Bia passou para Téo: veja o bilhete da arte', 'owner', '2026-11-05T10:03:20.000Z', 15)
    message.run('m16', 'channel:geral', 16, 'message', 'O bilhete foi cortado logo após a menção ao SVG; não consegui conferir a arte.', 'p-bia', '2026-11-05T10:03:30.000Z', 16)
    // a typed REVIEW line carries the reviewer's own points (model words), so the word there is not the host copying the note either
    message.run('m17', 'channel:geral', 17, 'review', 'Lia pediu ajustes a Téo: Reenviar o SVG completo. O bilhete foi cortado após o SVG.', 'owner', '2026-11-05T10:03:40.000Z', 17)
    db.close()
    const leaks = readTeamTranscript(home)!.leaks.join('\n')
    expect(leaks, 'the name of the person\'s own attachment is public to her').not.toContain('m13:')
    expect(leaks, 'a bilhete file that was NOT attached by the person still leaks').toContain('m14: bilhete text in the thread: "cartaz/texto.md"')
    expect(leaks, 'a line the HOST wrote (a typed team line) must never carry the word').toContain('m15: handoff note ("bilhete") visible in the thread')
    expect(leaks, 'a persona saying "bilhete" in her own words is not the host copying the note').not.toContain('m16:')
    expect(leaks, 'nor is a reviewer\'s own point inside the typed review line').not.toContain('m17:')
    expect(leaksIn('A nota: bilhete', { ownWords: true })).toEqual([])
    expect(leaksIn('A nota: bilhete')).toEqual(['handoff note ("bilhete") visible in the thread'])
    expect(leaksIn('A Coordenação: faça o pedido abaixo. Não use ferramentas.', { ownWords: true }).join(), 'internal-prompt phrases leak in anyone\'s words').toMatch(/internal prompt/u)
    expect(leaksIn('texto [[internal-note:{"a":1}]] depois', { ownWords: true }), 'a raw marker leaks in anyone\'s words').toEqual(['raw internal marker'])
  })

  it('says WHO made each request (the model through a team tool, or the host by its own rule) and counts the Tasks the host created by splitting the request by function', () => {
    const home = seedHome()
    const db = new DatabaseSync(join(home, 'db', 'persona.db'))
    const record = (id: string, callId: string): string => JSON.stringify({ fromPersonaId: 'p-bia', toPersonaId: 'p-teo', title: `Pedido ${id}`, kind: 'next', status: 'delivered', callId, note: { done: [], needed: [] } })
    const put = db.prepare('INSERT INTO screen_doc VALUES (?, ?, ?, ?, ?)')
    put.run('pp', 'handoff', 'h-model', record('h-model', 'toolu_01abc'), '2026-11-05T10:00:07.000Z')
    put.run('pp', 'handoff', 'h-plan', record('h-plan', 'campaign:m1:1'), '2026-11-05T10:00:08.000Z')
    put.run('pp', 'handoff', 'h-review', record('h-review', 'review:t1:1'), '2026-11-05T10:00:09.000Z')
    const ticket = db.prepare('INSERT INTO engine_ticket VALUES (?, ?, ?, ?, ?, ?, ?)')
    ticket.run('pp', 'ts1', '2026-11-05T10:00:12.000Z', 'person', 0, 'running', JSON.stringify({ title: 'Texto de …', origin: { triggerId: 'split:m1:p-bia' }, execution: { assignment: 'Pedido da pessoa: “…” Sua parte: texto.' } }))
    ticket.run('pp', 'ts2', '2026-11-05T10:00:13.000Z', 'person', 0, 'running', JSON.stringify({ title: 'Arte de …', origin: { triggerId: 'split:m1:p-teo' }, execution: { assignment: 'Pedido da pessoa: “…” Sua parte: arte.' } }))
    ticket.run('pp', 'tr1', '2026-11-05T10:00:14.000Z', 'ended', 1, 'ended', JSON.stringify({ title: 'Revisar: Arte de …', origin: { triggerId: 'h-review' }, execution: { assignment: 'Téo terminou "Arte de …" e pediu a sua revisão.\n<bilhete>\nJá está pronto:\n- a entrega inteira FIM-DA-ENTREGA\n</bilhete>' } }))
    db.close()
    const transcript = readTeamTranscript(home)!
    expect(Object.fromEntries(transcript.notes.map(note => [note.id, note.via]))).toEqual({ h1: 'model', 'h-model': 'model', 'h-plan': 'host', 'h-review': 'host' })
    expect(transcript.splitTasks, 'the Tasks whose trigger is the host\'s split (split:<message>:<persona>)').toBe(2)
    expect(transcript.splitAssignments, 'the assignment text of each split Task, as the worker receives it').toEqual(['Pedido da pessoa: “…” Sua parte: texto.', 'Pedido da pessoa: “…” Sua parte: arte.'])
    expect(transcript.reviewAssignments, 'what each reviewer is handed to review (her whole view of the delivery)').toHaveLength(1)
    expect(transcript.reviewAssignments[0]).toContain('FIM-DA-ENTREGA')
  })

  it('the team\'s QUESTION CARD (persona_ask) is read the way the screen draws it: the marker at the end of the body is NOT a leak (attempt 2 of the real round was wrongly LEAK-1), and the card is listed', () => {
    const home = seedHome()
    const db = new DatabaseSync(join(home, 'db', 'persona.db'))
    const card = { askId: 'a1', ticketId: 't1', personaId: 'p-teo', personaName: 'Téo', question: 'Qual é a promoção?', options: [{ id: 'desconto-em', label: 'Desconto em %' }, { id: 'preco', label: 'Preço fixo' }], multiple: false, step: { index: 1, total: 4 } }
    db.prepare('INSERT INTO event VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)').run('ask-card:a1', 'channel:geral', 13, 'message', `Téo pergunta: Qual é a promoção? Opções: Desconto em % · Preço fixo [[persona-ask:${JSON.stringify(card)}]]`, 'p-teo', '2026-11-05T10:03:00.000Z', 13)
    db.close()
    const transcript = readTeamTranscript(home)!
    const line = transcript.lines.find(item => item.id === 'ask-card:a1')!
    expect(line.text).toBe('Téo pergunta: Qual é a promoção? (cartão com opções: Desconto em % · Preço fixo — pergunta 1 de 4)')
    expect(line.leaks).toEqual([])
    expect(transcript.leaks.join('\n')).not.toContain('ask-card:a1')
    expect(transcript.asks).toEqual([{ id: 'ask-card:a1', askId: 'a1', ticketId: 't1', who: 'Téo', question: 'Qual é a promoção?', options: ['Desconto em %', 'Preço fixo'], step: { index: 1, total: 4 } }])
    expect(renderTranscriptMarkdown(transcript, 'x')).toContain('## Perguntas da equipe à pessoa')
    expect(renderTranscriptMarkdown(transcript, 'x')).toContain('- **Téo** (pergunta 1 de 4): Qual é a promoção? — opções: Desconto em % · Preço fixo')
    // a card with no chips and no sequence reads plainly
    expect(humanizeLine('Téo pergunta: Qual a cor? [[persona-ask:{"personaName":"Téo","question":"Qual a cor?"}]]')).toBe('Téo pergunta: Qual a cor? (cartão)')
  })

  it('only the markers the SCREEN strips (known kinds, at the END of the body) are not leaks: any other marker, or text after it, still is', () => {
    expect(leaksIn(humanizeLine('Proposta pronta. [[task-proposal:{"title":"x"}]]'))).toEqual([])
    expect(leaksIn(humanizeLine('Posso trocar a conta? [[account-ask:{"id":"1"}]]'))).toEqual([])
    expect(leaksIn(humanizeLine('Antes [[persona-ask:{"question":"x"}]] depois')), 'a marker with text after it is not stripped by the screen').toEqual(['raw internal marker'])
    expect(leaksIn(humanizeLine('Segredo [[internal-note:{"a":1}]]')), 'an unknown kind is never stripped').toEqual(['raw internal marker'])
    expect(leaksIn(humanizeLine('[[handoff:{}]] pronto'))).toEqual(['raw internal marker'])
    // the reader's pattern is the screen's: the two source texts cannot drift apart silently
    const client = readFileSync(join(REPO_ROOT, 'packages', 'persona', 'client-ui-persona', 'src', 'client', 'chat', 'wire-markers.ts'), 'utf8')
    expect(/const WIRE_MARKER = (\/.*\/u)\r?\n/u.exec(client)?.[1], 'wire-markers.ts of the client').toBe(`/${WIRE_MARKER.source}/u`)
    expect(stripWireMarker('Olá [[review:{"kind":"reviewed"}]]')).toBe('Olá')
  })

  it('a review the host recorded as unreadable ("turn ended" reached the reviewer) or failed in the engine is read from the Task side', () => {
    const home = seedHome()
    const db = new DatabaseSync(join(home, 'db', 'persona.db'))
    db.prepare("UPDATE screen_doc SET body = json_set(body, '$.failure', 'unreadable') WHERE kind = 'review_state'").run()
    db.close()
    expect(readTeamTranscript(home)!.reviews).toMatchObject([{ failure: 'unreadable', sealed: true }])
  })

  it('returns undefined without a database; humanizeLine / leaksIn are pure', () => {
    const empty = mkdtempSync(join(tmpdir(), 'team-transcript-empty-'))
    homes.push(empty)
    expect(readTeamTranscript(empty)).toBeUndefined()
    expect(humanizeLine('oi')).toBe('oi')
    expect(leaksIn('[[handoff:{}]] pronto')).toEqual(['raw internal marker'])
    expect(leaksIn('Tudo certo, Bia passou para o Téo.')).toEqual([])
  })
})

describe('poster image fixture', () => {
  it('is a valid, deterministic, small PNG with the expected size and colors', () => {
    const first = buildPosterPng()
    expect(first.equals(buildPosterPng())).toBe(true)
    expect([...first.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(first.readUInt32BE(16)).toBe(POSTER_WIDTH)
    expect(first.readUInt32BE(20)).toBe(POSTER_HEIGHT)
    expect(first.length).toBeLessThan(40_000)
    // decode the IDAT and read three pixels: the red circle's center, the blue field, the yellow band
    const idatAt = first.indexOf(Buffer.from('IDAT', 'ascii'))
    const idatLength = first.readUInt32BE(idatAt - 4)
    const raw = inflateSync(first.subarray(idatAt + 4, idatAt + 4 + idatLength))
    const pixel = (x: number, y: number): number[] => { const at = y * (1 + POSTER_WIDTH * 3) + 1 + x * 3; return [raw[at]!, raw[at + 1]!, raw[at + 2]!] }
    expect(pixel(320, 130)).toEqual([220, 38, 38])
    expect(pixel(10, 10)).toEqual([30, 64, 175])
    expect(pixel(10, 390)).toEqual([250, 204, 21])
  })
})

/**
 * TEAM-10 — three corrections of the READER after the real round of attempt 5 (09/11), found by reading the saved verdict against what the screen showed:
 *   1. a file in `inputs/` is the person's OWN attachment (the host drops it there): a persona naming it is not "the bilhete leaking" (LEAK-1 false positive, like `foto.png` in attempt 3);
 *   2. the opinion round counts by the id `opinion:<call>:…` as well as by type (the real lines are `message` events with that id): the verdict said 0 opinion lines over 7 on screen;
 *   3. a review that failed "in the reviewer's engine" while the thread says the round's TURN CAP was reached is "ran out of turns" (a finding), not a defect of the product.
 * The TRUE leak (a bilhete file the person never attached, echoed in the thread) and a real engine failure stay reported.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import type { LedgerEvidence } from '../src/ledger-evidence.ts'
import { describeBehaviors, evaluateTeamRound } from '../src/team-round-verdict.ts'
import { readTeamTranscript, type TeamTranscript, type TranscriptLine } from '../src/team-transcript.ts'

const homes: string[] = []
afterEach(() => { while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true }) })

/** A home whose bilhete lists the person's own attachment (as the host stores it) and a file of the team's own. */
function seedHome(files: string[], lines: Array<[string, string]>): string {
  const home = mkdtempSync(join(tmpdir(), 'team-reader-a5-'))
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
  const event = db.prepare('INSERT INTO event VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)')
  event.run('m1', 'channel:geral', 1, 'message', 'Faz o cartaz.', 'owner', '2026-11-09T10:00:00.000Z', 1)
  lines.forEach(([who, text], index) => event.run(`m${String(index + 2)}`, 'channel:geral', index + 2, 'message', text, who, `2026-11-09T10:00:${String(index + 10)}.000Z`, index + 2))
  db.prepare("INSERT INTO attachment VALUES ('a1', 'm1', 'foto.png')").run()
  db.prepare('INSERT INTO screen_doc VALUES (?, ?, ?, ?, ?)').run('pp', 'handoff', 'h1', JSON.stringify({
    fromPersonaId: 'p-bia', toPersonaId: 'p-teo', title: 'Arte do cartaz', status: 'delivered', askedAt: '2026-11-09T10:00:05.000Z', note: { done: [], needed: [], files, decisions: [] },
  }), '2026-11-09T10:00:06.000Z')
  db.close()
  return home
}

describe('1. the person\'s own attachment in the bilhete is not a leak', () => {
  it('inputs/foto.png and the host\'s inputs/<id>-foto.png named by a persona: no LEAK-1', () => {
    const home = seedHome(['inputs/foto.png', 'inputs/425aaacf-5061-48d0-9eb0-cb0e65d9ff0a-foto.png'], [
      ['p-teo', 'Usei a paleta do rascunho `inputs/foto.png`: fundo azul e círculo vermelho.'],
      ['p-bia', 'A cópia que o app guardou é inputs/425aaacf-5061-48d0-9eb0-cb0e65d9ff0a-foto.png.'],
    ])
    expect(readTeamTranscript(home)!.leaks).toEqual([])
  })
  it('a file the TEAM made (never attached by the person) echoed in the thread is still a leak', () => {
    const home = seedHome(['inputs/foto.png', 'artes/cartaz-final-instagram.svg'], [['p-teo', 'O arquivo artes/cartaz-final-instagram.svg está pronto.']])
    const leaks = readTeamTranscript(home)!.leaks
    expect(leaks).toHaveLength(1)
    expect(leaks[0]).toMatch(/bilhete text in the thread: "artes\/cartaz-final-instagram\.svg"/u)
  })
})

function line(id: string, who: string, text: string, type = 'message'): TranscriptLine {
  return { at: `2026-11-09T10:00:${id.padStart(2, '0')}.000Z`, stream: 'channel:geral', id, type, who, text, attachments: id === '0' ? ['foto.png'] : [], leaks: [] }
}
function ledger(turns: number): LedgerEvidence {
  const raw = Array.from({ length: turns }, (_, index) => ({ id: `l${String(index)}`, persona_id: 'p', engine: 'claude', kind: 'execution', input_tokens: 9000, output_tokens: 300, cache_read_tokens: 0, cache_write_tokens: 0, origin: 'measured', ticket_id: null, at: '2026-11-09T10:00:00.000Z' }))
  return {
    dbPath: 'x', rawRows: raw, turns, rows: raw.map(row => ({ kind: 'execution', engine: row.engine, origin: row.origin, inputTokens: row.input_tokens, outputTokens: row.output_tokens, cacheReadTokens: 0, cacheWriteTokens: 0, ticketId: null })) as unknown as LedgerEvidence['rows'],
    inputTokens: 9000 * turns, outputTokens: 300 * turns, cacheReadTokens: 0, cacheWriteTokens: 0, allMeasured: true,
  }
}
const CAP_LINE = 'Precisa de você: o limite de execuções reais desta rodada foi atingido (12 de 12). Nada foi iniciado.'
function transcript(lines: TranscriptLine[], overrides: Partial<TeamTranscript> = {}): TeamTranscript {
  return {
    lines, tickets: [], ledger: ledger(12), names: {}, personas: ['Bia', 'Téo', 'Lia'], leaks: [], ignoredTypes: {},
    notes: [{ id: 'h1', from: 'Bia', to: 'Téo', title: 'Arte', kind: 'next', status: 'delivered', askedAt: '', done: [], needed: [], files: [], decisions: [], colleagueReceived: true, colleagueTicketId: 't2', via: 'model' }],
    reviews: [], asks: [], splitTasks: 0, splitAssignments: [], reviewAssignments: [], draftDirectories: [], ...overrides,
  }
}
const EXPECT = { ceilingTurns: 12, minPersonas: 2, requireImage: true } as const
const GOOD = [
  line('0', 'Miguel', 'Faz o cartaz.'),
  line('1', 'Téo', 'Aqui está a arte.', 'message'),
  line('2', 'Bia', 'A imagem mostra um círculo vermelho sobre fundo azul e uma faixa amarela embaixo.'),
  line('8', 'Linha da equipe', 'Bia passou para Téo: Arte do cartaz', 'handoff'),
]
const SEALED = { taskId: 't0', status: 'closed', reviewer: 'Lia', author: 'Bia', returns: 0, sealed: true, summary: 'Aprovado.', failure: null } as const

describe('2. the opinion round is counted by its id as well as by its type', () => {
  const opinion = [line('3', 'Téo', 'Opinião sobre a arte?'), line('4', 'Lia', 'Está clara.'), line('5', 'Bia', 'Concordo.')].map(item => ({ ...item, id: `opinion:call:${item.id}` }))
  it('7 real lines were `message` events with an opinion:* id: the verdict counted 0', () => {
    const verdict = evaluateTeamRound(transcript([...GOOD, ...opinion]), EXPECT)
    expect(verdict.behaviors.opinionLines).toBe(3)
    expect(describeBehaviors(transcript([...GOOD, ...opinion])).find(row => row.n === 4)).toMatchObject({ occurred: true, count: 3 })
  })
  it('without any opinion line it stays 0 (a plain message with another id is not an opinion)', () => {
    expect(evaluateTeamRound(transcript(GOOD), EXPECT).behaviors.opinionLines).toBe(0)
    expect(describeBehaviors(transcript(GOOD)).find(row => row.n === 4)).toMatchObject({ occurred: false, count: 0 })
  })
})

describe('3. a review cut by the turn cap is "ran out of turns", not an engine defect', () => {
  const failed = { taskId: 't', status: 'closed', reviewer: 'Lia', author: 'Téo', returns: 1, sealed: false, summary: 'Ajustes feitos.', failure: 'engine' } as const
  it('failure engine + the thread says the cap was reached: a finding, outcome ran-out-of-turns, no harness problem', () => {
    const verdict = evaluateTeamRound(transcript([...GOOD, line('9', 'Lia', CAP_LINE)], { reviews: [SEALED, failed] }), EXPECT)
    expect(verdict.harnessProblems).toEqual([])
    expect(verdict.findings.join('\n')).toMatch(/ran out of turns.*review of Téo's work/u)
    expect(verdict.outcome).toBe('ran-out-of-turns')
    expect(verdict.passed).toBe(false)
  })
  it('failure engine with the ledger AT the ceiling counts too (the cap line may be hidden by the screen)', () => {
    expect(evaluateTeamRound(transcript(GOOD, { reviews: [SEALED, failed] }), EXPECT).outcome).toBe('ran-out-of-turns')
  })
  it('a real engine failure far below the cap stays a harness problem', () => {
    const verdict = evaluateTeamRound(transcript(GOOD, { reviews: [SEALED, failed], ledger: ledger(5) }), EXPECT)
    expect(verdict.harnessProblems.join('\n')).toMatch(/failed in the reviewer's engine/u)
    expect(verdict.outcome).toBe('harness-problem')
  })
})

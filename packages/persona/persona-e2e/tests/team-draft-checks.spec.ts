/**
 * TEAM-10 — P0-1 of the real round of 07/11: the receivers must FIND the shared files. Pure: drafts and stub logs written by hand, shaped like what attempt 4 left on disk
 * (`artifacts/team10/homes/real-attempt-4-…/worktrees/proj-pessoal/<ticket>`): Bia's part had only `inputs/<id>-foto.png`, the colleague Tasks had only `LEIAME.txt`.
 */
import { describe, expect, it } from 'vitest'
import { citedPaths, posterIn, promisedFiles, savedLinesProblems, sharedFilesProblems, stubTurnProblems, type StubTurnEvent } from '../src/team-draft-checks.ts'
import type { DraftFile, TeamTranscript, TranscriptDraft, TranscriptNote, TranscriptTicket } from '../src/team-transcript.ts'

const POSTER = 'a'.repeat(64)
const ART = 'artes/padaria-lua/cartaz-instagram-4x5.svg'
const OPTIONS = { attachmentName: 'foto.png', posterSha256: POSTER, requireDrafts: true } as const

const file = (path: string, sha: string | null = path): DraftFile => ({ path, size: 10, sha })
const LEIAME = file('LEIAME.txt', 'leiame')
const poster = (where = 'inputs/80731bc7-foto.png'): DraftFile => ({ path: where, size: 100, sha: POSTER })
const draft = (ticketId: string, ...files: DraftFile[]): TranscriptDraft => ({ ticketId, directory: `/home/worktrees/p/${ticketId}`, files })

const ASSIGNMENT_PART = 'Pedido da pessoa: “Faz o cartaz.”\nAnexos do pedido: foto.png.\nSua parte: arte. O resto do pedido foi para Bia (texto).'
const ASSIGNMENT_RECEIVER = `Téo pediu ajuda a Bia: Texto do cartaz.\n<bilhete>\nJá está pronto:\n- Arte-base feita.\nFalta:\n- Escrever o texto; salvar como artes/padaria-lua/cartaz-final.png quando acabar.\nArquivos:\n- ${ART}\nDecisões tomadas:\n- Formato 4:5.\n</bilhete>\nFaça o que Téo pediu.`

function ticket(id: string, title: string, trigger: string, assignment: string): TranscriptTicket {
  return { id, title, stage: 'person', assignmentState: 'running', ended: false, trigger, assignment }
}
const NOTE: TranscriptNote = {
  id: 'h1', from: 'Téo', to: 'Bia', title: 'Texto do cartaz', kind: 'next', status: 'delivered', askedAt: '', done: [], needed: [], files: [ART], decisions: [], colleagueReceived: true, colleagueTicketId: 'recv', via: 'model', fromTicketId: 'arte',
}
function transcript(drafts: TranscriptDraft[], overrides: Partial<TeamTranscript> = {}): TeamTranscript {
  return {
    lines: [], tickets: [ticket('arte', 'Arte do cartaz', 'split:m1:teo', ASSIGNMENT_PART), ticket('texto', 'Texto do cartaz', 'split:m1:bia', ASSIGNMENT_PART), ticket('recv', 'Texto do cartaz (Téo)', 'h1', ASSIGNMENT_RECEIVER)],
    ledger: undefined, names: {}, personas: ['Lia', 'Bia', 'Téo'], leaks: [], ignoredTypes: {}, notes: [NOTE], reviews: [], asks: [], splitTasks: 2, splitAssignments: [], reviewAssignments: [], draftDirectories: [], drafts,
    ...overrides,
  }
}

describe('what an assignment promises the worker', () => {
  it('reads the request attachments and the bilhete\'s "Arquivos:" list — and nothing from the free text ("salvar como x.png" is a file still to be made)', () => {
    expect(promisedFiles(ASSIGNMENT_PART)).toEqual(['foto.png'])
    expect(promisedFiles(ASSIGNMENT_RECEIVER)).toEqual([ART])
  })
  it('citedPaths: relative paths with an extension, never a URL, an absolute path or a path out of the draft', () => {
    expect(citedPaths('veja artes\\x.SVG, `inputs/a.png`, https://x.com/a.png, C:\\tmp\\a.png, /etc/a.txt, ../fora.png e foto.png.')).toEqual(['artes/x.SVG', 'inputs/a.png', 'foto.png'])
  })
  it('posterIn: the attachment under another path (inputs/<id>-foto.png) is found by NAME and bytes; other bytes are not the poster', () => {
    expect(posterIn([poster()], OPTIONS)).toBeDefined()
    expect(posterIn([{ path: 'inputs/x-foto.png', size: 1, sha: 'other' }], OPTIONS)).toBeUndefined()
    expect(posterIn([file('foto.pngx')], OPTIONS)).toBeUndefined()
  })
})

describe('sharedFilesProblems', () => {
  it('RED, shaped like attempt 4: the colleague of a pass has only LEIAME.txt (no poster, no art), the part cites "foto.png" while the file is inputs/<id>-foto.png', () => {
    const problems = sharedFilesProblems(transcript([
      draft('arte', LEIAME, file(ART), poster()),
      draft('texto', LEIAME, poster()),
      draft('recv', LEIAME),
    ]), OPTIONS)
    const joined = problems.join('\n')
    expect(joined).toMatch(/colleague of a pass_forward \(Téo → Bia\)\) does not find the request's attachment "foto.png"/u)
    expect(joined).toMatch(/Task "Arte do cartaz" is told about "foto.png" but its draft has no such file/u)
    expect(joined).toMatch(new RegExp(`Task "Texto do cartaz \\(Téo\\)" is told about "${ART.replace(/[.]/gu, '[.]')}" but its draft has no such file`, 'u'))
    expect(joined).toMatch(/Bia's draft .* does not have "artes\/padaria-lua\/cartaz-instagram-4x5.svg", cited in the bilhete of Téo \(next\)/u)
    expect(joined).not.toMatch(/cartaz-final/u) // a path in the free text of the bilhete is not promised
  })
  it('GREEN: the poster and the art are where each receiving Task works, at the path the assignment names', () => {
    const assignmentPart = 'Pedido da pessoa: “Faz o cartaz.”\nAnexos do pedido: inputs/80731bc7-foto.png.\nSua parte: arte.'
    const problems = sharedFilesProblems(transcript([
      draft('arte', LEIAME, file(ART), poster()),
      draft('texto', LEIAME, poster()),
      draft('recv', LEIAME, file(ART), poster()),
    ], { tickets: [ticket('arte', 'Arte', 'split:m1:teo', assignmentPart), ticket('texto', 'Texto', 'split:m1:bia', assignmentPart), ticket('recv', 'Texto (Téo)', 'h1', ASSIGNMENT_RECEIVER)] }), OPTIONS)
    expect(problems).toEqual([])
  })
  it('the reviewer holds what the author saved (not the baseline, not the attachment, not the PNG twin)', () => {
    const review: TranscriptNote = { ...NOTE, id: 'r1', to: 'Lia', kind: 'review', files: [], colleagueTicketId: 'rev', fromTicketId: 'arte' }
    const authorDraft = draft('arte', LEIAME, file(ART), file(ART.replace('.svg', '.png')), poster())
    const base = (reviewerFiles: DraftFile[]): TeamTranscript => transcript([authorDraft, draft('texto', LEIAME, poster()), draft('rev', LEIAME, ...reviewerFiles), draft('recv', LEIAME, file(ART), poster())], {
      notes: [review], tickets: [ticket('arte', 'Arte', 'x', ''), ticket('texto', 'Texto', 'y', ''), ticket('rev', 'Revisar: Arte', 'handoff:arte:review:arte:1', ''), ticket('recv', 'recv', 'z', '')],
    })
    expect(sharedFilesProblems(base([]), OPTIONS).join('\n')).toMatch(/Lia's draft .* does not have "artes\/padaria-lua\/cartaz-instagram-4x5.svg", saved by Téo \(review\)/u)
    expect(sharedFilesProblems(base([file(ART)]), OPTIONS)).toEqual([])
  })
  it('no draft on disk is a problem when the round needs them, and nothing to say otherwise', () => {
    expect(sharedFilesProblems(transcript([]), OPTIONS).join()).toMatch(/no Task draft was found on disk/u)
    expect(sharedFilesProblems(transcript([]), { attachmentName: 'foto.png' })).toEqual([])
  })
})

describe('savedLinesProblems: "X salvou … no rascunho" is only for what X wrote', () => {
  const ledgerRows = [{ persona_id: 'teo', ticket_id: 'arte' }, { persona_id: 'bia', ticket_id: 'recv' }, { persona_id: 'lia', ticket_id: 'rev' }]
  const base = (lines: Array<[string, string]>): TeamTranscript => transcript([], {
    names: { teo: 'Téo', bia: 'Bia', lia: 'Lia' },
    ledger: { dbPath: 'x', rows: [], rawRows: ledgerRows, turns: 3, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, allMeasured: true },
    lines: lines.map(([who, text], index) => ({ at: '', stream: 'channel:geral', id: String(index), type: 'message', who, text, attachments: [], leaks: [] })),
  })
  it('RED (the fake of 09/11): Bia and Lia "saved" files that were only copied into their drafts', () => {
    const problems = savedLinesProblems(base([['Téo', 'Téo salvou 2 arquivos no rascunho'], ['Bia', 'Bia salvou 3 arquivos no rascunho'], ['Lia', 'Lia salvou foto.png no rascunho']]), [{ cwd: '/h/worktrees/p/arte' }]).join('\n')
    expect(problems).toMatch(/"Bia salvou 3 arquivos no rascunho" \(Bia\) but Bia wrote no file/u)
    expect(problems).toMatch(/\(Lia\) but Lia wrote no file/u)
    expect(problems).not.toMatch(/\(Téo\)/u)
  })
  it('GREEN: each persona who is said to have saved something did write in one of her Tasks; other lines are not read', () => {
    expect(savedLinesProblems(base([['Téo', 'Téo salvou cartaz-arte.svg no rascunho'], ['Bia', 'Li o bilhete e salvou o texto.']]), [{ cwd: 'C:\\h\\worktrees\\p\\arte' }])).toEqual([])
  })
})

function turn(seq: number, cwd: string, cwdFiles: string[], extra: Partial<StubTurnEvent> = {}): StubTurnEvent {
  return { event: 'turn', proc: 1, seq, cwd, cwdFiles: cwdFiles.map(path => ({ p: path, s: 10, h: path === 'inputs/foto.png' ? POSTER : path })), promptPaths: [], ...extra }
}

describe('stubTurnProblems (what the fake CLI saw in its own working directory)', () => {
  const carries = (event: StubTurnEvent): boolean => event.needles?.request === true
  it('RED: a turn told about a file its working directory did not have, a turn that carries the request without the poster, a file recreated for a missing copy', () => {
    const problems = stubTurnProblems([
      turn(1, '/d/arte', ['LEIAME.txt'], { needles: { request: true } }),
      turn(2, '/d/recv', ['LEIAME.txt'], { promptPaths: [{ p: ART, present: false }] }),
      { event: 'write', proc: 1, seq: 2, cwd: '/d/recv', file: ART, recreated: true },
    ], { attachmentName: 'foto.png', posterSha256: POSTER }, carries).join('\n')
    expect(problems).toMatch(/turn 1#1 in arte carries the request but its working directory had no "foto.png"/u)
    expect(problems).toMatch(/turn 1#2 in recv was told about "artes\/padaria-lua\/cartaz-instagram-4x5.svg" but it was not in its working directory/u)
    expect(problems).toMatch(/turn 1#2 in recv wrote "artes\/padaria-lua\/cartaz-instagram-4x5.svg" because a colleague's copy was not in its working directory/u)
  })
  it('GREEN: the poster is there, the promised file is there, nothing was recreated', () => {
    expect(stubTurnProblems([
      turn(1, '/d/arte', ['LEIAME.txt', 'inputs/foto.png'], { needles: { request: true }, promptPaths: [{ p: 'inputs/foto.png', present: true }] }),
      turn(2, '/d/recv', ['LEIAME.txt', ART], { promptPaths: [{ p: ART, present: true }] }),
      { event: 'write', proc: 1, seq: 1, cwd: '/d/arte', file: ART }, // the AUTHOR writing the art is not a recreation
    ], { attachmentName: 'foto.png', posterSha256: POSTER }, carries)).toEqual([])
  })
})

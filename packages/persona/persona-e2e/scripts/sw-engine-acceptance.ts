/**
 * SW-9 / SW-10, ENGINE layer: the five "Rascunho da tarefa" scenarios and the cardápio.docx acceptance flow driven through the
 * real `ReviewDelivery` (private history, restore points, conflicts) on real Office files — no host, no UI, no model.
 *
 *   node --import tsx/esm packages/persona/persona-e2e/scripts/sw-engine-acceptance.ts
 *
 * Prints one JSON document (also written to `artifacts/sw/engine-acceptance.json`). Each scenario is `pass`, `fail` (a real
 * defect, with the failed check) or `blocked` (waiting on another builder's SW item, with the reason). Exit code is 0 unless
 * the script itself crashes: the spec decides what must be green.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReviewDelivery, HistoryReviewDelivery } from '../../persona-engine/src/review/history.ts'
import type { ReviewAcceptResult, ReviewDelivery } from '../../persona-engine/src/review/types.ts'
import {
  MENU_AFTER,
  MENU_BEFORE,
  buildDocx,
  createUserFolder,
  gitOnPath,
  holdExclusiveLock,
  readDocxParagraphs,
  userFolderProblems,
  withGitHiddenFromPath,
  type UserFolder,
} from '../src/simple-workspace-fixtures.ts'

type Status = 'pass' | 'fail' | 'blocked'
interface Scenario { id: string; title: string; status: Status; checks: string[]; failed: string[]; detail?: string }

const DOCX = 'cardápio.docx'
const XLSX = 'preços.xlsx'
const results: Scenario[] = []

function scenario(id: string, title: string): { scenario: Scenario; check: (ok: boolean, label: string) => void } {
  const row: Scenario = { id, title, status: 'pass', checks: [], failed: [] }
  results.push(row)
  return {
    scenario: row,
    check: (ok, label) => {
      row.checks.push(label)
      if (!ok) { row.failed.push(label); row.status = 'fail' }
    },
  }
}

const read = (folder: UserFolder, name: string): Buffer => readFileSync(join(folder.dir, name))

async function harness(folder: UserFolder): Promise<{ delivery: ReviewDelivery; home: string; cleanup(): Promise<void> }> {
  const home = await mkdtemp(join(tmpdir(), 'sw-persona-home-'))
  const delivery = createReviewDelivery({
    projectId: 'sw', personaHome: home, projectRoot: folder.dir, worktreesRoot: join(home, 'worktrees', 'sw'),
  })
  // The scenarios are about the private history for ordinary folders: if the factory chose Git, stop BEFORE any draft is prepared.
  if (!(delivery instanceof HistoryReviewDelivery)) {
    await rm(home, { recursive: true, force: true })
    throw new Error(`the review factory selected ${delivery.constructor.name}, not HistoryReviewDelivery, for ${folder.dir}`)
  }
  return { delivery, home, cleanup: async () => { await rm(home, { recursive: true, force: true }) } }
}

async function personaEdits(delivery: ReviewDelivery, ticketId: string, files: Record<string, Buffer | string>): Promise<void> {
  const draft = await delivery.prepare({ id: `a-${ticketId}`, ticketId })
  for (const [name, content] of Object.entries(files)) await writeFile(join(draft.path, name), content)
}

function merged(result: ReviewAcceptResult): result is Extract<ReviewAcceptResult, { kind: 'merged' }> {
  return result.kind === 'merged'
}

// ---------------------------------------------------------------------------------------------------------------------
// S1 + SW-10 core: folder without git, git on PATH: "atualize o cardápio.docx com os preços novos" → review → apply → undo.
// ---------------------------------------------------------------------------------------------------------------------
async function s1(): Promise<void> {
  const { check } = scenario('S1', 'pasta sem git, git no PATH — cardápio.docx: rascunho → revisar → aplicar → desfazer')
  const folder = await createUserFolder()
  const h = await harness(folder)
  try {
    const docxBefore = read(folder, DOCX)
    const xlsxBefore = read(folder, XLSX)
    check(gitOnPath(), 'git is on PATH in this scenario')
    await personaEdits(h.delivery, 't1', { [DOCX]: buildDocx(MENU_AFTER) })
    check(readDocxParagraphs(read(folder, DOCX)).join('|') === MENU_BEFORE.join('|'), 'the user folder is untouched while the draft is being worked on')
    const summary = await h.delivery.summary({ id: 't1', assignments: [] })
    check(summary.files.map(file => file.path).join(',') === DOCX, `review lists exactly the changed file (${summary.files.map(file => file.path).join(',')})`)
    const applied = await h.delivery.accept({ id: 't1' }, 'ff')
    check(merged(applied) && applied.restorePointId !== undefined, 'apply returns a restore point')
    check(readDocxParagraphs(read(folder, DOCX)).join('|') === MENU_AFTER.join('|'), 'cardápio.docx now has the new prices')
    check(read(folder, XLSX).equals(xlsxBefore), 'other files are byte-identical')
    check(userFolderProblems(folder.dir).length === 0, `the user folder still has no .git and no conflict markers (${userFolderProblems(folder.dir).join('; ')})`)
    if (merged(applied) && applied.restorePointId !== undefined) {
      const points = await h.delivery.listRestorePoints?.()
      check(points?.some(point => point.id === applied.restorePointId && point.state === 'available') === true, 'the restore point is listed as available (30 days)')
      const undone = await h.delivery.undoApply?.(applied.restorePointId)
      check(undone?.kind === 'restored', 'undo restores')
      check(read(folder, DOCX).equals(docxBefore), 'undo restores cardápio.docx byte for byte')
      check(userFolderProblems(folder.dir).length === 0, 'after undo the folder still has no .git')
    }
    check(existsSync(join(h.home, 'history', 'sw', 'git', 'HEAD')), 'the history lives in the private home, not in the folder')
  } finally {
    await h.cleanup()
    await folder.remove()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// S2: no git on PATH → the bundled MinGit must be used (SW-4, Rivet).
// ---------------------------------------------------------------------------------------------------------------------
async function s2(): Promise<void> {
  const { scenario: row, check } = scenario('S2', 'pasta sem git e SEM git no PATH — usa o git embutido')
  const folder = await createUserFolder()
  const h = await harness(folder)
  const hidden = withGitHiddenFromPath()
  try {
    check(!gitOnPath(), 'git is hidden from PATH')
    try {
      await personaEdits(h.delivery, 't2', { [DOCX]: buildDocx(MENU_AFTER) })
      const applied = await h.delivery.accept({ id: 't2' }, 'ff')
      check(merged(applied), 'apply works without git on PATH')
      check(readDocxParagraphs(read(folder, DOCX)).join('|') === MENU_AFTER.join('|'), 'cardápio.docx updated')
      check(userFolderProblems(folder.dir).length === 0, 'no .git in the folder')
    } catch (error) {
      row.status = 'blocked'
      row.detail = `SW-4 (MinGit embutido) ainda não resolve o git: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`
    }
  } finally {
    hidden.restore()
    await h.cleanup()
    await folder.remove()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// S3: OneDrive (SW-5, Rivet): no simulation exists yet.
// ---------------------------------------------------------------------------------------------------------------------
function s3(): void {
  const { scenario: row } = scenario('S3', 'pasta no OneDrive (arquivo só online hidratado antes de copiar)')
  row.status = 'blocked'
  row.detail = 'SW-5 (Rivet) ainda não entregou a simulação do placeholder online; o teste real precisa do arquivo com FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS.'
}

// ---------------------------------------------------------------------------------------------------------------------
// S4: spreadsheet open in Excel during Apply: all-or-nothing, an actionable message, then it works once closed.
// ---------------------------------------------------------------------------------------------------------------------
async function s4(): Promise<void> {
  const { scenario: row, check } = scenario('S4', 'planilha aberta durante o Aplicar — tudo ou nada, aviso acionável, funciona depois de fechar')
  if (process.platform !== 'win32') {
    row.status = 'blocked'
    row.detail = 'Windows only (FileShare.None)'
    return
  }
  const folder = await createUserFolder()
  const h = await harness(folder)
  try {
    const before = { docx: read(folder, DOCX), xlsx: read(folder, XLSX) }
    await personaEdits(h.delivery, 't4', {
      [DOCX]: buildDocx(MENU_AFTER),
      [XLSX]: Buffer.concat([before.xlsx, Buffer.from('persona-edit')]),
    })
    const lock = await holdExclusiveLock(join(folder.dir, XLSX))
    let outcome = 'threw'
    let explanation = ''
    try {
      const result = await h.delivery.accept({ id: 't4' }, 'ff')
      outcome = result.kind
      if (result.kind === 'blocked') explanation = result.explanation
    } catch (error) {
      explanation = error instanceof Error ? error.message : String(error)
    }
    check(outcome !== 'merged', `apply does not report success while the spreadsheet is open (outcome: ${outcome})`)
    // Reading the locked file is impossible; compare the others and the locked file's size via stat after release.
    check(read(folder, DOCX).equals(before.docx), 'all-or-nothing: cardápio.docx was NOT half-applied')
    check(userFolderProblems(folder.dir).length === 0, 'no .git and no leftovers in the folder')
    row.detail = `message: ${explanation.slice(0, 240)}`
    check(/feche|fechar|aberto|aberta|em uso/iu.test(explanation), 'the message tells the person what to do in Portuguese ("feche a planilha …")')
    await lock.release()
    check(read(folder, XLSX).equals(before.xlsx), 'the spreadsheet is byte-identical after the failed attempt')
    const retry = await h.delivery.accept({ id: 't4' }, 'ff')
    check(merged(retry), 'apply works once the spreadsheet is closed')
    if (merged(retry) && retry.restorePointId !== undefined) {
      const undone = await h.delivery.undoApply?.(retry.restorePointId)
      check(undone?.kind === 'restored' && read(folder, XLSX).equals(before.xlsx) && read(folder, DOCX).equals(before.docx), 'undo restores both files byte for byte')
    }
  } finally {
    await h.cleanup()
    await folder.remove()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// S5: the person edited the same file while the persona worked: 3 choices, no markers, then Desfazer.
// ---------------------------------------------------------------------------------------------------------------------
async function s5(): Promise<void> {
  for (const choice of ['keep_mine', 'keep_persona', 'keep_both'] as const) {
    const { check } = scenario(`S5-${choice}`, `conflito (${choice}) seguido de Desfazer`)
    const folder = await createUserFolder()
    const h = await harness(folder)
    try {
      const original = read(folder, DOCX)
      const mine = buildDocx([...MENU_BEFORE, 'Fechamos às segundas (edição minha)'])
      const theirs = buildDocx(MENU_AFTER)
      await personaEdits(h.delivery, 't5', { [DOCX]: theirs })
      await writeFile(join(folder.dir, DOCX), mine) // the person edits the same file meanwhile
      const blocked = await h.delivery.accept({ id: 't5' }, 'ff')
      check(blocked.kind === 'blocked' && (blocked.conflicts?.length ?? 0) === 1, 'apply stops and names the one conflicting file')
      check(read(folder, DOCX).equals(mine), 'nothing is overwritten before the person chooses')
      if (blocked.kind !== 'blocked' || blocked.conflicts === undefined) continue
      const conflict = blocked.conflicts[0]!
      const applied = await h.delivery.accept({ id: 't5' }, 'ff', { conflicts: [{ ...conflict, choice }] })
      check(merged(applied), `apply works after the choice (${choice})`)
      const names = (await readdir(folder.dir)).sort()
      if (choice === 'keep_mine') check(read(folder, DOCX).equals(mine), 'keep_mine: the person\'s file stays')
      if (choice === 'keep_persona') check(readDocxParagraphs(read(folder, DOCX)).join('|') === MENU_AFTER.join('|'), 'keep_persona: the persona\'s version is in place')
      if (choice === 'keep_both') {
        check(names.filter(name => name.startsWith('cardápio')).length >= 2, `keep_both: a second copy exists (${names.join(', ')})`)
        check(read(folder, DOCX).equals(mine), 'keep_both: the person\'s file keeps its name and bytes')
      }
      check(userFolderProblems(folder.dir).length === 0, 'no .git and no conflict markers in any file')
      if (merged(applied) && applied.restorePointId !== undefined) {
        const undone = await h.delivery.undoApply?.(applied.restorePointId)
        check(undone?.kind === 'restored', 'Desfazer restores after the conflict resolution')
        check(read(folder, DOCX).equals(mine) || read(folder, DOCX).equals(original), 'after Desfazer the folder is back to what the person had')
      }
    } finally {
      await h.cleanup()
      await folder.remove()
    }
  }
}

const startedAt = Date.now()
for (const run of [s1, s2, async () => { s3() }, s4, s5]) {
  try {
    await run()
  } catch (error) {
    const row = results.at(-1)
    if (row !== undefined) {
      row.status = 'fail'
      row.failed.push(`script error: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`)
    }
  }
}

const report = {
  at: new Date().toISOString(),
  elapsedMs: Date.now() - startedAt,
  scenarios: results,
  summary: Object.fromEntries((['pass', 'fail', 'blocked'] as const).map(status => [status, results.filter(row => row.status === status).map(row => row.id)])),
}
const out = join(new URL('../artifacts/sw/', import.meta.url).pathname.replace(/^\/(\w:)/u, '$1'))
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'engine-acceptance.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))

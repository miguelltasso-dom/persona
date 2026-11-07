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
import { copyFile, mkdir, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, toNamespacedPath } from 'node:path'
import { createReviewDelivery, HistoryReviewDelivery } from '../../persona-engine/src/review/history.ts'
import type { HistoryFileOps } from '../../persona-engine/src/review/history-files.ts'
import type { ReviewAcceptResult, ReviewDelivery } from '../../persona-engine/src/review/types.ts'
import { resolveGitExecutable } from '../../persona-runners/src/resolve/git.ts'
import { createWindowsHistoryFileOps, type WindowsHistoryIo } from '../../persona-runners/src/workspace/windows-files.ts'
import {
  MENU_AFTER,
  MENU_BEFORE,
  buildDocx,
  createUserFolder,
  gitOnPath,
  holdExclusiveLock,
  readDocxParagraphs,
  userFolderProblems,
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

interface HarnessOptions {
  /** Absolute path to the git executable the private history must run (S2: the bundled MinGit). */
  readonly git?: string
  /** Platform file layer (S3: the Windows locks/hydration/long-path layer the host wires in). */
  readonly fileOps?: HistoryFileOps
}

/** Removes a tree even when it holds paths over 260 characters. */
const removeTree = (dir: string): Promise<void> => rm(toNamespacedPath(dir), { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })

async function harness(folder: UserFolder, options: HarnessOptions = {}): Promise<{ delivery: ReviewDelivery; home: string; draftDir(ticketId: string): string; cleanup(): Promise<void> }> {
  const home = await mkdtemp(join(tmpdir(), 'sw-persona-home-'))
  const worktreesRoot = join(home, 'worktrees', 'sw')
  const delivery = createReviewDelivery({
    projectId: 'sw', personaHome: home, projectRoot: folder.dir, worktreesRoot,
    ...(options.git === undefined ? {} : { git: options.git }),
    ...(options.fileOps === undefined ? {} : { fileOps: options.fileOps }),
  })
  // The scenarios are about the private history for ordinary folders: if the factory chose Git, stop BEFORE any draft is prepared.
  if (!(delivery instanceof HistoryReviewDelivery)) {
    await removeTree(home)
    throw new Error(`the review factory selected ${delivery.constructor.name}, not HistoryReviewDelivery, for ${folder.dir}`)
  }
  return { delivery, home, draftDir: ticketId => join(worktreesRoot, ticketId), cleanup: async () => { await removeTree(home) } }
}

async function personaEdits(delivery: ReviewDelivery, ticketId: string, files: Record<string, Buffer | string>): Promise<void> {
  const draft = await delivery.prepare({ id: `a-${ticketId}`, ticketId })
  for (const [name, content] of Object.entries(files)) {
    const target = join(draft.path, name)
    await mkdir(toNamespacedPath(dirname(target)), { recursive: true })
    await writeFile(toNamespacedPath(target), content)
  }
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
// S2: no git on the PATH → the bundled MinGit runs the private history (SW-4). The user's PATH is System32 only.
// The MinGit comes from the packaging cache (this script NEVER downloads); `PERSONA_SW_BUNDLED_GIT=<...\mingit\cmd\git.exe>` points at the
// one inside an INSTALLED app instead (the win-unpacked/installed `resources`).
// ---------------------------------------------------------------------------------------------------------------------
const MINGIT_CACHE = 'C:/p8c'
const MINGIT_ZIP = `${MINGIT_CACHE}/mingit/MinGit-2.56.0.4-64-bit.zip`

async function bundledGitPath(): Promise<{ readonly executable: string; readonly resources: string | undefined } | string> {
  const fromInstalled = process.env.PERSONA_SW_BUNDLED_GIT
  if (fromInstalled !== undefined && fromInstalled !== '') {
    return existsSync(fromInstalled) ? { executable: fromInstalled, resources: undefined } : `PERSONA_SW_BUNDLED_GIT does not exist: ${fromInstalled}`
  }
  if (!existsSync(MINGIT_ZIP)) return `the MinGit zip is not in the packaging cache (${MINGIT_ZIP}); this script never downloads it`
  const resources = await mkdtemp(join(tmpdir(), 'sw-resources-'))
  const installer = await import(new URL('../../../../apps/desktop/scripts/persona-mingit.mjs', import.meta.url).href) as {
    installPersonaMinGit(resources: string, env: Record<string, string>): Promise<unknown>
  }
  await installer.installPersonaMinGit(resources, { DSH_DESKTOP_PACKAGE_CACHE_DIR: MINGIT_CACHE })
  return { executable: join(resources, 'mingit', 'cmd', 'git.exe'), resources }
}

async function s2(): Promise<void> {
  const { scenario: row, check } = scenario('S2', 'pasta sem git e SEM git no PATH (só System32) — usa o git embutido: rascunho → revisar → aplicar → desfazer')
  if (process.platform !== 'win32') {
    row.status = 'blocked'
    row.detail = 'Windows only (MinGit for Windows, System32 PATH)'
    return
  }
  const bundled = await bundledGitPath()
  if (typeof bundled === 'string') {
    row.status = 'blocked'
    row.detail = bundled
    return
  }
  const folder = await createUserFolder()
  const previousPath = process.env.PATH
  process.env.PATH = join(process.env.SystemRoot ?? 'C:/Windows', 'System32')
  const h = await harness(folder, { git: bundled.executable })
  try {
    const docxBefore = read(folder, DOCX)
    const xlsxBefore = read(folder, XLSX)
    check(!gitOnPath(), 'the user has NO git on the PATH (System32 only)')
    check(existsSync(bundled.executable), `the bundled MinGit is there (${bundled.executable})`)
    const resolved = await resolveGitExecutable({ env: process.env, bundledExecutable: bundled.executable })
    check(resolved.source === 'bundled', `the git resolver picks the bundled MinGit (source: ${resolved.source})`)
    await personaEdits(h.delivery, 't2', { [DOCX]: buildDocx(MENU_AFTER) })
    check(read(folder, DOCX).equals(docxBefore), 'the user folder is untouched while the draft is being worked on')
    const summary = await h.delivery.summary({ id: 't2', assignments: [] })
    check(summary.files.map(file => file.path).join(',') === DOCX, `review lists exactly the changed file (${summary.files.map(file => file.path).join(',')})`)
    const applied = await h.delivery.accept({ id: 't2' }, 'ff')
    check(merged(applied) && applied.restorePointId !== undefined, 'apply works without git on the PATH and returns a restore point')
    check(readDocxParagraphs(read(folder, DOCX)).join('|') === MENU_AFTER.join('|'), 'cardápio.docx now has the new prices')
    check(read(folder, XLSX).equals(xlsxBefore), 'other files are byte-identical')
    check(userFolderProblems(folder.dir).length === 0, `the user folder still has no .git (${userFolderProblems(folder.dir).join('; ')})`)
    check(existsSync(join(h.home, 'history', 'sw', 'git', 'HEAD')), 'the history lives in the private home, written by the bundled git')
    if (merged(applied) && applied.restorePointId !== undefined) {
      const undone = await h.delivery.undoApply?.(applied.restorePointId)
      check(undone?.kind === 'restored' && read(folder, DOCX).equals(docxBefore), 'undo restores cardápio.docx byte for byte')
      check(userFolderProblems(folder.dir).length === 0, 'after undo the folder still has no .git')
    }
    row.detail = `git: ${bundled.executable}${bundled.resources === undefined ? ' (instalado)' : ' (extraído do cache do pacote)'}`
  } finally {
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
    await h.cleanup()
    await folder.remove()
    if (bundled.resources !== undefined) await removeTree(bundled.resources).catch(() => {})
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// S3: the Windows file layer the host wires in (SW-5): locks, long paths, OneDrive online-only files (hydration simulated: the
// real client is not running on this machine and nobody touches the owner's files — persona-spec/contracts/sw-windows-draft.md G4).
// ---------------------------------------------------------------------------------------------------------------------
const FECHE_XLSX = /Feche “preços\.xlsx”/u

/** A spreadsheet open in Excel while the draft is PREPARED: actionable line, no half-made draft, works once closed. */
async function s3PrepareLocked(): Promise<void> {
  const { scenario: row, check } = scenario('S3-prepare-locked', 'planilha aberta ao PREPARAR o rascunho — "Feche “preços.xlsx”…", nada pela metade, funciona depois de fechar')
  if (process.platform !== 'win32') { row.status = 'blocked'; row.detail = 'Windows only (FileShare.None)'; return }
  const folder = await createUserFolder()
  const h = await harness(folder, { fileOps: createWindowsHistoryFileOps({ cloudRoots: [] }) })
  try {
    const docxBefore = read(folder, DOCX)
    const lock = await holdExclusiveLock(join(folder.dir, XLSX))
    let message = ''
    try { await h.delivery.prepare({ id: 'a-t3', ticketId: 't3' }) } catch (error) { message = error instanceof Error ? error.message : String(error) }
    row.detail = `message: ${message.slice(0, 240)}`
    check(FECHE_XLSX.test(message), 'the line names the file and says to close it ("Feche “preços.xlsx” …")')
    check(!existsSync(h.draftDir('t3')), 'no half-made draft is left behind')
    check(read(folder, DOCX).equals(docxBefore), 'the folder was not touched')
    check(userFolderProblems(folder.dir).length === 0, 'no .git in the folder')
    await lock.release()
    const draft = await h.delivery.prepare({ id: 'a-t3', ticketId: 't3' }).catch(() => undefined)
    check(draft !== undefined, 'after closing the spreadsheet the draft is prepared')
  } finally {
    await h.cleanup()
    await folder.remove()
  }
}

/** A spreadsheet open while APPLYING, with the Windows layer: the same all-or-nothing guarantees and the exact actionable line. */
async function s3ApplyLocked(): Promise<void> {
  await s4('S3-apply-locked', 'planilha aberta durante o Aplicar (camada do Windows) — tudo ou nada, "Feche “preços.xlsx”…", funciona depois de fechar', createWindowsHistoryFileOps({ cloudRoots: [] }))
}

/** A path over 300 characters: draft, Apply and Desfazer work. */
async function s3LongPath(): Promise<void> {
  const { scenario: row, check } = scenario('S3-long-path', 'caminho com mais de 300 caracteres — rascunho, Aplicar e Desfazer funcionam')
  if (process.platform !== 'win32') { row.status = 'blocked'; row.detail = 'Windows only (260-character limit)'; return }
  const folder = await createUserFolder()
  const h = await harness(folder, { fileOps: createWindowsHistoryFileOps({ cloudRoots: [] }) })
  try {
    const deep = Array.from({ length: 6 }, (_unused, index) => `pasta-bem-comprida-numero-${String(index)}-para-passar-de-260`).join('\\')
    const relative = join(deep, 'relatório.txt')
    const absolute = join(folder.dir, relative)
    check(absolute.length > 300, `the file path is ${String(absolute.length)} characters`)
    await mkdir(toNamespacedPath(dirname(absolute)), { recursive: true })
    await writeFile(toNamespacedPath(absolute), 'velho\n')
    const readLong = (): string => readFileSync(toNamespacedPath(absolute), 'utf8')
    await personaEdits(h.delivery, 't3l', { [relative]: 'novo\n' })
    check(readLong() === 'velho\n', 'the folder is untouched while the draft is being worked on')
    const summary = await h.delivery.summary({ id: 't3l', assignments: [] })
    check(summary.files.some(file => file.path.replaceAll('\\', '/') === relative.replaceAll('\\', '/')), 'review lists the long-path file')
    const applied = await h.delivery.accept({ id: 't3l' }, 'ff')
    check(merged(applied) && applied.restorePointId !== undefined, 'apply works and returns a restore point')
    check(readLong() === 'novo\n', 'the long-path file has the new content')
    check(!existsSync(toNamespacedPath(join(folder.dir, '.git'))), 'the folder has no .git')
    if (merged(applied) && applied.restorePointId !== undefined) {
      const undone = await h.delivery.undoApply?.(applied.restorePointId)
      check(undone?.kind === 'restored' && readLong() === 'velho\n', 'Desfazer restores the long-path file')
    }
  } finally {
    await h.cleanup()
    await removeTree(folder.dir)
  }
}

/** OneDrive online-only files: hydrated BEFORE each copy; if the cloud cannot deliver, the line says what to do and nothing is left half-done. */
async function s3Hydrate(): Promise<void> {
  const { scenario: row, check } = scenario('S3-hydrate', 'arquivo só online (OneDrive, simulado) é hidratado ANTES de copiar; se a nuvem falha, o aviso manda abrir o OneDrive')
  if (process.platform !== 'win32') { row.status = 'blocked'; row.detail = 'Windows only (OneDrive layer)'; return }
  const folder = await createUserFolder()
  const calls: string[] = []
  const tail = (path: string): string => path.split('\\').at(-1) ?? path
  const io: WindowsHistoryIo = {
    hydrate: async (source) => { calls.push(`hydrate:${tail(source)}`) },
    copy: async (source, destination) => { calls.push(`copy:${tail(source)}`); await copyFile(source, destination) },
  }
  const h = await harness(folder, { fileOps: createWindowsHistoryFileOps({ cloudRoots: [folder.dir] }, io) })
  const offline = await harness(folder, {
    fileOps: createWindowsHistoryFileOps({ cloudRoots: [folder.dir] }, {
      hydrate: async () => { throw Object.assign(new Error('offline detail'), { code: 'ENOENT' }) },
      copy: async () => { throw new Error('unexpected copy: the file was not hydrated') },
    }),
  })
  try {
    const docxBefore = read(folder, DOCX)
    await personaEdits(h.delivery, 't3h', { [DOCX]: buildDocx(MENU_AFTER) })
    for (const name of [DOCX, XLSX, 'recado.txt']) {
      const hydrated = calls.indexOf(`hydrate:${name}`)
      check(hydrated >= 0 && hydrated < calls.indexOf(`copy:${name}`), `${name} is hydrated before it is copied`)
    }
    const applied = await h.delivery.accept({ id: 't3h' }, 'ff')
    check(merged(applied), 'apply works on the hydrated draft')
    check(userFolderProblems(folder.dir).length === 0, 'the folder has no .git')
    if (merged(applied) && applied.restorePointId !== undefined) await h.delivery.undoApply?.(applied.restorePointId)
    check(read(folder, DOCX).equals(docxBefore), 'Desfazer leaves the folder as the person had it')

    let message = ''
    try { await offline.delivery.prepare({ id: 'a-t3o', ticketId: 't3o' }) } catch (error) { message = error instanceof Error ? error.message : String(error) }
    row.detail = `offline message: ${message.slice(0, 240)}`
    check(/OneDrive.*Sempre manter neste dispositivo/u.test(message), 'if the cloud cannot deliver, the line says: open OneDrive, "Sempre manter neste dispositivo"')
    check(!existsSync(offline.draftDir('t3o')), 'no half-made draft is left behind')
    check(read(folder, DOCX).equals(docxBefore), 'the folder was not touched')
  } finally {
    await h.cleanup()
    await offline.cleanup()
    await folder.remove()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// S4: spreadsheet open in Excel during Apply: all-or-nothing, an actionable message, then it works once closed.
// ---------------------------------------------------------------------------------------------------------------------
async function s4(
  id = 'S4',
  title = 'planilha aberta durante o Aplicar — tudo ou nada, aviso acionável, funciona depois de fechar',
  fileOps?: HistoryFileOps,
): Promise<void> {
  const { scenario: row, check } = scenario(id, title)
  if (process.platform !== 'win32') {
    row.status = 'blocked'
    row.detail = 'Windows only (FileShare.None)'
    return
  }
  const folder = await createUserFolder()
  const h = await harness(folder, fileOps === undefined ? {} : { fileOps })
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
    if (fileOps !== undefined) check(FECHE_XLSX.test(explanation), 'the Windows layer names the file: "Feche “preços.xlsx” …"')
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
for (const run of [s1, s2, s3PrepareLocked, s3ApplyLocked, s3LongPath, s3Hydrate, () => s4(), s5]) {
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

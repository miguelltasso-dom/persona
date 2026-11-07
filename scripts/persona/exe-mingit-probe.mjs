// INSTALLED-EXE CHECK for SW-4 / SW-5 (Rivet, 07/11): the Git the person gets is the one INSIDE the package, and the review flow works with it.
// Run INSIDE the exe's own node, with the PATH reduced to System32 (no git anywhere else):
//   ELECTRON_RUN_AS_NODE=1 <win-unpacked or installed>/Persona.exe scripts/persona/exe-mingit-probe.mjs      (zero AI, no window, ~10 s; exit 0 only when it all works)
// 1. the packaged persona-runners resolves git to the BUNDLED MinGit (resources/mingit/cmd/git.exe), not to something on the machine;
// 2. with that git, the packaged persona-engine's HistoryReviewDelivery prepares a draft of a project OUTSIDE its folder, applies it (fast-forward) with a restore
//    point and undoes it, and the person's folder never gets a .git directory (SW-4);
// 3. the Windows file helpers the apply uses are the packaged ones (OneDrive / open-file / long-path handling, SW-5).
// Prints ONE line: MINGIT-LIVE <json>.
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const resources = join(dirname(process.execPath), 'resources')
const lib = name => pathToFileURL(join(resources, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', name, 'lib', 'index.js')).href
const bundledExecutable = join(resources, 'mingit', 'cmd', 'git.exe')
const report = { ok: false, bundledExists: existsSync(bundledExecutable), bundledExecutable }
const root = await mkdtemp(join(tmpdir(), 'persona-mingit-exe-'))
const previousPath = process.env.PATH
try {
  if (!report.bundledExists) throw new Error('the package has no resources/mingit/cmd/git.exe')
  const runners = await import(lib('dsh-persona-runners'))
  const engine = await import(lib('dsh-persona-engine'))
  for (const [owner, name] of [[runners, 'resolveGitExecutable'], [runners, 'createWindowsHistoryFileOps'], [engine, 'HistoryReviewDelivery']]) {
    if (typeof owner[name] !== 'function') throw new Error(`the packaged library has no ${name}`)
  }
  // no git on the PATH: only System32 (cmd, tar... but no git.exe)
  process.env.PATH = join(process.env.SystemRoot ?? 'C:/Windows', 'System32')
  const git = await runners.resolveGitExecutable({ env: process.env, bundledExecutable })
  report.gitSource = git.source
  report.gitExecutable = git.executable
  if (git.source !== 'bundled') throw new Error(`git resolved to "${String(git.source)}", not the bundled MinGit`)
  const project = join(root, 'documents')
  const home = join(root, 'persona')
  await mkdir(project)
  await writeFile(join(project, 'menu.txt'), 'old')
  const delivery = new engine.HistoryReviewDelivery({
    projectId: 'test', personaHome: home, projectRoot: project, worktreesRoot: join(home, 'worktrees'), git: git.executable, fileOps: runners.createWindowsHistoryFileOps(),
  })
  const draft = await delivery.prepare({ id: 'assignment', ticketId: 'ticket' })
  report.draftIsSeparate = draft.path !== project
  await writeFile(join(draft.path, 'menu.txt'), 'new')
  const applied = await delivery.accept({ id: 'ticket' }, 'ff')
  report.apply = applied.kind
  if (applied.kind !== 'merged' || !applied.restorePointId) throw new Error(`apply gave ${String(applied.kind)}`)
  if (await readFile(join(project, 'menu.txt'), 'utf8') !== 'new') throw new Error('the applied file does not carry the new text')
  const undone = await delivery.undoApply(applied.restorePointId)
  report.undo = undone.kind
  if (undone.kind !== 'restored' || await readFile(join(project, 'menu.txt'), 'utf8') !== 'old') throw new Error('undo did not restore the old text')
  report.projectGitDirectory = existsSync(join(project, '.git'))
  report.ok = report.draftIsSeparate === true && report.projectGitDirectory === false
  if (!report.ok) report.error = 'the draft shares the project folder or a .git appeared in it'
} catch (error) {
  report.error = String(error instanceof Error ? error.message : error).slice(0, 400)
} finally {
  if (previousPath === undefined) delete process.env.PATH
  else process.env.PATH = previousPath
  if (resolve(root).startsWith(`${resolve(tmpdir())}${sep}`)) await rm(root, { recursive: true, force: true }).catch(() => undefined)
}
console.log(`MINGIT-LIVE ${JSON.stringify(report)}`)
process.exit(report.ok ? 0 : 1)

/**
 * HT-11 (D-084 item "skills pessoais por opção"): the person's own Claude skills, loaded only when the person turned the option on.
 *
 * Why a product directory and not the person's settings: loading the `user` setting source brings back far more than skills (the person's
 * permission allow-list, model and effort, hooks, plugins). Measured on the real CLI (reports/ht11-skills-dry.json): `--setting-sources user`
 * changes the applied effort and carries the person's `permissions.allow`. `--add-dir <dir>` with a `.claude/skills` folder brings the
 * skills in and nothing else (reports/ht11-skills-dry2.json). The product keeps such a folder of POINTERS (directory junctions on Windows,
 * symlinks elsewhere) to the person's skill folders: nothing is copied, nothing is read (only whether `SKILL.md` exists), the person's
 * folder is never written, and removing a pointer never touches the skill.
 */

import { lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { homedir, platform, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** A skill folder name the product is willing to point at (no separators, no dots-only names, bounded). */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u

export interface SkillsRoot {
  /** The directory to hand to `--add-dir` (it contains `.claude/skills/<name>`). */
  readonly root: string
  /** How many skills it points at. */
  readonly count: number
}

export interface SkillsFs {
  readonly entries: (dir: string) => readonly string[]
  readonly isSkillDir: (dir: string) => boolean
  readonly realpath: (path: string) => string
  /** The target of an existing pointer, or `undefined` when `path` is absent or is not a pointer. */
  readonly pointerTarget: (path: string) => string | undefined
  readonly link: (target: string, path: string) => void
  readonly unlink: (path: string) => void
  readonly mkdirs: (dir: string) => void
}

const realFs: SkillsFs = {
  entries: dir => readdirSync(dir),
  isSkillDir: (dir) => {
    try { return statSync(dir).isDirectory() && statSync(join(dir, 'SKILL.md')).isFile() } catch { return false }
  },
  realpath: path => realpathSync(path),
  pointerTarget: (path) => {
    let pointer: boolean
    try { pointer = lstatSync(path).isSymbolicLink() } catch { return undefined }
    if (!pointer) return undefined
    // Compared by real path (a junction's raw link text carries prefixes); a dangling pointer is still a pointer, with no target.
    try { return realpathSync(path) } catch { return '' }
  },
  link: (target, path) => { symlinkSync(target, path, platform() === 'win32' ? 'junction' : 'dir') },
  // A pointer is removed as a pointer: `recursive: false` never descends into the skill it points at.
  unlink: (path) => { rmSync(path, { recursive: false, force: true }) },
  mkdirs: (dir) => { mkdirSync(dir, { recursive: true }) },
}

/** Where Claude keeps the person's personal skills. */
export function personalSkillsSource(home: string = homedir()): string {
  return join(home, '.claude', 'skills')
}

/** Where the product keeps its folder of pointers (outside any project, outside the person's `.claude`). */
export function defaultSkillsRoot(): string {
  return join(tmpdir(), 'persona-cli-env', 'personal-skills')
}

/**
 * Brings the product's folder of pointers in line with the person's skills: a pointer for each skill folder, none for what was removed.
 * Idempotent and cheap (a directory listing and one `SKILL.md` existence check per skill). Never reads a file's content and never writes
 * inside the person's folder.
 * @param options - `source`: the person's skills directory; `root`: the product's folder; `fs`: injected in tests.
 * @returns The folder to pass to `--add-dir`, or `undefined` when the person has no skills to load (the plan then stays at the floor).
 */
export function syncSkillsRoot(options: { readonly source?: string; readonly root?: string; readonly fs?: SkillsFs } = {}): SkillsRoot | undefined {
  const fs = options.fs ?? realFs
  const source = options.source ?? personalSkillsSource()
  const root = options.root ?? defaultSkillsRoot()
  const skillsDir = join(root, '.claude', 'skills')
  let names: readonly string[]
  try { names = fs.entries(source) } catch { return undefined }
  const wanted = new Map<string, string>()
  for (const name of names) {
    if (!SAFE_NAME.test(name)) continue
    const path = join(source, name)
    if (!fs.isSkillDir(path)) continue
    let real: string
    try { real = fs.realpath(path) } catch { continue }
    wanted.set(name, real)
  }
  try { fs.mkdirs(skillsDir) } catch { return undefined }
  // Drop pointers to skills that are gone; never touch anything that is not a pointer.
  let existing: readonly string[] = []
  try { existing = fs.entries(skillsDir) } catch { existing = [] }
  for (const name of existing) {
    if (wanted.has(name)) continue
    const path = join(skillsDir, name)
    if (fs.pointerTarget(path) !== undefined) {
      try { fs.unlink(path) } catch { /* left behind: harmless, the CLI sees a dangling pointer as no skill */ }
    }
  }
  let count = 0
  for (const [name, real] of wanted) {
    const path = join(skillsDir, name)
    const current = fs.pointerTarget(path)
    if (current !== undefined && resolve(current) === resolve(real)) { count += 1; continue }
    try {
      if (current !== undefined) fs.unlink(path)
      fs.link(real, path)
      count += 1
    } catch { /* a name the product cannot point at (a real folder is there) is skipped */ }
  }
  return count === 0 ? undefined : { root, count }
}

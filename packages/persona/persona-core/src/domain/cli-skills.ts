/**
 * Import skill candidates from Claude Code / Codex home dirs.
 * Proposed only — never auto-enabled. Secrets are dropped, not copied.
 */

import { dirname, join } from 'node:path'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { shareLooksLikeSecret } from './share.ts'

export interface SkillDirIo {
  home(): string
  list(dir: string): string[]
  read(file: string): string | undefined
  isDir(path: string): boolean
}

export interface CliSkillCandidate {
  name: string
  body: string
  origin: 'learned'
  enabled: false
  source: 'claude' | 'codex'
  skillKey: string
}

const SKIP_NAME = /(?:^|\/)\.env(?:\.|$)|credentials|secret|token|id_rsa|id_ed25519|\.pem$/iu

/**
 * Default filesystem against the current user home.
 */
export function defaultSkillDirIo(): SkillDirIo {
  return {
    home: () => homedir(),
    list: (dir) => {
      try {
        return readdirSync(dir)
      } catch (listError: unknown) {
        void listError
        return []
      }
    },
    read: (file) => {
      try {
        return readFileSync(file, 'utf8')
      } catch (readError: unknown) {
        void readError
        return undefined
      }
    },
    isDir: (path) => {
      try {
        return statSync(path).isDirectory()
      } catch (statError: unknown) {
        void statError
        return false
      }
    },
  }
}

function parseSkillMarkdown(text: string, fallback: string): { name: string; body: string } | undefined {
  if (shareLooksLikeSecret(text)) return undefined
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  let name = fallback
  let body = trimmed
  if (trimmed.startsWith('---')) {
    const close = trimmed.indexOf('\n---', 3)
    if (close > 0) {
      const fm = trimmed.slice(3, close)
      const named = /(?:^|\n)name:\s*(.+)/u.exec(fm)
      if (named?.[1] !== undefined) name = named[1].trim().replace(/^["']|["']$/g, '')
      body = trimmed.slice(close + 4).trim()
    }
  }
  if (name === '' || shareLooksLikeSecret(name) || shareLooksLikeSecret(body)) return undefined
  return { name: name.slice(0, 80), body: body.slice(0, 8_000) }
}

function walkSkills(root: string, io: SkillDirIo, source: 'claude' | 'codex'): CliSkillCandidate[] {
  const out: CliSkillCandidate[] = []
  if (!io.isDir(root)) return out
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    for (const entry of io.list(dir)) {
      const path = join(dir, entry)
      if (SKIP_NAME.test(entry) || SKIP_NAME.test(path)) continue
      if (io.isDir(path)) {
        stack.push(path)
        continue
      }
      if (!/^(?:SKILL\.md|skill\.md)$/u.test(entry)) continue
      const text = io.read(path)
      if (text === undefined) continue
      const key = dirname(path).split(/[/\\]/u).at(-1) ?? entry
      const parsed = parseSkillMarkdown(text, key)
      if (parsed === undefined) continue
      out.push({
        name: parsed.name,
        body: parsed.body,
        origin: 'learned',
        enabled: false,
        source,
        skillKey: key,
      })
    }
  }
  return out
}

/**
 * Read `~/.claude/skills` and `~/.codex/skills`. Candidates stay disabled.
 * @param io - Injectable fs (tests).
 */
export function importCliSkillCandidates(io: SkillDirIo = defaultSkillDirIo()): CliSkillCandidate[] {
  const home = io.home()
  const claude = walkSkills(join(home, '.claude', 'skills'), io, 'claude')
  const codex = walkSkills(join(home, '.codex', 'skills'), io, 'codex')
  const seen = new Set<string>()
  const merged: CliSkillCandidate[] = []
  for (const row of [...claude, ...codex]) {
    const id = `${row.source}:${row.skillKey}`
    if (seen.has(id)) continue
    seen.add(id)
    merged.push(row)
  }
  return merged
}

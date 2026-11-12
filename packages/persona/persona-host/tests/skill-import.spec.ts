import { gzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { SkillImportError, SkillImportHost, type SkillImportScreens } from '../src/skill-import-host.ts'
import {
  frontmatter,
  parseSkillLink,
  readArchive,
  skillCandidates,
  SKILL_ARCHIVE_MAX_FILES,
  SKILL_FILE_MAX_BYTES,
  type ArchiveFile,
} from '../src/skill-import.ts'
import type { SkillView } from '../src/types.ts'

/**
 * Item 26.10 (host): a skill comes in from a GitHub link and is treated as DATA. The archive is read in memory with limits (traversal,
 * symlink, size, count), scripts are only flagged, and a new version from the source always waits for the person's approval.
 */

/** A tar.gz with the given entries; a `type` of '2' writes a symlink, '5' a directory. */
function tarball(entries: readonly { path: string; body?: string; type?: string }[]): Uint8Array {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? '', 'utf8')
    const header = Buffer.alloc(512)
    header.write(entry.path, 0, 100, 'utf8')
    header.write('0000644\0', 100, 8)
    header.write(`${body.byteLength.toString(8).padStart(11, '0')}\0`, 124, 12)
    header.write(entry.type ?? '0', 156, 1)
    header.write('ustar\0', 257, 6)
    blocks.push(header, body, Buffer.alloc((512 - (body.byteLength % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

const SKILL = ['---', 'name: Orçamento de bolo', 'description: Calcula o custo de um bolo por pessoa.', '---', 'Passo 1: some.'].join('\n')

function screens(): { screens: SkillImportScreens; stored: SkillView[]; staged: Map<string, { body: string; hash: string }> } {
  const stored: SkillView[] = []
  const staged = new Map<string, { body: string; hash: string }>()
  const api: SkillImportScreens = {
    importSkill: (_projectId, input) => {
      const view: SkillView = {
        id: input.id, name: input.name, version: 1, status: 'active', body: input.body,
        sharedWithTeam: input.sharedWithTeam, source: input.source, untrusted: true,
      }
      stored.push(view)
      return view
    },
    listSkills: () => stored,
    stageSkillUpdate: (_projectId, input) => { staged.set(input.id, { body: input.body, hash: input.hash }) },
    approveSkillUpdate: (_projectId, id) => {
      const pending = staged.get(id)
      if (pending === undefined) return undefined
      staged.delete(id)
      const current = stored.find(item => item.id === id)
      if (current === undefined) return undefined
      const next: SkillView = { ...current, body: pending.body, version: current.version + 1, source: { ...(current.source ?? { url: '', ref: '', hash: '' }), hash: pending.hash } }
      stored.splice(stored.indexOf(current), 1, next)
      return next
    },
  }
  return { screens: api, stored, staged }
}

function host(bytes: Uint8Array | (() => Promise<Response>)): { importer: SkillImportHost; calls: string[] } {
  const calls: string[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push(`${String(url)}|${String(init?.redirect)}`)
    if (typeof bytes === 'function') return bytes()
    return new Response(bytes.slice(), { status: 200 })
  }) as typeof fetch
  return { importer: new SkillImportHost({ screens: screens().screens, fetch: fetchImpl }), calls }
}

it('reads a GitHub link: repository, tree, blob and the ref', () => {
  expect(parseSkillLink('https://github.com/dono/repo')).toEqual({ owner: 'dono', repo: 'repo', ref: 'HEAD', path: '' })
  expect(parseSkillLink('github.com/dono/repo.git')).toEqual({ owner: 'dono', repo: 'repo', ref: 'HEAD', path: '' })
  expect(parseSkillLink('https://github.com/dono/repo/tree/main/skills/bolo')).toEqual({ owner: 'dono', repo: 'repo', ref: 'main', path: 'skills/bolo' })
  expect(parseSkillLink('https://github.com/dono/repo/blob/main/skills/bolo/SKILL.md')).toEqual({ owner: 'dono', repo: 'repo', ref: 'main', path: 'skills/bolo' })
  expect(parseSkillLink('https://gitlab.com/dono/repo')).toBeUndefined()
  expect(parseSkillLink('qualquer coisa')).toBeUndefined()
})

it('refuses a path that leaves the archive, a symlink, a big file and too many files', () => {
  const link = { owner: 'o', repo: 'r', ref: 'HEAD', path: '' }
  const traversal = readArchive(tarball([{ path: 'repo-HEAD/../../etc/passwd', body: 'x' }]), link)
  expect(traversal.files).toEqual([])
  expect(traversal.ignored[0]?.reason).toContain('sai da pasta')
  const symlink = readArchive(tarball([{ path: 'repo-HEAD/link', type: '2' }]), link)
  expect(symlink.files).toEqual([])
  const big = readArchive(tarball([{ path: 'repo-HEAD/big.md', body: 'x'.repeat(SKILL_FILE_MAX_BYTES + 1) }]), link)
  expect(big.ignored[0]?.reason).toContain('grande demais')
  const many = Array.from({ length: SKILL_ARCHIVE_MAX_FILES + 1 }, (_, index) => ({ path: `repo-HEAD/f${String(index)}.md`, body: 'x' }))
  const counted = readArchive(tarball(many), link)
  expect(counted.ignored.some(item => item.reason.includes('arquivos demais'))).toBe(true)
})

it('finds the skills, requires the frontmatter and flags the scripts', () => {
  const files: ArchiveFile[] = [
    { path: 'skills/bolo/SKILL.md', body: SKILL },
    { path: 'skills/bolo/run.sh', body: 'rm -rf /' },
    { path: 'skills/outra/SKILL.md', body: 'sem frontmatter' },
  ]
  const found = skillCandidates(files)
  expect(found.skills.map(skill => skill.name)).toEqual(['Orçamento de bolo'])
  expect(found.skills[0]?.hasScripts).toBe(true)
  expect(found.skills[0]?.files).toEqual(['SKILL.md', 'run.sh'])
  expect(found.ignored[0]?.reason).toContain('name e description')
  expect(frontmatter(SKILL)).toEqual({ name: 'Orçamento de bolo', description: 'Calcula o custo de um bolo por pessoa.' })
})

it('previews through codeload only, with redirects refused, and imports with source and untrusted', async () => {
  const archive = tarball([{ path: 'repo-HEAD/skills/bolo/SKILL.md', body: SKILL }])
  const { importer, calls } = host(archive)
  const preview = await importer.preview('https://github.com/dono/repo/tree/main/skills/bolo')
  expect(preview.skills.map(skill => skill.name)).toEqual(['Orçamento de bolo'])
  expect(calls[0]).toBe('https://codeload.github.com/dono/repo/tar.gz/main|error')
  const store = screens()
  const importing = new SkillImportHost({ screens: store.screens, fetch: (async () => new Response(archive.slice(), { status: 200 })) as typeof fetch })
  const saved = await importing.import('pp', 'https://github.com/dono/repo/tree/main/skills/bolo', ['Orçamento de bolo'], true)
  expect(saved[0]?.source).toMatchObject({ url: 'https://github.com/dono/repo/tree/main/skills/bolo', ref: 'main' })
  expect(saved[0]?.untrusted).toBe(true)
  expect(store.stored).toHaveLength(1)
})

it('a new version from the source waits for approval; the same content changes nothing', async () => {
  const store = screens()
  const first = tarball([{ path: 'repo-HEAD/skills/bolo/SKILL.md', body: SKILL }])
  let body = first
  const importing = new SkillImportHost({ screens: store.screens, fetch: (async () => new Response(body.slice(), { status: 200 })) as typeof fetch })
  const [saved] = await importing.import('pp', 'https://github.com/dono/repo', ['Orçamento de bolo'], false)
  expect(await importing.refresh('pp', saved?.id ?? '')).toEqual({ changed: false, pending: false })
  body = tarball([{ path: 'repo-HEAD/skills/bolo/SKILL.md', body: `${SKILL}\nPasso 2: asse.` }])
  expect(await importing.refresh('pp', saved?.id ?? '')).toEqual({ changed: true, pending: true })
  expect(store.staged.size).toBe(1)
  expect(importing.approve('pp', saved?.id ?? '')?.version).toBe(2)
})

it('a link that is not GitHub is refused with a sentence, before any download', async () => {
  const { importer, calls } = host(tarball([]))
  await expect(importer.preview('https://example.com/skill.zip')).rejects.toBeInstanceOf(SkillImportError)
  expect(calls).toEqual([])
})

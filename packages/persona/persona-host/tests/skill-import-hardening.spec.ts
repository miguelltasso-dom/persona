/**
 * Carbon P0-03 (colheita-s1-fix, item 26 `skill-import.ts`): the link a person pastes is DATA from the internet. A hostile archive must never freeze the host (a tar
 * header with a negative size made `offset` stop advancing: 100% CPU on the event loop), never exhaust memory (a gzip bomb), and a download that hangs must end with a
 * sentence. Reading and importing is the machine owner's (the host opens a connection to the typed address). Written RED first.
 *
 * The infinite loop is proved in a CHILD process with a deadline: in the old code it would hang this very test run, because a synchronous loop cannot be interrupted by a timeout.
 */
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { SkillImportError, SkillImportHost } from '../src/skill-import-host.ts'
import { readArchive, SKILL_TAR_MAX_BYTES } from '../src/skill-import.ts'
import { bindHostFile, it } from './host-harness.ts'

const LINK = { owner: 'acme', repo: 'skills', ref: 'HEAD', path: '' }
const SKILL_MODULE = new URL('../src/skill-import.ts', import.meta.url).href

/** A tar header (512 bytes) with the size field written as the caller wants it (so a hostile one can be built). */
function header(path: string, sizeField: string, type = '0'): Buffer {
  const block = Buffer.alloc(512)
  block.write(path, 0, 100, 'utf8')
  block.write('0000644\0', 100, 8)
  block.write(sizeField, 124, 12, 'utf8')
  block.write(type, 156, 1)
  block.write('ustar\0', 257, 6)
  return block
}

const gz = (...blocks: Buffer[]): Uint8Array => gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))

/**
 * Runs `readArchive` on the bytes in a child process that is killed after `ms`; answers what it printed, or `'HUNG'` when it never ended.
 * @param bytes - The hostile archive.
 * @param ms - The deadline.
 */
function readInChild(bytes: Uint8Array, ms: number): string {
  const script = `
    import(${JSON.stringify(SKILL_MODULE)}).then((m) => {
      const bytes = Buffer.from(process.argv[1], 'base64')
      const out = m.readArchive(bytes, ${JSON.stringify(LINK)})
      process.stdout.write(JSON.stringify({ files: out.files.length, ignored: out.ignored.map(item => item.reason) }))
    })`
  try {
    return execFileSync(process.execPath, ['-e', script, Buffer.from(bytes).toString('base64')], { timeout: ms, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (error: unknown) {
    const killed = (error as { code?: string; signal?: string }).code === 'ETIMEDOUT' || (error as { signal?: string }).signal === 'SIGTERM'
    return killed ? 'HUNG' : `ERROR:${error instanceof Error ? error.message : String(error)}`
  }
}

it('a tar header with a NEGATIVE size ("-1000") does not freeze the host: the archive is refused as malformed, quickly', () => {
  const hostile = gz(header('repo-main/dir/', '-1000\0', '5'), header('repo-main/SKILL.md', '00000000000\0'))
  const answer = readInChild(hostile, 8_000)
  expect(answer).not.toBe('HUNG')
  const parsed = JSON.parse(answer) as { files: number; ignored: string[] }
  expect(parsed.ignored.some(reason => /malformado|inválido/iu.test(reason))).toBe(true)
  expect(parsed.files).toBe(0)
}, 20_000)

it('a size field that is not octal (letters, spaces inside, a sign, a base-256 marker) is malformed too, never read as a number', () => {
  for (const field of ['12ab\0', '1 2\0', '+100\0', '\x80\x00\x00\x00\x00\x00\x00\x00\x00\x00\x10\x00']) {
    const out = readArchive(gz(header('repo-main/a.txt', field), header('repo-main/b.txt', '00000000000\0')), LINK)
    expect(out.ignored.some(item => /malformado|inválido/iu.test(item.reason)), `field ${JSON.stringify(field)}`).toBe(true)
    expect(out.files).toEqual([])
  }
})

it('an honest archive still reads: zero-size entries, a directory and a normal file (octal parsing did not get stricter than the format)', () => {
  const body = Buffer.from('---\nname: A\ndescription: B\n---\ncorpo', 'utf8')
  const file = header('repo-main/skill/SKILL.md', `${body.byteLength.toString(8).padStart(11, '0')}\0`)
  const out = readArchive(gz(header('repo-main/skill/', '00000000000\0', '5'), file, body, Buffer.alloc((512 - (body.byteLength % 512)) % 512)), LINK)
  expect(out.ignored).toEqual([])
  expect(out.files.map(item => item.path)).toEqual(['skill/SKILL.md'])
})

it('a gzip bomb (tens of MB of zeros in a few KB) is refused by the decompressed-size limit instead of filling the memory', () => {
  const bomb = gzipSync(Buffer.alloc(SKILL_TAR_MAX_BYTES + 4 * 1024 * 1024))
  expect(bomb.byteLength).toBeLessThan(200 * 1024)
  const out = readArchive(bomb, LINK)
  expect(out.files).toEqual([])
  expect(out.ignored.some(item => /grande demais/iu.test(item.reason))).toBe(true)
})

it('a download that never answers ends with a sentence at the deadline (the host does not wait forever), even when the fetch ignores the signal', async () => {
  const importer = new SkillImportHost({ screens: {} as never, fetch: () => new Promise<Response>(() => undefined), timeoutMs: 80 })
  await expect(importer.preview('github.com/acme/skills')).rejects.toThrow(SkillImportError)
  await expect(importer.preview('github.com/acme/skills')).rejects.toThrow(/demor/iu)
}, 10_000)

it('a body that starts and then stalls also ends at the deadline', async () => {
  const stalled = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([31, 139])) } }) // two bytes, then silence
  const importer = new SkillImportHost({ screens: {} as never, fetch: () => Promise.resolve(new Response(stalled, { status: 200 })), timeoutMs: 80 })
  await expect(importer.preview('github.com/acme/skills')).rejects.toThrow(/demor/iu)
}, 10_000)

it('the fetch gets an AbortSignal (the real network is cut at the deadline, not only abandoned)', async () => {
  let signal: AbortSignal | null | undefined
  const importer = new SkillImportHost({
    screens: {} as never,
    fetch: (_url, init) => { signal = init?.signal; return Promise.reject(new Error('offline')) },
    timeoutMs: 80,
  })
  await expect(importer.preview('github.com/acme/skills')).rejects.toThrow(SkillImportError)
  expect(signal).toBeInstanceOf(AbortSignal)
})

// ---- the Remotes: the host opens a connection to what the person typed, so it is the machine OWNER's ----
const { host } = bindHostFile('2026-11-12T12:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pr' } // a SHARED project: a member can read it (the personal one is the owner's alone), so the guard under test is the only thing between her and the network

function seed(h: PersonaHost): { calls: string[] } {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createProject({ id: 'pr', workspaceId: 'ws', name: 'Alpha', description: 'app' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', ...scope, displayName: 'Bia', handle: 'bia', role: 'member' })
  const calls: string[] = []
  const spy = (url: unknown): Promise<Response> => { calls.push(String(url)); return Promise.reject(new Error('offline')) }
  ;(h as unknown as { skillImport: SkillImportHost }).skillImport = new SkillImportHost({ screens: h.screens, fetch: spy as typeof fetch })
  h.sessionMemberId = 'ana'
  return { calls }
}

it('only the machine OWNER previews, imports and refreshes from a link: a member is refused BEFORE any network call', async () => {
  const h = host()
  const { calls } = seed(h)
  h.sessionMemberId = 'bia'
  await expect(h.previewSkillImport({ ...scope, url: 'github.com/acme/skills' })).rejects.toThrow('forbidden')
  await expect(h.importSkills({ ...scope, url: 'github.com/acme/skills', names: ['A'], sharedWithTeam: false })).rejects.toThrow('forbidden')
  await expect(h.refreshSkill({ ...scope, id: 'qualquer' })).rejects.toThrow('forbidden')
  expect(calls).toEqual([])
  h.sessionMemberId = 'ana'
  await expect(h.previewSkillImport({ ...scope, url: 'github.com/acme/skills' })).rejects.toBeDefined() // the owner reaches the network (the spy refuses it)
  expect(calls).toHaveLength(1)
})

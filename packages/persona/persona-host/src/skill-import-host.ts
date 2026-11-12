/**
 * Item 26.10/26.11 (host): download a skill from GitHub, preview it, import it, and refresh it from the same source.
 *
 * Security, per the plan Keel approved: only `github.com` links are parsed and only `codeload.github.com` is fetched, with redirects
 * refused (no cross-host hop) and no user data sent; the archive is read in memory under the limits of `skill-import.ts`; the imported
 * body is stored as UNTRUSTED DATA (`untrusted: true`), never as instructions to the host; and a new version from the source always waits
 * for the person's approval with the before/after.
 */

import type { ScreensHost } from './screens.ts'
import type { SkillView } from './types.ts'
import {
  archiveUrl,
  parseSkillLink,
  readArchive,
  skillCandidates,
  SKILL_ARCHIVE_MAX_BYTES,
  type SkillImportPreview,
} from './skill-import.ts'

/** A refused import: the message is the sentence the screen shows. */
export class SkillImportError extends Error {}

/** What the importer needs from the skills store (a test passes a double). */
export type SkillImportScreens = Pick<ScreensHost, 'importSkill' | 'listSkills' | 'stageSkillUpdate' | 'approveSkillUpdate'>

/** What the importer needs. */
export interface SkillImportHostDeps {
  readonly screens: SkillImportScreens
  /** The network (a test replaces it). */
  readonly fetch?: typeof fetch
  /** Carbon P0-03: how long the WHOLE download may take (default 15 s). A server that never answers must end with a sentence, not hold the host. */
  readonly timeoutMs?: number
}

/** Default deadline of one download. */
export const SKILL_DOWNLOAD_TIMEOUT_MS = 15_000

/** Ends `work` with `onTimeout()` when the signal fires, even if the thing behind it ignores the signal (an injected fetch, a stalled stream). */
function within<T>(work: Promise<T>, signal: AbortSignal, onTimeout: () => Error): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      if (signal.aborted) { reject(onTimeout()); return }
      signal.addEventListener('abort', () => { reject(onTimeout()) }, { once: true })
    }),
  ])
}

/** The result of asking the source for a new version. */
export interface SkillRefreshResult {
  readonly changed: boolean
  /** A new version was staged and waits for the person's approval. */
  readonly pending: boolean
}

/**
 * One importer per host.
 */
export class SkillImportHost {
  private readonly deps: SkillImportHostDeps

  /**
   * @param deps - The skills store and the network.
   */
  constructor(deps: SkillImportHostDeps) {
    this.deps = deps
  }

  /**
   * @param url - A GitHub link.
   * @returns What the link would bring in, before anything is written.
   */
  async preview(url: string): Promise<SkillImportPreview> {
    const link = parseSkillLink(url)
    if (link === undefined) throw new SkillImportError('Cole um link do GitHub (github.com/dono/repositorio).')
    const bytes = await this.download(link)
    const archive = readArchive(bytes, link)
    const found = skillCandidates(archive.files)
    if (found.skills.length === 0) {
      throw new SkillImportError('Não achei nenhuma skill nesse link (um SKILL.md com name e description).')
    }
    return {
      source: { url: url.trim(), ref: link.ref },
      skills: found.skills,
      ignored: [...archive.ignored, ...found.ignored],
    }
  }

  /**
   * @param projectId - Tenant.
   * @param url - The link the preview read.
   * @param names - Which skills of the preview to bring in.
   * @param sharedWithTeam - Whether the whole team may use them.
   * @returns The stored skills.
   */
  async import(projectId: string, url: string, names: readonly string[], sharedWithTeam: boolean): Promise<SkillView[]> {
    const preview = await this.preview(url)
    const wanted = preview.skills.filter(skill => names.includes(skill.name))
    if (wanted.length === 0) throw new SkillImportError('Escolha pelo menos uma skill da lista.')
    return wanted.map(skill => this.deps.screens.importSkill(projectId, {
      id: `import-${slug(skill.name)}`,
      name: skill.name,
      body: skill.body,
      sharedWithTeam,
      source: { url: preview.source.url, ref: preview.source.ref, hash: skill.hash },
    }))
  }

  /**
   * Ask the source for the skill again. Same content changes nothing; a new one is staged and waits for approval.
   * @param projectId - Tenant.
   * @param id - Skill id.
   * @returns Whether the source moved.
   */
  async refresh(projectId: string, id: string): Promise<SkillRefreshResult> {
    const skill = this.deps.screens.listSkills(projectId).find(item => item.id === id)
    if (skill === undefined || skill.source === undefined) throw new SkillImportError('Esta skill não veio de um link.')
    const preview = await this.preview(skill.source.url)
    const fresh = preview.skills.find(item => item.name === skill.name)
    if (fresh === undefined) throw new SkillImportError('A skill não está mais no link de origem.')
    if (fresh.hash === skill.source.hash) return { changed: false, pending: false }
    this.deps.screens.stageSkillUpdate(projectId, { id, body: fresh.body, hash: fresh.hash })
    return { changed: true, pending: true }
  }

  /**
   * @param projectId - Tenant.
   * @param id - Skill id.
   * @returns The skill with the staged version applied, or undefined when nothing was waiting.
   */
  approve(projectId: string, id: string): SkillView | undefined {
    return this.deps.screens.approveSkillUpdate(projectId, id)
  }

  private async download(link: ReturnType<typeof parseSkillLink>): Promise<Uint8Array> {
    if (link === undefined) throw new SkillImportError('Cole um link do GitHub (github.com/dono/repositorio).')
    const fetchImpl = this.deps.fetch ?? fetch
    const signal = AbortSignal.timeout(this.deps.timeoutMs ?? SKILL_DOWNLOAD_TIMEOUT_MS)
    const tooSlow = (): Error => new SkillImportError('O GitHub demorou demais para responder. Tente de novo daqui a pouco.')
    let response: Response
    try {
      // No redirects: the only host we talk to is codeload.github.com, and a hop could take the download anywhere. The signal cuts the real network at the deadline.
      response = await within(fetchImpl(archiveUrl(link), { redirect: 'error', headers: { accept: 'application/gzip' }, signal }), signal, tooSlow)
    } catch (error) {
      if (error instanceof SkillImportError) throw error
      throw signal.aborted ? tooSlow() : new SkillImportError('Não consegui baixar esse repositório. Confira o link e a internet.')
    }
    if (!response.ok) throw new SkillImportError('Não consegui baixar esse repositório. Confira o link.')
    const chunks: Uint8Array[] = []
    let total = 0
    const reader = response.body?.getReader()
    if (reader === undefined) throw new SkillImportError('O repositório veio vazio.')
    for (;;) {
      let step: ReadableStreamReadResult<Uint8Array>
      try {
        step = await within(reader.read(), signal, tooSlow)
      } catch (error) {
        void reader.cancel().catch((cancelError: unknown) => { void cancelError }) // a stalled stream cannot be awaited: let it go
        throw error instanceof SkillImportError ? error : new SkillImportError('Não consegui baixar esse repositório. Confira o link e a internet.')
      }
      const { done, value } = step
      if (done) break
      total += value.byteLength
      if (total > SKILL_ARCHIVE_MAX_BYTES) {
        await reader.cancel()
        throw new SkillImportError('Esse repositório é grande demais para trazer uma skill.')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 60)
}

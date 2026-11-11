/** Download, verify and install on-demand runtime components (persona-spec/contracts/on-demand-runtime.md). */
import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statfsSync } from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import extractZip from 'extract-zip'
import type { ComponentKind, ComponentManifest, ComponentManifestEntry } from './manifest.ts'

/** Why a component could not be installed; the client renders one sentence per reason. */
export type ComponentFailure = 'offline' | 'checksum' | 'disk' | 'http' | 'cancelled'

/** Observable state of one component. */
export type ComponentState =
  | { readonly state: 'installed'; readonly path: string; readonly version: string }
  | { readonly state: 'absent' }
  | { readonly state: 'downloading'; readonly received: number; readonly total: number }
  | { readonly state: 'failed'; readonly reason: ComponentFailure }

/** Construction facts for a {@link ComponentManager}. */
export interface ComponentManagerOptions {
  /** Directory that owns every installed component: `<PERSONA_HOME>/runtime`. */
  readonly root: string
  readonly manifest: ComponentManifest
  /** Injected for tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch
  /** Receives download progress; the client renders it. */
  readonly onProgress?: (kind: ComponentKind, received: number, total: number) => void
  /** Receives every transition, so the host can publish it to the client. */
  readonly onState?: (kind: ComponentKind, state: ComponentState) => void
}

/** Network failure that maps to the contract's `offline` reason. */
class OfflineError extends Error {}

/** Archive bytes that do not match the pinned sha256. */
class ChecksumError extends Error {}

/**
 * Owns the on-demand components: one installation per kind at a time, sha256 verified before extraction,
 * and an atomic move into `<root>/<kind>/<version>`.
 */
export class ComponentManager {
  private readonly states = new Map<ComponentKind, ComponentState>()
  private readonly inflight = new Map<ComponentKind, Promise<ComponentState>>()
  private readonly options: ComponentManagerOptions

  /** @param options - Root, manifest and optional test seams. */
  constructor(options: ComponentManagerOptions) {
    this.options = options
  }

  /**
   * Current state without touching the network.
   * @param kind - Component to inspect.
   * @returns Installed, absent, downloading or the last failure.
   */
  state(kind: ComponentKind): ComponentState {
    const entry = this.entry(kind)
    const installed = join(this.options.root, entry.kind, entry.version)
    if (existsSync(installed)) return { state: 'installed', path: installed, version: entry.version }
    return this.states.get(kind) ?? { state: 'absent' }
  }

  /**
   * Install the component once; concurrent callers share the same download.
   * @param kind - Component to install.
   * @returns The settled state (installed or failed); never rejects for a known failure.
   */
  ensure(kind: ComponentKind): Promise<ComponentState> {
    const entry = this.entry(kind)
    const current = this.state(kind)
    if (current.state === 'installed') return Promise.resolve(current)
    const running = this.inflight.get(kind)
    if (running !== undefined) return running
    const attempt = this.install(entry).finally(() => { this.inflight.delete(kind) })
    this.inflight.set(kind, attempt)
    return attempt
  }

  /**
   * Remove every installed version of one component.
   * @param kind - Component to remove.
   * @returns After the directory is gone.
   */
  async remove(kind: ComponentKind): Promise<void> {
    this.entry(kind)
    rmSync(join(this.options.root, kind), { recursive: true, force: true })
    this.settle(kind, { state: 'absent' })
  }

  private entry(kind: ComponentKind): ComponentManifestEntry {
    const entry = this.options.manifest.components.find(row => row.kind === kind)
    if (entry === undefined) throw new Error(`components: ${kind} is not in the manifest`)
    return entry
  }

  private settle(kind: ComponentKind, state: ComponentState): void {
    this.states.set(kind, state)
    this.options.onState?.(kind, state)
  }

  private progress(kind: ComponentKind, received: number, total: number): void {
    this.states.set(kind, { state: 'downloading', received, total })
    this.options.onProgress?.(kind, received, total)
  }

  private async install(entry: ComponentManifestEntry): Promise<ComponentState> {
    const kind = entry.kind
    const installed = join(this.options.root, entry.kind, entry.version)
    const downloadDir = join(this.options.root, '.download')
    const stagingRoot = join(this.options.root, '.staging')
    const part = join(downloadDir, `${kind}-${randomUUID()}.part`)
    const staging = join(stagingRoot, `${kind}-${randomUUID()}`)
    try {
      mkdirSync(downloadDir, { recursive: true })
      mkdirSync(stagingRoot, { recursive: true })
      // Two copies are needed while installing (archive + extracted tree) plus room for the user's own files.
      const free = statfsSync(this.options.root)
      if (free.bavail * free.bsize < entry.bytes * 3) return this.fail(kind, 'disk')
      await this.download(entry, part)
      await extractZip(part, { dir: staging })
      mkdirSync(join(this.options.root, kind), { recursive: true })
      rmSync(installed, { recursive: true, force: true })
      renameSync(staging, installed)
      const state: ComponentState = { state: 'installed', path: installed, version: entry.version }
      this.settle(kind, state)
      return state
    } catch (error) {
      if (error instanceof OfflineError) return this.fail(kind, 'offline')
      if (error instanceof ChecksumError) return this.fail(kind, 'checksum')
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOSPC') return this.fail(kind, 'disk')
      return this.fail(kind, 'http')
    } finally {
      rmSync(part, { force: true })
      rmSync(staging, { recursive: true, force: true })
    }
  }

  private fail(kind: ComponentKind, reason: ComponentFailure): ComponentState {
    const state: ComponentState = { state: 'failed', reason }
    this.settle(kind, state)
    return state
  }

  private async download(entry: ComponentManifestEntry, part: string): Promise<void> {
    const fetchImpl = this.options.fetch ?? fetch
    let response: Response
    try {
      response = await fetchImpl(entry.url, { redirect: 'follow' })
    } catch (error) {
      if (error instanceof Error) throw new OfflineError(error.message)
      throw error
    }
    if (!response.ok || response.body === null) throw new Error(`components: HTTP ${String(response.status)}`)
    const hash = createHash('sha256')
    let received = 0
    const meter = new Transform({
      transform: (chunk: Buffer, _encoding, done) => {
        hash.update(chunk)
        received += chunk.length
        if (received > entry.bytes) { done(new Error('components: archive larger than the manifest')); return }
        this.progress(entry.kind, received, entry.bytes)
        done(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(response.body as WebReadableStream<Uint8Array>), meter, createWriteStream(part))
    if (received !== entry.bytes) throw new Error('components: archive size mismatch')
    if (hash.digest('hex') !== entry.sha256) throw new ChecksumError('components: checksum mismatch')
  }
}

/** Cordis plugin: `ctx.personaComponents` — on-demand runtime components (persona-spec/contracts/on-demand-runtime.md §6). */

import { readFileSync } from 'node:fs'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ComponentManager } from './manager.ts'
import { parseComponentManifest } from './manifest.ts'
import type { ComponentKind } from './manifest.ts'
import type { ComponentState } from './manager.ts'

/** Plugin configuration; an empty manifest path leaves the service inert (development and tests). */
export interface Config {
  /** Packaged manifest written by the release build. */
  manifestPath: string
  /** Installed components root; the profile passes `<PERSONA_HOME>/runtime`. */
  root: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** On-demand components: state, install and removal. */
    personaComponents: PersonaComponents
  }
}

/** Host service the client settings page and the Office features call. */
export default class PersonaComponents extends Service {
  static inject: string[] = []
  static Config: z<Config> = z.object({
    manifestPath: z.string().default(''),
    root: z.string().default(''),
  })

  private readonly manager: ComponentManager | undefined
  private readonly listeners = new Set<(kind: ComponentKind, state: ComponentState) => void>()

  /**
   * @param ctx - Host context.
   * @param config - Manifest and installation root.
   */
  constructor(ctx: Context, config: Config = { manifestPath: '', root: '' }) {
    super(ctx, 'personaComponents')
    if (config.manifestPath === '') { this.manager = undefined; return }
    if (config.root === '') throw new Error('components: root is required with a manifest')
    const manifest = parseComponentManifest(JSON.parse(readFileSync(config.manifestPath, 'utf8')))
    this.manager = new ComponentManager({
      root: config.root,
      manifest,
      onState: (kind, state) => { for (const listener of this.listeners) listener(kind, state) },
    })
  }

  /**
   * Current state without touching the network.
   * @param kind - Component to inspect.
   * @returns Installed, absent, downloading or the last failure.
   */
  state(kind: ComponentKind): ComponentState {
    return this.manager?.state(kind) ?? { state: 'absent' }
  }

  /**
   * Install the component once; concurrent callers share the same download.
   * @param kind - Component to install.
   * @returns The settled state.
   */
  ensure(kind: ComponentKind): Promise<ComponentState> {
    if (this.manager === undefined) throw new Error('components: no manifest is configured')
    return this.manager.ensure(kind)
  }

  /**
   * Remove every installed version of one component.
   * @param kind - Component to remove.
   * @returns After the directory is gone.
   */
  remove(kind: ComponentKind): Promise<void> {
    if (this.manager === undefined) throw new Error('components: no manifest is configured')
    return this.manager.remove(kind)
  }

  /**
   * Observe every state transition, for the client's progress.
   * @param listener - Called with each transition.
   * @returns Disposer.
   */
  subscribe(listener: (kind: ComponentKind, state: ComponentState) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

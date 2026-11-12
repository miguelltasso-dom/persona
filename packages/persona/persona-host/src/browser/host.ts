/**
 * Item 17 (colheita): the browser as the host composes it — the service, its stored profiles and grants, and the view the
 * screen reads. The remote methods of the host delegate here, so the hot host file only gains one-line calls.
 *
 * Chrome discovery is a parameter: the screen must say "o Google Chrome não está instalado" instead of failing a turn.
 */

import { findChrome, type ChromeInstall } from './chrome.ts'
import { loadBrowserProfiles, saveBrowserProfiles } from './profile-store.ts'
import { browserTurnOpener, type BrowserTurnOpener } from './turn-browser.ts'
import { BrowserDeniedError, BrowserService } from './service.ts'
import { SecretMask } from './blind-typing.ts'
import type { TurnHolder } from './turn.ts'
import type { BrowserProfileView, BrowserScreenView } from '../types.ts'

/** The answer to "Assumir controle" / "Devolver". */
export type BrowserTurnAnswer = { readonly ok: true } | { readonly ok: false; readonly line: string }

/** What composing the browser needs. */
export interface BrowserHostInput {
  /** The product's data folder (profiles and grants live under it). */
  readonly dataRoot: string
  /** The Chrome DevTools MCP entry file a turn attaches. */
  readonly serverPath: string
  /** Node/Electron binary that runs the server; default `process.execPath`. */
  readonly node?: string
  /** Whether a CLI can carry an extra MCP server (Cursor cannot). */
  readonly carriesMcp: (cli: string) => boolean
  /** Chrome discovery; default {@link findChrome}. */
  readonly chrome?: () => ChromeInstall | undefined
  /** Called when a person takes a live persona's turn (the host stops that run). */
  readonly onTakeover?: (previous: TurnHolder) => void
}

/** The browser the host composes: one service, its stored state, the turn opener and the screen view. */
export class BrowserHost {
  /** Profiles, grants and Chrome sessions. */
  readonly service: BrowserService
  /** What a turn calls to get its browser. */
  readonly opener: BrowserTurnOpener
  /** COLHEITA 15b: the secrets typed into a page, kept out of the host's outputs for ten minutes. */
  readonly mask: SecretMask = new SecretMask()
  private readonly input: BrowserHostInput

  /** @param input - Data folder, server file, CLI capability, Chrome discovery. */
  constructor(input: BrowserHostInput) {
    this.input = input
    const stored = loadBrowserProfiles(input.dataRoot)
    this.service = new BrowserService({
      dataRoot: input.dataRoot,
      onChange: () => { this.save() },
      ...(input.chrome === undefined ? {} : { chrome: input.chrome }),
      ...(input.onTakeover === undefined ? {} : { onTakeover: input.onTakeover }),
      // Carbon P0-05a: a typed secret stays masked as long as the Chrome that holds its traffic lives; when that Chrome closes it is let go.
      onClosed: (profileId) => { this.mask.release(`profile:${profileId}`) },
    })
    this.service.restore(stored.profiles, stored.grants)
    this.opener = browserTurnOpener({
      service: this.service,
      serverPath: input.serverPath,
      ...(input.node === undefined ? {} : { node: input.node }),
      carriesMcp: input.carriesMcp,
    })
  }

  /** The screen's data. */
  view(): BrowserScreenView {
    const chrome = (this.input.chrome ?? findChrome)()
    const personas = Object.keys(this.service.grantsOf())
    const profiles: BrowserProfileView[] = this.service.profiles().map((profile) => {
      const state = this.service.state(profile.id)
      return {
        id: profile.id,
        name: profile.name,
        ...(state?.holder === undefined ? {} : { holder: { kind: state.holder.kind, id: state.holder.id } }),
        running: state?.running === true,
        personas: personas.filter(personaId => this.service.granted(personaId, profile.id)),
        defaultsFor: personas.filter(personaId => this.service.defaultProfileOf(personaId)?.id === profile.id),
      }
    })
    return {
      profiles,
      ...(chrome === undefined ? {} : { chrome: { path: chrome.path, ...(chrome.version === undefined ? {} : { version: chrome.version }) } }),
    }
  }

  /** Create a profile; the screen shows the refusal in words. */
  create(name: string): void {
    this.service.create(name)
  }

  /** Rename a profile. */
  rename(id: string, name: string): void {
    this.service.rename(id, name)
  }

  /** Let a persona drive a profile. */
  grant(personaId: string, profileId: string): void {
    this.service.grant(personaId, profileId)
  }

  /** Take a profile back from a persona. */
  revoke(personaId: string, profileId: string): void {
    this.service.revoke(personaId, profileId)
  }

  /**
   * The person takes the window ("Assumir controle"): the persona's run is stopped by the host and its next command is
   * refused.
   * @param profileId - Profile id.
   * @param personId - The person's id.
   */
  take(profileId: string, personId: string): BrowserTurnAnswer {
    const outcome = this.service.takeTurn(profileId, { kind: 'person', id: personId })
    return outcome.ok ? { ok: true } : { ok: false, line: 'outra pessoa já está com este perfil agora' }
  }

  /** The person gives the window back ("Devolver"). */
  release(profileId: string, personId: string): void {
    this.service.releaseTurn(profileId, { kind: 'person', id: personId })
  }

  /** Stop the profile's Chrome; the profiles and grants stay. */
  async close(profileId: string): Promise<void> {
    await this.service.close(profileId)
  }

  /** Stop every Chrome (host shutdown). */
  async closeAll(): Promise<void> {
    await this.service.closeAll()
  }

  /** Persist the list and the grants. */
  private save(): void {
    saveBrowserProfiles(this.input.dataRoot, { profiles: this.service.profiles(), grants: this.service.grantsOf() })
  }
}

/** A refusal from the browser, in the screen's words; anything else is a bug and stays loud. */
export function browserRefusal(error: unknown): string | undefined {
  return error instanceof BrowserDeniedError ? error.message : undefined
}

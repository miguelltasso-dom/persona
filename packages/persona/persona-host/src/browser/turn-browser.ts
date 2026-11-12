/**
 * Item 17 (colheita): the browser of ONE persona turn. Resolves the profile the turn may drive (by name, or the only one
 * it was granted), takes the turn, starts the profile's Chrome and returns the MCP server entry the turn's session
 * options carry. `release` gives the turn back when the turn ends; Chrome stays up for the next turn of the profile.
 *
 * A turn that cannot have the browser fails here, in the person's words, before the CLI is started — never by handing the
 * persona a browser of nobody.
 */

import { fileURLToPath } from 'node:url'
import type { BrowserProfile } from './profiles.ts'
import { browserMcpServer, type BrowserMcpServer } from './server.ts'
import { BrowserDeniedError, type BrowserDenial, type BrowserService, type ProfileSession } from './service.ts'

/** What one turn asks for. */
export interface TurnBrowserInput {
  /** The host's profiles and turns. */
  readonly service: BrowserService
  /** The persona that will drive. */
  readonly personaId: string
  /** The profile it asked for; empty/omitted means "the only one I was granted". */
  readonly profileName?: string
  /** The Chrome DevTools MCP entry file (the app composition resolves the dependency). */
  readonly serverPath: string
  /** Node/Electron binary that runs the server; default `process.execPath`. */
  readonly node?: string
}

/** The browser a turn was handed. */
export interface TurnBrowser {
  readonly profile: BrowserProfile
  readonly session: ProfileSession
  /** The `mcpServers` entry of this turn's session options. */
  readonly server: BrowserMcpServer
  /** Give the turn back (the run ended, or it failed after this point). Idempotent. */
  readonly release: () => void
}

/**
 * Open the browser of one persona turn.
 * @param input - Service, persona, profile name, server file.
 * @returns The profile, its DevTools session and the MCP entry.
 * @throws Error with a sentence for the screen when there is no grant, no profile, or someone else is driving.
 */
export async function openTurnBrowser(input: TurnBrowserInput): Promise<TurnBrowser> {
  const { profile, session } = await input.service.sessionFor(input.personaId, input.profileName ?? '')
  return {
    profile,
    session,
    server: browserMcpServer({
      port: session.port,
      serverPath: input.serverPath,
      // Nothing to upload: the server's filesystem tools may only read this empty folder of the profile.
      workspace: input.service.uploadFolder(profile.id),
      ...(input.node === undefined ? {} : { node: input.node }),
    }),
    release: () => { input.service.releaseTurn(profile.id, { kind: 'persona', id: input.personaId }) },
  }
}

/** What a turn is, for the browser decision. */
export interface BrowserTurnRequest {
  /** The persona that will drive. */
  readonly personaId: string
  /** The resolved CLI (`claude`, `codex`, `opencode`, `cursor`). */
  readonly cli: string
  /** The profile the caller already chose, when it knows one. */
  readonly profileName?: string
}

/** The answer to one turn: its browser, or why it has none (the turn still runs). */
export type BrowserTurnResult =
  | { readonly ok: true; readonly browser: TurnBrowser }
  | { readonly ok: false; readonly reason: BrowserDenial | 'sem-navegador'; readonly line: string }

/** Opens the browser of a turn, or says why it cannot. */
export type BrowserTurnOpener = (turn: BrowserTurnRequest) => Promise<BrowserTurnResult>

/** What the opener needs. */
export interface BrowserOpenerInput {
  readonly service: BrowserService
  /** The Chrome DevTools MCP entry file. */
  readonly serverPath: string
  /** Node/Electron binary that runs the server; default `process.execPath`. */
  readonly node?: string
  /** Whether this CLI can carry an extra MCP server at all (Cursor cannot). */
  readonly carriesMcp: (cli: string) => boolean
}

/**
 * The opener a host turn calls before it builds the session options.
 * @param input - Service, server file, CLI capability.
 * @returns The opener; a refusal never throws, so a busy profile does not fail the turn.
 */
export function browserTurnOpener(input: BrowserOpenerInput): BrowserTurnOpener {
  return async (turn) => {
    if (input.serverPath === '') {
      return { ok: false, reason: 'sem-navegador', line: 'o navegador não está disponível nesta instalação' }
    }
    if (!input.carriesMcp(turn.cli)) {
      return { ok: false, reason: 'sem-navegador', line: 'este motor não abre o navegador' }
    }
    if (input.service.defaultProfileOf(turn.personaId) === undefined) {
      return { ok: false, reason: 'sem-perfil', line: 'esta persona não tem nenhum perfil de navegador liberado' }
    }
    try {
      return {
        ok: true,
        browser: await openTurnBrowser({
          service: input.service,
          personaId: turn.personaId,
          ...(turn.profileName === undefined ? {} : { profileName: turn.profileName }),
          serverPath: input.serverPath,
          ...(input.node === undefined ? {} : { node: input.node }),
        }),
      }
    } catch (error) {
      if (error instanceof BrowserDeniedError) return { ok: false, reason: error.why, line: error.message }
      throw error
    }
  }
}

/**
 * The Chrome DevTools MCP entry file of this installation.
 * @returns The absolute path, or `undefined` when the app does not ship the server (the browser is then unavailable).
 */
export function resolveBrowserServerPath(): string | undefined {
  try {
    return fileURLToPath(import.meta.resolve('chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'))
  } catch (error) {
    void error
    return undefined
  }
}

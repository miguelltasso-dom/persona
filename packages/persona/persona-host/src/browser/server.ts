/**
 * Item 17 (colheita): the browser a persona drives, as an MCP server for its turn. The server is the Chrome DevTools MCP
 * (already in the tree as an experimental provider), ATTACHED to the Chrome this product launched on the profile — it
 * never launches a browser of its own, so there is no second Chromium and the profile (and its logins) is the one the
 * person granted.
 *
 * Pure: the caller resolves the server file (the app composition owns that dependency) and passes the port.
 */

/** A stdio MCP server, in the shape the runtime session options take. */
export interface BrowserMcpServer {
  /** The name the CLI knows the tools by (`mcp__browser__*` in Claude). */
  readonly name: string
  readonly command: string
  readonly args: readonly string[]
}

/** The server name; the persona's tools appear under it. */
export const BROWSER_SERVER_NAME = 'browser'

/** What a turn's browser server needs. */
export interface BrowserServerInput {
  /** The DevTools port of the profile's Chrome. */
  readonly port: number
  /** The Chrome DevTools MCP entry file. */
  readonly serverPath: string
  /** Node/Electron binary that runs it; default `process.execPath` (Electron needs `ELECTRON_RUN_AS_NODE=1` in the session env). */
  readonly node?: string
  /**
   * The only folder the server's filesystem tools may read (an empty one denies `upload_file` by construction). Absent =
   * the server's own default (the OS temp folder).
   */
  readonly workspace?: string
}

/**
 * The MCP server of one profile's Chrome.
 * @param input - Port, server file, runtime binary, filesystem folder.
 * @returns The session's `mcpServers` entry.
 */
export function browserMcpServer(input: BrowserServerInput): BrowserMcpServer {
  return {
    name: BROWSER_SERVER_NAME,
    command: input.node ?? process.execPath,
    args: [
      input.serverPath,
      '--browserUrl', `http://127.0.0.1:${String(input.port)}`,
      // The persona navigates, reads and captures; running its own script in the page is refused by the server itself
      // (it also drops `initScript` and `javascript:` URLs), so no CLI filter can be the only thing holding it back.
      '--no-javascriptEvaluation',
      // `upload_file` reads a local file: an empty folder is nothing to upload, so the tool is refused by construction.
      ...(input.workspace === undefined ? [] : [`--workspace=${input.workspace}`]),
      // Nothing about the person's browsing leaves this machine through the server itself.
      '--no-usageStatistics',
      '--no-performanceCrux',
    ],
  }
}

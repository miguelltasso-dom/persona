/**
 * MARCO M5 (Lumen P1-3): who the tailnet says an address is. The name a phone gives itself ("Pixel da Ana") is self-declared, and the owner's approval screen is the only control — so the screen also
 * shows what TAILSCALE says about the address (the node's name and the login that owns it; `tailscale whois`), and the device is bound to that address. An address inside the tailnet cannot be forged,
 * so a cookie stolen from one device is worth nothing on another node. For a member who is the OWNER, the login must be the PC's own.
 *
 * The runner is injected (tests); the real one is `execFile` with no shell and a short deadline, and only ever receives a validated tailnet address.
 */

import { execFile } from 'node:child_process'
import { isTailnetAddress } from './tailnet-bind.ts'

/** What Tailscale says about a node. Both are optional: the CLI may be missing or the node unknown. */
export interface TailnetIdentity {
  /** The node's name in the tailnet (e.g. `pixel-da-ana`). */
  readonly node?: string
  /** The login that owns it (e.g. `ana@exemplo.com`). */
  readonly login?: string
}

/** Runs a command and returns its stdout; tests replace it. */
export type CommandRunner = (command: string, args: readonly string[]) => Promise<string>

const defaultRun: CommandRunner = (command, args) => new Promise((resolve, reject) => {
  execFile(command, [...args], { timeout: 3_000, windowsHide: true }, (error, stdout) => {
    if (error !== null) reject(new Error(error.message))
    else resolve(stdout)
  })
})

/** One short clean line (the text goes on the owner's screen). */
const clean = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 80)
  return text === '' ? undefined : text
}

/**
 * Read the identity out of `tailscale whois --json <ip>`.
 * @param raw - The command's output.
 * @returns The node and the login, or `undefined` when there is nothing usable.
 */
export function parseWhois(raw: string): TailnetIdentity | undefined {
  try {
    const parsed = JSON.parse(raw) as { Node?: { ComputedName?: unknown; Name?: unknown }; UserProfile?: { LoginName?: unknown } }
    const nodeName = clean(parsed.Node?.ComputedName) ?? clean(parsed.Node?.Name)
    const node = nodeName?.replace(/\.$/u, '')
    const login = clean(parsed.UserProfile?.LoginName)
    if (node === undefined && login === undefined) return undefined
    return { ...(node === undefined ? {} : { node }), ...(login === undefined ? {} : { login }) }
  } catch (error) {
    void error
    return undefined
  }
}

/**
 * What the tailnet says about an address.
 * @param address - A tailnet address (anything else is refused before a command exists).
 * @param run - Command runner (tests inject one).
 * @returns The identity, or `undefined` when Tailscale does not say.
 */
export async function whois(address: string, run: CommandRunner = defaultRun): Promise<TailnetIdentity | undefined> {
  if (!isTailnetAddress(address)) return undefined
  try {
    return parseWhois(await run('tailscale', ['whois', '--json', address]))
  } catch (error) {
    void error
    return undefined
  }
}

/**
 * The login that owns THIS PC's Tailscale node (`tailscale status --json`: `Self.UserID` into `User`).
 * @param raw - The command's output.
 * @returns The login, if the output names it.
 */
export function parseSelfLogin(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { Self?: { UserID?: unknown }; User?: Record<string, { LoginName?: unknown } | undefined> }
    const id = parsed.Self?.UserID
    if (typeof id !== 'number' && typeof id !== 'string') return undefined
    return clean(parsed.User?.[String(id)]?.LoginName)
  } catch (error) {
    void error
    return undefined
  }
}

/**
 * @param run - Command runner (tests inject one).
 * @returns The login of this PC's Tailscale node, or `undefined`.
 */
export async function selfLogin(run: CommandRunner = defaultRun): Promise<string | undefined> {
  try {
    return parseSelfLogin(await run('tailscale', ['status', '--json']))
  } catch (error) {
    void error
    return undefined
  }
}

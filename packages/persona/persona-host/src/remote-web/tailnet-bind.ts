/**
 * MARCO M5 (acesso remoto sem Cloudflare): the ONE address the remote gate may listen on — this machine's Tailscale address (100.64.0.0/10). Never a wildcard, never loopback, never a LAN
 * address: the gate is reachable from the tailnet and from nowhere else. The functions here are pure (and the watcher takes its clock and its reader), so the rule is testable without a tailnet.
 */

import { networkInterfaces } from 'node:os'
import { readTailscale, type TailscaleStatus } from '../station/tailscale.ts'

/** One dotted-quad octet: no sign, no padding, no spaces ("064" and " 64" are not addresses). */
const OCTET = /^(?:0|[1-9]\d{0,2})$/u

/** Why an address may not be the gate's. */
export type BindRefusal = 'curinga' | 'loopback' | 'fora-do-tailnet'

/**
 * Whether the text is an IPv4 address inside the tailnet range (100.64.0.0/10: 100.64.0.0 to 100.127.255.255).
 * @param address - What an interface (or a config) says.
 * @returns `true` only for a strict dotted quad in the range.
 */
export function isTailnetAddress(address: string): boolean {
  const parts = address.split('.')
  if (parts.length !== 4) return false
  if (!parts.every(part => OCTET.test(part) && Number(part) <= 255)) return false
  const first = Number(parts[0])
  const second = Number(parts[1])
  return first === 100 && second >= 64 && second <= 127
}

/**
 * The rule for a bind address: only the tailnet's. The refusal names the mistake (a wildcard would expose the port on every interface; loopback would hide it from the phone; a LAN address
 * would put it on the home network) so the diagnostic is useful, but every refusal is the same refusal.
 * @param address - The address a caller wants to listen on.
 * @returns Why it is refused, or `undefined` when it is a tailnet address.
 */
export function refuseBind(address: string): BindRefusal | undefined {
  if (address === '' || address === '0.0.0.0' || /^[0:]+$/u.test(address)) return 'curinga'
  if (address === 'localhost' || address === '::1' || address.startsWith('127.')) return 'loopback'
  return isTailnetAddress(address) ? undefined : 'fora-do-tailnet'
}

/**
 * The tailnet address among this machine's interfaces.
 * @param interfaces - Network interfaces (tests inject one).
 * @returns The first external IPv4 address in the tailnet range, if the mesh is up here.
 */
export function tailnetAddressOf(interfaces: () => ReturnType<typeof networkInterfaces> = networkInterfaces): string | undefined {
  for (const rows of Object.values(interfaces())) {
    for (const row of rows ?? []) {
      if (row.family === 'IPv4' && !row.internal && isTailnetAddress(row.address)) return row.address
    }
  }
  return undefined
}

/** How often the watcher looks (the address appears with the VPN and goes with it). */
export const TAILNET_WATCH_MS = 15_000

/** What the watcher needs. */
export interface TailnetWatchDeps {
  /** Reads the Tailscale state; default {@link readTailscale}. */
  readonly read?: () => Promise<TailscaleStatus>
  /** Called with the tailnet address when it appears or changes, and with `undefined` when it is gone. Never called twice in a row with the same value. */
  readonly onAddress: (address: string | undefined) => void
  /** Milliseconds between looks; default {@link TAILNET_WATCH_MS}. */
  readonly intervalMs?: number
}

/** A running watcher. */
export interface TailnetWatch {
  stop(): void
}

/**
 * Follow the tailnet address. The gate listens only while this says there is one: Tailscale off (or its address gone) closes the gate, and it never falls back to another interface.
 * Looks once now and then every `intervalMs`, one look at a time (a slow `tailscale status` never piles up).
 * @param deps - Reader, callback and period.
 * @returns A handle to stop the watching.
 */
export function watchTailnet(deps: TailnetWatchDeps): TailnetWatch {
  const read = deps.read ?? (() => readTailscale())
  const interval = deps.intervalMs ?? TAILNET_WATCH_MS
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let last: string | undefined
  let first = true
  const look = async (): Promise<void> => {
    let now: string | undefined
    try {
      const status = await read()
      now = status.state === 'ativo' && status.address !== undefined && isTailnetAddress(status.address) ? status.address : undefined
    } catch (error) {
      void error // a reader that fails means "no address": the gate stays closed
      now = undefined
    }
    if (stopped) return
    if (first || now !== last) {
      first = false
      last = now
      deps.onAddress(now)
    }
    timer = setTimeout(() => { void look() }, interval)
    timer.unref()
  }
  void look()
  return {
    stop(): void {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
    },
  }
}

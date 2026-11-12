/**
 * Carbon P0-13b (Gauge, Keel 05:22): "Testar conexão" of the mailbox makes the HOST open a TCP connection to the host and port the caller typed. A mail host is a PUBLIC name (a provider);
 * an address of the machine itself or of its network (`127.0.0.1`, `10.x`, `192.168.x`, `169.254.169.254`, `localhost`, a one-word intranet name, a name that RESOLVES to one of those) is a probe
 * of the inside (SSRF) and is refused, whoever asks. A name is resolved once here; the probe resolves it again (a rebinding between the two is not closed by this check).
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** Resolver of a host name to all of its addresses (tests replace it). */
export type MailHostResolver = (host: string) => Promise<readonly string[]>

const defaultResolver: MailHostResolver = async host => (await lookup(host, { all: true })).map(row => row.address)

/** @param ip - A dotted IPv4. @returns Whether it is loopback, private, link-local, CGNAT, "this network", multicast or reserved. */
function privateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  const [a = 0, b = 0, c = 0] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  return false
}

/** @param ip - An IPv6 text. @returns Whether it is loopback, unspecified, unique-local, link-local, or an IPv4-mapped address of a private IPv4. */
function privateIPv6(ip: string): boolean {
  const text = ip.toLowerCase()
  if (text === '::1' || text === '::') return true
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(text)
  if (mapped !== null) return privateIPv4(mapped[1] ?? '')
  const first = Number.parseInt(text.split(':')[0] || '0', 16)
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00
}

/**
 * Whether an address (not a name) is one of the machine or its network.
 * @param address - A literal IPv4 or IPv6.
 * @returns true when private.
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return privateIPv4(address)
  if (version === 6) return privateIPv6(address)
  return false
}

/**
 * Whether a host the caller typed is, by its WRITING alone, one of the machine or its network: a private literal, `localhost`, a local or internal suffix, a one-word name, or a number written
 * in a form the OS still reads as an address (`2130706433`, `0x7f.1`).
 * @param host - What was typed.
 * @returns true when it must be refused without even resolving.
 */
export function isPrivateMailHost(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/u, '')
  if (name === '') return true
  if (isIP(name) !== 0) return isPrivateAddress(name)
  if (/^[0-9a-fx.]+$/u.test(name) && /\d/u.test(name)) return true // a number or dotted number that is not a plain dotted quad: the OS may read it as an address
  if (name === 'localhost' || /\.(?:localhost|local|internal|lan|home|corp|intranet|home\.arpa)$/u.test(name)) return true
  return !name.includes('.') // one word: an intranet name
}

/**
 * Whether the host may be connected to by the mail probe: written like a public name AND, when it is a name, resolved only to public addresses. A name that does not resolve is let through
 * (the probe fails by itself, honestly, as "network").
 * @param host - What was typed or stored.
 * @param resolve - The resolver (tests replace it).
 * @returns true when the connection is allowed.
 */
export async function mailHostAllowed(host: string, resolve: MailHostResolver = defaultResolver): Promise<boolean> {
  if (isPrivateMailHost(host)) return false
  if (isIP(host.trim().replace(/^\[|\]$/gu, '')) !== 0) return true
  let addresses: readonly string[]
  try {
    addresses = await resolve(host.trim())
  } catch {
    return true
  }
  return addresses.every(address => !isPrivateAddress(address))
}

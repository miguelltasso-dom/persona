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

/**
 * Carbon P0-06c: the eight 16-bit groups of an IPv6 text, every spelling of `::` expanded, and a trailing dotted IPv4 (`::ffff:127.0.0.1`) read as its two groups.
 * @param ip - A valid IPv6 text.
 * @returns The eight groups.
 */
function ipv6Groups(ip: string): number[] {
  let text = ip.toLowerCase()
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(text)
  if (dotted !== null) {
    const [a = 0, b = 0, c = 0, d = 0] = dotted.slice(1).map(Number)
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head = '', tail] = text.split('::')
  const front = head === '' ? [] : head.split(':')
  const back = tail === undefined || tail === '' ? [] : tail.split(':')
  const fill = tail === undefined ? [] : Array.from({ length: Math.max(0, 8 - front.length - back.length) }, () => '0')
  return [...front, ...fill, ...back].map(group => Number.parseInt(group || '0', 16))
}

/** @param ip - An IPv6 text. @returns Whether it is loopback, unspecified, unique-local, link-local, multicast, or CARRIES a private IPv4 (mapped, compatible, NAT64, 6to4), in any spelling. */
function privateIPv6(ip: string): boolean {
  const g = ipv6Groups(ip)
  const v4 = (high: number, low: number): string => `${String(high >> 8)}.${String(high & 0xff)}.${String(low >> 8)}.${String(low & 0xff)}`
  const zeros = (from: number, to: number): boolean => g.slice(from, to).every(group => group === 0)
  if (zeros(0, 7) && (g[7] === 0 || g[7] === 1)) return true // :: and ::1
  if (zeros(0, 5) && g[5] === 0xffff) return privateIPv4(v4(g[6] ?? 0, g[7] ?? 0)) // mapped: ::ffff:a.b.c.d, in hex or dotted
  if (zeros(0, 6)) return privateIPv4(v4(g[6] ?? 0, g[7] ?? 0)) // compatible (deprecated): ::a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return privateIPv4(v4(g[6] ?? 0, g[7] ?? 0)) // NAT64 64:ff9b::/96
  if (g[0] === 0x2002) return privateIPv4(v4(g[1] ?? 0, g[2] ?? 0)) // 6to4: the IPv4 is in the next 32 bits
  const first = g[0] ?? 0
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
 * Carbon MH-2: the ONE address a mail connection may use for `host`. A literal public address is itself; a public-looking NAME is resolved HERE, once, and only when every address it answers is public:
 * the caller connects to the address returned (never resolves the name again, so a rebinding between the check and the socket reaches nothing). A private host, a name that resolves to a private
 * address, a name with no address and a failed resolution are all refused (FAIL CLOSED: an unknown is not a green light).
 * @param host - What was typed or stored.
 * @param resolve - The resolver (tests replace it).
 * @returns The vetted address, or undefined when the host is refused.
 */
export async function resolveMailHost(host: string, resolve: MailHostResolver = defaultResolver): Promise<string | undefined> {
  if (isPrivateMailHost(host)) return undefined
  const literal = host.trim().replace(/^\[|\]$/gu, '')
  if (isIP(literal) !== 0) return literal
  let addresses: readonly string[]
  try {
    addresses = await resolve(host.trim())
  } catch {
    return undefined
  }
  const [first] = addresses
  return first === undefined || addresses.some(address => isPrivateAddress(address)) ? undefined : first
}

/**
 * Whether the host may be connected to by the mail probe (see {@link resolveMailHost}).
 * @param host - What was typed or stored.
 * @param resolve - The resolver (tests replace it).
 * @returns true when the connection is allowed.
 */
export async function mailHostAllowed(host: string, resolve: MailHostResolver = defaultResolver): Promise<boolean> {
  return (await resolveMailHost(host, resolve)) !== undefined
}

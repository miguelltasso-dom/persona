import { expect, it } from 'vitest'
import { isPrivateAddress, isPrivateMailHost, mailHostAllowed, resolveMailHost } from '../src/mail-host-guard.ts'

/** Carbon P0-13b: the mail probe connects only to PUBLIC mail hosts (an address of the machine or its network is a probe of the inside). */
it('refuses by writing alone: loopback, private, link-local, metadata, localhost, one-word and local names, numbers the OS reads as an address', () => {
  for (const host of [
    '127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1',
    '::1', '::', '[::1]', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    'localhost', 'LOCALHOST', 'mail.localhost', 'printer.local', 'db.internal', 'nas.lan', 'router.home.arpa', 'mailserver', '2130706433', '0x7f.1', '0177.0.0.1', '',
  ]) expect(isPrivateMailHost(host), host).toBe(true)
})

it('lets public names and public addresses through', () => {
  for (const host of ['imap.gmail.com', 'outlook.office365.com', 'imap.mail.yahoo.com', 'imap.uol.com.br', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111']) {
    expect(isPrivateMailHost(host), host).toBe(false)
  }
  expect(isPrivateAddress('93.184.216.34')).toBe(false)
})

it('a public-looking NAME that resolves to a private address is refused (the resolution is checked); one that does not resolve is let through to fail honestly', async () => {
  expect(await mailHostAllowed('imap.exemplo.com', async () => ['203.0.113.7'])).toBe(true)
  expect(await mailHostAllowed('imap.exemplo.com', async () => ['203.0.113.7', '127.0.0.1'])).toBe(false)
  expect(await mailHostAllowed('imap.exemplo.com', async () => ['::1'])).toBe(false)
  expect(await mailHostAllowed('imap.exemplo.com', async () => { throw new Error('ENOTFOUND') }), 'MH-2: a failed resolution FAILS CLOSED (it used to answer open)').toBe(false)
  expect(await mailHostAllowed('imap.exemplo.com', async () => []), 'MH-2: a name with no address is refused').toBe(false)
  expect(await mailHostAllowed('127.0.0.1', async () => ['8.8.8.8'])).toBe(false)
})

/** Carbon P0-06c (round 2): IPv6 forms that carry an IPv4 in HEX (mapped, compatible, NAT64, 6to4) are judged by the IPv4 inside. */
it('an IPv4 written as IPv6 in hex is judged by the IPv4 it carries (mapped, compatible, NAT64, 6to4, any spelling)', () => {
  for (const host of [
    '::ffff:7f00:1', '[::ffff:7f00:1]', '::FFFF:7F00:1', '0:0:0:0:0:ffff:7f00:1', '::ffff:a00:1', '::ffff:c0a8:101', '::ffff:a9fe:a9fe',
    '::7f00:1', '::a00:5', '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2002:c0a8:101::1',
  ]) expect(isPrivateMailHost(host), host).toBe(true)
  for (const host of ['::ffff:808:808', '64:ff9b::808:808', '2002:808:808::1']) expect(isPrivateMailHost(host), host).toBe(false)
})

/** Carbon MH-2: the name is resolved ONCE, and the address that was vetted is the one the socket connects to (never a second resolution that a rebinding could change). */
it('resolveMailHost answers the ONE vetted address (a literal, or the first of a public resolution) and nothing else', async () => {
  let calls = 0
  const resolve = async (): Promise<string[]> => { calls += 1; return ['203.0.113.7', '203.0.113.8'] }
  expect(await resolveMailHost('imap.exemplo.com', resolve)).toBe('203.0.113.7')
  expect(calls, 'resolved once').toBe(1)
  expect(await resolveMailHost('8.8.8.8', resolve), 'a public literal is itself').toBe('8.8.8.8')
  expect(calls, 'a literal is not resolved').toBe(1)
  expect(await resolveMailHost('[2606:4700:4700::1111]', resolve)).toBe('2606:4700:4700::1111')
  expect(await resolveMailHost('imap.exemplo.com', async () => ['203.0.113.7', '10.0.0.1']), 'one private address among the answers refuses the name').toBeUndefined()
  expect(await resolveMailHost('127.0.0.1', resolve)).toBeUndefined()
  expect(await resolveMailHost('localhost', resolve)).toBeUndefined()
  expect(await resolveMailHost('imap.exemplo.com', async () => { throw new Error('ENOTFOUND') })).toBeUndefined()
})

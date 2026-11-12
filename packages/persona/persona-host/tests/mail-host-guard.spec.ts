import { expect, it } from 'vitest'
import { isPrivateAddress, isPrivateMailHost, mailHostAllowed } from '../src/mail-host-guard.ts'

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
  expect(await mailHostAllowed('imap.exemplo.com', async () => { throw new Error('ENOTFOUND') })).toBe(true)
  expect(await mailHostAllowed('127.0.0.1', async () => ['8.8.8.8'])).toBe(false)
})

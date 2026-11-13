import { describe, expect, it } from 'vitest'
import {
  OWNER_DEVICE_ONLY, PHONE_NEVER, PHONE_PLANNED, PHONE_READS, PHONE_WITHHELD, PHONE_WRITES, REMOTE_NOT_ALLOWED, phoneAllows,
} from '../src/remote-web/phone-allow.ts'

/**
 * M5 (Lumen D1/D2): the lists of what a paired phone may call — pure rules. (The completeness against the REAL host's Remotes is the host spec.)
 */
describe('PHONE_ALLOW lists', () => {
  const all = [...PHONE_READS, ...PHONE_WRITES]

  it('the refusal has a stable code', () => {
    expect(REMOTE_NOT_ALLOWED).toBe('remote-not-allowed')
  })

  it('no name twice, none both read and write, none both allowed and owner-only', () => {
    expect(new Set(all).size).toBe(all.length)
    expect(OWNER_DEVICE_ONLY.filter(name => all.includes(name))).toEqual([])
  })

  it('the tripwire: no allowed name is something a phone must NEVER do (Cofre, secrets, the PC\'s browser, files, updates, pairing, creating things, undo, clicks…)', () => {
    const offenders = [...all, ...OWNER_DEVICE_ONLY].filter(name => PHONE_NEVER.some(rule => rule.test(name)))
    expect(offenders).toEqual([])
  })

  it('the tripwire bites: it does catch the things it exists for', () => {
    for (const bad of ['listCofreEntries', 'saveConnectorSecret', 'browserOpen', 'stationPair', 'backupNow', 'setProjectRoot', 'listFiles', 'issueDeviceCode', 'approvePair', 'setRemoteAccess', 'moveTicket', 'createPersona', 'undoApproval', 'startComputerUse', 'takeControl']) {
      expect(PHONE_NEVER.some(rule => rule.test(bad)), bad).toBe(true)
    }
  })

  it('the planned names are all on the lists (a planned name that is not allowed anywhere is a mistake)', () => {
    for (const name of PHONE_PLANNED) expect([...all, ...OWNER_DEVICE_ONLY], name).toContain(name)
  })

  it('a phone gets the Casa and what it writes as itself, and nothing else', () => {
    const phone = { memberIsOwner: false }
    for (const name of ['listMessages', 'followMessages', 'postMessage', 'decideApproval', 'stopComputerRun', 'getNightSummary']) expect(phoneAllows(name, phone), name).toBe(true)
    for (const name of ['listCofreEntries', 'moveTicket', 'createPersona', 'issueDeviceCode', 'approvePair', 'listDevices', 'revokeDevice', 'doesNotExist', '']) expect(phoneAllows(name, phone), name).toBe(false)
  })

  it('listing and revoking devices is for a device whose member is the OWNER only; issuing and approving stay on the PC for everybody', () => {
    const owner = { memberIsOwner: true }
    expect(phoneAllows('listDevices', owner)).toBe(true)
    expect(phoneAllows('revokeDevice', owner)).toBe(true)
    expect(phoneAllows('issueDeviceCode', owner)).toBe(false)
    expect(phoneAllows('approvePair', owner)).toBe(false)
    expect(phoneAllows('setRemoteAccess', owner)).toBe(false)
  })

  it('Gauge 15:53: the reads withheld on a closer reading of their types (the account the owner pays with; the BODY of Cofre records) are NOT allowed, each says why', () => {
    const phone = { memberIsOwner: false }
    for (const [name, why] of Object.entries(PHONE_WITHHELD)) {
      expect(all, name).not.toContain(name)
      expect(phoneAllows(name, phone), name).toBe(false)
      expect(phoneAllows(name, { memberIsOwner: true }), name).toBe(false) // not even for an owner's phone
      expect(why.length, name).toBeGreaterThan(40)
    }
    expect(Object.keys(PHONE_WITHHELD)).toEqual(expect.arrayContaining(['getOfficialQuota', 'getTurnContext', 'getOnboarding']))
  })

  it('names are matched exactly (no prefix, no case trick, no inherited property)', () => {
    const phone = { memberIsOwner: false }
    for (const name of ['postMessage2', 'POSTMESSAGE', 'postmessage', ' postMessage', 'postMessage ', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) expect(phoneAllows(name, phone), name).toBe(false)
  })
})

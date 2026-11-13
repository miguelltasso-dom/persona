import { describe, expect, it } from 'vitest'
import { DeviceBook, MAX_DEVICES } from '../src/remote-web/device-book.ts'
import { MAX_PAIR_REQUESTS, PAIR_COLLECT_MS, PAIR_REQUEST_TTL_MS, PairRequests } from '../src/remote-web/pair-requests.ts'

/**
 * M5 (Lumen B4): a right code is NOT a session. It opens a request; only the owner's approval on the PC makes the device, and its secret goes once to the phone that holds the poll token.
 */
const clock = (start = 1_800_000_000_000): { now: () => number; advance: (ms: number) => void } => {
  let at = start
  return { now: () => at, advance: (ms) => { at += ms } }
}
const setup = (): { time: ReturnType<typeof clock>; book: DeviceBook; requests: PairRequests } => {
  const time = clock()
  const book = new DeviceBook(undefined, time.now)
  return { time, book, requests: new PairRequests(book, time.now) }
}
const open = (requests: PairRequests, label = 'Pixel da Ana', address = '100.64.0.7'): { requestId: string; pollToken: string } => {
  const made = requests.open({ memberId: 'm-ana', label, address })
  if (made === 'cheio') throw new Error('full')
  return made
}

describe('PairRequests', () => {
  it('a request waits for the owner: the PC sees the name and the address, never a token or a secret', () => {
    const { requests } = setup()
    const made = open(requests)
    const list = requests.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ requestId: made.requestId, memberId: 'm-ana', label: 'Pixel da Ana', address: '100.64.0.7' })
    expect(JSON.stringify(list)).not.toContain(made.pollToken)
    expect(requests.poll(made.pollToken)).toEqual({ state: 'esperando-o-dono' })
  })

  it('approval makes the device NOW and hands its secret ONCE to the holder of the poll token; the device then works, the token means nothing', () => {
    const { requests, book } = setup()
    const made = open(requests)
    expect(book.list()).toHaveLength(0) // a right code did not make a device
    expect(requests.approve(made.requestId)).toBe(true)
    expect(requests.list()).toHaveLength(0)
    const got = requests.poll(made.pollToken)
    expect(got.state).toBe('aprovado')
    if (got.state !== 'aprovado') throw new Error('not approved')
    expect(got.memberId).toBe('m-ana')
    expect(book.verify(got.device.id, got.device.secret)?.memberId).toBe('m-ana')
    expect(requests.poll(made.pollToken)).toEqual({ state: 'desconhecido' }) // the secret left once
  })

  it('a refusal makes no device and says so once', () => {
    const { requests, book } = setup()
    const made = open(requests)
    expect(requests.reject(made.requestId)).toBe(true)
    expect(requests.poll(made.pollToken)).toEqual({ state: 'recusado' })
    expect(requests.poll(made.pollToken)).toEqual({ state: 'desconhecido' })
    expect(book.list()).toHaveLength(0)
    expect(requests.approve(made.requestId)).toBe(false) // too late to approve what was refused
  })

  it('only the holder of the token hears the answer (another token, an empty one and a guessed one get nothing)', () => {
    const { requests } = setup()
    const mine = open(requests, 'a')
    const other = open(requests, 'b')
    requests.approve(mine.requestId)
    expect(requests.poll(other.pollToken)).toEqual({ state: 'esperando-o-dono' }) // somebody else's approval is not mine
    for (const bad of ['', 'x', '0'.repeat(32), mine.requestId]) expect(requests.poll(bad)).toEqual({ state: 'desconhecido' })
  })

  it('a request the owner never answered expires after two minutes (and approving it is too late)', () => {
    const { requests, time } = setup()
    const made = open(requests)
    time.advance(PAIR_REQUEST_TTL_MS - 1)
    expect(requests.list()).toHaveLength(1)
    time.advance(2)
    expect(requests.list()).toHaveLength(0)
    expect(requests.approve(made.requestId)).toBe(false)
    expect(requests.poll(made.pollToken)).toEqual({ state: 'desconhecido' })
  })

  it('an approval the phone never collected is cut off after its collection window (nobody holds its secret)', () => {
    const { requests, book, time } = setup()
    const made = open(requests)
    expect(requests.approve(made.requestId)).toBe(true)
    expect(book.list()).toHaveLength(1)
    time.advance(PAIR_COLLECT_MS - 1)
    requests.list()
    expect(book.list()).toHaveLength(1) // still inside its window
    time.advance(2)
    requests.list() // any call sweeps
    expect(book.list()).toHaveLength(0)
  })

  it('Lumen P2-5: approving at 1:59 still leaves the phone its OWN time to collect (the sweep must not revoke a device made one second ago)', () => {
    const { requests, book, time } = setup()
    const made = open(requests)
    time.advance(PAIR_REQUEST_TTL_MS - 1_000) // the owner clicks with one second left
    expect(requests.approve(made.requestId)).toBe(true)
    time.advance(20_000) // the phone polls 20 s later: past the request's own deadline, inside the collection window
    const got = requests.poll(made.pollToken)
    expect(got.state).toBe('aprovado')
    if (got.state !== 'aprovado') throw new Error('not approved')
    expect(book.verify(got.device.id, got.device.secret)).toBeDefined() // and the device is still alive
  })

  it('Lumen P1-3: the owner sees what Tailscale says about the address, and the device is BOUND to that address', () => {
    const { requests, book } = setup()
    const made = requests.open({ memberId: 'm-ana', label: 'Pixel da Ana', address: '100.64.0.7', identity: { node: 'pixel-da-ana', login: 'ana@exemplo.com' } })
    if (made === 'cheio') throw new Error('full')
    expect(requests.list()[0]).toMatchObject({ address: '100.64.0.7', node: 'pixel-da-ana', login: 'ana@exemplo.com', loginMismatch: false })
    expect(requests.approve(made.requestId)).toBe(true)
    expect(book.list()[0]).toMatchObject({ address: '100.64.0.7', node: 'pixel-da-ana', login: 'ana@exemplo.com' })
  })

  it('an OWNER\'s device whose Tailscale login is not the PC\'s cannot be approved, only refused', () => {
    const { requests, book } = setup()
    const made = requests.open({ memberId: 'm-ana', label: 'Pixel', address: '100.64.0.9', identity: { node: 'x', login: 'outra@pessoa.com' }, loginMismatch: true })
    if (made === 'cheio') throw new Error('full')
    expect(requests.list()[0]?.loginMismatch).toBe(true)
    expect(requests.approve(made.requestId)).toBe(false)
    expect(book.list()).toHaveLength(0)
    expect(requests.reject(made.requestId)).toBe(true)
    expect(requests.poll(made.pollToken)).toEqual({ state: 'recusado' })
  })

  it('when Tailscale does not say who the address is, the request still opens (the screen says "desconhecida"); the device is bound to the address anyway', () => {
    const { requests, book } = setup()
    const made = open(requests, 'x', '100.64.0.11')
    const view = requests.list()[0]
    expect(view?.node).toBeUndefined()
    expect(view?.login).toBeUndefined()
    requests.approve(made.requestId)
    expect(book.list()[0]?.address).toBe('100.64.0.11')
  })

  it('caps the waiting requests (a flood fills the list, not the PC) and the owner hears every new one', () => {
    const { requests } = setup()
    const heard: string[] = []
    requests.onRequest(view => heard.push(view.label))
    for (let index = 0; index < MAX_PAIR_REQUESTS; index += 1) open(requests, `c${String(index)}`)
    expect(requests.open({ memberId: 'm-ana', label: 'mais um', address: 'x' })).toBe('cheio')
    expect(heard).toHaveLength(MAX_PAIR_REQUESTS)
  })

  it('cleans what the phone calls itself (one short line)', () => {
    const { requests } = setup()
    open(requests, `Pixel\n da\tAna${'x'.repeat(80)}\u0007`)
    const label = requests.list()[0]?.label ?? ''
    expect(label.length).toBeLessThanOrEqual(40)
    expect(label).not.toMatch(/[\n\t\u0007]/u)
    open(requests, '   ')
    expect(requests.list()[1]?.label).toBe('Celular')
  })

  it('a full book refuses the approval and the phone is told no', () => {
    const { requests, book } = setup()
    for (let index = 0; index < MAX_DEVICES; index += 1) book.enroll('m-a', `d${String(index)}`)
    const made = open(requests)
    expect(requests.approve(made.requestId)).toBe(false)
    expect(requests.poll(made.pollToken)).toEqual({ state: 'recusado' })
  })
})

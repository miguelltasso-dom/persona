import { describe, expect, it } from 'vitest'
import { createLateWebSocketFactory, type LateSocket, type LateSocketEvent } from '../src/client/boot/late-websocket.ts'
import { createHostLink } from '../src/client/boot/late-transport.ts'

/**
 * boot-estatico: the Gateway's socket of the static shell. While the host is starting the connection gets a socket that is still "connecting"; the real one opens, at the host's origin, when the link
 * turns ready, and the listeners the connection registered meanwhile move to it.
 */
class FakeSocket implements LateSocket {
  readyState = 0
  readonly sent: string[] = []
  closedWith: { code: number | undefined; reason: string | undefined } | undefined
  readonly listeners: { event: LateSocketEvent; listener: (event: never) => void; once: boolean }[] = []
  constructor(readonly url: string) {}
  send(data: string): void { this.sent.push(data) }
  close(code?: number, reason?: string): void { this.closedWith = { code, reason }; this.readyState = 3 }
  addEventListener(event: LateSocketEvent, listener: (event: never) => void, options?: { readonly once?: boolean }): void {
    this.listeners.push({ event, listener, once: options?.once === true })
  }
  removeEventListener(event: LateSocketEvent, listener: (event: never) => void): void {
    const index = this.listeners.findIndex(entry => entry.event === event && entry.listener === listener)
    if (index >= 0) this.listeners.splice(index, 1)
  }
  emit(event: LateSocketEvent, payload: object = {}): void {
    for (const entry of [...this.listeners]) {
      if (entry.event !== event) continue
      if (entry.once) this.listeners.splice(this.listeners.indexOf(entry), 1)
      ;(entry.listener as (value: object) => void)(payload)
    }
  }
}

function rig(origin: string | null = 'http://127.0.0.1:54321') {
  const link = createHostLink<never, never>({ send: () => Promise.reject(new Error('no calls')) })
  const opened: FakeSocket[] = []
  let hostOrigin: string | undefined = origin ?? undefined
  const make = createLateWebSocketFactory({
    link,
    hostOrigin: () => hostOrigin,
    open: (url) => { const socket = new FakeSocket(url); opened.push(socket); return socket },
  })
  return { link, opened, make, setOrigin: (next: string | undefined) => { hostOrigin = next } }
}

describe('createLateWebSocketFactory', () => {
  it('while the host is starting the socket is connecting and nothing is opened; at ready the real one opens at the host origin and takes the listeners', () => {
    const { link, opened, make } = rig()
    const socket = make('ws://app/gateway?resume=7')
    expect(socket.readyState).toBe(0)
    expect(opened).toHaveLength(0)
    const heard: string[] = []
    const onOpen = (): void => { heard.push('open') }
    const onMessage = (event: { readonly data: unknown }): void => { heard.push(`message:${String(event.data)}`) }
    const onceClose = (): void => { heard.push('close') }
    socket.addEventListener('open', onOpen as (event: never) => void)
    socket.addEventListener('message', onMessage as (event: never) => void)
    socket.addEventListener('close', onceClose, { once: true })
    link.markReady()
    expect(opened).toHaveLength(1)
    expect(opened[0]?.url).toBe('ws://127.0.0.1:54321/gateway?resume=7') // the channel, at the host's own origin
    opened[0]!.readyState = 1
    expect(socket.readyState).toBe(1)
    opened[0]!.emit('open')
    opened[0]!.emit('message', { data: 'oi' })
    opened[0]!.emit('close')
    opened[0]!.emit('close') // `once` fires once
    expect(heard).toEqual(['open', 'message:oi', 'close'])
    socket.send('quadro')
    expect(opened[0]?.sent).toEqual(['quadro'])
    socket.close(1000, 'fim')
    expect(opened[0]?.closedWith).toEqual({ code: 1000, reason: 'fim' })
  })

  it('a listener added after the real socket exists goes straight to it, and a removed one never arrives', () => {
    const { link, opened, make } = rig()
    const socket = make('ws://app/gateway')
    const removed = (): void => { throw new Error('removed listener called') }
    socket.addEventListener('open', removed)
    socket.removeEventListener('open', removed)
    link.markReady()
    const late: string[] = []
    socket.addEventListener('open', () => { late.push('open') })
    opened[0]!.emit('open')
    expect(late).toEqual(['open'])
  })

  it('send before the real socket exists fails like a socket that is still connecting', () => {
    const { make } = rig()
    const socket = make('ws://app/gateway')
    expect(() => { socket.send('cedo') }).toThrow('not open yet')
  })

  it('closing while the host is still starting tells the listener and never opens the real socket', () => {
    const { link, opened, make } = rig()
    const socket = make('ws://app/gateway')
    const closes: unknown[] = []
    socket.addEventListener('close', ((event: unknown) => { closes.push(event) }) as (event: never) => void)
    socket.close(4000, 'troquei de tela')
    expect(socket.readyState).toBe(3)
    expect(closes).toEqual([{ code: 4000, reason: 'troquei de tela' }])
    link.markReady()
    expect(opened).toHaveLength(0)
  })

  it('a link that fails before ready makes the socket report an error and a close (the connection recovery takes it from there)', () => {
    const { link, opened, make } = rig()
    const socket = make('ws://app/gateway')
    const heard: string[] = []
    socket.addEventListener('error', () => { heard.push('error') })
    socket.addEventListener('close', ((event: { readonly code: number }) => { heard.push(`close:${String(event.code)}`) }) as (event: never) => void)
    link.markFailed('o host saiu')
    expect(heard).toEqual(['error', 'close:1006'])
    expect(socket.readyState).toBe(3)
    expect(opened).toHaveLength(0)
  })

  it('with the host already ready it hands out the real socket straight away (still at the host origin)', () => {
    const { link, opened, make } = rig()
    link.markReady()
    const socket = make('ws://app/gateway')
    expect(opened).toHaveLength(1)
    expect(socket).toBe(opened[0])
    expect(opened[0]?.url).toBe('ws://127.0.0.1:54321/gateway')
  })

  it('an https origin gives wss, and no origin (a served page) keeps the URL the connection built', () => {
    const secure = rig('https://host.exemplo:8443')
    secure.link.markReady()
    secure.make('ws://app/gateway')
    expect(secure.opened[0]?.url).toBe('wss://host.exemplo:8443/gateway')
    const plain = rig(null)
    plain.link.markReady()
    plain.make('ws://pagina.local/gateway?x=1')
    expect(plain.opened[0]?.url).toBe('ws://pagina.local/gateway?x=1')
  })
})

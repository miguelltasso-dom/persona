/**
 * H23 / F4: the LIVE link of a connected team — ONE WebSocket per device to the hub (F3), signed like every other call. It does two things and nothing else:
 *  - it WAKES the host: when the hub says "something new in a channel", the host runs the same `sync` the poll runs, so verification, decryption, keys and cursors stay in one place;
 *  - it carries presence: who is online right now (the roster the hub derives from its live sockets) and this device's own state.
 * It is an accelerator, never the only way: without it (no WebSocket in this runtime, the hub is down) the poll keeps working, and every reconnect wakes the host once to catch
 * up on what it missed. The upgrade is signed with the device's key; a hub that closes with `ACCESS_REVOKED` is not retried (the person was removed).
 */

/** Presence states the hub knows (`persona-edge` F3). */
export type LivePresenceState = 'online' | 'busy' | 'away' | 'out'

/** One live device, as the hub reports it. */
export interface LiveRosterRow {
  readonly actor: string
  readonly device: string
  readonly state: LivePresenceState
  readonly since: number
  readonly machine?: string
}

/** The part of a WebSocket this link uses (the global one in Node ≥ 22; a fake in tests). */
export interface LiveSocket {
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: { readonly data?: unknown; readonly code?: number }) => void): void
}

/** Opens the socket. The standard constructor cannot set headers; the runtime's (undici) takes them in its init dictionary. */
export type LiveSocketFactory = (url: string, headers: Record<string, string>) => LiveSocket

/** What a live link needs. */
export interface RemoteLiveOptions {
  /** `ws://<edge>/w/<workspace>/sync`. */
  readonly url: string
  /** A fresh `Authorization` value for the upgrade (it is signed over the time, so it is made again for every attempt). */
  readonly authorize: () => Promise<string>
  /** The hub said something new arrived (also once after every (re)connect): the host syncs. */
  readonly onWake: () => void
  /** The roster changed. */
  readonly onRoster?: (rows: readonly LiveRosterRow[]) => void
  /** The hub cut this device because the person was removed: no retry. */
  readonly onRevoked?: () => void
  readonly factory?: LiveSocketFactory
  /** This machine's name, shown next to the presence ("Notebook do Bob"). */
  readonly machine?: string
}

/** The heartbeat the hub answers by itself (`ping` → `pong`), so an idle team lets the Durable Object sleep. */
const PING_MS = 25_000
/** No word from the hub (not even a pong) for this long: the link is dead, reconnect. */
const SILENCE_MS = 70_000
const BACKOFF_FIRST_MS = 1_000
const BACKOFF_MAX_MS = 30_000
/** WebSocket close code the hub uses when the member was revoked. */
const POLICY_VIOLATION = 1008

const defaultFactory: LiveSocketFactory = (url, headers) => {
  const Socket = (globalThis as { WebSocket?: unknown }).WebSocket as (new (target: string, init: { headers: Record<string, string> }) => LiveSocket) | undefined
  if (Socket === undefined) throw new Error('remote-live-no-websocket')
  return new Socket(url, { headers })
}

/** One device's live link to its team's hub. */
export class RemoteLive {
  private readonly options: RemoteLiveOptions
  private socket: LiveSocket | undefined
  private running = false
  private attempts = 0
  private rows: readonly LiveRosterRow[] = []
  private presence: { readonly state: LivePresenceState; readonly machine?: string } | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private retry: ReturnType<typeof setTimeout> | undefined
  private lastHeard = 0
  private open = false

  /** @param options - Where to connect, how to sign, what to do with what arrives. */
  constructor(options: RemoteLiveOptions) {
    this.options = options
  }

  /** Start (or keep) the link. Idempotent. */
  start(): void {
    if (this.running) return
    this.running = true
    this.attempts = 0
    void this.connect()
  }

  /** Stop for good: the socket is closed and nothing is retried. Idempotent. */
  stop(): void {
    this.running = false
    this.open = false
    if (this.retry !== undefined) clearTimeout(this.retry)
    this.retry = undefined
    this.clearHeartbeat()
    const socket = this.socket
    this.socket = undefined
    this.rows = []
    try {
      socket?.close(1000, 'stop')
    } catch (error) {
      void error // already closed
    }
  }

  /** @returns Whether the socket is open right now. */
  connected(): boolean {
    return this.open
  }

  /** @returns Who is live right now, one row per device (empty until the hub says hello). */
  roster(): readonly LiveRosterRow[] {
    return this.rows
  }

  /**
   * Say how this device is doing ("busy", "away"); it is sent again after every reconnect.
   * @param state - Presence state.
   * @param machine - This machine's name.
   */
  setPresence(state: LivePresenceState, machine?: string): void {
    this.presence = machine === undefined ? { state } : { state, machine }
    this.sendPresence()
  }

  private sendPresence(): void {
    if (!this.open || this.presence === undefined) return
    this.socket?.send(JSON.stringify({ type: 'presence', state: this.presence.state, ...(this.presence.machine === undefined ? {} : { machine: this.presence.machine }) }))
  }

  private async connect(): Promise<void> {
    if (!this.running) return
    let socket: LiveSocket
    try {
      const authorization = await this.options.authorize()
      if (!this.running) return
      socket = (this.options.factory ?? defaultFactory)(this.options.url, { authorization })
    } catch (error) {
      void error // no WebSocket in this runtime, or the identity is not available: the poll carries on
      this.schedule()
      return
    }
    this.socket = socket
    this.lastHeard = Date.now()
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return
      this.open = true
      this.lastHeard = Date.now()
      this.startHeartbeat(socket)
      this.sendPresence()
      if (this.presence === undefined && this.options.machine !== undefined) this.setPresence('online', this.options.machine)
    })
    socket.addEventListener('message', (event) => {
      if (this.socket === socket) this.hear(event.data)
    })
    const lost = (code: number | undefined): void => {
      if (this.socket !== socket) return
      this.socket = undefined
      this.open = false
      this.clearHeartbeat()
      if (code === POLICY_VIOLATION) {
        this.running = false
        this.rows = []
        this.options.onRevoked?.()
        return
      }
      this.schedule()
    }
    socket.addEventListener('close', (event) => { lost(event.code) })
    socket.addEventListener('error', () => { lost(undefined) })
  }

  private hear(data: unknown): void {
    this.lastHeard = Date.now()
    if (typeof data !== 'string' || data === 'pong') return
    let message: unknown
    try {
      message = JSON.parse(data)
    } catch (error) {
      void error
      return
    }
    if (typeof message !== 'object' || message === null) return
    const type: unknown = Reflect.get(message, 'type')
    if (type === 'hello' || type === 'roster') {
      this.rows = rowsOf(Reflect.get(message, 'roster'))
      this.options.onRoster?.(this.rows)
      if (type === 'hello') {
        this.attempts = 0 // a hello is proof the link works: the next loss starts the backoff from the beginning
        this.options.onWake() // whatever was said while this device was away
      }
    } else if (type === 'envelope') {
      this.options.onWake()
    } else if (type === 'revoked') {
      // The hub says the person was removed. It does not wait for the `close` event (which can lag or never come): stop for good and tell the host.
      this.stop()
      this.options.onRevoked?.()
    }
  }

  private startHeartbeat(socket: LiveSocket): void {
    this.clearHeartbeat()
    this.heartbeat = setInterval(() => {
      if (this.socket !== socket) return
      if (Date.now() - this.lastHeard > SILENCE_MS) {
        try {
          socket.close(4000, 'silence') // the 'close' event follows and reconnects
        } catch (error) {
          void error
        }
        return
      }
      try {
        socket.send('ping')
      } catch (error) {
        void error
      }
    }, PING_MS)
    this.heartbeat.unref()
  }

  private clearHeartbeat(): void {
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat)
    this.heartbeat = undefined
  }

  private schedule(): void {
    if (!this.running || this.retry !== undefined) return
    const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** this.attempts) + (this.attempts * 37) % 250
    this.attempts += 1
    this.retry = setTimeout(() => {
      this.retry = undefined
      void this.connect()
    }, wait)
    this.retry.unref()
  }
}

/** @param value - The `roster` the hub sent. @returns Only the well-formed rows. */
function rowsOf(value: unknown): readonly LiveRosterRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return []
    const actor: unknown = Reflect.get(item, 'actor')
    const device: unknown = Reflect.get(item, 'device')
    const state: unknown = Reflect.get(item, 'state')
    const since: unknown = Reflect.get(item, 'since')
    const machine: unknown = Reflect.get(item, 'machine')
    if (typeof actor !== 'string' || typeof device !== 'string' || typeof since !== 'number') return []
    if (state !== 'online' && state !== 'busy' && state !== 'away' && state !== 'out') return []
    return [{ actor, device, state, since, ...(typeof machine === 'string' ? { machine } : {}) }]
  })
}

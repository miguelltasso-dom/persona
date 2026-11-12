/**
 * COLHEITA 15b: the smallest Chrome DevTools Protocol client the host needs to type a secret into the page without the value
 * ever crossing a model boundary. Only loopback: the profile's Chrome listens on 127.0.0.1 with a port the product chose.
 *
 * Node's global `WebSocket` is the transport; no dependency, no second browser.
 *
 * Carbon P0-02: the connection never hangs. A tab that closes or a socket that errors rejects every command that was waiting (and every later one), a command that is never answered is
 * rejected after its own timeout, and opening has a timeout too.
 */

/** One debuggable target of the profile's Chrome. */
export interface CdpTarget {
  readonly id: string
  readonly type: string
  readonly url: string
  readonly webSocketDebuggerUrl: string
}

/** How long one command may wait for its answer. */
export const CDP_COMMAND_TIMEOUT_MS = 15_000
/** How long opening the socket may take. */
export const CDP_OPEN_TIMEOUT_MS = 10_000

/**
 * The page targets of a Chrome listening on `port`.
 * @param port - DevTools port of the profile's Chrome.
 * @returns Every target Chrome reports.
 */
export async function cdpTargets(port: number): Promise<readonly CdpTarget[]> {
  const response = await fetch(`http://127.0.0.1:${String(port)}/json/list`, { signal: AbortSignal.timeout(CDP_OPEN_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`DevTools respondeu ${String(response.status)}`)
  const body = await response.json() as unknown
  if (!Array.isArray(body)) return []
  return body.flatMap((item) => {
    if (item === null || typeof item !== 'object') return []
    const record = item as { id?: unknown; type?: unknown; url?: unknown; webSocketDebuggerUrl?: unknown }
    if (typeof record.id !== 'string' || typeof record.type !== 'string' || typeof record.url !== 'string' || typeof record.webSocketDebuggerUrl !== 'string') return []
    return [{ id: record.id, type: record.type, url: record.url, webSocketDebuggerUrl: record.webSocketDebuggerUrl }]
  })
}

interface Pending {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: ReturnType<typeof setTimeout>
}

/** A live protocol connection to one target. */
export class CdpConnection {
  private nextId = 1
  private ended: Error | undefined
  private readonly pending = new Map<number, Pending>()

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event: MessageEvent) => {
      const text = typeof event.data === 'string' ? event.data : ''
      if (text === '') return
      let message: { id?: number; result?: unknown; error?: { message?: string } }
      try { message = JSON.parse(text) as typeof message } catch { return }
      if (message.id === undefined) return
      const slot = this.pending.get(message.id)
      if (slot === undefined) return
      this.pending.delete(message.id)
      clearTimeout(slot.timer)
      if (message.error !== undefined) slot.reject(new Error(message.error.message ?? 'DevTools recusou o comando'))
      else slot.resolve(message.result)
    })
    // A page that is closed (or a Chrome that dies) leaves nobody to answer: say so instead of hanging the turn.
    socket.addEventListener('close', () => { this.end(new Error('o Chrome fechou a página')) })
    socket.addEventListener('error', () => { this.end(new Error('a conexão com o Chrome falhou')) })
  }

  /**
   * Wrap a socket that is already open (the product opens it with {@link CdpConnection.open}; tests drive a fake one by hand).
   * @param socket - An open socket to one target.
   * @returns The connection.
   */
  static over(socket: WebSocket): CdpConnection {
    return new CdpConnection(socket)
  }

  /**
   * Connect to one target.
   * @param webSocketDebuggerUrl - The target's own URL from {@link cdpTargets}.
   * @returns The open connection.
   */
  static async open(webSocketDebuggerUrl: string): Promise<CdpConnection> {
    const socket = new WebSocket(webSocketDebuggerUrl)
    const { promise, resolve, reject } = Promise.withResolvers<void>()
    const timer = setTimeout(() => { reject(new Error('o Chrome não respondeu ao abrir a página')) }, CDP_OPEN_TIMEOUT_MS)
    socket.addEventListener('open', () => { resolve() }, { once: true })
    socket.addEventListener('error', () => { reject(new Error('não consegui falar com o Chrome')) }, { once: true })
    try {
      await promise
    } catch (error) {
      try { socket.close() } catch (closing) { void closing }
      throw error
    } finally {
      clearTimeout(timer)
    }
    return new CdpConnection(socket)
  }

  /**
   * Send one command and wait for its result.
   * @param method - Protocol method (`Runtime.evaluate`, `Input.insertText`, …).
   * @param params - Method parameters.
   * @param timeoutMs - How long to wait for the answer; default {@link CDP_COMMAND_TIMEOUT_MS}.
   * @returns The protocol result.
   */
  send<T>(method: string, params: unknown = {}, timeoutMs: number = CDP_COMMAND_TIMEOUT_MS): Promise<T> {
    if (this.ended !== undefined) return Promise.reject(this.ended)
    const { promise, resolve, reject } = Promise.withResolvers<T>()
    const id = this.nextId++
    const timer = setTimeout(() => {
      if (this.pending.delete(id)) reject(new Error(`o Chrome não respondeu a ${method}`))
    }, timeoutMs)
    this.pending.set(id, { resolve: (value) => { resolve(value as T) }, reject, timer })
    try {
      this.socket.send(JSON.stringify({ id, method, params }))
    } catch (error) {
      void error // the socket is already gone
      clearTimeout(timer)
      this.pending.delete(id)
      reject(new Error('o Chrome fechou a página'))
    }
    return promise
  }

  /** Close the connection (the page stays open). Whatever was waiting is rejected. */
  close(): void {
    this.end(new Error('a conexão com o Chrome foi encerrada'))
    try { this.socket.close() } catch (error) { void error }
  }

  private end(error: Error): void {
    if (this.ended !== undefined) return
    this.ended = error
    for (const slot of this.pending.values()) {
      clearTimeout(slot.timer)
      slot.reject(error)
    }
    this.pending.clear()
  }
}

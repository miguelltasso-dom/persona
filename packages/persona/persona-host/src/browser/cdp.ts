/**
 * COLHEITA 15b: the smallest Chrome DevTools Protocol client the host needs to type a secret into the page without the value
 * ever crossing a model boundary. Only loopback: the profile's Chrome listens on 127.0.0.1 with a port the product chose.
 *
 * Node's global `WebSocket` is the transport; no dependency, no second browser.
 */

/** One debuggable target of the profile's Chrome. */
export interface CdpTarget {
  readonly id: string
  readonly type: string
  readonly url: string
  readonly webSocketDebuggerUrl: string
}

/**
 * The page targets of a Chrome listening on `port`.
 * @param port - DevTools port of the profile's Chrome.
 * @returns Every target Chrome reports.
 */
export async function cdpTargets(port: number): Promise<readonly CdpTarget[]> {
  const response = await fetch(`http://127.0.0.1:${String(port)}/json/list`)
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

/** A live protocol connection to one target. */
export class CdpConnection {
  private nextId = 1
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

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
      if (message.error !== undefined) slot.reject(new Error(message.error.message ?? 'DevTools recusou o comando'))
      else slot.resolve(message.result)
    })
  }

  /**
   * Connect to one target.
   * @param webSocketDebuggerUrl - The target's own URL from {@link cdpTargets}.
   * @returns The open connection.
   */
  static async open(webSocketDebuggerUrl: string): Promise<CdpConnection> {
    const socket = new WebSocket(webSocketDebuggerUrl)
    const { promise, resolve, reject } = Promise.withResolvers<void>()
    socket.addEventListener('open', () => { resolve() }, { once: true })
    socket.addEventListener('error', () => { reject(new Error('não consegui falar com o Chrome')) }, { once: true })
    await promise
    return new CdpConnection(socket)
  }

  /**
   * Send one command and wait for its result.
   * @param method - Protocol method (`Runtime.evaluate`, `Input.insertText`, …).
   * @param params - Method parameters.
   * @returns The protocol result.
   */
  send<T>(method: string, params: unknown = {}): Promise<T> {
    const { promise, resolve, reject } = Promise.withResolvers<T>()
    const id = this.nextId++
    this.pending.set(id, { resolve: (value) => { resolve(value as T) }, reject })
    this.socket.send(JSON.stringify({ id, method, params }))
    return promise
  }

  /** Close the connection (the page stays open). */
  close(): void {
    this.socket.close()
  }
}

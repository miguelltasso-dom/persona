/**
 * Streaming of a reply into the thread. The reply being written is ONE message that grows (`type: 'partial'`, shown to the
 * UI as `streaming: true`) and then settles into the final text under the same id, so nothing is shown twice and a
 * re-delivery of the final is a no-op. The first piece opens the message at once; later pieces are written at most once per
 * `throttleMs`, with a trailing write so the last text before a pause is never stale.
 */

/** Where the text goes. */
export interface ReplyStreamPorts {
  /** Create the message with the first text. */
  open(text: string): void
  /** Replace the text of the open message. */
  update(text: string): void
}

/** Throttled writer for one reply. */
export class ReplyStream {
  /** Latest cumulative text received (not necessarily written yet). */
  text = ''
  private opened = false
  private closed = false
  private written = ''
  private lastWriteMs = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param ports - Message writer.
   * @param throttleMs - Minimum gap between two writes; 0 writes every piece.
   * @param nowMs - Clock (injectable).
   */
  constructor(
    private readonly ports: ReplyStreamPorts,
    private readonly throttleMs: number,
    private readonly nowMs: () => number = () => Date.now(),
  ) {}

  /**
   * A new cumulative text from the runner.
   * @param text - Everything written so far.
   */
  push(text: string): void {
    if (this.closed || text.trim() === '') return
    this.text = text
    if (!this.opened) {
      this.opened = true
      this.write(true)
      return
    }
    if (this.throttleMs <= 0 || this.nowMs() - this.lastWriteMs >= this.throttleMs) {
      this.flush()
      return
    }
    if (this.timer === undefined) {
      this.timer = setTimeout(() => { this.timer = undefined; this.flush() }, this.throttleMs)
      this.timer.unref()
    }
  }

  /** Write what is pending now (the end of the turn calls this before settling). */
  flush(): void {
    this.clear()
    if (!this.closed && this.opened && this.text !== this.written) this.write(false)
  }

  /** Stop for good: late pieces from a runner that is still talking are ignored. */
  stop(): void {
    this.clear()
    this.closed = true
  }

  private clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  private write(first: boolean): void {
    this.written = this.text
    this.lastWriteMs = this.nowMs()
    if (first) this.ports.open(this.text)
    else this.ports.update(this.text)
  }
}

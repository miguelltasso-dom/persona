/** One file queued in the composer before send. */
export type ComposerPendingAttachment =
  | {
    readonly key: string
    readonly name: string
    readonly status: 'uploading'
  }
  | {
    readonly key: string
    readonly name: string
    readonly status: 'ready'
    readonly id: string
  }
  | {
    readonly key: string
    readonly name: string
    readonly status: 'error'
    readonly message: string
  }

export function readyAttachmentIds(rows: readonly ComposerPendingAttachment[]): string[] {
  return rows.flatMap(row => row.status === 'ready' ? [row.id] : [])
}

export function composerCanSend(body: string, rows: readonly ComposerPendingAttachment[]): boolean {
  if (rows.some(row => row.status === 'uploading')) return false
  return body.trim().length > 0 || rows.some(row => row.status === 'ready')
}

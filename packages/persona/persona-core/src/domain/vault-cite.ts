/**
 * Cofre file citations for Contexto usado. Store/RPC stay on Anvil (v14).
 * Host maps ingest/search hits onto these types; UI shows title + locator.
 */

export interface VaultDocumentCite {
  readonly id: string
  readonly documentId: string
  readonly title: string
  readonly locator: string
  readonly body: string
  readonly restricted: boolean
}

/** One Contexto usado row for a document chunk. */
export interface UsedDocumentCite {
  readonly id: string
  readonly kind: 'document'
  readonly body: string
  readonly required: false
  readonly restricted: boolean
  readonly title: string
  readonly locator: string
}

/**
 * Drawer / prompt label: "Contrato.pdf · seção Contratos".
 * Restricted rows keep title+locator and hide the body.
 * @param cite - Title, locator, and restriction flag.
 */
export function formatVaultCitation(cite: {
  readonly title: string
  readonly locator: string
  readonly restricted?: boolean
}): string {
  const title = cite.title.trim() || 'Documento'
  const locator = cite.locator.trim()
  const head = locator === '' ? title : `${title} · ${locator}`
  return cite.restricted === true ? `${head} (restrito)` : head
}

/**
 * @param cite - FTS hit already ACL-filtered by the host.
 */
export function toUsedDocumentCite(cite: VaultDocumentCite): UsedDocumentCite {
  return {
    id: cite.id,
    kind: 'document',
    body: cite.restricted ? '' : cite.body,
    required: false,
    restricted: cite.restricted,
    title: cite.title,
    locator: cite.locator,
  }
}

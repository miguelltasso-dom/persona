/**
 * "Tornar do time": a memória que o dono disse numa DM vira memória da equipe (`persona-spec/contracts/memoria-da-dm-para-o-time.md`).
 * Regras puras sobre os repositórios (sem @Remote aqui até o S4b).
 *
 * - Só o dono do espaço, só memória que ele mesmo disse (`proof.byId`), só memória ou regra (`assertMemoryReachable` recusa o resto como `memory-not-found`).
 * - Prévia (não grava) → confirmação explícita com o hash do que o dono viu: registro mudado no meio = `preview-changed`. O texto editado passa pelos mesmos filtros.
 * - Nunca sobe: segredo (palavras-chave, números longos ou padrões de token/chave), dado de terceiros, regra que estoura o teto das regras da casa.
 * - A mensagem original da DM não sobe: a citação pública vira o fato; a original não-secreta fica guardada na trilha para o "desfazer".
 * - Desfazer = a mesma memória volta a `persona` (nova revisão); a trilha `memory_promotion` registra as duas mudanças com o texto visto.
 */
import { createHash } from 'node:crypto'
import type { VaultRecord } from '@deepseek-ai/dsh-persona-core'
import type { ProductRepos, ScreenRepos, VaultRepos } from '@deepseek-ai/dsh-persona-store'
import { MEMORY_PROOF_KIND, memoryProofOf, type MemoryProof } from './owner-memory.ts'
import { assertMemoryReachable } from './private-records.ts'

/** Screen document kind of the promotion trail (internal only; never exposed by a Remote). */
export const MEMORY_PROMOTION_KIND = 'memory_promotion'

/** Same budget `Orchestration.compileUsedNow` allocates for mandatory house rules (2000 tokens, ~4 chars/token). */
const REQUIRED_BUDGET_TOKENS = 2000
const tokensOf = (text: string): number => Math.max(1, Math.ceil(text.length / 4))

const SECRET_WORDS = /\b(?:senha|password|passwd|token|api[\s_-]?key|chave\s+(?:de\s+)?api|chave\s+privada|secret|segredo|cvv)\b|\d[\d .-]{11,}\d/iu
const SECRET_TOKENS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  /\bBearer\s+[a-z0-9._~+/=-]{20,}/iu,
  /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*\S{8,}/iu,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/u,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/u,
]
const THIRD_PARTY = /[\w.+-]+@[\w-]+\.[\w.-]+|\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/u

const isSecretText = (text: string): boolean => SECRET_WORDS.test(text) || SECRET_TOKENS.some(pattern => pattern.test(text))

/** Machine code explaining why a memory cannot be promoted to the team right now. */
export type PromotionBlockCode = 'secret' | 'third-party' | 'rules-too-big' | 'revoked' | 'already-team'

const BLOCK_MESSAGE: Readonly<Record<PromotionBlockCode, string>> = {
  secret: 'Isto parece uma senha ou chave. Guarde no Cofre.',
  'third-party': 'Tem dado de uma pessoa de fora. Tire o dado ou deixe no Cofre.',
  'rules-too-big': 'As regras da casa já estão no limite. Resuma algumas antes de acrescentar esta.',
  revoked: 'Esta memória foi esquecida.',
  'already-team': 'Esta memória já é da equipe.',
}

/** Preview returned before the owner confirms; writes nothing. */
export interface PromotionPreview {
  readonly id: string
  /** Exact text the team would read. */
  readonly fact: string
  /** Source line as it would appear to the team (for example: "Você disse numa conversa privada com Bia, 11/11."). */
  readonly source: { readonly line: string }
  /** True when promoting a house rule (mandatory context in every persona turn). */
  readonly rule: boolean
  /** Hash of the text the owner inspected; confirmation must send it back unchanged. */
  readonly textHash: string
  /** Blocking reason when promotion is not allowed without editing. */
  readonly blocked?: { readonly code: PromotionBlockCode; readonly message: string }
}

/** One entry in the `memory_promotion` audit trail. */
export interface MemoryPromotionRow {
  readonly id: string
  readonly recordId: string
  readonly byId: string
  readonly at: string
  readonly direction: 'to-team' | 'to-persona'
  readonly fromPersonaId: string
  /** Exact text confirmed by the owner. */
  readonly textShown: string
  /** Previous proof restored on demote (never retains secret text). */
  readonly before?: MemoryProof
}

/** Repository ports needed to preview, promote, and demote a DM memory. */
export interface PromotionStores {
  readonly vault: VaultRepos
  readonly screens: ScreenRepos
  readonly product: ProductRepos
  /** Revision-preserving update of record visibility (and body when the owner edited it). */
  readonly setVisibility: (
    id: string,
    visibility: VaultRecord['visibility'],
    authorId: string,
    body?: string,
  ) => unknown
}

/** Clock and timezone offset used to format the date in the preview source line. */
export interface PromotionContext {
  readonly now: () => string
  readonly offsetMinutes?: number
}

interface Scope {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
}

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)

function ownRecord(stores: PromotionStores, scope: Scope, viewerId: string): { readonly record: VaultRecord; readonly proof: MemoryProof } {
  assertMemoryReachable(stores, scope, viewerId)
  const record = stores.vault.getRecord(scope.id)
  const proof = memoryProofOf(stores.screens, scope.projectId, scope.id)
  if (record === undefined || proof === undefined || proof.byId !== viewerId) throw new Error('memory-not-found')
  if (stores.product.getMember(viewerId)?.role !== 'owner') throw new Error('forbidden')
  return { record, proof }
}

function sourceLineOf(stores: PromotionStores, proof: MemoryProof, personaId: string | undefined, offsetMinutes: number): string {
  const ms = Date.parse(proof.at)
  const day = Number.isFinite(ms) ? new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 10) : proof.at.slice(0, 10)
  const date = `${day.slice(8, 10)}/${day.slice(5, 7)}`
  const persona = personaId === undefined ? undefined : stores.product.getPersona(personaId)?.name
  return `Você disse numa conversa privada${persona === undefined ? '' : ` com ${persona}`}, ${date}.`
}

function blockOf(stores: PromotionStores, scope: Scope, text: string, isRule: boolean): PromotionBlockCode | undefined {
  if (isSecretText(text)) return 'secret'
  if (THIRD_PARTY.test(text)) return 'third-party'
  if (isRule) {
    const used = stores.vault.listRecords(scope.projectId)
      .filter(row => row.id !== scope.id && row.status === 'active' && (row.kind === 'constraint' || row.kind === 'decision') && row.visibility.kind !== 'persona' && row.visibility.kind !== 'members')
      .reduce((sum, row) => sum + tokensOf(row.body), 0)
    if (used + tokensOf(text) > REQUIRED_BUDGET_TOKENS) return 'rules-too-big'
  }
  return undefined
}

/**
 * Preview promoting a private DM memory to the whole team without mutating any store.
 * @param stores - Vault, screen, and product repositories.
 * @param scope - Tenant and record identifiers.
 * @param viewerId - Authenticated member id from the session.
 * @param context - Clock and timezone offset for the date label.
 * @returns Preview payload containing the text, origin line, verification hash, and any block reason.
 */
export function previewPromotion(stores: PromotionStores, scope: Scope, viewerId: string, context: PromotionContext): PromotionPreview {
  const { record, proof } = ownRecord(stores, scope, viewerId)
  const personaId = record.visibility.kind === 'persona' ? record.visibility.personaId : undefined
  const code: PromotionBlockCode | undefined = record.status === 'revoked'
    ? 'revoked'
    : record.visibility.kind === 'workspace'
      ? 'already-team'
      : blockOf(stores, scope, record.body, record.kind === 'constraint')
  return {
    id: record.id,
    fact: record.body,
    rule: record.kind === 'constraint',
    textHash: hashOf(record.body),
    source: { line: sourceLineOf(stores, proof, personaId, context.offsetMinutes ?? 0) },
    ...(code === undefined ? {} : { blocked: { code, message: BLOCK_MESSAGE[code] } }),
  }
}

/**
 * Promote a private DM memory to workspace visibility after verifying owner confirmation and preview hash.
 * @param stores - Vault, screen, and product repositories.
 * @param request - Tenant, record id, edited/confirmed text, preview hash, and explicit confirmation flag.
 * @param viewerId - Authenticated member id from the session.
 * @param context - Clock provider.
 * @returns Promoted record id and team-visible body (idempotent when already promoted).
 */
export function promoteToTeam(
  stores: PromotionStores,
  request: Scope & { readonly text: string; readonly previewHash: string; readonly explicit: boolean },
  viewerId: string,
  context: PromotionContext,
): { readonly id: string; readonly body: string } {
  if (request.explicit !== true) throw new Error('explicit-required')
  const { record, proof } = ownRecord(stores, request, viewerId)
  if (record.status === 'revoked') throw new Error('revoked')
  if (record.visibility.kind === 'workspace') return { id: record.id, body: record.body }
  if (request.previewHash !== hashOf(record.body)) throw new Error('preview-changed')
  const text = request.text.replace(/\s+/gu, ' ').trim()
  if (text.length < 8) throw new Error('text-too-short')
  const code = blockOf(stores, request, text, record.kind === 'constraint')
  if (code !== undefined) throw new Error(code)
  const fromPersonaId = record.visibility.kind === 'persona' ? record.visibility.personaId : ''
  stores.setVisibility(record.id, { kind: 'workspace' }, viewerId, text === record.body ? undefined : text)
  stores.screens.put(
    request.projectId,
    MEMORY_PROOF_KIND,
    record.id,
    { ...proof, quote: text, where: 'channel', place: '', scope: 'team' } satisfies MemoryProof,
  )
  const at = context.now()
  const before: MemoryProof | undefined = isSecretText(proof.quote) ? undefined : proof
  const row: MemoryPromotionRow = {
    id: `promo:${record.id}:${at}`,
    recordId: record.id,
    byId: viewerId,
    at,
    direction: 'to-team',
    fromPersonaId,
    textShown: text,
    ...(before === undefined ? {} : { before }),
  }
  stores.screens.put(request.projectId, MEMORY_PROMOTION_KIND, row.id, row)
  return { id: record.id, body: text }
}

/**
 * Demote a promoted memory back to its original persona's private DM visibility.
 * @param stores - Vault, screen, and product repositories.
 * @param scope - Tenant and record identifiers.
 * @param viewerId - Authenticated member id from the session.
 * @param context - Clock provider.
 * @returns Demoted record id.
 */
export function demoteToPersona(stores: PromotionStores, scope: Scope, viewerId: string, context: PromotionContext): { readonly id: string } {
  const { record } = ownRecord(stores, scope, viewerId)
  if (record.visibility.kind !== 'workspace') return { id: record.id }
  const last = stores.screens.list<MemoryPromotionRow>(scope.projectId, MEMORY_PROMOTION_KIND)
    .filter(row => row.recordId === record.id && row.direction === 'to-team')
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1)
  if (last === undefined || last.fromPersonaId === '' || stores.product.getPersona(last.fromPersonaId) === undefined) throw new Error('persona-gone')
  stores.setVisibility(record.id, { kind: 'persona', personaId: last.fromPersonaId }, viewerId)
  if (last.before !== undefined) stores.screens.put(scope.projectId, MEMORY_PROOF_KIND, record.id, last.before)
  const at = context.now()
  stores.screens.put(scope.projectId, MEMORY_PROMOTION_KIND, `promo:${record.id}:${at}:back`, {
    id: `promo:${record.id}:${at}:back`,
    recordId: record.id,
    byId: viewerId,
    at,
    direction: 'to-persona',
    fromPersonaId: last.fromPersonaId,
    textShown: record.body,
  } satisfies MemoryPromotionRow)
  return { id: record.id }
}

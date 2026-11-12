/**
 * Memory that proves itself (harvest item 16, first slice): what the owner asks the team to remember, in plain words, becomes a
 * memory the whole team reads, tied to the exact message that said it.
 *
 * The host writes it, never a model: a persona that read an outside page earlier in the same run cannot water down or invent what the
 * owner said. The record keeps the owner's message as its source (`sourceIds`) and a small proof document with the literal words, who said
 * them, where and when, so Memória can show "você disse em #geral, 11/11: «…»" and nobody has to take the team's word for it.
 *
 * - "Pessoal, lembrem: a promoção é 2 por R$ 9." in a channel → a memory for the team (visible to every persona).
 * - The same asked in a DM → a memory of that persona only (a DM is private).
 * - "Regra da casa: …", "A partir de agora …", "Sempre …" → a rule: mandatory context in every turn.
 * - The same fact twice is one memory; a persona's copy is replaced when the owner says it to the team ("Tornar do time").
 * - A secret (password, token, a long number) is never kept here: that belongs to the Cofre.
 */

import { nearDuplicate } from '@deepseek-ai/dsh-persona-core'
import type { ProductRepos, ScreenRepos, StoredEvent, VaultRepos } from '@deepseek-ai/dsh-persona-store'

/** Screen document kind holding the proof of a memory the owner asked for. */
export const MEMORY_PROOF_KIND = 'memory_proof'

/** What a memory remembers about where it came from. */
export interface MemoryProof {
  /** The owner's own message, word for word. */
  readonly quote: string
  readonly messageId: string
  /** Display name of who said it. */
  readonly by: string
  /** Member id of who said it (the list tells "você" from another member by it). */
  readonly byId: string
  readonly at: string
  readonly where: 'channel' | 'dm'
  /** The channel's name ("geral") when said in a channel; empty in a DM. */
  readonly place: string
  /** Everyone reads it (a channel) or only the persona it was said to (a DM). */
  readonly scope: 'team' | 'persona'
}

/** A request to remember, read from the owner's words. */
export interface OwnerMemoryAsk {
  /** The fact, as a clean sentence. */
  readonly fact: string
  /** A rule (always/never/from now on) is mandatory context; anything else is recalled when it matches. */
  readonly rule: boolean
}

const FACT_MIN = 8
const FACT_MAX = 600

const ADDRESS = String.raw`(?:pessoal|gente|time|equipe|galera|turma|todos|pessoas)`
const VERB = String.raw`(?:lembr(?:em|e|a)(?:-se)?|anot(?:em|e|a)|guard(?:em|e|a)|memoriz(?:em|e|a)|fiqu(?:em|e) sabendo|saibam|saiba)`

/** "Pessoal, lembrem disso: X": addressed to the team. */
const TEAM_ASK = new RegExp(String.raw`^\s*${ADDRESS}\b[\s,!:.-]*(?:por favor[\s,]*)?${VERB}\b(?:\s+(?:disso|isso|bem|aí))?[\s,:;-]*(?:que\s+)?(.+)$`, 'isu')
/** "Lembra que X" / "Anota: X": the verb must be followed by "que", a colon or "disso/isso:" so a question ("Lembra do pedido?") is not an order. */
const PLAIN_ASK = new RegExp(String.raw`^\s*(?:por favor[\s,]*)?${VERB}\b(?:\s+(?:disso|isso))?\s*(?::|-|\s+que\b)\s*(.+)$`, 'isu')
const RULE_ASK = /^\s*(?:regra(?:\s+da\s+casa)?|nova\s+regra)\s*[:\-–]\s*(.+)$/isu
const FROM_NOW_ON = /^\s*a\s+partir\s+de\s+agora[\s,:-]+(.+)$/isu
/** A fact that starts like a rule is mandatory context. */
const RULE_START = /^(?:sempre|nunca|jamais|n[ãa]o\s+(?:use|usem|diga|digam|fa[çc]a|fa[çc]am|envie|enviem|publique|publiquem|responda|respondam|aceite|aceitem|ofere[çc]a|ofere[çc]am|prometa|prometam)|toda\s+vez|todo\s+(?:cliente|pedido|dia)|toda\s+(?:encomenda|mensagem|resposta))\b/iu
/** What never belongs in a memory: it goes to the Cofre. */
const SECRET = /\b(?:senha|password|passwd|token|api[\s_-]?key|chave\s+(?:de\s+)?api|chave\s+privada|secret|segredo|cvv)\b|\d[\d .-]{11,}\d/iu

function clean(text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  const first = flat.charAt(0)
  const sentence = `${first.toUpperCase()}${flat.slice(1)}`
  return /[.!?…]$/u.test(sentence) ? sentence : `${sentence}.`
}

/**
 * Read an owner's line for a request to remember.
 * @param text - The message, as written.
 * @returns The fact and whether it is a rule; undefined when the line is not such a request (a question, a secret, too short or too long).
 */
export function ownerMemoryAskOf(text: string): OwnerMemoryAsk | undefined {
  const line = text.trim()
  if (line === '' || line.length > FACT_MAX + 80) return undefined
  const explicitRule = RULE_ASK.exec(line)?.[1] ?? FROM_NOW_ON.exec(line)?.[1]
  const asked = explicitRule ?? TEAM_ASK.exec(line)?.[1] ?? PLAIN_ASK.exec(line)?.[1]
  if (asked === undefined) return undefined
  const fact = asked.replace(/\s+/gu, ' ').trim()
  if (fact.length < FACT_MIN || fact.length > FACT_MAX || fact.endsWith('?') || SECRET.test(fact)) return undefined
  return { fact: clean(fact), rule: explicitRule !== undefined || RULE_START.test(fact) }
}

/** What the host needs to keep a memory. */
export interface OwnerMemoryDeps {
  readonly vault: VaultRepos
  readonly screens: ScreenRepos
  readonly product: Pick<ProductRepos, 'getPersona' | 'getMember' | 'getDm' | 'getChannel'>
}

/** What {@link captureOwnerMemory} did. */
export interface CapturedMemory {
  readonly status: 'saved' | 'duplicate' | 'promoted'
  readonly recordId: string
  readonly kind: 'memory' | 'constraint'
  readonly fact: string
  readonly proof: MemoryProof
}

function slug(fact: string): string {
  return fact.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').replace(/[^a-z0-9]+/gu, ' ').trim().slice(0, 110)
}

/** The persona a DM is with (the other participant), when the message was said in a DM. */
function personaOfDm(deps: OwnerMemoryDeps, event: StoredEvent): string | undefined {
  if (!event.streamId.startsWith('dm:')) return undefined
  const dm = deps.product.getDm(event.streamId.slice(3))
  if (dm === undefined) return undefined
  return [dm.participantA, dm.participantB].find(id => deps.product.getPersona(id) !== undefined)
}

/**
 * Keep what the owner asked the team to remember. Idempotent per message; never throws for a line that is not a request.
 * @param deps - Vault, screens and the product repos.
 * @param event - A message the owner just wrote.
 * @returns What was kept, or undefined when the line is no request, nobody the host knows wrote it, or it is a secret.
 */
export function captureOwnerMemory(deps: OwnerMemoryDeps, event: StoredEvent): CapturedMemory | undefined {
  // Only a person of this workspace: a persona, a routine or the team's own line never writes the owner's memory.
  if (/^(?:initiative|routine-run|plan):/u.test(event.id) || event.actorId.startsWith('routine:') || event.actorId.startsWith('team:')) return undefined
  if (deps.product.getPersona(event.actorId) !== undefined) return undefined
  const member = deps.product.getMember(event.actorId)
  if (member === undefined || member.workspaceId !== event.workspaceId) return undefined
  const ask = ownerMemoryAskOf(event.body)
  if (ask === undefined) return undefined

  const dmPersona = personaOfDm(deps, event)
  const where = event.streamId.startsWith('dm:') ? 'dm' as const : 'channel' as const
  if (where === 'dm' && dmPersona === undefined) return undefined // a DM between people is nobody's team memory
  const kind = ask.rule ? 'constraint' as const : 'memory' as const
  const scope = where === 'dm' ? 'persona' as const : 'team' as const
  const place = where === 'channel' ? deps.product.getChannel(event.streamId.slice(event.streamId.indexOf(':') + 1))?.name ?? '' : ''
  const proof: MemoryProof = { quote: event.body.trim(), messageId: event.id, by: member.displayName, byId: member.id, at: event.occurredAt, where, place, scope }
  const recordId = `owner-mem-${event.id}`

  // Idempotent: the same message twice is one memory.
  if (deps.vault.getRecord(recordId) !== undefined) return { status: 'duplicate', recordId, kind, fact: ask.fact, proof }

  const sameFact = deps.vault.listRecords(event.projectId).filter(record => record.status === 'active' && (record.kind === 'memory' || record.kind === 'constraint')
    && (record.factKey === `owner:${slug(ask.fact)}` || nearDuplicate(record.body, ask.fact)))
  const teamCopy = sameFact.find(record => record.visibility.kind === 'workspace')
  if (teamCopy !== undefined) return { status: 'duplicate', recordId: teamCopy.id, kind: teamCopy.kind === 'constraint' ? 'constraint' : 'memory', fact: teamCopy.body, proof }
  const personaCopy = scope === 'persona' ? sameFact.find(record => record.visibility.kind === 'persona' && record.visibility.personaId === dmPersona) : undefined
  if (personaCopy !== undefined) return { status: 'duplicate', recordId: personaCopy.id, kind: personaCopy.kind === 'constraint' ? 'constraint' : 'memory', fact: personaCopy.body, proof }

  deps.vault.createRecord({
    id: recordId,
    workspaceId: event.workspaceId,
    projectId: event.projectId,
    kind,
    body: ask.fact,
    authorId: member.id,
    visibility: scope === 'team' ? { kind: 'workspace' } : { kind: 'persona', personaId: dmPersona ?? '' },
    sourceIds: [event.id],
    factKey: `owner:${slug(ask.fact)}`,
  })
  deps.screens.put(event.projectId, MEMORY_PROOF_KIND, recordId, proof)
  // "Tornar do time": the owner said to the team what a persona kept for herself: the copies she kept are archived.
  let promoted = false
  if (scope === 'team') {
    for (const record of sameFact) {
      if (record.visibility.kind === 'persona') { deps.vault.revokeRecord(record.id); promoted = true }
    }
  }
  return { status: promoted ? 'promoted' : 'saved', recordId, kind, fact: ask.fact, proof }
}

/**
 * The proof of a memory, when the owner asked for it.
 * @param screens - The host's screen documents.
 * @param projectId - Tenant.
 * @param recordId - The memory.
 */
export function memoryProofOf(screens: ScreenRepos, projectId: string, recordId: string): MemoryProof | undefined {
  return screens.get<MemoryProof>(projectId, MEMORY_PROOF_KIND, recordId)
}

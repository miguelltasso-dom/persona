/**
 * "Traga o que suas IAs já sabem" (BRIEFING 18): paste parser + Obsidian folder.
 * Proposals only — nothing becomes a required vault fact without explicit apply.
 */

import { createHash } from 'node:crypto'
import { contradicts, nearDuplicate } from '../domain/aging.ts'
import { looksLikeCredential } from '../domain/secrets.ts'
import { looksLikeSecret } from './privacy.ts'
import { markdownAdapter } from './markdown.ts'
import type { ImportFile } from './types.ts'

export type BringLocale = 'pt' | 'en'
export type BringProvider = 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'other'
export type BringVaultKind = 'brief' | 'constraint' | 'decision' | 'memory'
export type BringProposalStatus = 'ready' | 'uncertain' | 'blocked' | 'duplicate' | 'conflict'
export type BringApplyAction = 'accept' | 'edit' | 'discard' | 'private'

const PROVIDER_PT: Record<BringProvider, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  grok: 'Grok',
  other: 'outra IA',
}

const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/
const CARD = /\b(?:\d{4}[ -]?){3}\d{4}\b/
const BANK = /\b(?:ag[eê]ncia|conta[- ]corrente|iban|dados banc[aá]rios)\b/i

const SKIP_DIR = /(?:^|\/)(?:\.obsidian|\.trash)(?:\/|$)/i
const BINARY = /\.(png|jpe?g|gif|webp|pdf|mp3|mp4|mov|zip|exe|dll|db|canvas|bind)$/i
const MAX_NOTE = 200_000

const EMPTY_ITEM = /^(não sei|nao sei|i don't know|unknown)\.?$/i

export const BRING_CONTEXT_PROMPT_PT = `Quero levar o que você sabe sobre mim e meu trabalho para a minha nova equipe de assistentes (Persona).
Com base em tudo o que você lembra das nossas conversas e da sua memória sobre mim, escreva um resumo
completo e organizado, em português, com estas seções e títulos exatamente assim:

## Sobre mim
Nome, papel, como prefiro ser tratado, estilo de comunicação e preferências de trabalho.

## Empresa e projetos
O que a empresa faz, clientes, produtos/serviços, projetos em andamento e objetivos.

## Regras e restrições
Coisas que sempre devem (ou nunca devem) ser feitas, limites, políticas, tom de voz da marca.

## Decisões já tomadas
Decisões importantes com o motivo, quando eu tiver dito.

## Ferramentas e processos
Ferramentas que uso, como trabalho, rotinas recorrentes e padrões.

## Pessoas e contatos de trabalho
Pessoas relevantes e o papel de cada uma (sem dados sensíveis como documentos, senhas ou endereços).

## O que ainda está em aberto
Pendências, dúvidas e próximos passos.

Regras: use tópicos curtos; não invente nada — se não souber, escreva "não sei"; marque com (incerto)
o que você não tem certeza; não inclua senhas, tokens, números de documentos ou dados bancários.`

export const BRING_CONTEXT_PROMPT_EN = `I want to take what you know about me and my work to my new assistant team (Persona).
Based on everything you remember from our conversations and your memory of me, write a complete
organized summary in English, with these sections and headings exactly like this:

## About me
Name, role, how I prefer to be addressed, communication style and work preferences.

## Company and projects
What the company does, clients, products/services, projects in progress and goals.

## Rules and constraints
Things that must always (or never) be done, limits, policies, brand voice.

## Decisions already made
Important decisions with the reason, when I have said them.

## Tools and processes
Tools I use, how I work, recurring routines and patterns.

## People and work contacts
Relevant people and each one's role (no sensitive data such as IDs, passwords or addresses).

## Still open
Open items, questions and next steps.

Rules: use short bullets; do not invent anything — if you do not know, write "I don't know"; mark with (uncertain)
what you are not sure about; do not include passwords, tokens, ID numbers or bank details.`

interface SectionDef {
  readonly headings: readonly string[]
  readonly kind: BringVaultKind
  readonly label: string
}

const SECTIONS: readonly SectionDef[] = [
  { headings: ['sobre mim', 'about me'], kind: 'brief', label: 'Sobre mim' },
  { headings: ['empresa e projetos', 'company and projects'], kind: 'brief', label: 'Empresa e projetos' },
  { headings: ['regras e restrições', 'regras e restricoes', 'rules and constraints'], kind: 'constraint', label: 'Regras e restrições' },
  { headings: ['decisões já tomadas', 'decisoes ja tomadas', 'decisions already made'], kind: 'decision', label: 'Decisões já tomadas' },
  { headings: ['ferramentas e processos', 'tools and processes'], kind: 'memory', label: 'Ferramentas e processos' },
  { headings: ['pessoas e contatos de trabalho', 'people and work contacts'], kind: 'memory', label: 'Pessoas e contatos de trabalho' },
  { headings: ['o que ainda está em aberto', 'o que ainda esta em aberto', 'still open'], kind: 'memory', label: 'O que ainda está em aberto' },
]

export interface BringExistingRecord {
  readonly id: string
  readonly kind: string
  readonly body: string
}

export interface BringVaultFile {
  readonly path: string
  readonly text: string
}

export interface BringIgnored {
  readonly path: string
  readonly why: string
}

export interface BringPriorHash {
  readonly path: string
  readonly hash: string
}

export interface BringContextProposal {
  readonly id: string
  readonly kind: BringVaultKind
  readonly section: string
  readonly body: string
  readonly provenance: string
  readonly uncertain: boolean
  readonly sensitive: boolean
  readonly blocked: boolean
  readonly sensitiveWhy: string
  readonly duplicateOf: string
  readonly conflictQuestion: string
  readonly status: BringProposalStatus
  readonly path: string
  readonly hash: string
}

export interface BringContextPreview {
  readonly source: 'paste' | 'vault'
  readonly proposals: readonly BringContextProposal[]
  readonly ignored: readonly BringIgnored[]
}

/**
 * @param locale - UI locale.
 * @returns Prompt the person copies to an existing AI.
 */
export function bringContextPrompt(locale: BringLocale = 'pt'): string {
  return locale === 'en' ? BRING_CONTEXT_PROMPT_EN : BRING_CONTEXT_PROMPT_PT
}

/**
 * @param text - Candidate body.
 * @returns Why it looks sensitive, or empty.
 */
export function sensitiveWhy(text: string): string {
  if (looksLikeCredential(text) || looksLikeSecret(text)) return 'Parece senha, token ou chave. Bloqueado por padrão.'
  if (CPF.test(text)) return 'Parece CPF ou documento. Bloqueado por padrão.'
  if (CARD.test(text)) return 'Parece número de cartão. Bloqueado por padrão.'
  if (BANK.test(text) && /\d/.test(text)) return 'Parece dado bancário. Bloqueado por padrão.'
  return ''
}

/**
 * @param path - Vault-relative path.
 */
export function classifyVaultPath(path: string): 'keep' | 'obsidian' | 'trash' | 'binary' | 'other' {
  const norm = path.replace(/\\/g, '/')
  if (SKIP_DIR.test(norm) && norm.includes('.obsidian')) return 'obsidian'
  if (SKIP_DIR.test(norm) && norm.includes('.trash')) return 'trash'
  if (BINARY.test(norm)) return 'binary'
  if (norm.toLowerCase().endsWith('.md')) return 'keep'
  return 'other'
}

/**
 * @param text - File or item body.
 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

function slug(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

function formatDay(at: string): string {
  const stamp = Date.parse(at)
  const date = Number.isFinite(stamp) ? new Date(stamp) : new Date()
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

function splitItems(body: string): string[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const items: string[] = []
  let buf: string[] = []
  const flush = (): void => {
    const text = buf.join('\n').trim()
    buf = []
    if (text === '' || EMPTY_ITEM.test(text)) return
    items.push(text)
  }
  for (const line of lines) {
    if (/^\s*(?:[-*]|#{1,3}|\d+\.)\s+/.test(line) && buf.length > 0) flush()
    buf.push(line.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))
  }
  flush()
  return items
}

function sectionOf(heading: string): SectionDef | undefined {
  const key = heading.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim()
  return SECTIONS.find(section => section.headings.some((name) => {
    const n = name.normalize('NFD').replace(/\p{M}/gu, '')
    return key === n || key.startsWith(`${n} `)
  }))
}

function splitSections(text: string): { def: SectionDef; body: string }[] {
  const rows: { def: SectionDef; body: string }[] = []
  const parts = text.replace(/\r\n/g, '\n').split(/^#{1,3}\s+/m)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1)
    const def = sectionOf(heading)
    if (def === undefined) continue
    rows.push({ def, body })
  }
  return rows
}

function finishProposal(base: Omit<BringContextProposal, 'status' | 'blocked' | 'sensitive' | 'sensitiveWhy' | 'duplicateOf' | 'conflictQuestion' | 'uncertain'> & {
  readonly uncertain?: boolean
  readonly existing: readonly BringExistingRecord[]
}): BringContextProposal {
  const why = sensitiveWhy(base.body)
  const uncertain = base.uncertain === true || /\((?:incerto|uncertain)\)/i.test(base.body)
  const duplicate = base.existing.find(row => nearDuplicate(row.body, base.body))
  const fixed = base.existing.find(row =>
    (row.kind === 'decision' || row.kind === 'constraint') && contradicts(row.body, base.body))
  let status: BringProposalStatus = 'ready'
  if (why !== '') status = 'blocked'
  else if (fixed !== undefined) status = 'conflict'
  else if (duplicate !== undefined) status = 'duplicate'
  else if (uncertain) status = 'uncertain'
  return {
    ...base,
    uncertain,
    sensitive: why !== '',
    blocked: why !== '',
    sensitiveWhy: why,
    duplicateOf: duplicate?.id ?? '',
    conflictQuestion: fixed === undefined
      ? ''
      : `O Cofre já tem: “${fixed.body}”. A colagem diz: “${base.body}”. Qual vale?`,
    status,
  }
}

/**
 * Paste from an existing AI → typed proposals with provenance.
 * @param input - Trusted paste, provider, clock, current Cofre.
 */
export function parseBringPaste(input: {
  readonly text: string
  readonly provider: BringProvider
  readonly at: string
  readonly existing?: readonly BringExistingRecord[]
}): BringContextPreview {
  const existing = input.existing ?? []
  const provenance = `colado do ${PROVIDER_PT[input.provider]} em ${formatDay(input.at)}`
  const proposals: BringContextProposal[] = []
  let n = 0
  for (const section of splitSections(input.text)) {
    for (const body of splitItems(section.body)) {
      n += 1
      proposals.push(finishProposal({
        id: `byc-paste-${String(n)}-${slug(body)}`,
        kind: section.def.kind,
        section: section.def.label,
        body,
        provenance,
        existing,
        path: '',
        hash: contentHash(body),
      }))
    }
  }
  return { source: 'paste', proposals, ignored: [] }
}

/**
 * Classify a vault walk: keep .md, list ignored .obsidian / .trash / binaries.
 * @param paths - Relative paths from the chosen folder.
 */
export function listVaultFolderFiles(paths: readonly string[]): {
  readonly keep: readonly string[]
  readonly ignored: readonly BringIgnored[]
} {
  const keep: string[] = []
  const ignored: BringIgnored[] = []
  for (const path of paths) {
    const kind = classifyVaultPath(path)
    if (kind === 'keep') keep.push(path.replace(/\\/g, '/'))
    else if (kind === 'obsidian') ignored.push({ path, why: 'Pasta .obsidian ignorada.' })
    else if (kind === 'trash') ignored.push({ path, why: 'Lixeira .trash ignorada.' })
    else if (kind === 'binary') ignored.push({ path, why: `Anexo ignorado: ${path}. Importe só o texto da nota.` })
    else ignored.push({ path, why: `Arquivo ignorado: ${path}. Só notas .md entram.` })
  }
  return { keep, ignored }
}

/**
 * Obsidian / .md folder via the existing markdown adapter. Reimport is path+hash.
 * @param input - Files, prior hashes, current Cofre.
 */
export function previewBringVault(input: {
  readonly files: readonly BringVaultFile[]
  readonly prior?: readonly BringPriorHash[]
  readonly existing?: readonly BringExistingRecord[]
}): BringContextPreview {
  const existing = input.existing ?? []
  const prior = new Map((input.prior ?? []).map(row => [row.path.replace(/\\/g, '/'), row.hash]))
  const walk = listVaultFolderFiles(input.files.map(file => file.path))
  const ignored = [...walk.ignored]
  const byPath = new Map(input.files.map(file => [file.path.replace(/\\/g, '/'), file]))
  const mdFiles: ImportFile[] = []
  for (const path of walk.keep) {
    const file = byPath.get(path)
    if (file === undefined) continue
    if (file.text.length > MAX_NOTE) {
      ignored.push({ path, why: 'Nota grande demais (limite 200 KB).' })
      continue
    }
    const hash = contentHash(file.text)
    if (prior.get(path) === hash) {
      ignored.push({ path, why: 'Sem mudança (mesmo caminho e hash).' })
      continue
    }
    mdFiles.push({ name: path, text: file.text })
  }
  const parsed = mdFiles.length === 0
    ? { accepted: [] as { body: string; externalId: string }[], rejected: [] as { externalId: string; why?: string }[] }
    : markdownAdapter.parse(mdFiles)
  for (const row of parsed.rejected) {
    ignored.push({ path: row.externalId.replace(/^md:/, ''), why: row.why ?? 'Ignorado.' })
  }
  const proposals = parsed.accepted.map((row) => {
    const path = row.externalId.replace(/^md:/, '')
    return finishProposal({
      id: `byc-vault-${contentHash(path)}-${contentHash(row.body)}`,
      kind: 'memory',
      section: 'Vault',
      body: row.body,
      provenance: `vault: ${path}`,
      existing,
      path,
      hash: contentHash(row.body),
    })
  })
  return { source: 'vault', proposals, ignored }
}

export interface BringApplyItem {
  readonly id: string
  readonly action: BringApplyAction
  readonly body?: string
}

/**
 * Map Cofre rows for comparison, excluding the importer's trailing source annotation.
 * Host must pass this instead of `existing: []`.
 * @param records - Active vault rows the actor can read.
 * @returns Rows ready for {@link parseBringPaste} `existing`.
 */
export function vaultToBringExisting(
  records: readonly { readonly id: string; readonly kind: string; readonly body: string }[],
): BringExistingRecord[] {
  return records
    .filter(row => row.id !== '' && row.body.trim() !== '')
    .map(row => ({ id: row.id, kind: row.kind,
      body: row.body.replace(/\n\n\((?:colado do (?:ChatGPT|Claude|Gemini|Grok|outra IA) em \d{2}\/\d{2}|vault: [^\n]+)\)\s*$/u, '') }))
}

/**
 * Lumen / Anvil RPC name for {@link decideBringApply}.
 * @param preview - Last preview.
 * @param items - Person choices.
 * @returns Reviewed rows; sensitive bodies, unresolved conflicts and discards never write.
 */
export function applyContextProposals(
  preview: BringContextPreview,
  items: readonly BringApplyItem[],
): BringContextProposal[] {
  return decideBringApply(preview, items)
}

/**
 * Recheck explicit edits before applying the preview's default sensitive-data block.
 * @param preview - Proposals shown to the person.
 * @param items - Explicit review actions and replacement bodies.
 * @returns Accepted non-sensitive rows, including edits that remove sensitive content.
 */
export function decideBringApply(
  preview: BringContextPreview,
  items: readonly BringApplyItem[],
): BringContextProposal[] {
  const choice = new Map(items.map(row => [row.id, row]))
  const out: BringContextProposal[] = []
  for (const proposal of preview.proposals) {
    const pick = choice.get(proposal.id)
    if (pick === undefined || pick.action === 'discard') continue
    if (proposal.blocked && pick.action !== 'edit') continue
    if (proposal.status === 'conflict') continue
    if (proposal.status === 'duplicate') continue
    if (pick.action === 'edit' && (pick.body === undefined || pick.body.trim() === '')) continue
    const body = pick.body !== undefined && pick.body.trim() !== '' ? pick.body.trim() : proposal.body
    if (sensitiveWhy(body) !== '') continue
    out.push({
      ...proposal,
      body,
      blocked: false,
      sensitive: false,
      sensitiveWhy: '',
      status: pick.action === 'private' ? proposal.status : 'ready',
    })
  }
  return out
}

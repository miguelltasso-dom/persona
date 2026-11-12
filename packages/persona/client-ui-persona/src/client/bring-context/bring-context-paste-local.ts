/**
 * Client-local mirror of persona-core bring-context paste helpers (bundle purity).
 * Host RPC is canonical when available; this path supports offline organize + createVaultRecord fallback.
 */

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
const CREDENTIAL = /(?:sk-[A-Za-z0-9_\-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._\-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|xai-[A-Za-z0-9]{20,})/
const SECRET = /(cookie|authorization|api[-_]?key|secret|token|passwd|password|bearer\s+[a-z0-9._\-]+)/i

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

export interface BringIgnored {
  readonly path: string
  readonly why: string
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

export interface BringApplyItem {
  readonly id: string
  readonly action: BringApplyAction
  readonly body?: string
}

function looksLikeCredential(body: string): boolean {
  return CREDENTIAL.test(body)
}

function looksLikeSecret(body: string): boolean {
  return SECRET.test(body) || looksLikeCredential(body)
}

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(part => part.length > 2))
}

function nearDuplicate(a: string, b: string): boolean {
  const left = tokens(a)
  const right = tokens(b)
  if (left.size === 0 || right.size === 0) return false
  let inter = 0
  for (const token of left) if (right.has(token)) inter += 1
  const union = left.size + right.size - inter
  return inter / union >= 0.8
}

const NEGATION = /\b(não|nao|never|not)\b/i

function contradicts(a: string, b: string): boolean {
  if (!nearDuplicate(a.replace(NEGATION, ''), b.replace(NEGATION, ''))) return false
  return NEGATION.test(a) !== NEGATION.test(b)
}

/** Stable id fingerprint for client preview (host uses SHA-256). */
export function contentHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0').repeat(3).slice(0, 24)
}

/**
 * @param locale - UI locale.
 */
export function bringContextPrompt(locale: BringLocale = 'pt'): string {
  return locale === 'en' ? BRING_CONTEXT_PROMPT_EN : BRING_CONTEXT_PROMPT_PT
}

/**
 * @param text - Candidate body.
 */
export function sensitiveWhy(text: string): string {
  if (looksLikeCredential(text) || looksLikeSecret(text)) return 'Parece senha, token ou chave. Bloqueado por padrão.'
  if (CPF.test(text)) return 'Parece CPF ou documento. Bloqueado por padrão.'
  if (CARD.test(text)) return 'Parece número de cartão. Bloqueado por padrão.'
  if (BANK.test(text) && /\d/.test(text)) return 'Parece dado bancário. Bloqueado por padrão.'
  return ''
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
      : `A Memória da empresa já tem: “${fixed.body}”. A colagem diz: “${base.body}”. Qual vale?`,
    status,
  }
}

/**
 * Paste from an existing AI → typed proposals with provenance.
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
 * Review decisions. Blocked/conflict/discard never write. Edit uses the new body.
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
    if (proposal.blocked) continue
    if (proposal.status === 'conflict') continue
    if (proposal.status === 'duplicate') continue
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

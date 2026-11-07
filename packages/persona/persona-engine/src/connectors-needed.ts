/**
 * HT-10 (D-084): which of the person's connectors a request needs. Pure and deterministic: no model, no I/O, no clock. The sibling of
 * `wantsWork` for the question "does this ask need the Gmail, the Drive, the calendar?". Contract: persona-spec/contracts/connectors-needed.md.
 *
 * Why it exists: the person's connectors are AVAILABLE to the personas (D-084) and an explicit request ("envie um email para X") already
 * authorises the use for THAT request; but every connector a call loads costs tokens on every call (~+1 500 for one small connector,
 * 377 000 for all of them: reports/iso-dry-product.json). So the runner loads only what the request needs, and something has to decide
 * what that is, cheaply, testably and without a model.
 *
 * Rules (all deterministic):
 *  - the text is the PERSON'S message only: the type is a brand only {@link asHumanText} makes, and the host calls it with the person's own
 *    words, never with text read from ingested content (a connector's description, a file, an email). The function never reads a
 *    connector's description or tool names either (untrusted text from the CLI): only its NAME.
 *  - a connector is chosen when its brand appears as a whole word (`named`), or when a phrase of its kind does (`intent`);
 *  - an intent kind with one connector chooses it, with several asks (`ambiguous`), with none says so (`missing`);
 *  - a negation up to 3 words before a mention cancels it ("não envie email", "sem usar o Gmail");
 *  - never more than {@link MAX_CONNECTORS_PER_CALL} (cost); never something that is not in `available`.
 * The lexicon is closed on purpose and avoids words that mean something else in the product ("canal" is a Persona channel, "pedido" is
 * a request of the person): a chat connector is only ever chosen by its NAME. Growing it is additive and tested.
 */

export type ConnectorKind = 'mail' | 'calendar' | 'files' | 'code' | 'chat' | 'tasks' | 'deploy' | 'db' | 'shop' | 'other'

/** A connector the person has, as the bridge reads it (name and id only). */
export interface AvailableConnector {
  readonly id: string
  readonly name: string
}

declare const HUMAN: unique symbol
/** The words of the PERSON. The only way to get one is {@link asHumanText}, which the host calls with the person's own message. */
export type HumanText = string & { readonly [HUMAN]: true }

/**
 * Mark a string as written by the person. The host must NEVER call this with text read from a file, an email, a web page, a connector's
 * description or any other ingested content: that text is data, not a request.
 * @param text - The person's message.
 */
export function asHumanText(text: string): HumanText {
  return text as HumanText
}

export const MAX_CONNECTORS_PER_CALL = 3

export interface ConnectorChoice {
  readonly id: string
  readonly rule: 'named' | 'intent'
  readonly kind: ConnectorKind
}

export interface ConnectorsNeeded {
  /** In the order of `available`, at most {@link MAX_CONNECTORS_PER_CALL}. */
  readonly chosen: readonly ConnectorChoice[]
  /** The request names a kind with several connectors: the host asks once ("Gmail ou Outlook?") and remembers. */
  readonly ambiguous: readonly { readonly kind: ConnectorKind; readonly candidates: readonly string[] }[]
  /** The request needs a kind the person has no connector for: the persona says so instead of guessing. */
  readonly missing: readonly ConnectorKind[]
  /** There were more than {@link MAX_CONNECTORS_PER_CALL}: only the first ones are loaded and the person is asked to narrow it. */
  readonly capped: boolean
}

/** Known brands (a distinctive word of the connector's name) → kind. Anything else is `other` and is only ever chosen by name. */
const BRANDS: Readonly<Record<string, ConnectorKind>> = {
  gmail: 'mail', outlook: 'mail', mail: 'mail', fastmail: 'mail', proton: 'mail', zoho: 'mail',
  calendar: 'calendar', calendly: 'calendar', cal: 'calendar',
  drive: 'files', dropbox: 'files', onedrive: 'files', sharepoint: 'files', box: 'files', notion: 'files', confluence: 'files', docs: 'files', sheets: 'files',
  github: 'code', gitlab: 'code', bitbucket: 'code',
  slack: 'chat', discord: 'chat', teams: 'chat', telegram: 'chat', whatsapp: 'chat',
  linear: 'tasks', jira: 'tasks', asana: 'tasks', trello: 'tasks', clickup: 'tasks',
  vercel: 'deploy', netlify: 'deploy', heroku: 'deploy', render: 'deploy', fly: 'deploy',
  supabase: 'db', postgres: 'db', mysql: 'db', mongodb: 'db', firebase: 'db', neon: 'db', planetscale: 'db',
  shopify: 'shop', woocommerce: 'shop', bigcommerce: 'shop',
}

/** Words of a connector's name that say nothing about which service it is. */
const NOISE = new Set(['claude', 'ai', 'mcp', 'server', 'connector', 'conector', 'by', 'the', 'google', 'microsoft', 'apple', 'for', 'app', 'api', 'com', 'org', 'net', 'io', 'www', 'dev', 'co'])

/** Intent phrases (accent-free, lowercase) per kind. `chat` has none on purpose: "canal" is a Persona channel. */
const INTENT: Readonly<Partial<Record<ConnectorKind, readonly string[]>>> = {
  mail: ['email', 'emails', 'e mail', 'e mails', 'mail', 'caixa de entrada', 'inbox', 'correio eletronico', 'rascunho de email', 'responder o email', 'responda o email'],
  calendar: ['agenda', 'calendario', 'calendar', 'reuniao', 'reunioes', 'meeting', 'meetings', 'compromisso', 'compromissos', 'horario livre', 'evento no calendario', 'marcar uma reuniao'],
  files: ['drive', 'planilha', 'planilhas', 'spreadsheet', 'documento no drive', 'pasta compartilhada', 'arquivo na nuvem', 'google docs', 'google sheets', 'google slides'],
  code: ['repositorio', 'repositorios', 'repo', 'repository', 'pull request', 'pull requests', 'commit', 'commits', 'branch', 'issue do github'],
  deploy: ['deploy', 'deployment', 'colocar no ar', 'publicar o site'],
  db: ['banco de dados', 'database', 'sql', 'migracao do banco'],
  shop: ['minha loja', 'loja virtual', 'estoque', 'inventory', 'catalogo de produtos', 'produtos da loja', 'pedidos da loja', 'pedidos online'],
}

const NEGATIONS = new Set(['nao', 'nunca', 'sem', 'not', 'dont', 'never', 'without', 'evite', 'evitar', 'jamais'])
const NEGATION_WINDOW = 3

function fold(text: string): string {
  return text
    // an address or a link is DATA in the request, not a service the person asked to use ("para ana@gmail.com" is not "use o Gmail")
    .replace(/\S+@\S+/gu, ' ')
    .replace(/https?:\/\/\S+|www\.\S+/gu, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/don['’]t/gu, 'dont')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
}

/** Whole-word/phrase positions of `phrase` in the folded words, as the index of its first word. */
function positionsOf(words: readonly string[], phrase: string): number[] {
  const parts = phrase.split(' ')
  const found: number[] = []
  for (let at = 0; at + parts.length <= words.length; at += 1) {
    if (parts.every((part, offset) => words[at + offset] === part)) found.push(at)
  }
  return found
}

function negated(words: readonly string[], at: number): boolean {
  for (let back = 1; back <= NEGATION_WINDOW && at - back >= 0; back += 1) {
    if (NEGATIONS.has(words[at - back] ?? '')) return true
  }
  return false
}

interface Profile {
  readonly connector: AvailableConnector
  readonly kind: ConnectorKind
  /** The distinctive words of its name. */
  readonly brand: readonly string[]
}

function profileOf(connector: AvailableConnector): Profile {
  const brand = fold(connector.name).split(' ').filter(word => word.length > 2 && !NOISE.has(word))
  const known = brand.map(word => BRANDS[word]).find((kind): kind is ConnectorKind => kind !== undefined)
  return { connector, kind: known ?? 'other', brand }
}

/**
 * Which connectors a request needs.
 * @param text - The person's message ({@link asHumanText}).
 * @param available - The connectors the person has (names and ids only).
 * @returns The connectors to load for this call, plus what is ambiguous or missing.
 */
export function connectorsNeededBy(text: HumanText, available: readonly AvailableConnector[]): ConnectorsNeeded {
  const words = fold(text).split(' ').filter(word => word !== '')
  const profiles = available.map(profileOf)
  const excluded = new Set<string>()
  const named = new Set<string>()

  for (const profile of profiles) {
    for (const word of profile.brand) {
      for (const at of positionsOf(words, word)) {
        if (negated(words, at)) excluded.add(profile.connector.id)
        else named.add(profile.connector.id)
      }
    }
  }
  for (const id of excluded) named.delete(id)

  const intents = new Set<ConnectorKind>()
  for (const [kind, phrases] of Object.entries(INTENT) as [ConnectorKind, readonly string[]][]) {
    for (const phrase of phrases) {
      for (const at of positionsOf(words, phrase)) {
        if (!negated(words, at)) intents.add(kind)
      }
    }
  }

  const chosen = new Map<string, ConnectorChoice>()
  for (const profile of profiles) {
    if (named.has(profile.connector.id)) chosen.set(profile.connector.id, { id: profile.connector.id, rule: 'named', kind: profile.kind })
  }
  const ambiguous: { kind: ConnectorKind; candidates: string[] }[] = []
  const missing: ConnectorKind[] = []
  for (const kind of intents) {
    // A connector of this kind named in the same request already answers it.
    if ([...chosen.values()].some(choice => choice.kind === kind)) continue
    const candidates = profiles.filter(profile => profile.kind === kind && !excluded.has(profile.connector.id))
    if (candidates.length === 1 && candidates[0] !== undefined) chosen.set(candidates[0].connector.id, { id: candidates[0].connector.id, rule: 'intent', kind })
    else if (candidates.length > 1) ambiguous.push({ kind, candidates: candidates.map(profile => profile.connector.id) })
    else missing.push(kind)
  }

  const ordered = available.flatMap(connector => chosen.get(connector.id) ?? [])
  return {
    chosen: ordered.slice(0, MAX_CONNECTORS_PER_CALL),
    ambiguous,
    missing,
    capped: ordered.length > MAX_CONNECTORS_PER_CALL,
  }
}

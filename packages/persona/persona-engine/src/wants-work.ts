/**
 * Whether a #geral / DM line should become a Ticket (not a talk reply).
 * Agência dogfood 0 execs: "Monte a equipe…" missed the old host regex.
 * D-073 (Tally): "Pesquise 3 concorrentes" was a chat line, not work, and "O que você pode fazer por mim?"
 * was work because it contains "fazer". The rules now decide in this order:
 *   1. a polite request that leads to a work verb ("pode criar…", "can you review…") is work, even as a question;
 *   2. a question ("qual…", "quem…", "what…", anything ending in "?") is conversation, whatever words it contains;
 *   3. otherwise the line is work when it asks for a deliverable ("me dê um resumo…"), starts a clause with a work
 *      verb ("Pesquise…", "Resuma… e proponha…", "Research 3 competitors") or carries a word of the original list.
 * `tests/wants-work-suggestions.spec.ts` runs every suggestion the UI offers through it.
 */

/** The original substring list, kept as it was: a statement that carries one of these is work. */
const WORK = new RegExp(
  [
    'preciso',
    'implement',
    'cri[ae]',
    'fa[cç]a',
    'adicion',
    'consert',
    'corrig',
    'atualiz',
    'escrev',
    'readme',
    'deploy',
    'faz(er)?\\b',
    'tarefa',
    'ticket',
    'aprov',
    'mont[aeo]',
    'organiz',
    'resum[aei]',
    'proponh',
    'propor\\b',
    'entreg[aeu]',
    'planej',
    'public[ae]',
    'contrat[ae]',
    'aloqu',
    'desenh[ae]',
  ].join('|'),
  'iu',
)

/**
 * Work verbs (pt-BR and en): imperative, plural imperative or infinitive. Whole words only, so "resumo"
 * (a noun) and "criança" do not count.
 */
const VERB = new RegExp(
  `(?:${[
    // pt-BR
    'pesquis(?:e|em|ar)', 'compar(?:e|em|ar)', 'levant(?:e|em|ar)', 'procur(?:e|em|ar)', 'busqu(?:e|em)', 'buscar',
    'investig(?:ue|uem|ar)', 'analis(?:e|em|ar)', 'verifiqu(?:e|em)', 'verificar', 'encontr(?:e|em|ar)', 'mont(?:e|em|ar)',
    'prepar(?:e|em|ar)', 'escrev(?:a|am|er)', 'cri(?:e|em|ar)', 'revis(?:e|em|ar)', 'respond(?:a|am|er)',
    'list(?:e|em|ar)', 'resum(?:a|am|e|em|ir)', 'propon(?:ha|ham)', 'propor', 'sugir(?:a|am)', 'sugerir',
    'elabor(?:e|em|ar)', 'ger(?:e|em|ar)', 'defin(?:a|am|ir)', 'document(?:e|em|ar)', 'traduz(?:a|am|ir)',
    'calcul(?:e|em|ar)', 'agend(?:e|em|ar)', 'envi(?:e|em|ar)', 'le(?:ia|iam|r)', 'escolh(?:a|am|er)',
    'otimiz(?:e|em|ar)', 'automatiz(?:e|em|ar)', 'refator(?:e|em|ar)', 'execut(?:e|em|ar)', 'instal(?:e|em|ar)',
    'configur(?:e|em|ar)', 'publiqu(?:e|em)', 'monitor(?:e|em|ar)', 'acompanh(?:e|em|ar)', 'atualiz(?:e|em|ar)',
    'organiz(?:e|em|ar)', 'fa(?:ça|çam|zer)', 'adicion(?:e|em|ar)', 'consert(?:e|em|ar)', 'corrij(?:a|am)',
    'corrigir', 'implement(?:e|em|ar)', 'entreg(?:ue|uem|ar)', 'planej(?:e|em|ar)', 'contrat(?:e|em|ar)',
    'desenh(?:e|em|ar)', 'aprov(?:e|em|ar)', 'apont(?:e|em|ar)', 'ajud(?:e|em|ar)', 'mape(?:ie|iem|ar)',
    'classifiqu(?:e|em)', 'classificar', 'compil(?:e|em|ar)', 'extra(?:ia|iam|ir)', 'anot(?:e|em|ar)',
    'rascunh(?:e|em|ar)', 'redij(?:a|am)', 'redigir', 'proponh(?:a|am)', 'pe(?:ça|çam|dir)', 'solicit(?:e|em|ar)',
    'mand(?:e|em|ar)', 'junt(?:e|em|ar)',
    // en
    'research', 'compare', 'find', 'search', 'look\\s+up', 'investigate', 'analy[sz]e', 'verify', 'check', 'prepare',
    'write', 'create', 'build', 'make', 'draft', 'review', 'summari[sz]e', 'list', 'plan', 'propose', 'suggest',
    'organi[sz]e', 'fix', 'implement', 'add', 'update', 'deploy', 'send', 'schedule', 'translate', 'calculate',
    'generate', 'set\\s+up', 'answer', 'reply', 'read', 'design', 'define', 'document', 'automate', 'monitor',
    'execute', 'run', 'publish', 'hire', 'approve', 'deliver', 'extract', 'classify', 'map', 'outline', 'rewrite',
  ].join('|')})(?![\\p{L}])`,
  'iu',
)

/** "Give me a summary" shapes: a request for a deliverable, not a chat. */
const DELIVERABLE_ASK = new RegExp(
  '^(?:me\\s+d[êe]|me\\s+mostre|me\\s+envie|me\\s+passe|give\\s+me|show\\s+me|send\\s+me)\\s+(?:um|uma|o|a|the|an?)?\\s*'
  + '(?:resumo|relat[óo]rio|lista|plano|vis[ãa]o|panorama|status|an[áa]lise|compara[çc][ãa]o|summary|report|list|plan|overview|analysis|comparison)',
  'iu',
)

/** What may stand before the verb: a name or "equipe,", "por favor", a polite lead. */
const LEAD = new RegExp(
  '^(?:@\\S+\\s+|[\\p{L}][\\p{L}\\s]{0,24},\\s*)?'
  + '(?:(?:por\\s+favor|please|favor)\\s*[,:]?\\s*)?'
  + '(?:(?:voc[êe]\\s+)?(?:pode(?:ria|m)?|consegue(?:ria)?|conseguem|can\\s+you|could\\s+you|would\\s+you|will\\s+you)\\s+)?',
  'iu',
)

const POLITE = /\b(?:pode|poderia|podem|consegue|conseguiria|conseguem|can\s+you|could\s+you|would\s+you|will\s+you)\b/iu

const QUESTION_START = new RegExp(
  '^(?:qual|quais|quem|quando|onde|como|por\\s*que|porque|o\\s+que|que\\b|quanto|quantos|quantas|quanta|ser[áa]\\b'
  + '|existe|h[áa]\\b|tem\\b|t[êe]m\\b|d[áa]\\s+(?:para|pra)|what|who|whom|when|where|why|how|which|whose'
  + '|is\\b|are\\b|do\\b|does\\b|did\\b|will\\b|should\\b|can\\s+we|could\\s+we)',
  'iu',
)

/** "I want to know…" is a question in disguise. */
const WANTS_TO_KNOW = /^(?:quero|queria|gostaria\s+de|preciso|i\s+(?:want|need)\s+to|i'd\s+like\s+to)\s+(?:saber|entender|know|understand)/iu

const GREETING = /^(oi|ol[aá]|e a[ií]|fala|hey|obrigad[oa]|valeu|beleza|ok|blz|👍|🙏)\b/iu

const CLAUSE_SPLIT = /(?:[.;:!]\s+|\s+(?:e|and|then|depois|ent[ãa]o)\s+)/iu

function startsWithVerb(clause: string): boolean {
  const cleaned = clause.trim().replace(/^(?:por\s+favor|please)\s*[,:]?\s*/iu, '')
  const match = VERB.exec(cleaned)
  return match !== null && match.index === 0
}

/** A work verb at the start of the text or of a clause ("… e proponha …", "…. Monte …"). */
function verbStartsClause(text: string): boolean {
  return text.split(CLAUSE_SPLIT).some(startsWithVerb)
}

function isQuestion(text: string): boolean {
  if (WANTS_TO_KNOW.test(text)) return true
  if (/[?？]\s*$/u.test(text)) {
    // "Aprovar o deploy em staging?": a request in a question tone still starts with a work verb
    if (startsWithVerb(text)) return false
    // "Resuma o Cofre. Quem é o responsável?": an earlier sentence that asks for work wins over the closing question
    const sentences = text.split(/(?<=[.!])\s+/u)
    return !(sentences.length > 1 && sentences.slice(0, -1).some(startsWithVerb))
  }
  if (!QUESTION_START.test(text)) return false
  // "Como combinado, monte a equipe": an interrogative opener followed by a work verb is a request, not a question
  return !text.split(/[,;:]\s*/u).slice(1).some(verbStartsClause)
}

/**
 * @param text - Human message body.
 * @returns True when Coordination must accept a Ticket (executor / motor).
 */
export function wantsWork(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  const lead = LEAD.exec(trimmed)
  const rest = lead === null ? trimmed : trimmed.slice(lead[0].length)
  // 1. a polite request that leads to a work verb is work, even phrased as a question ("Pode criar o filtro?")
  if (lead !== null && POLITE.test(lead[0]) && startsWithVerb(rest)) return true
  // "preciso de um README?" stays an ask (the original rule); "preciso saber…" is a question
  if (/^preciso\b/iu.test(rest) && !WANTS_TO_KNOW.test(rest)) return true
  // 2. a question is conversation, whatever words it contains
  if (isQuestion(rest) || isQuestion(trimmed)) return false
  // 3. deliverable asks, work verbs at the start of a clause, then the original word list
  if (DELIVERABLE_ASK.test(rest)) return true
  if (verbStartsClause(rest)) return true
  return WORK.test(trimmed)
}

/** Ledger / triage: why ingest stayed on talk. */
export type WorkSkipReason = 'empty' | 'courtesy' | 'not-work'

/**
 * @param text - Human message body.
 * @returns Skip tag when {@link wantsWork} is false.
 */
export function workSkipReason(text: string): WorkSkipReason | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return 'empty'
  if (wantsWork(trimmed)) return undefined
  return GREETING.test(trimmed) ? 'courtesy' : 'not-work'
}

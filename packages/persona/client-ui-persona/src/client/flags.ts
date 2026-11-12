/**
 * Leitor ÚNICO das flags do cliente (D-077/D-090; Keel, FLAGS-ON-1). Até a v1.1 cada recurso novo nascia DESLIGADO atrás de uma flag própria, com o seu
 * leitor (`*-flag.ts`); no app do Miguel TODAS as do escopo da v1.1 vêm LIGADAS por padrão. Cada `*-flag.ts` continua exportando a mesma chave e a mesma função,
 * agora um invólucro fino de {@link readFlag}: nenhum importador mudou.
 *
 * PRECEDÊNCIA (a primeira que existir):
 *  1. `localStorage[chave]`: `'0'`/`'false'` desliga, `'1'`/`'true'` liga (a escolha explícita da pessoa, da varredura da Muse ou de um `addInitScript`);
 *  2. `window.__PERSONA_FLAGS__[nome]` (ou `[chave]`): `false` desliga, `true` liga;
 *  3. o padrão da tabela {@link FLAGS}: LIGADO, salvo o que espera uma decisão (ver `persona-spec/contracts/flags-defaults.md`).
 * Storage bloqueado (janela privada, prévia) ou sem `window` = não há escolha explícita: vale o padrão (LIGADO). Nunca lança.
 *
 * NÃO existe nada específico de teste aqui: a faixa de testes chama {@link setFlagDefaults}`(false)` num setup (`scripts/test-dom-environment.ts`) para que as
 * specs escritas quando tudo nascia desligado continuem valendo; quem prova o padrão de produção chama `setFlagDefaults(undefined)`.
 */

export type FlagName =
  | 'personaAsk'
  | 'actionPreview'
  | 'bubbles'
  | 'houseDecor'
  | 'figurinhas'
  | 'workingControl'
  | 'teamwork'
  | 'lampLight'
  | 'nextStep'
  | 'navPlaces'
  | 'taskProposal'
  | 'settingsPersonas'
  | 'engineEffort'
  | 'approvalsInboxV2'
  | 'remoteTeamTab'
  | 'channelSections'
  | 'toolsCatalog'

export interface FlagSpec {
  /** A chave do `localStorage` (e do `window.__PERSONA_FLAGS__`, que também aceita o nome curto). */
  readonly key: string
  /** Entra LIGADA na v1.1? */
  readonly defaultOn: boolean
}

/**
 * A tabela dos padrões da v1.1. Dona e justificativa de cada linha: `persona-spec/contracts/flags-defaults.md`. Todas LIGADAS: a `actionPreview` virou ON no D-095 (o HT-9 foi
 * PROVADO e a v1.1 sai com o ENVIO por permissão).
 */
export const FLAGS: Readonly<Record<FlagName, FlagSpec>> = {
  personaAsk: { key: 'persona.flag.personaAsk', defaultOn: true },
  actionPreview: { key: 'persona.flag.actionPreview', defaultOn: true },
  bubbles: { key: 'persona.flag.bubbles', defaultOn: true },
  houseDecor: { key: 'persona.flag.houseDecor', defaultOn: true },
  figurinhas: { key: 'persona.flag.figurinhas', defaultOn: true },
  workingControl: { key: 'persona.flag.workingControl', defaultOn: true },
  teamwork: { key: 'persona.flag.teamwork', defaultOn: true },
  lampLight: { key: 'persona.flag.lampLight', defaultOn: true },
  // Muse 06:15 (rodada 5): NextStepBar fica DESLIGADA no corte; volta na v1.2 com os estados interceptados.
  nextStep: { key: 'persona.flag.nextStep', defaultOn: false },
  navPlaces: { key: 'persona.flag.navPlaces', defaultOn: true },
  taskProposal: { key: 'persona.flag.taskProposal', defaultOn: true },
  settingsPersonas: { key: 'persona.flag.settingsPersonas', defaultOn: true },
  // Atlas/Keel 06:21: EFF-1 NÃO sai desligado da v1.1 (o Miguel pediu). Ligada por padrão.
  engineEffort: { key: 'persona.flag.engineEffort', defaultOn: true },
  // Aprovações em 2 painéis (Ember): a única com a chave FORA do prefixo `persona.flag.` (nasceu antes da convenção); entra aqui para a faixa de testes a cobrir.
  approvalsInboxV2: { key: 'persona.approvalsInbox.v2', defaultOn: true },
  // Cena 20 (Muse) + decisão do Keel: a aba Membros só existe com a equipe remota ligada. Padrão DESLIGADA na v1.1 (deploy externo E11 pendente).
  remoteTeamTab: { key: 'persona.flag.remoteTeamTab', defaultOn: false },
  // Item 22 (Muse §22): equipes como seções, canais múltiplos e cabeçalho do canal. DESLIGADA até a Muse e a Ember aceitarem (ordem do Keel, 12/11).
  channelSections: { key: 'persona.flag.channelSections', defaultOn: false },
  // Item 26 (Muse §26 + decisão do Keel/Muse 12/11): a aba Configurações › Ferramentas só liga quando existir o fluxo "Conectar" (26.5): nenhum cartão morto ao Miguel.
  toolsCatalog: { key: 'persona.flag.toolsCatalog', defaultOn: false },
}

export const FLAG_NAMES = Object.keys(FLAGS) as readonly FlagName[]

/**
 * O override mora em `globalThis` (e não numa variável do módulo): uma spec que faz `vi.resetModules()` recarrega este arquivo, e o padrão que o setup da faixa de testes
 * escolheu não pode se perder no reload. `Symbol.for` dá a mesma chave em qualquer cópia do módulo.
 */
const OVERRIDE_KEY = Symbol.for('persona.client.flagDefaults')
type OverrideHolder = { [OVERRIDE_KEY]?: boolean }

/**
 * Troca o padrão de TODAS as flags (sem escolha explícita). Para a faixa de testes e para cenários de prova; o produto nunca chama.
 * @param value - `false`/`true` força o padrão; `undefined` volta aos padrões da tabela.
 */
export function setFlagDefaults(value: boolean | undefined): void {
  const holder = globalThis as OverrideHolder
  if (value === undefined) delete holder[OVERRIDE_KEY]
  else holder[OVERRIDE_KEY] = value
}

function explicitBoolean(raw: unknown): boolean | undefined {
  if (raw === true || raw === '1' || raw === 'true') return true
  if (raw === false || raw === '0' || raw === 'false') return false
  return undefined
}

/**
 * A flag está ligada? Ver a precedência no topo do arquivo. Nunca lança.
 * @param name - O nome curto da flag.
 */
export function readFlag(name: FlagName): boolean {
  const spec = FLAGS[name]
  try {
    const stored = explicitBoolean(globalThis.localStorage?.getItem(spec.key))
    if (stored !== undefined) return stored
  } catch {
    /* storage bloqueado: não há escolha explícita, segue para o padrão */
  }
  try {
    const flags = (globalThis as { window?: { __PERSONA_FLAGS__?: Readonly<Record<string, unknown>> } }).window?.__PERSONA_FLAGS__
    if (flags !== undefined && flags !== null) {
      const fromWindow = explicitBoolean(flags[name] ?? flags[spec.key])
      if (fromWindow !== undefined) return fromWindow
    }
  } catch {
    /* janela sem acesso às flags: segue para o padrão */
  }
  return (globalThis as OverrideHolder)[OVERRIDE_KEY] ?? spec.defaultOn
}

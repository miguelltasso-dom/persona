/**
 * EFF-1 — Modelo puro de Modelo e Esforço por persona (`persona-spec/design/EFFORT-SPEC.md`, D-088).
 * A pessoa escolhe qualquer modelo e qualquer nível que o motor aceita; o padrão de toda persona nova é
 * "Padrão do motor" (`null` em modelo e em esforço). Nenhum selo "Recomendado".
 * Os níveis têm o NOME NATIVO do motor (o que a própria CLI chama: low, medium, high, xhigh, max…), em minúsculas e sem tradução
 * (pedido do Miguel, 07/11); a dica curta em português vem embaixo de cada nível conhecido.
 */

import type { ConnectionView, EngineModelView } from '@deepseek-ai/dsh-persona-host/types'
import { modelLabel } from '../team/engine-label.ts'

/** Sentinela de UI para `null` ("Padrão do motor", sem `--model` nem `--effort`). */
export const ENGINE_DEFAULT_ID = '__default__'

/** O nome NATIVO de um nível de esforço, como o motor o chama (minúsculas): `low`, `medium`, `high`, `xhigh`, `max`, `minimal`, `ultra`… */
export type EffortName = string

export type ModelChoiceId = typeof ENGINE_DEFAULT_ID | string
export type EffortChoiceId = typeof ENGINE_DEFAULT_ID | EffortName

/** Do mais leve ao mais pesado, só para o ajuste quando o modelo muda (os nomes nativos que se conhecem; um nome fora da lista não se compara). */
export const EFFORT_LEVEL_ORDER: readonly EffortName[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']

/** Os níveis que têm dica curta em `locale-sources/profile.*.json` (`engine.effortHint.<nível>`); qualquer outro nome aparece só com o nome. */
const KNOWN_EFFORT_HINTS: ReadonlySet<string> = new Set(EFFORT_LEVEL_ORDER)

export type TranslateFn = (key: string, params?: Readonly<Record<string, string>>) => string

/**
 * @param value - Qualquer valor vindo do host ou do armazenamento.
 * @returns O nome nativo normalizado (sem espaços, em minúsculas), ou `undefined` quando não é um nome.
 */
export function normalizeEffortName(value: unknown): EffortName | undefined {
  if (typeof value !== 'string') return undefined
  const name = value.trim().toLowerCase()
  return name === '' ? undefined : name
}

/** @returns Verdadeiro quando o valor é um nome de nível (qualquer nome que o motor tenha mandado). */
export function isValidEffortLevel(value: unknown): value is EffortName {
  return normalizeEffortName(value) !== undefined
}

/** O nome nativo na tela: `max`, `xhigh`… (nunca traduzido). Usado no chip, no aviso e nas linhas. */
export function nativeEffortName(level: EffortName): string {
  return level.trim().toLowerCase()
}

/** Rótulo do nível: o nome nativo do motor; "Padrão do motor" quando não há nível (`null`). */
export function effortLevelLabel(t: TranslateFn, level: EffortName | null): string {
  if (level === null) return t('engine.effortLevel.default')
  return nativeEffortName(level)
}

/**
 * Dica curta de uma linha por nível (`EFFORT-SPEC.md` §2).
 * @returns O texto, ou `undefined` para um nome que o host mandou e não tem dica (aparece só com o nome, sem inventar).
 */
export function effortLevelHint(t: TranslateFn, level: EffortName | null): string | undefined {
  if (level === null) return t('engine.effortHint.default')
  const name = nativeEffortName(level)
  return KNOWN_EFFORT_HINTS.has(name) ? t(`engine.effortHint.${name}`) : undefined
}

/** Dica honesta de uma linha para o cartão de cada modelo (`EFFORT-SPEC.md` §2). */
export function modelChoiceHint(t: TranslateFn, id: string | null, label = ''): string {
  if (id === null || id === ENGINE_DEFAULT_ID) return t('engine.modelHint.default')
  const probe = `${id} ${label}`.toLowerCase()
  if (probe.includes('opus')) return t('engine.modelHint.opus')
  if (probe.includes('sonnet')) return t('engine.modelHint.sonnet')
  if (probe.includes('haiku')) return t('engine.modelHint.haiku')
  return t('engine.modelHint.generic')
}

/** Lista de modelos que o motor informou, sempre começando por "Padrão do motor" e na ordem do host. */
export function modelOptionsForConnection(
  t: TranslateFn,
  connection: ConnectionView | undefined,
): readonly { readonly id: ModelChoiceId; readonly title: string; readonly body: string }[] {
  const first = {
    id: ENGINE_DEFAULT_ID,
    title: t('engine.modelDefault'),
    body: t('engine.modelHint.default'),
  }
  const hostModels: readonly EngineModelView[] = connection?.models ?? []
  return [
    first,
    ...hostModels.map(model => ({
      id: model.id,
      title: model.label,
      body: modelChoiceHint(t, model.id, model.label),
    })),
  ]
}

/** Os nomes de nível de uma lista do host: normalizados, sem repetição, na ordem em que o host os mandou. */
function levelNamesOf(raw: readonly unknown[]): readonly EffortName[] {
  const names: EffortName[] = []
  for (const value of raw) {
    const name = normalizeEffortName(value)
    if (name !== undefined && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * Quais níveis de esforço aquele motor + modelo aceitam (`persona-settings-host.md` §2), com o nome nativo que o host mandou:
 *  - em "Padrão do motor" (`runnerModel === null`), usa `connection.defaultEffortLevels`;
 *  - num modelo específico, usa `model.effortLevels` daquele modelo;
 *  - sem lista do host (ou motor embutido `dsh`), devolve `[]` ("Este motor não deixa escolher o esforço.").
 */
export function acceptedEffortLevels(
  connection: ConnectionView | undefined,
  runnerModel: string | null,
): readonly EffortName[] {
  if (connection === undefined || connection.kind === 'dsh') return []
  const raw: readonly unknown[] = runnerModel === null || runnerModel === ENGINE_DEFAULT_ID
    ? (connection.defaultEffortLevels ?? [])
    : (connection.models?.find(model => model.id === runnerModel)?.effortLevels ?? [])
  return levelNamesOf(raw)
}

export interface SnapEffortResult {
  readonly next: EffortName | null
  /** Preenchido quando o nível anterior não existe no novo modelo e caiu para `next`. */
  readonly snappedFrom: EffortName | null
}

/**
 * Quando o modelo muda e o nível escolhido não vale mais (`EFFORT-SPEC.md` §2):
 * cai para o nível válido mais próximo abaixo (ou "Padrão do motor" se nenhum nível abaixo existir).
 */
export function snapEffort(
  current: EffortName | null,
  allowed: readonly EffortName[],
): SnapEffortResult {
  if (current === null) return { next: null, snappedFrom: null }
  if (allowed.includes(current)) return { next: current, snappedFrom: null }
  const currentIdx = EFFORT_LEVEL_ORDER.indexOf(current)
  for (let i = currentIdx - 1; i >= 0; i -= 1) {
    const candidate = EFFORT_LEVEL_ORDER[i]
    if (candidate !== undefined && allowed.includes(candidate)) {
      return { next: candidate, snappedFrom: current }
    }
  }
  return { next: null, snappedFrom: current }
}

/**
 * O chip "Opus · max" (ou só "Sonnet" quando o esforço é o Padrão do motor) para o cartão da persona
 * e para a linha de Configurações › Personas (`EFFORT-SPEC.md` §3): "{modelo} · {nível nativo}".
 *
 * Quando `fallbackDefaultLabel` é passado (ex.: na linha de Configurações › Personas), devolve esse rótulo se tanto o
 * modelo quanto o esforço estão no Padrão do motor; no cartão da persona (`fallbackDefaultLabel` ausente), devolve `undefined`
 * quando nada específico foi escolhido.
 */
export function formatEngineEffortChip(
  input: {
    readonly runnerModel?: string | null | undefined
    readonly modelLabel?: string | undefined
    readonly runnerEffort?: EffortName | null | undefined
  },
  effortName: (level: EffortName) => string = nativeEffortName,
  fallbackDefaultLabel?: string,
): string | undefined {
  const rawModel = input.runnerModel !== undefined
    ? input.runnerModel
    : (input.modelLabel !== undefined && input.modelLabel !== 'default' && input.modelLabel !== 'modelo padrão' ? input.modelLabel : null)
  const cleanModel = rawModel !== null && rawModel.trim() !== '' && rawModel.trim().toLowerCase() !== 'default'
    ? modelLabel(rawModel)
    : null
  const level = normalizeEffortName(input.runnerEffort)
  const cleanEffort = level !== undefined ? effortName(level) : null
  if (cleanModel !== null && cleanEffort !== null) return `${cleanModel} · ${cleanEffort}`
  if (cleanModel !== null) return cleanModel
  if (cleanEffort !== null) return fallbackDefaultLabel !== undefined ? `${fallbackDefaultLabel} · ${cleanEffort}` : cleanEffort
  return fallbackDefaultLabel
}

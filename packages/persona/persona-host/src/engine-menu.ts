/**
 * EFF-1 (D-088): the model and the "Capricho" (the engine's reasoning effort) a person picks for each persona.
 * The principle is the person's: nobody decides the effort for them. So
 *  - a new persona has the engine's DEFAULT in both (model `default`, no effort): nothing is sent to the CLI;
 *  - what the screen offers comes from the ENGINE (the menu the CLI itself reported), never from a list of ours, and there is no
 *    "recommended" field anywhere;
 *  - any model and any level the engine accepts can be chosen: no lock, no confirmation. A level the engine refuses at run time
 *    falls back to its default inside the runner (it says so); the host does not second-guess the menu.
 */

import type { PersonaEffortLevel, PersonaRunner } from '@deepseek-ai/dsh-persona-core'
import { RemoteFault as HostRemoteFault } from './remote-guard.ts'
import type { EngineModelView, SetPersonaEngineRequest } from './types.ts'

/**
 * The levels the host stores: the names the engines themselves use (the union over Claude and Codex, the same names as the runners' static table
 * `STATIC_EFFORT_LEVELS`), lightest first. What the screen offers for a model is what the ENGINE listed for it, in the engine's own order, cut to these names.
 */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const satisfies readonly PersonaEffortLevel[]

/** The stored name of "Padrão do motor": the runner sends no `--model` for it. */
export const ENGINE_DEFAULT_MODEL = 'default'

const MODELS_MAX = 64

/** @param value - Any wire value. @returns True when it is one of {@link EFFORT_LEVELS}. */
export function isEffortLevel(value: unknown): value is PersonaEffortLevel {
  return typeof value === 'string' && (EFFORT_LEVELS as readonly string[]).includes(value)
}

/** One model of the engine's own menu (the runner's `ModelMenuEntry`, read structurally). */
export interface EngineMenuEntry {
  readonly id: string
  readonly label?: string | undefined
  readonly efforts?: readonly string[] | undefined
  readonly defaultEffort?: string | undefined
  readonly disabled?: boolean | undefined
}

/** What the engine reported about its models (the runner's `ConnectionSnapshot`, read structurally). */
export interface EngineMenuInput {
  readonly models: readonly string[]
  readonly modelMenu?: readonly EngineMenuEntry[] | undefined
}

/**
 * The menu the screen draws, from what the ENGINE said. "Padrão do motor" is not a row: the screen always offers it, and the levels
 * that apply to it are `defaultEffortLevels` (the engine's own `default` entry). A model the engine lists but refuses to run is left
 * out (the reason is the engine's, it never reaches a screen). No effort listed for a model = that model has no choice of effort.
 * @param input - The engine's models and, when it gave one, its menu.
 * @returns Rows in the engine's order and the levels of the default model.
 */
export function engineModelsOf(input: EngineMenuInput): { models: EngineModelView[]; defaultEffortLevels: PersonaEffortLevel[] } {
  const entries: readonly EngineMenuEntry[] = input.modelMenu ?? input.models.map(id => ({ id }))
  // The names are the engine's own; only their ORDER is normalized to lightest → heaviest (the CLIs already list them so), so the screen reads the same
  // whatever order a CLI lists them in (Quill 14:47).
  const levels = (efforts: readonly string[] | undefined): PersonaEffortLevel[] => [...new Set((efforts ?? []).filter(isEffortLevel))]
    .sort((left, right) => EFFORT_LEVELS.indexOf(left) - EFFORT_LEVELS.indexOf(right))
  const defaults = entries.find(entry => entry.id === ENGINE_DEFAULT_MODEL)
  const seen = new Set<string>()
  const models: EngineModelView[] = []
  for (const entry of entries) {
    if (entry.id === ENGINE_DEFAULT_MODEL || entry.id === '' || entry.disabled === true || seen.has(entry.id)) continue
    seen.add(entry.id)
    const effortLevels = levels(entry.efforts)
    const label = entry.label !== undefined && entry.label.trim() !== '' ? entry.label : entry.id
    const preferred = entry.defaultEffort
    models.push({
      id: entry.id, label, effortLevels,
      ...(isEffortLevel(preferred) && effortLevels.includes(preferred) ? { defaultEffort: preferred } : {}),
    })
    if (models.length >= MODELS_MAX) break
  }
  return { models, defaultEffortLevels: levels(defaults?.efforts) }
}

/**
 * The runner a persona gets after "change engine / model / capricho". `null` model = the engine's default; `null` effort = the engine's
 * default (no `--effort`). An effort left out (`undefined`) is kept only while the engine AND the model are the same: a level of one
 * model may not exist on another, and the person never gets a choice they did not make.
 * @param previous - The runner stored today.
 * @param request - What the person chose.
 * @param cli - The validated CLI of the request (`undefined` for the built-in engine).
 */
export function nextRunner(previous: PersonaRunner, request: SetPersonaEngineRequest, cli: 'claude' | 'codex' | 'cursor' | 'opencode' | undefined): PersonaRunner {
  const model = request.runnerModel === null || request.runnerModel.trim() === '' ? ENGINE_DEFAULT_MODEL : request.runnerModel
  if (request.runnerEffort !== undefined && request.runnerEffort !== null && !isEffortLevel(request.runnerEffort)) {
    throw new HostRemoteFault('invalid-payload', 'Escolha um dos níveis de esforço que o motor oferece.')
  }
  if (cli === undefined || request.runnerKind === 'dsh') return { kind: 'dsh', model } // the built-in engine has no effort to choose
  let effort: PersonaEffortLevel | undefined
  if (request.runnerEffort === undefined) {
    effort = previous.kind === 'cli' && previous.cli === cli && previous.model === model ? previous.effort : undefined
  } else {
    effort = request.runnerEffort ?? undefined
  }
  return { kind: 'cli', cli, model, ...(effort === undefined ? {} : { effort }) }
}

/** @param runner - The stored runner. @returns The model/effort the person chose; `null` = the engine's default. */
export function engineChoiceOf(runner: PersonaRunner): { runnerModel: string | null; runnerEffort: PersonaEffortLevel | null } {
  return {
    runnerModel: runner.model === ENGINE_DEFAULT_MODEL || runner.model === '' ? null : runner.model,
    runnerEffort: runner.kind === 'cli' ? runner.effort ?? null : null,
  }
}

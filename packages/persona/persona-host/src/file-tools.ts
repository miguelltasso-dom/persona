/**
 * D-099 (Atlas, 07/11): "a arte vira arquivo". A persona SAVES FILES — only into the DRAFT of the project's folder (the person applies them in Revisar mudanças),
 * never with a shell. ON for every persona the product creates; the person turns it off per persona (“Pode salvar arquivos no rascunho”). It is the persona's own
 * file grant (`tools.files = 'write'`); what a Task's runner really gets is decided per Task (`toolsForTask`): the grant is effective only when the Task HAS a draft
 * folder to write in, so a write can never land outside a draft and a project without a folder stays text-only.
 *
 * A file grant is not a grant over the world: the persona's OWN tools gateway (board, routines, browser, e-mail…) opens at the level of her NON-file grants
 * (`gatewayLevelOf`), so saving files never widens what she may do outside (D-081/083).
 */

import type { ToolLevel } from '@deepseek-ai/dsh-persona-core'
import { gatewayToolLevel } from '@deepseek-ai/dsh-persona-runners'

type Tools = Readonly<Record<string, ToolLevel>>

/** The keys the CLI policy reads as FILE tools (persona-runners `grantsOf`: the first one defined wins). */
const FILE_KEYS: readonly string[] = ['files', 'write', 'edit']

/** The grant every persona the product creates is born with. */
export const NEW_PERSONA_TOOLS: Readonly<Record<string, ToolLevel>> = { files: 'write' }

/** @param tools - Persona tools. @returns The file level the CLI policy reads (`none` when no file key is set). */
export function fileLevelOf(tools: Tools): ToolLevel {
  for (const key of FILE_KEYS) {
    const level = tools[key]
    if (level !== undefined) return level
  }
  return 'none'
}

/** @param tools - Persona tools. @returns Whether the persona may save files (into a draft). */
export function canSaveFiles(tools: Tools): boolean {
  return fileLevelOf(tools) === 'write'
}

/** @param tools - Persona tools. @returns The same grants without any file key. */
export function withoutFileTools(tools: Tools): Record<string, ToolLevel> {
  return Object.fromEntries(Object.entries(tools).filter(([key]) => !FILE_KEYS.includes(key)))
}

/**
 * @param tools - Persona tools.
 * @param on - The person's choice.
 * @returns The grants with saving files on (`files: 'write'`) or off (no file key); every other grant is kept.
 */
export function withFilesSaving(tools: Tools, on: boolean): Record<string, ToolLevel> {
  const rest = withoutFileTools(tools)
  return on ? { ...rest, files: 'write' } : rest
}

/**
 * The level the persona's OWN tools gateway opens at: her grants WITHOUT the file ones (saving files does not raise it).
 * @param tools - Persona tools.
 */
export function gatewayLevelOf(tools: Tools | undefined): ToolLevel {
  return gatewayToolLevel(tools ?? {})
}

/**
 * The tools a Task's runner gets. On a CLI the file grant is effective only when the Task has a draft folder (its directory is not the placeholder `.`);
 * the built-in engine keeps its tools as they are.
 * @param tools - Persona tools.
 * @param draftDirectory - The Task's working directory (`.` or empty = no draft).
 * @param onCli - Whether the persona runs on a CLI.
 */
export function toolsForTask(tools: Tools, draftDirectory: string | undefined, onCli: boolean): Tools {
  if (!onCli) return tools
  return draftDirectory !== undefined && draftDirectory !== '' && draftDirectory !== '.' ? tools : withoutFileTools(tools)
}

/**
 * The tools a persona the Gestor hires is born with: saving files, but never more than the Gestor has (D-081/083) and only if the Gestor's limits allow the `files` tool.
 * @param gestorTools - The Gestor persona's tools.
 * @param allowedTools - The Gestor mandate's list of tool names (empty = no restriction).
 */
export function gestorHireTools(gestorTools: Tools, allowedTools: readonly string[]): Record<string, ToolLevel> {
  return canSaveFiles(gestorTools) && (allowedTools.length === 0 || allowedTools.includes('files')) ? { files: 'write' } : {}
}

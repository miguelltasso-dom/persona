/**
 * S4 conversational drafts: Rivet `createDraftDriver`, else `fallbackDraft`.
 * No coordination role is assigned (onboarding works before a coordinator).
 */
import { parsePersonaSpec } from '@deepseek-ai/dsh-persona-core'
import {
  createDraftDriver,
  createScriptedRunner,
  fallbackDraft,
  type PersonaDraft as RivetDraft,
} from '@deepseek-ai/dsh-persona-runners'
import type { PersonaDraft } from './types.ts'

/**
 * Deterministic draft when the driver is silent.
 * @param description - User text.
 */
export function draftPersonaFromDescription(description: string): PersonaDraft {
  return toWire(fallbackDraft(description))
}

/**
 * Split a team description into up to 8 deterministic drafts.
 * @param description - Paragraphs or lines.
 */
export function draftTeamFromDescription(description: string): PersonaDraft[] {
  const chunks = description.split(/\n\s*\n|\n/u).map(item => item.trim()).filter(item => item !== '')
  const parts = chunks.length === 0 ? ['Membro'] : chunks.slice(0, 8)
  return parts.map(part => draftPersonaFromDescription(part))
}

/**
 * Draft through Rivet's driver (scripted runner → fallback when mute).
 * @param description - User text.
 */
export async function draftPersonaWithDriver(description: string): Promise<PersonaDraft> {
  try {
    const driver = createDraftDriver({ runner: createScriptedRunner() })
    return toWire(await driver.draftPersona(description))
  } catch {
    return draftPersonaFromDescription(description)
  }
}

/**
 * Team draft through the same driver.
 * @param description - User text.
 */
export async function draftTeamWithDriver(description: string): Promise<PersonaDraft[]> {
  try {
    const driver = createDraftDriver({ runner: createScriptedRunner() })
    return (await driver.draftTeam(description)).map(toWire)
  } catch {
    return draftTeamFromDescription(description)
  }
}

function toWire(draft: RivetDraft): PersonaDraft {
  const spec = parsePersonaSpec({
    name: draft.name,
    avatar: { kind: draft.avatarKind, ref: draft.avatarRef },
    title: draft.title,
    description: draft.description,
    personality: draft.personality,
    instructions: draft.instructions,
    runner: isCli(draft.runnerCli)
      ? { kind: 'cli', cli: draft.runnerCli, model: draft.runnerModel === '' ? 'default' : draft.runnerModel }
      : { kind: 'dsh', model: draft.runnerModel === '' ? 'default' : draft.runnerModel },
    tools: {},
    skills: [],
    limits: {},
    systemRoles: [],
    canRecruit: false,
  })
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    personality: spec.personality,
    instructions: spec.instructions,
    avatarKind: spec.avatar.kind,
    avatarRef: spec.avatar.ref,
    runnerKind: spec.runner.kind,
    runnerCli: spec.runner.kind === 'cli' ? spec.runner.cli : '',
    runnerModel: spec.runner.model,
    canRecruit: spec.canRecruit,
    systemRoles: spec.systemRoles,
  }
}

function isCli(value: string): value is 'claude' | 'codex' | 'opencode' | 'cursor' {
  return value === 'claude' || value === 'codex' || value === 'opencode' || value === 'cursor'
}

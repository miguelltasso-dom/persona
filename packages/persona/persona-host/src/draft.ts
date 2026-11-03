/** Deterministic conversational drafts (S4). A live Runner replaces this later. */
import { parsePersonaSpec } from '@deepseek-ai/dsh-persona-core'
import type { PersonaDraft } from './types.ts'

/**
 * Build one editable persona draft from a natural-language description.
 * Tools stay empty so the draft never exceeds the creator's access.
 * @param description - User text.
 * @returns A Forge-valid spec projected to the wire.
 */
export function draftPersonaFromDescription(description: string): PersonaDraft {
  const line = description.trim().split(/\r?\n/, 1)[0] ?? ''
  const name = clip(line === '' ? 'Rascunho' : line, 80)
  const spec = parsePersonaSpec({
    name,
    avatar: { kind: 'silhouette', ref: 'draft' },
    title: clip(name, 80),
    description: clip(description.trim() === '' ? name : description.trim(), 2000),
    personality: 'Direto e claro.',
    instructions: clip(description.trim() === '' ? `Atue como ${name}.` : description.trim(), 8000),
    runner: { kind: 'dsh', model: 'default' },
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

/**
 * Split a team description into up to 8 persona drafts. No coordination role
 * is assigned (onboarding works before a coordinator exists).
 * @param description - User text; paragraphs or lines become members.
 * @returns Valid drafts.
 */
export function draftTeamFromDescription(description: string): PersonaDraft[] {
  const chunks = description.split(/\n\s*\n|\n/).map(item => item.trim()).filter(item => item !== '')
  const parts = chunks.length === 0 ? ['Membro'] : chunks.slice(0, 8)
  return parts.map(part => draftPersonaFromDescription(part))
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

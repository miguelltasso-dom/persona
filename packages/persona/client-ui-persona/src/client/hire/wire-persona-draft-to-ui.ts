import type { PersonaDraft as WirePersonaDraft } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaDraft } from '../persona-editor/persona-draft.ts'
import { createEmptyHireDraft } from './empty-hire-draft.ts'

function harnessFromWire(wire: WirePersonaDraft): string {
  if (wire.runnerKind === 'dsh') return 'dsh'
  const cli = wire.runnerCli.trim()
  if (cli === '') return 'oar:claude'
  return cli.includes(':') ? cli : `oar:${cli}`
}

/**
 * Host Forge draft → editor draft (system roles as toggles, no fixed persona names).
 * @param wire - Remote `draftPersona` payload.
 * @param avatarRefFallback - Keeps hire gallery pick when wire leaves ref empty.
 */
export function wirePersonaDraftToUi(wire: WirePersonaDraft, avatarRefFallback: string): PersonaDraft {
  const avatarSource = wire.avatarKind
  const avatarRef = wire.avatarRef.length > 0 ? wire.avatarRef : avatarRefFallback
  const base = createEmptyHireDraft(avatarRef)
  return {
    ...base,
    name: wire.name,
    avatarSource,
    avatarRef,
    jobTitle: wire.title,
    jobDescription: wire.description,
    personality: wire.personality,
    instructions: wire.instructions,
    harness: harnessFromWire(wire),
    model: wire.runnerModel.length > 0 ? wire.runnerModel : 'default',
    coordination: wire.systemRoles.includes('coordination'),
    watchdog: wire.systemRoles.includes('watchdog'),
  }
}

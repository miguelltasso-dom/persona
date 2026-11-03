/**
 * Policy-layer admission from ACL (P11). Engine Policy.gate maps this result.
 */

import { can, type Actor } from './acl.ts'

export type AdmissionStrength = 'explicit' | 'inferred'

export type Admission =
  | { admissible: false; reason: string }
  | { admissible: true; strength: AdmissionStrength }

/**
 * Admit a trigger only when the actor may `decide` on the project channel.
 * Explicit = human and addressed; inferred = human without address; else refused.
 * @param actor - Coordinator or whoever is evaluating.
 * @param input - Trigger facts already authenticated by the host.
 */
export function admitTrigger(actor: Actor, input: {
  projectId: string
  human: boolean
  addressed?: 'mention' | 'direct'
}): Admission {
  if (!can(actor, 'decide', {
    type: 'channel',
    workspaceId: actor.workspaceId,
    projectId: input.projectId,
  })) {
    return { admissible: false, reason: 'aclDenied' }
  }
  if (input.human && input.addressed !== undefined) return { admissible: true, strength: 'explicit' }
  if (input.human) return { admissible: true, strength: 'inferred' }
  return { admissible: false, reason: 'notHuman' }
}

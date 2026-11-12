/**
 * H23 / F2, test helper for the specs that run a REAL host against the local edge: the device identity of a host (the one its Cofre holds) as a `Device`, so a spec can
 * call the hub as that person (signed) to check what the hub lets THEM see. And the owner's two clicks: list who is waiting, approve.
 */
import { CofreIdentityStore } from '../../../packages/persona/persona-host/src/e2ee-identity.ts'
import type PersonaHost from '../../../packages/persona/persona-host/src/index.ts'
import { publicIdentity } from '../../../packages/persona/persona-sync/src/index.ts'
import type { Device } from './signed-fetch.ts'

/**
 * @param host - A host that has already connected or accepted an invite (its identity exists).
 * @param id - Its member id at the hub.
 */
export async function deviceOf(host: PersonaHost, id: string): Promise<Device> {
  const identity = await new CofreIdentityStore(host.cofreSecrets).load()
  if (identity === undefined) throw new Error(`o host de ${id} ainda não tem identidade`)
  return { id, identity, keys: publicIdentity(identity) }
}

/** The owner approves everybody who asked with a link (the channel keys come with the next slice). @returns How many were approved. */
export async function approveAll(owner: PersonaHost, scope: { readonly workspaceId: string; readonly projectId: string }): Promise<number> {
  const waiting = await owner.remoteTeam.joinRequests(scope)
  for (const request of waiting) await owner.remoteTeam.approveJoinRequest(scope, request.id)
  return waiting.length
}

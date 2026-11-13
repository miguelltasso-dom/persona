/**
 * MARCO M5: a PAIRED device as a Peer of the Gateway. The principal says only WHICH device (`deviceId`); who the device speaks for comes from the book, never from the wire. It is a NON-owner principal, so the
 * Gateway asks the policy below before it resolves an id or decodes an argument: a Remote that is not on the permitted list (`phone-allow.ts`) is refused by default, with the stable reason
 * `remote-not-allowed`. The same list also feeds the funnel in `remote-guard.ts`, so a refusal does not depend on the Gateway alone.
 *
 * The policy follows the precedent of the LiveShare viewer (`registerPolicy('share-viewer', …)`): in-memory rules, read synchronously, `explain()` for the code the client already understands. The shapes below
 * are the structural twins of the Gateway's `RemoteAccessPolicy` (persona-host does not depend on that package; it reaches the service by name, like the web server).
 */

import { OWNER_DEVICE_ONLY, PHONE_READS, PHONE_WRITES, REMOTE_NOT_ALLOWED } from './phone-allow.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** One paired phone or notebook of this PC, by its device id (the member it speaks for is in the DeviceBook). */
    paired: PairedPrincipal
  }
}

/** A paired device. No credential, no member: only the id of the device. */
export interface PairedPrincipal {
  readonly kind: 'paired'
  readonly deviceId: string
}

/** A role over the global resource: the endpoints (`namespace/method`) it allows. */
export interface AccessRole {
  readonly name: string
  readonly resource: 'global'
  readonly actions: readonly `${string}/${string}`[]
}

/** A role granted on the global resource. */
export interface AccessBinding {
  readonly role: AccessRole
  readonly resource: { readonly kind: 'global' }
}

/** What the Gateway asks of the policy of one non-owner principal kind. */
export interface PairedPolicy {
  bindings(principal: PairedPrincipal): readonly AccessBinding[]
  explain(request: unknown): string | undefined
}

/**
 * @param deviceId - The device (as the book knows it).
 * @returns The principal its calls speak for.
 */
export function pairedPrincipal(deviceId: string): PairedPrincipal {
  return { kind: 'paired', deviceId }
}

/** What the policy reads — all synchronous, all in memory. */
export interface PairedAccessFacts {
  /** The member a LIVE device speaks for; `undefined` when the device is unknown, revoked or expired (it then holds nothing). */
  readonly memberOfDevice: (deviceId: string) => string | undefined
  /** Whether a member is the OWNER of the team (the owner's phone may list and revoke devices). */
  readonly isOwnerMember: (memberId: string) => boolean
  /** The Typert namespace of the PersonaHost's Remotes (`persona`). */
  readonly namespace?: string
}

const GLOBAL = { kind: 'global' } as const

/**
 * The policy of the `paired` principal kind.
 * @param facts - The book and the owner lookup.
 * @returns The policy to register with `remoteAccess.registerPolicy('paired', …)`.
 */
export function createPairedAccessPolicy(facts: PairedAccessFacts): PairedPolicy {
  const namespace = facts.namespace ?? 'persona'
  const endpoints = (names: readonly string[]): readonly `${string}/${string}`[] => names.map(name => `${namespace}/${name}` as const)
  const phone: AccessRole = { name: 'paired:phone', resource: 'global', actions: endpoints([...PHONE_READS, ...PHONE_WRITES]) }
  const ownerDevice: AccessRole = { name: 'paired:owner-device', resource: 'global', actions: endpoints(OWNER_DEVICE_ONLY) }
  return {
    bindings(principal: PairedPrincipal): readonly AccessBinding[] {
      const member = facts.memberOfDevice(principal.deviceId)
      if (member === undefined) return [] // not live: nothing, whatever it asks
      return [{ role: phone, resource: GLOBAL }, ...(facts.isOwnerMember(member) ? [{ role: ownerDevice, resource: GLOBAL }] : [])]
    },
    explain: () => REMOTE_NOT_ALLOWED,
  }
}

/** The service the Gateway registers policies on, reached by name (the S2 wiring passes `ctx.get('remoteAccess')`). */
export interface PolicyRegistry {
  registerPolicy(kind: string, policy: PairedPolicy): void
}

/**
 * Register the policy of paired devices with the Gateway's access service.
 * @param registry - `ctx.get('remoteAccess')`.
 * @param facts - The book and the owner lookup.
 */
export function registerPairedPolicy(registry: PolicyRegistry, facts: PairedAccessFacts): void {
  registry.registerPolicy('paired', createPairedAccessPolicy(facts))
}

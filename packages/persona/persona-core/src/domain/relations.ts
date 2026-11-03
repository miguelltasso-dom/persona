/**
 * Canvas relations and positions (G1). A relation never grants ACL access and
 * never starts work. Delegation is an explicit action. Position is display only.
 */

import { can, type AclAction, type AclResource, type Actor } from './acl.ts'

export type RelationKind = 'reports_to' | 'collaborates' | 'nearby'

export interface Relation {
  id: string
  fromId: string
  toId: string
  kind: RelationKind
}

export interface CanvasPosition {
  objectId: string
  x: number
  y: number
}

export interface Delegation {
  id: string
  fromPersonaId: string
  toPersonaId: string
  ticketId: string
  at: string
}

/**
 * Relations are decorative / org-chart only.
 * @param _relation - Unused; documented so callers see the invariant.
 */
export function relationGrantsAccess(_relation: Relation): false {
  return false
}

/**
 * Work starts only through an explicit delegation (or a Ticket assignment).
 * @param _relation - Nearby / reports-to is not enough.
 * @param delegation - Optional explicit hand-off.
 */
export function relationStartsWork(_relation: Relation, delegation?: Delegation): boolean {
  return delegation !== undefined
}

/**
 * Layout never enters `can()`.
 * @param _position - Canvas coordinates.
 */
export function positionAffectsPolicy(_position: CanvasPosition): false {
  return false
}

/**
 * ACL after placing two people next to each other: unchanged.
 * @param actor - Reader.
 * @param action - Verb.
 * @param resource - Target.
 * @param _position - Ignored.
 * @param _relation - Ignored.
 */
export function canWithLayout(
  actor: Actor,
  action: AclAction,
  resource: AclResource,
  _position?: CanvasPosition,
  _relation?: Relation,
): boolean {
  return can(actor, action, resource)
}

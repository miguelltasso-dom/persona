/**
 * Item 26 (Muse §26, "Quem pode usar?"): who of the team may use a connected tool, read from the host's grants (`listConnectorGrants`). Pure: no React, no host import.
 * The default is NOBODY without asking (D-084): a face is ticked only when the host has a grant for that persona; the screen never invents one.
 */

import { sameTool, type ToolCard } from './tools-model.ts'

/** One grant as the screen reads it (`ConnectorGrantView`): a persona holds a connector, with a level and what she waived. */
export interface ToolGrant {
  readonly personaId: string
  readonly cli: string
  readonly connectorId: string
  readonly name: string
  readonly access: 'read' | 'write'
  readonly confirm: { readonly send: 'ask' | 'never'; readonly pay: 'ask' | 'never'; readonly delete: 'ask' | 'never' }
  /** The engine loads every connector anyway (e.g. Codex): the permission is still the host's policy, and the screen says so. */
  readonly loadedAlways: boolean
}

/** A face of the team. */
export interface WhoFace {
  readonly id: string
  readonly name: string
  readonly avatarSrc?: string | undefined
}

/** What the host needs to grant the same connector to one more persona. */
export interface ToolRef {
  readonly cli: string
  readonly id: string
  readonly name: string
}

const ASK = (value: unknown): 'ask' | 'never' => (value === 'never' ? 'never' : 'ask')

/** What the screen accepts from the wire: a grant with the fields it needs; anything else is dropped (an older or newer host must not break the screen). */
export function readGrants(raw: unknown): readonly ToolGrant[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[]).flatMap((item) => {
    const entry = item as Record<string, unknown>
    if (typeof entry.personaId !== 'string' || typeof entry.cli !== 'string' || typeof entry.connectorId !== 'string' || typeof entry.name !== 'string') return []
    const confirm = (entry.confirm ?? {}) as Record<string, unknown>
    return [{
      personaId: entry.personaId,
      cli: entry.cli,
      connectorId: entry.connectorId,
      name: entry.name,
      access: entry.access === 'write' ? 'write' as const : 'read' as const,
      confirm: { send: ASK(confirm.send), pay: ASK(confirm.pay), delete: ASK(confirm.delete) },
      loadedAlways: entry.loadedAlways === true,
    }]
  })
}

/** The grants of one tool of the catalog, by the same name matching the host uses for `linked`. */
export function grantsOfTool(card: ToolCard, grants: readonly ToolGrant[]): readonly ToolGrant[] {
  return grants.filter(grant => sameTool(grant.name, card.name))
}

/** The connector to hand the host when ticking one more face: the one an existing grant of this tool already points at (the screen never builds a ref out of thin air). */
export function refOfTool(card: ToolCard, grants: readonly ToolGrant[]): ToolRef | undefined {
  const first = grantsOfTool(card, grants)[0]
  return first === undefined ? undefined : { cli: first.cli, id: first.connectorId, name: first.name }
}

export interface WhoRow {
  readonly face: WhoFace
  /** The host has a grant for this persona and this tool. */
  readonly on: boolean
  /** Those grants (a persona can hold the same tool through more than one engine): unticking takes every one back. */
  readonly grants: readonly ToolGrant[]
}

/**
 * One row per face, in the order of the team.
 * @param card - The connected tool.
 * @param faces - The team.
 * @param grants - The host's grants of the whole workspace.
 */
export function whoRows(card: ToolCard, faces: readonly WhoFace[], grants: readonly ToolGrant[]): readonly WhoRow[] {
  const mine = grantsOfTool(card, grants)
  return faces.map((face) => {
    const own = mine.filter(grant => grant.personaId === face.id)
    return { face, on: own.length > 0, grants: own }
  })
}

export type PermitGroupId = 'read' | 'change' | 'send' | 'pay' | 'delete'

export interface PermitGroup {
  readonly id: PermitGroupId
  /** Allowed to someone today: `read` as soon as one face is ticked, `change` when one grant is `write`, the others by what was waived. */
  readonly on: boolean
  /** "Sempre pede" (the 16 px lock): the class asks the person first, every time, for everyone who holds the tool. */
  readonly asks: boolean
}

/**
 * What the tool permits, in the host's own classes (Ler · Mudar · Enviar · Pagar · Apagar). Only what the policy says: a class asks unless somebody waived it explicitly.
 * @param grants - The grants of THIS tool.
 */
export function permitsOf(grants: readonly ToolGrant[]): readonly PermitGroup[] {
  const any = grants.length > 0
  const waived = (kind: 'send' | 'pay' | 'delete'): boolean => grants.some(grant => grant.confirm[kind] === 'never')
  return [
    { id: 'read', on: any, asks: false },
    { id: 'change', on: grants.some(grant => grant.access === 'write'), asks: false },
    { id: 'send', on: any, asks: !waived('send') },
    { id: 'pay', on: any, asks: !waived('pay') },
    { id: 'delete', on: any, asks: !waived('delete') },
  ]
}

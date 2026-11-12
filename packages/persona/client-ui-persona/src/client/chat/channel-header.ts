/**
 * COLHEITA 22 (Muse §22) — the pure side of the channel: the header ("#marketing", the neutral equipe chip, the stack of up to 5 faces,
 * "Respondem aqui: Lia, Téo e Bia"), the fence lines with their buttons and the `@` menu. The host (Flint) writes every word that is data
 * (the line "Lia não está em #marketing.", the labels "Pôr Lia no canal"); this file reads those values at the wire boundary and decides
 * the SHAPE the screen draws: **circle = people, rounded square with an animal = persona**.
 */

/** Most faces the header stack draws; the rest are "+N". */
export const HEADER_FACES_MAX = 5

export type MemberShape = 'circle' | 'square'

export interface ChannelHeaderMemberWire {
  readonly kind: 'persona' | 'human'
  readonly id: string
  readonly name: string
}

export type EmptyChannelWire =
  | { readonly kind: 'ready'; readonly title: string; readonly body: string }
  | { readonly kind: 'nobody'; readonly title: string; readonly actionLabel: string }

export interface ChannelHeaderWire {
  readonly channelId: string
  readonly name: string
  readonly teamId?: string | undefined
  readonly teamName?: string | undefined
  readonly members: readonly ChannelHeaderMemberWire[]
  readonly respondem: string
  readonly empty: EmptyChannelWire
}

export interface HeaderFaceUi {
  readonly id: string
  readonly name: string
  readonly kind: 'persona' | 'human'
  /** The grammar of shape: a person is a circle, a persona is a rounded square with its animal. */
  readonly shape: MemberShape
}

export interface ChannelHeaderUi {
  readonly channelId: string
  /** With the `#`: "#marketing". */
  readonly title: string
  readonly teamName?: string | undefined
  /** The faces of the stack (at most {@link HEADER_FACES_MAX}), in roster order. */
  readonly faces: readonly HeaderFaceUi[]
  /** How many more are on the channel ("+3"). */
  readonly more: number
  /** Total people and personas on the channel (what opens the members panel). */
  readonly memberCount: number
  /** "Respondem aqui: Lia, Téo e Bia"; empty when nobody is on the channel (the line is not drawn). */
  readonly respondem: string
  readonly empty: EmptyChannelWire
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** The shape of one member: a person is a circle, a persona is a rounded square (everywhere: rail, thread, `@` menu, header). */
export const shapeOf = (kind: 'persona' | 'human'): MemberShape => (kind === 'human' ? 'circle' : 'square')

function mapEmpty(value: unknown): EmptyChannelWire | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Readonly<Record<string, unknown>>
  if (row.kind === 'ready' && text(row.title) !== '') return { kind: 'ready', title: text(row.title), body: text(row.body) }
  if (row.kind === 'nobody' && text(row.title) !== '' && text(row.actionLabel) !== '') return { kind: 'nobody', title: text(row.title), actionLabel: text(row.actionLabel) }
  return undefined
}

/**
 * @param wire - The answer of `getChannelHeader` (a wire value). `undefined` from the host means a DM (no channel header).
 * @returns The header, or `undefined` when there is none (a DM) or the answer is not usable.
 */
export function mapChannelHeader(wire: unknown): ChannelHeaderUi | undefined {
  if (typeof wire !== 'object' || wire === null) return undefined
  const row = wire as Readonly<Record<string, unknown>>
  const channelId = text(row.channelId)
  const name = text(row.name).replace(/^#/u, '')
  const empty = mapEmpty(row.empty)
  if (channelId === '' || name === '' || empty === undefined) return undefined
  const members = Array.isArray(row.members)
    ? (row.members as unknown[]).flatMap((member): HeaderFaceUi[] => {
      if (typeof member !== 'object' || member === null) return []
      const item = member as Readonly<Record<string, unknown>>
      const kind = item.kind === 'human' ? 'human' : item.kind === 'persona' ? 'persona' : undefined
      const id = text(item.id)
      const memberName = text(item.name)
      return kind === undefined || id === '' || memberName === '' ? [] : [{ id, name: memberName, kind, shape: shapeOf(kind) }]
    })
    : []
  const teamName = text(row.teamName)
  return {
    channelId,
    title: `#${name}`,
    ...(teamName === '' ? {} : { teamName }),
    faces: members.slice(0, HEADER_FACES_MAX),
    more: Math.max(0, members.length - HEADER_FACES_MAX),
    memberCount: members.length,
    respondem: text(row.respondem),
    empty,
  }
}

/** The fence line the host posts after a message (`MessageView.channelNotice`), as the thread draws it. */
export interface ChannelNoticeUi {
  readonly kind: 'outside-personas' | 'outside-team'
  readonly text: string
  /** "Pôr Lia no canal"; the button exists only when the screen can do it (no dead control). */
  readonly add: { readonly label: string; readonly personaIds: readonly string[]; readonly teamId?: string | undefined }
  readonly dismissLabel?: string | undefined
  readonly goTo?: { readonly label: string; readonly channelId: string } | undefined
}

/** @param wire - `MessageView.channelNotice` (a wire value). @returns The notices that are well formed, in order. */
export function mapChannelNotices(wire: unknown): readonly ChannelNoticeUi[] {
  if (!Array.isArray(wire)) return []
  return (wire as unknown[]).flatMap((entry): ChannelNoticeUi[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Readonly<Record<string, unknown>>
    const kind = row.kind === 'outside-personas' || row.kind === 'outside-team' ? row.kind : undefined
    const add = typeof row.add === 'object' && row.add !== null ? (row.add as Readonly<Record<string, unknown>>) : undefined
    const personaIds = Array.isArray(add?.personaIds) ? (add.personaIds as unknown[]).filter((id): id is string => typeof id === 'string' && id !== '') : []
    if (kind === undefined || text(row.text) === '' || add === undefined || text(add.label) === '' || personaIds.length === 0) return []
    const goTo = typeof row.goTo === 'object' && row.goTo !== null ? (row.goTo as Readonly<Record<string, unknown>>) : undefined
    const teamId = text(add.teamId)
    return [{
      kind,
      text: text(row.text),
      add: { label: text(add.label), personaIds, ...(teamId === '' ? {} : { teamId }) },
      ...(text(row.dismissLabel) === '' ? {} : { dismissLabel: text(row.dismissLabel) }),
      ...(goTo !== undefined && text(goTo.label) !== '' && text(goTo.channelId) !== '' ? { goTo: { label: text(goTo.label), channelId: text(goTo.channelId) } } : {}),
    }]
  })
}

export interface MentionOptionUi {
  readonly kind: 'own-team' | 'team' | 'persona'
  readonly id: string
  /** What goes after the `@` when chosen. */
  readonly insert: string
  readonly label: string
  readonly faceIds: readonly string[]
  /** `false` = the persona is not on this channel: offered with "Pôr no canal". */
  readonly onChannel: boolean
}

/** @param wire - The answer of `listMentionOptions` (a wire value). @returns The entries in the host's order (equipes, then personas). */
export function mapMentionOptions(wire: unknown): readonly MentionOptionUi[] {
  if (!Array.isArray(wire)) return []
  return (wire as unknown[]).flatMap((entry): MentionOptionUi[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Readonly<Record<string, unknown>>
    const kind = row.kind === 'own-team' || row.kind === 'team' || row.kind === 'persona' ? row.kind : undefined
    const id = text(row.id)
    const insert = text(row.insert)
    const label = text(row.label)
    if (kind === undefined || id === '' || insert === '' || label === '') return []
    const faceIds = Array.isArray(row.faceIds) ? (row.faceIds as unknown[]).filter((face): face is string => typeof face === 'string' && face !== '').slice(0, 3) : []
    return [{ kind, id, insert, label, faceIds, onChannel: row.onChannel !== false }]
  })
}

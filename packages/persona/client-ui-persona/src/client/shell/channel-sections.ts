/**
 * COLHEITA 22 (Muse §22) — "Equipes e canais": the pure model of the sidebar's channel sections. The host (Flint) says what exists
 * (`getChannelLayout`: the channels with no section first, then one section per equipe); this file says what the sidebar draws:
 * which sections are open, the unread seal of a CLOSED section, the order Alt+↑/↓ walks, and when the "Pessoas" section exists.
 *
 * On the screen "equipe" and "categoria" are ONE thing: each equipe is a collapsible section with its channels inside.
 * The wire is read as data (a client boundary): a shape that is not what the host promised is dropped, never half drawn.
 */

/** Persona ids for the 16 px faces of a header: at most this many. */
export const SECTION_FACES_MAX = 3
/** The "Pessoas" section (real people) exists from the 2nd real person on. */
export const PEOPLE_SECTION_MIN_HUMANS = 2

export type ChannelKindUi = string

/** A channel row as the host sends it. */
export interface ChannelRowWire {
  readonly id: string
  readonly name: string
  readonly kind: ChannelKindUi
  readonly teamId?: string | undefined
}

/** A block of the sidebar as the host sends it (`id: null` = the channels with no section). */
export interface ChannelSectionWire {
  readonly id: string | null
  readonly name: string | null
  readonly teamId?: string | undefined
  readonly faceIds: readonly string[]
  readonly channels: readonly ChannelRowWire[]
}

export interface ChannelLayoutWire {
  readonly sections: readonly ChannelSectionWire[]
  readonly humanCount: number
}

/** A channel row as the sidebar draws it. */
export interface ChannelRowUi {
  readonly id: string
  /** Without the `#` ("marketing"). */
  readonly name: string
  readonly kind: ChannelKindUi
  readonly teamId?: string | undefined
  /** Unread messages (0 = none). */
  readonly unread: number
  /** The person muted it: the name in the soft ink. */
  readonly muted: boolean
  readonly active: boolean
}

/** A section as the sidebar draws it. */
export interface ChannelSectionUi {
  /** Stable key: `none` for the channels with no section, else the section id (what `localStorage` remembers). */
  readonly key: string
  /** `null` = no header (the channels with no section). */
  readonly name: string | null
  readonly teamId?: string | undefined
  /** The tone of the 8 px dot: a stable index per equipe (0 = none, the section was made by hand). */
  readonly toneIndex: number
  readonly faceIds: readonly string[]
  readonly rows: readonly ChannelRowUi[]
  readonly open: boolean
  /** Unread across the section's channels. */
  readonly unread: number
  /** The count the HEADER shows: only when the section is closed and something is unread. */
  readonly headerBadge: number
  /** Something here waits for the person (a mention): the seal is amber instead of neutral. */
  readonly needsYou: boolean
}

export interface ChannelLayoutUi {
  readonly sections: readonly ChannelSectionUi[]
  readonly humanCount: number
  /** Whether the "Pessoas" section is drawn (a 2nd real person exists). */
  readonly showPeople: boolean
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * @param wire - The answer of `getChannelLayout` (a wire value: nothing is trusted).
 * @returns The layout, or `undefined` when it is not one (the sidebar then keeps the channels it had).
 */
export function mapChannelLayout(wire: unknown): ChannelLayoutWire | undefined {
  if (typeof wire !== 'object' || wire === null) return undefined
  const row = wire as Readonly<Record<string, unknown>>
  if (!Array.isArray(row.sections)) return undefined
  const sections: ChannelSectionWire[] = []
  for (const entry of row.sections as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const section = entry as Readonly<Record<string, unknown>>
    const id = section.id === null ? null : text(section.id)
    if (id === '') continue
    const name = section.name === null || section.name === undefined ? null : text(section.name)
    const channels = Array.isArray(section.channels)
      ? (section.channels as unknown[]).flatMap((channel): ChannelRowWire[] => {
        if (typeof channel !== 'object' || channel === null) return []
        const item = channel as Readonly<Record<string, unknown>>
        const channelId = text(item.id)
        const channelName = text(item.name)
        if (channelId === '' || channelName === '') return []
        const teamId = text(item.teamId)
        return [{ id: channelId, name: channelName.replace(/^#/u, ''), kind: text(item.kind), ...(teamId === '' ? {} : { teamId }) }]
      })
      : []
    const faceIds = Array.isArray(section.faceIds) ? (section.faceIds as unknown[]).filter((face): face is string => typeof face === 'string' && face !== '').slice(0, SECTION_FACES_MAX) : []
    const teamId = text(section.teamId)
    sections.push({ id, name: name === '' ? null : name, faceIds, channels, ...(teamId === '' ? {} : { teamId }) })
  }
  const humans = typeof row.humanCount === 'number' && Number.isFinite(row.humanCount) ? Math.max(0, Math.floor(row.humanCount)) : 0
  return { sections, humanCount: humans }
}

/** A stable tone per equipe (0..5) so the same equipe is the same dot every time; 0 for a section made by hand. */
export function teamToneIndex(teamId: string | undefined): number {
  if (teamId === undefined || teamId === '') return 0
  let hash = 0
  for (const char of teamId) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return 1 + (hash % 5)
}

export const NO_SECTION_KEY = 'none'

export interface BuildSectionsInput {
  readonly layout: ChannelLayoutWire
  /** Unread messages by channel id. */
  readonly unreadByChannel: Readonly<Record<string, number>>
  /** Channels with a mention waiting for the person (the amber seal). */
  readonly mentionedChannelIds?: ReadonlySet<string> | undefined
  readonly mutedChannelIds?: ReadonlySet<string> | undefined
  /** What the person opened (`true`) or closed (`false`); a section not listed is open. */
  readonly open: Readonly<Record<string, boolean>>
  readonly activeChannelId: string | null
}

/**
 * @param input - The host's layout and the screen's own state.
 * @returns The sidebar's sections in the order they are drawn.
 */
export function buildChannelSections(input: BuildSectionsInput): ChannelLayoutUi {
  const sections = input.layout.sections.map((section): ChannelSectionUi => {
    const key = section.id ?? NO_SECTION_KEY
    const rows = section.channels.map((channel): ChannelRowUi => ({
      id: channel.id,
      name: channel.name,
      kind: channel.kind,
      ...(channel.teamId === undefined ? {} : { teamId: channel.teamId }),
      unread: Math.max(0, Math.floor(input.unreadByChannel[channel.id] ?? 0)),
      muted: input.mutedChannelIds?.has(channel.id) === true,
      active: channel.id === input.activeChannelId,
    }))
    const unread = rows.reduce((sum, row) => sum + row.unread, 0)
    // The channels with no section have no header: they can never be closed.
    const open = section.id === null ? true : input.open[key] !== false
    const needsYou = rows.some(row => input.mentionedChannelIds?.has(row.id) === true && row.unread > 0)
    return {
      key,
      name: section.name,
      ...(section.teamId === undefined ? {} : { teamId: section.teamId }),
      toneIndex: teamToneIndex(section.teamId),
      faceIds: section.faceIds,
      rows,
      open,
      unread,
      headerBadge: !open && unread > 0 ? unread : 0,
      needsYou,
    }
  })
  return { sections, humanCount: input.layout.humanCount, showPeople: input.layout.humanCount >= PEOPLE_SECTION_MIN_HUMANS }
}

/** The order Alt+↑/↓ walks: the channels of the OPEN sections, as drawn (a closed section's rows are not reachable). */
export function channelOrder(layout: ChannelLayoutUi): readonly string[] {
  return layout.sections.filter(section => section.open).flatMap(section => section.rows.map(row => row.id))
}

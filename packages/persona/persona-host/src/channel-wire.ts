/**
 * Item 22 (colheita): the host's seam to the channel rules. ONE small class that reads a stored message and answers, for the places in
 * `orchestration.ts` that used to read the whole roster: who the message addresses INSIDE its channel (`@name`, `@Equipe`, `@equipe`), who is
 * on the channel (the fence for the function route), and what to say when somebody named is not on it.
 *
 * The orchestration only asks this class; it holds no rule of its own. Without a directory (`directory()` undefined) or in a stream that is
 * not a channel (a DM), every answer is `undefined` and the old behavior stands untouched.
 */

import type { StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { addressChannel, type AddressPersona, type Addressing } from './channel-address.ts'
import type { ChannelDirectory } from './channel-directory.ts'
import { outsideNotices, type ChannelNotice } from './channel-notices.ts'

/** The parts of a stored message this reads. */
export interface ChannelMessage {
  readonly projectId: string
  /** `channel:<id>` or `dm:<id>`. */
  readonly streamId: string
  readonly body: string
}

export interface ChannelWireDeps {
  /** The directory of the host; `undefined` = the channel layer is off (everything is as before). */
  readonly directory: () => ChannelDirectory | undefined
  /** The project's personas in roster order. */
  readonly personas: (projectId: string) => readonly StoredPersona[]
  readonly isPaused: (projectId: string, personaId: string) => boolean
}

/** What the orchestration needs for one message of a channel. */
export interface ChannelReading {
  readonly addressing: Addressing
  /** Stored personas that answer by name or by equipe, in the order of `Addressing.personas` (empty when `via` is function/none). */
  readonly named: readonly StoredPersona[]
  /** Persona ids on the channel (the fence). */
  readonly members: readonly string[]
  readonly projectId: string
  readonly channelId: string
  readonly channelName: string
}

/** Reads a channel message through the directory. */
export class ChannelWire {
  constructor(private readonly deps: ChannelWireDeps) {}

  /**
   * @param message - A stored message.
   * @returns The reading, or `undefined` when the layer is off, the stream is not a channel, or the directory does not know the channel
   *   (then nobody is fenced and the caller keeps the old behavior).
   */
  read(message: ChannelMessage): ChannelReading | undefined {
    const directory = this.deps.directory()
    if (directory === undefined || !message.streamId.startsWith('channel:')) return undefined
    const channelId = message.streamId.slice('channel:'.length)
    const members = directory.membersOf(message.projectId, channelId)
    if (members === undefined) return undefined
    const stored = this.deps.personas(message.projectId)
    const roster: AddressPersona[] = stored.map(persona => ({
      id: persona.id, name: persona.name, title: persona.title, description: persona.description,
      coordination: persona.systemRoles.includes('coordination'),
      paused: this.deps.isPaused(message.projectId, persona.id),
    }))
    const channel = directory.channels(message.projectId).find(item => item.id === channelId)
    const addressing = addressChannel({
      body: message.body, personas: roster, teams: directory.teams(message.projectId),
      channel: { ...(channel?.teamId === undefined ? {} : { teamId: channel.teamId }) }, members,
    })
    const named = addressing.via === 'mention' || addressing.via === 'team'
      ? addressing.personas.flatMap(item => stored.find(persona => persona.id === item.id) ?? [])
      : []
    return { addressing, named, members, projectId: message.projectId, channelId, channelName: channel?.name ?? channelId }
  }

  /**
   * The lines to write after a message that named someone outside its channel.
   * @param reading - The reading of that message.
   * @returns The notices (empty when nobody named is outside).
   */
  noticesOf(reading: ChannelReading): ChannelNotice[] {
    const directory = this.deps.directory()
    if (directory === undefined) return []
    return outsideNotices(reading.addressing, reading.channelName, (teamId) => {
      const own = directory.channels(reading.projectId).find(channel => channel.teamId === teamId && channel.kind !== 'general' && channel.archived !== true)
      return own === undefined ? undefined : { id: own.id, name: own.name }
    })
  }
}

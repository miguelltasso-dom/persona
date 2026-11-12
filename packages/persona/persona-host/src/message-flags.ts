/**
 * Small facts about a message that must survive a reload but are not part of its text: it was a “Direcionar agora” (chip
 * “Direcionou {persona}”), or it is the line a Parar left (“Você parou aqui · Continuar”). One `screen_doc` per message.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { ChannelNotice } from './channel-notices.ts'
import type { DraftFileView, FanoutLineView, HarnessActionView, OpinionView, StateLineView, TaskWithView } from './types.ts'

const KIND = 'message_flags'

/** What the UI may need to decorate a message. */
export interface MessageFlagsDoc {
  /** Persona whose open turn this message was steered into. */
  readonly steeredPersonaId?: string
  /** The line a Parar posted. */
  readonly stopped?: true
  /** Ticket that was stopped. */
  readonly stoppedTicketId?: string
  /** CV-5: the line says who is working WITH the lead of a Task (the words are written by the UI from these fields). */
  readonly taskWith?: TaskWithView
  /** HT-3: the line says what the host did when the person moved a card to Fazendo. */
  readonly harness?: HarnessActionView
  /** CV-8: the line is one persona's part of a block. */
  readonly fanout?: FanoutLineView
  /** TEAM-4: the line is part of a round of opinion a persona asked of the team. */
  readonly opinion?: OpinionView
  /** R1: the line is a state of a Task (typed, so no screen has to read the words). */
  readonly stateLine?: StateLineView
  /** P0-C2: the line says what a persona SAVED in the draft during one turn (typed; the thumbnails live here, so they survive Aplicar and Descartar). */
  readonly filesSaved?: { readonly files: readonly DraftFileView[] }
  /** Item 22: the line is the "fence" notice of a channel (someone named is not on it): the buttons it offers. */
  readonly channelNotice?: readonly ChannelNotice[]
  /** CV-8: THIS message (the person's) started a block: it is answered by the block, so the recovery sweep must not answer it again. */
  readonly fanoutId?: string
}

/** Per-message flags. */
export class MessageFlags {
  readonly screens: ScreenRepos

  /**
   * @param screens - Doc store.
   */
  constructor(screens: ScreenRepos) {
    this.screens = screens
  }

  /**
   * @param projectId - Tenant.
   * @param messageId - Message.
   * @param flags - Facts to remember.
   */
  set(projectId: string, messageId: string, flags: MessageFlagsDoc): void {
    this.screens.put(projectId, KIND, messageId, flags)
  }

  /**
   * @param projectId - Tenant.
   * @param messageId - Message.
   * @returns The flags, or an empty object.
   */
  of(projectId: string, messageId: string): MessageFlagsDoc {
    return this.screens.get<MessageFlagsDoc>(projectId, KIND, messageId) ?? {}
  }
}

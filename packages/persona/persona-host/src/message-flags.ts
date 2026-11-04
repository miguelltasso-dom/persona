/**
 * Small facts about a message that must survive a reload but are not part of its text: it was a “Direcionar agora” (chip
 * “Direcionou {persona}”), or it is the line a Parar left (“Você parou aqui · Continuar”). One `screen_doc` per message.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'

const KIND = 'message_flags'

/** What the UI may need to decorate a message. */
export interface MessageFlagsDoc {
  /** Persona whose open turn this message was steered into. */
  readonly steeredPersonaId?: string
  /** The line a Parar posted. */
  readonly stopped?: true
  /** Ticket that was stopped. */
  readonly stoppedTicketId?: string
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

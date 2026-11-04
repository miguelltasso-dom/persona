/**
 * X-3: poll Rivet mappers → engine.receive; reply on the origin channel.
 * Tokens stay in an injected secret vault — never logged.
 */

import {
  originReply,
  receiveExternal,
  receiveExternalBatch,
  type OriginReply,
  type ReceiveResult,
  type Trigger,
} from '@deepseek-ai/dsh-persona-engine'
import {
  createProcessBudget,
  pollCalDav,
  pollDiscord,
  pollEmail,
  pollSlack,
  pollTelegram,
  replyDiscord,
  replyEmail,
  replySlack,
  replyTelegram,
  SOURCE_REQUEST_CAP,
  VAULT_CALDAV,
  VAULT_DISCORD,
  VAULT_IMAP,
  VAULT_SLACK,
  VAULT_TELEGRAM,
  type EmailMessage,
  type ProcessBudget,
} from '@deepseek-ai/dsh-persona-runners'
import type { Orchestration } from './orchestration.ts'

/** Sealed-credential reader (persona-vault in prod; Map in tests). */
export interface SecretVault {
  get(personId: string, provider: string): Promise<string | undefined>
}

/** Per-source fake HTTP roots. Empty skips that poll. */
export interface ExternalSourceEndpoints {
  telegram?: string
  slack?: string
  slackChannel?: string
  discord?: string
  discordChannel?: string
  calendar?: string
}

/** Intake outcomes for one poll batch. */
export interface PollExternalResult {
  results: ReceiveResult[]
}

/**
 * Host face: poll → receiveExternal; originReply → Rivet reply*.
 */
export class ExternalSourcesHost {
  readonly orchestration: Orchestration
  secrets: SecretVault
  fetchImpl: typeof fetch
  endpoints: ExternalSourceEndpoints
  emailList: () => Promise<readonly EmailMessage[]>
  emailSend: (input: { to: string; subject: string; text: string }) => Promise<boolean>
  /** Shared slot counter for Rivet `withSourceRequest` (X-4). */
  budget: ProcessBudget = createProcessBudget(SOURCE_REQUEST_CAP)

  /**
   * @param orchestration - Per-project engines.
   * @param secrets - Token reader.
   */
  constructor(orchestration: Orchestration, secrets: SecretVault = emptySecrets()) {
    this.orchestration = orchestration
    this.secrets = secrets
    this.fetchImpl = globalThis.fetch
    this.endpoints = {}
    this.emailList = () => Promise.resolve([])
    this.emailSend = () => Promise.resolve(false)
  }

  /**
   * Poll every configured source for `personId` and ingest into `projectId`.
   * @param projectId - Tenant engine.
   * @param personId - Vault owner.
   */
  async poll(projectId: string, personId: string): Promise<PollExternalResult> {
    const engine = this.orchestration.runtime(projectId).engine
    const triggers: Trigger[] = []
    const telegram = await this.secrets.get(personId, VAULT_TELEGRAM)
    if (telegram !== undefined && this.endpoints.telegram !== undefined) {
      triggers.push(...await pollTelegram({
        token: telegram, fetch: this.fetchImpl, baseUrl: this.endpoints.telegram, budget: this.budget,
      }))
    }
    const slack = await this.secrets.get(personId, VAULT_SLACK)
    if (slack !== undefined && this.endpoints.slack !== undefined) {
      triggers.push(...await pollSlack({
        token: slack,
        channel: this.endpoints.slackChannel ?? 'C-in',
        fetch: this.fetchImpl,
        baseUrl: this.endpoints.slack,
        budget: this.budget,
      }))
    }
    const discord = await this.secrets.get(personId, VAULT_DISCORD)
    if (discord !== undefined && this.endpoints.discord !== undefined) {
      triggers.push(...await pollDiscord({
        token: discord,
        channel: this.endpoints.discordChannel ?? 'D-in',
        fetch: this.fetchImpl,
        baseUrl: this.endpoints.discord,
        budget: this.budget,
      }))
    }
    const caldav = await this.secrets.get(personId, VAULT_CALDAV)
    if (caldav !== undefined && this.endpoints.calendar !== undefined) {
      triggers.push(...await pollCalDav({
        url: this.endpoints.calendar, fetch: this.fetchImpl, token: caldav, budget: this.budget,
      }))
    }
    const imap = await this.secrets.get(personId, VAULT_IMAP)
    if (imap !== undefined) triggers.push(...await pollEmail({ list: this.emailList, budget: this.budget }))
    return { results: receiveExternalBatch(engine, triggers) }
  }

  /**
   * Ingest one already-mapped Trigger (tests / webhook).
   * @param projectId - Tenant.
   * @param trigger - Rivet-mapped inbound.
   */
  receive(projectId: string, trigger: Trigger): ReceiveResult {
    return receiveExternal(this.orchestration.runtime(projectId).engine, trigger)
  }

  /**
   * Reply on the origin channel. Missing token ⇒ `{ ok: false }` (no throw, no log).
   * @param personId - Vault owner.
   * @param trigger - Stored inbound.
   * @param text - Reply body.
   */
  async reply(personId: string, trigger: Trigger, text: string): Promise<{ ok: boolean }> {
    const dest = originReply(trigger)
    if (dest === undefined) return { ok: false }
    return this.replyOrigin(personId, dest, text)
  }

  /**
   * Reply from a Remote-safe origin (no Trigger payload).
   * @param personId - Vault owner.
   * @param dest - originReply fields.
   * @param text - Body.
   */
  async replyOrigin(personId: string, dest: OriginReply, text: string): Promise<{ ok: boolean }> {
    if (dest.source === 'telegram' && dest.chat !== undefined && this.endpoints.telegram !== undefined) {
      const token = await this.secrets.get(personId, VAULT_TELEGRAM)
      if (token === undefined) return { ok: false }
      return replyTelegram({
        token, chat: dest.chat, text, fetch: this.fetchImpl, baseUrl: this.endpoints.telegram,
      })
    }
    if (dest.source === 'slack' && dest.channel !== undefined && this.endpoints.slack !== undefined) {
      const token = await this.secrets.get(personId, VAULT_SLACK)
      if (token === undefined) return { ok: false }
      return replySlack({
        token, channel: dest.channel, text, fetch: this.fetchImpl, baseUrl: this.endpoints.slack,
      })
    }
    if (dest.source === 'discord' && dest.channel !== undefined && this.endpoints.discord !== undefined) {
      const token = await this.secrets.get(personId, VAULT_DISCORD)
      if (token === undefined) return { ok: false }
      return replyDiscord({
        token, channel: dest.channel, text, fetch: this.fetchImpl, baseUrl: this.endpoints.discord,
      })
    }
    if (dest.source === 'email' && dest.to !== undefined) {
      return replyEmail({
        to: dest.to, subject: dest.subject ?? '', text, send: this.emailSend,
      })
    }
    return { ok: false }
  }

  /** Drop injected fakes (host test reset). */
  reset(): void {
    this.secrets = emptySecrets()
    this.fetchImpl = globalThis.fetch
    this.endpoints = {}
    this.emailList = () => Promise.resolve([])
    this.emailSend = () => Promise.resolve(false)
  }
}

function emptySecrets(): SecretVault {
  return { get: () => Promise.resolve(undefined) }
}

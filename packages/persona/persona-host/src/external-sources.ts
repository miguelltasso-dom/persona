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
  type EmailArrivalFilter,
  type ProcessBudget,
} from '@deepseek-ai/dsh-persona-runners'
import type { Orchestration } from './orchestration.ts'

/** Sealed-credential reader (persona-vault in prod; Map in tests). */
export interface SecretVault {
  /**
   * @param projectId - Tenant whose sources are being read (a connector belongs to one project).
   * @param personId - Vault owner.
   * @param provider - Rivet key (`telegram`, `slack`, `imap`, …).
   * @returns The token, or `undefined` when absent or revoked.
   */
  get(projectId: string, personId: string, provider: string): Promise<string | undefined>
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
  /** Per-project engines. */
  readonly orchestration: Orchestration
  /** Sealed-credential reader (persona-vault in prod; Map in tests). */
  secrets: SecretVault
  /** HTTP port (fake in tests). */
  fetchImpl: typeof fetch
  /** Per-source fake HTTP roots; empty skips that poll. */
  endpoints: ExternalSourceEndpoints
  /** Injected inbox reader (fake in tests); the real one is `emailReader`. */
  emailList: () => Promise<readonly EmailMessage[]>
  /** Injected SMTP send port. */
  emailSend: (input: { to: string; subject: string; text: string }) => Promise<boolean>
  /** Harvest 19b: the real read-only IMAP reader, when the vault holds a mailbox credential (JSON). */
  emailReader: ((secret: string) => Promise<readonly EmailMessage[]>) | undefined
  /** Harvest 19b: the project's inbox rule, read at the origin (before any Trigger exists). */
  emailFilter: (projectId: string) => EmailArrivalFilter | undefined = () => undefined
  /**
   * Item 26: the routines that listen to a source take their events HERE, before the engine sees them (the filter runs in code: an event nobody asked for costs
   * nothing). What they leave goes on as a conversation, as always. Default: nobody listens. The host wires the real one.
   */
  routineEvents: (projectId: string, triggers: readonly Trigger[]) => Trigger[] = (_projectId, triggers) => [...triggers]
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
    this.emailReader = undefined
  }

  /**
   * Poll every configured source for `personId` and ingest into `projectId`.
   * @param projectId - Tenant engine.
   * @param personId - Vault owner.
   * @returns The intake results, one per trigger plus one `filtered` per email the rule dropped.
   */
  async poll(projectId: string, personId: string): Promise<PollExternalResult> {
    const engine = this.orchestration.runtime(projectId).engine
    const triggers: Trigger[] = []
    const telegram = await this.secrets.get(projectId, personId, VAULT_TELEGRAM)
    if (telegram !== undefined && this.endpoints.telegram !== undefined) {
      triggers.push(...await pollTelegram({
        token: telegram, fetch: this.fetchImpl, baseUrl: this.endpoints.telegram, budget: this.budget,
      }))
    }
    const slack = await this.secrets.get(projectId, personId, VAULT_SLACK)
    if (slack !== undefined && this.endpoints.slack !== undefined) {
      triggers.push(...await pollSlack({
        token: slack,
        channel: this.endpoints.slackChannel ?? 'C-in',
        fetch: this.fetchImpl,
        baseUrl: this.endpoints.slack,
        budget: this.budget,
      }))
    }
    const discord = await this.secrets.get(projectId, personId, VAULT_DISCORD)
    if (discord !== undefined && this.endpoints.discord !== undefined) {
      triggers.push(...await pollDiscord({
        token: discord,
        channel: this.endpoints.discordChannel ?? 'D-in',
        fetch: this.fetchImpl,
        baseUrl: this.endpoints.discord,
        budget: this.budget,
      }))
    }
    const caldav = await this.secrets.get(projectId, personId, VAULT_CALDAV)
    if (caldav !== undefined && this.endpoints.calendar !== undefined) {
      triggers.push(...await pollCalDav({
        url: this.endpoints.calendar, fetch: this.fetchImpl, token: caldav, budget: this.budget,
      }))
    }
    const imap = await this.secrets.get(projectId, personId, VAULT_IMAP)
    let filtered = 0
    if (imap !== undefined) {
      const secret = imap
      const reader = this.emailReader
      const list = reader === undefined ? this.emailList : () => reader(secret)
      const filter = this.emailFilter(projectId)
      triggers.push(...await pollEmail({
        list,
        budget: this.budget,
        ...(filter === undefined ? {} : { filter }),
        onFiltered: () => { filtered += 1 },
      }))
    }
    return {
      results: [
        ...receiveExternalBatch(engine, this.routineEvents(projectId, triggers)),
        ...Array.from({ length: filtered }, () => 'filtered' as const),
      ],
    }
  }

  /**
   * Ingest one already-mapped Trigger (tests / webhook).
   * @param projectId - Tenant.
   * @param trigger - Rivet-mapped inbound.
   * @returns The engine's intake result.
   */
  receive(projectId: string, trigger: Trigger): ReceiveResult {
    return receiveExternal(this.orchestration.runtime(projectId).engine, trigger)
  }

  /**
   * Reply on the origin channel. Missing token ⇒ `{ ok: false }` (no throw, no log).
   * @param projectId - Tenant whose connector is used.
   * @param personId - Vault owner.
   * @param trigger - Stored inbound.
   * @param text - Reply body.
   * @returns Whether the outbound send succeeded.
   */
  async reply(projectId: string, personId: string, trigger: Trigger, text: string): Promise<{ ok: boolean }> {
    const dest = originReply(trigger)
    if (dest === undefined) return { ok: false }
    return this.replyOrigin(projectId, personId, dest, text)
  }

  /**
   * Reply from a Remote-safe origin (no Trigger payload).
   * @param projectId - Tenant whose connector is used.
   * @param personId - Vault owner.
   * @param dest - originReply fields.
   * @param text - Body.
   * @returns Whether the outbound send succeeded.
   */
  async replyOrigin(projectId: string, personId: string, dest: OriginReply, text: string): Promise<{ ok: boolean }> {
    if (dest.source === 'telegram' && dest.chat !== undefined && this.endpoints.telegram !== undefined) {
      const token = await this.secrets.get(projectId, personId, VAULT_TELEGRAM)
      if (token === undefined) return { ok: false }
      return replyTelegram({
        token, chat: dest.chat, text, fetch: this.fetchImpl, baseUrl: this.endpoints.telegram,
      })
    }
    if (dest.source === 'slack' && dest.channel !== undefined && this.endpoints.slack !== undefined) {
      const token = await this.secrets.get(projectId, personId, VAULT_SLACK)
      if (token === undefined) return { ok: false }
      return replySlack({
        token, channel: dest.channel, text, fetch: this.fetchImpl, baseUrl: this.endpoints.slack,
      })
    }
    if (dest.source === 'discord' && dest.channel !== undefined && this.endpoints.discord !== undefined) {
      const token = await this.secrets.get(projectId, personId, VAULT_DISCORD)
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
    this.emailReader = undefined
    this.emailFilter = () => undefined
  }
}

function emptySecrets(): SecretVault {
  return { get: () => Promise.resolve(undefined) }
}

/**
 * "Seus números" (colheita item 19a): a number or a small chart a persona reported in a conversation, pinned to the Visão geral and kept fresh by a
 * SILENT routine.
 *
 * - The offer is READ from the persona's message (`[[indicador: {json}]]`, engine `readIndicatorMarker`); nothing is stored until the person pins it.
 * - Pinning needs a TEST with real data first (`test`): the persona answers a quiet turn, the result is shown, and only a fresh test of that very
 *   message can be pinned. A recipe that cannot produce the number never becomes a card.
 * - A refresh is a quiet turn outside the thread (the same door as `/lado`): it NEVER posts a message to a channel or a DM. A failed refresh keeps
 *   the old value and says so; a fall past the alert rule goes to "Precisa de você" only.
 */

import {
  evaluateAlert,
  indicatorMarkerOf,
  INDICATOR_ALERT_DEFAULT_PCT,
  INDICATOR_NAME_MAX,
  readIndicatorMarker,
  readRefreshAnswer,
  type IndicatorData,
} from '@deepseek-ai/dsh-persona-engine'
import type { EventRepos, ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { IndicatorOfferView, IndicatorSchedule, IndicatorTestView, IndicatorView } from './types.ts'

const KIND = 'indicator'
const TEST_KIND = 'indicator_test'
const HOUR_MS = 3_600_000
/** A test is good to pin for this long. */
export const INDICATOR_TEST_TTL_MS = 15 * 60_000
/** The hour of the daily refresh (local time). */
export const INDICATOR_DAILY_HOUR = 8

interface IndicatorRecord {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly personaId: string
  readonly personaName: string
  /** What the person asked in the conversation (the recipe of the refresh). */
  readonly request: string
  readonly sourceMessageId: string
  readonly schedule: IndicatorSchedule
  readonly alertDropPct?: number
  readonly data: IndicatorData
  readonly status: 'ok' | 'updating' | 'failed'
  readonly failure?: string
  readonly updatedAt: string
  readonly createdAt: string
  readonly alert?: { readonly pct: number; readonly text: string; readonly at: string }
}

interface TestRecord {
  readonly id: string
  readonly projectId: string
  readonly messageId: string
  readonly personaId: string
  readonly personaName: string
  readonly name: string
  readonly request: string
  readonly data: IndicatorData
  readonly at: string
}

/** The quiet model turn, injected by the host (the same one `/lado` uses). */
export interface IndicatorAnswerer {
  blocked(projectId: string, personaId: string): { readonly code: string; readonly message: string } | undefined
  answer(projectId: string, personaId: string, askId: string, question: string): Promise<string>
}

export interface IndicatorsDeps {
  readonly product: Pick<ProductRepos, 'getPersona'>
  readonly screens: ScreenRepos
  readonly events: Pick<EventRepos, 'get' | 'listProject'>
  readonly answerer: IndicatorAnswerer
  readonly now: () => string
  /** Every project of the host (the timer refreshes what is due in all of them). */
  readonly projects: () => string[]
}

/** A refusal with a Portuguese line for the person (the host turns it into a Remote fault). */
export class IndicatorError extends Error {
  /** @param code - Reason for the host. @param message - Safe Portuguese line. */
  constructor(readonly code: 'not-found' | 'invalid-payload' | 'conflict', message: string) {
    super(message)
    this.name = 'IndicatorError'
  }
}

function alertRule(percent: number | undefined): { readonly dropPct: number } | undefined {
  return percent === undefined ? undefined : { dropPct: percent }
}

/**
 * The instant of the most recent daily refresh slot (08:00 local) at or before `now`.
 * @param now - The clock.
 */
export function lastDailySlot(now: Date): Date {
  const slot = new Date(now)
  slot.setHours(INDICATOR_DAILY_HOUR, 0, 0, 0)
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1)
  return slot
}

/**
 * Whether an indicator is due for its quiet refresh.
 * @param schedule - `hourly` (every hour) or `daily` (every day at 08:00).
 * @param updatedAt - When it was last updated (ISO).
 * @param now - The clock.
 */
export function isDue(schedule: IndicatorSchedule, updatedAt: string, now: Date): boolean {
  const last = Date.parse(updatedAt)
  if (Number.isNaN(last)) return true
  return schedule === 'hourly' ? now.getTime() - last >= HOUR_MS : last < lastDailySlot(now).getTime()
}

/** The pinned indicators: store, test, quiet refresh. */
export class Indicators {
  private readonly deps: IndicatorsDeps
  private readonly inflight = new Set<string>()

  /** @param deps - Host parts. */
  constructor(deps: IndicatorsDeps) {
    this.deps = deps
  }

  /**
   * The words and the offer of a persona's message (undefined when it carries no valid indicator).
   * @param messageId - The message.
   * @param body - Stored body.
   */
  offerOf(messageId: string, body: string): { readonly body: string; readonly offer?: IndicatorOfferView } | undefined {
    const read = readIndicatorMarker(body)
    if (read.text === body) return undefined
    return { body: read.text, ...(read.offer === undefined ? {} : { offer: { messageId, name: read.offer.name, data: read.offer.data } }) }
  }

  /**
   * Run the quiet turn for a message's indicator and keep the result for pinning. The persona answers ONLY with the marker line.
   * @param input - Tenant, the persona's message, schedule and alert.
   */
  async test(input: { readonly projectId: string; readonly messageId: string }): Promise<IndicatorTestView> {
    const event = this.deps.events.get(input.messageId)
    const persona = event === undefined ? undefined : this.deps.product.getPersona(event.actorId)
    const offer = event === undefined ? undefined : readIndicatorMarker(event.body).offer
    if (event === undefined || persona === undefined || persona.projectId !== input.projectId || offer === undefined) {
      throw new IndicatorError('not-found', 'Esse número não está mais na conversa.')
    }
    const request = this.requestBefore(input.projectId, event.streamId, event.seq) ?? offer.name
    const blocked = this.deps.answerer.blocked(input.projectId, persona.id)
    if (blocked !== undefined) throw new IndicatorError('invalid-payload', blocked.message)
    const fresh = await this.ask(input.projectId, persona.id, `indicator-test:${input.messageId}`, offer.name, offer.data, request)
    if ('failure' in fresh) throw new IndicatorError('invalid-payload', `Não consegui testar agora. ${fresh.failure}`)
    const test: TestRecord = {
      id: `itest:${input.messageId}:${this.deps.now()}`, projectId: input.projectId, messageId: input.messageId,
      personaId: persona.id, personaName: persona.name, name: offer.name, request, data: fresh.data, at: this.deps.now(),
    }
    this.deps.screens.put(input.projectId, TEST_KIND, test.id, test)
    return { testId: test.id, name: test.name, data: test.data }
  }

  /**
   * Pin what a test showed. Only a fresh test of the person's own request can be pinned.
   * @param input - The test, the name the person chose, the schedule and the alert.
   */
  pin(input: { readonly projectId: string; readonly testId: string; readonly name: string; readonly schedule: IndicatorSchedule; readonly alertDropPct?: number }): IndicatorView {
    const test = this.deps.screens.get<TestRecord>(input.projectId, TEST_KIND, input.testId)
    if (test === undefined) throw new IndicatorError('invalid-payload', 'Teste antes de fixar: assim você vê o número de verdade.')
    if (Date.parse(this.deps.now()) - Date.parse(test.at) > INDICATOR_TEST_TTL_MS) throw new IndicatorError('invalid-payload', 'O teste ficou velho. Teste de novo antes de fixar.')
    const name = input.name.replace(/\s+/gu, ' ').trim()
    if (name === '') throw new IndicatorError('invalid-payload', 'Dê um nome ao número.')
    if (name.length > INDICATOR_NAME_MAX) throw new IndicatorError('invalid-payload', `O nome passa de ${String(INDICATOR_NAME_MAX)} caracteres.`)
    if (input.schedule !== 'hourly' && input.schedule !== 'daily') throw new IndicatorError('invalid-payload', 'Escolha quando atualizar.')
    const pct = input.alertDropPct
    if (pct !== undefined && (!Number.isFinite(pct) || pct < 1 || pct > 99)) throw new IndicatorError('invalid-payload', 'O aviso de queda vai de 1% a 99%.')
    if (pct !== undefined && test.data.kind !== 'numero') throw new IndicatorError('invalid-payload', 'Só um número pode avisar quando cair.')
    if (this.records(input.projectId).some(row => row.sourceMessageId === test.messageId)) throw new IndicatorError('conflict', 'Esse número já está na Visão geral.')
    const at = this.deps.now()
    const row: IndicatorRecord = {
      id: `ind:${test.messageId}`, projectId: input.projectId, name, personaId: test.personaId, personaName: test.personaName, request: test.request,
      sourceMessageId: test.messageId, schedule: input.schedule, data: test.data, status: 'ok', updatedAt: at, createdAt: at,
      ...(pct === undefined ? {} : { alertDropPct: pct }),
    }
    this.put(row)
    this.deps.screens.delete(input.projectId, TEST_KIND, test.id)
    return this.view(row)
  }

  /**
   * @param projectId - Tenant.
   * @returns The pinned indicators, oldest first.
   */
  list(projectId: string): IndicatorView[] {
    return this.records(projectId).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(row => this.view(row))
  }

  /**
   * @param projectId - Tenant.
   * @param id - The indicator.
   * @returns true when it was there.
   */
  unpin(projectId: string, id: string): boolean {
    const row = this.deps.screens.get<IndicatorRecord>(projectId, KIND, id)
    if (row === undefined) return false
    this.deps.screens.delete(projectId, KIND, id)
    return true
  }

  /**
   * Refresh one indicator now (quiet). A failure keeps the old value and says why; the answer never reaches a conversation.
   * @param projectId - Tenant.
   * @param id - The indicator.
   */
  async refresh(projectId: string, id: string): Promise<IndicatorView> {
    const row = this.deps.screens.get<IndicatorRecord>(projectId, KIND, id)
    if (row === undefined) throw new IndicatorError('not-found', 'Esse número não está mais na Visão geral.')
    if (this.inflight.has(id)) return this.view(row)
    this.inflight.add(id)
    try {
      this.put({ ...row, status: 'updating' })
      const blocked = this.deps.answerer.blocked(projectId, row.personaId)
      const fresh = blocked !== undefined
        ? { failure: blocked.message }
        : await this.ask(projectId, row.personaId, `indicator:${id}`, row.name, row.data, row.request)
      const at = this.deps.now()
      const current = this.deps.screens.get<IndicatorRecord>(projectId, KIND, id)
      if (current === undefined) return this.view(row) // unpinned while it was updating
      if ('failure' in fresh) {
        const failed: IndicatorRecord = { ...current, status: 'failed', failure: fresh.failure }
        this.put(failed)
        return this.view(failed)
      }
      const fired = evaluateAlert(current.data, fresh.data, alertRule(current.alertDropPct))
      const { failure: _failure, alert: _alert, ...rest } = current
      const done: IndicatorRecord = { ...rest, data: fresh.data, status: 'ok', updatedAt: at, ...(fired === undefined ? {} : { alert: { pct: fired.pct, text: fired.text, at } }) }
      this.put(done)
      return this.view(done)
    } finally {
      this.inflight.delete(id)
    }
  }

  /**
   * Refresh every indicator that is due. Called by the host's timer.
   * @returns How many were refreshed.
   */
  async tick(): Promise<number> {
    const now = new Date(this.deps.now())
    let count = 0
    for (const projectId of this.projects()) {
      for (const row of this.records(projectId)) {
        if (row.status === 'updating' || this.inflight.has(row.id) || !isDue(row.schedule, row.updatedAt, now)) continue
        await this.refresh(projectId, row.id).catch(() => undefined)
        count += 1
      }
    }
    return count
  }

  /**
   * The alerts that wait for the person ("Precisa de você"): the indicators whose last refresh fell past the rule.
   * @param projectId - Tenant.
   */
  alerts(projectId: string): { readonly id: string; readonly title: string; readonly at: string; readonly personaId: string; readonly personaName: string }[] {
    return this.records(projectId).flatMap(row => row.alert === undefined
      ? []
      : [{ id: `indicator:${row.id}:${row.alert.at}`, title: `${row.name}: ${row.alert.text}`, at: row.alert.at, personaId: row.personaId, personaName: row.personaName }])
  }

  private async ask(projectId: string, personaId: string, askId: string, name: string, was: IndicatorData, request: string): Promise<{ readonly data: IndicatorData } | { readonly failure: string }> {
    const format = indicatorMarkerOf({ name, data: was })
    const question = `Atualize o número «${name}» sem escrever na conversa. O pedido original foi: «${request}». Responda SOMENTE com uma linha no mesmo formato de antes, com os dados de agora, sem outro texto. Formato de antes: ${format}`
    try {
      const text = await this.deps.answerer.answer(projectId, personaId, askId, question)
      return readRefreshAnswer(text, was.kind)
    } catch (error: unknown) {
      return { failure: error instanceof Error && error.message !== '' ? error.message : 'Não consegui atualizar agora.' }
    }
  }

  /** The last words of a person before a persona's message in its stream: what the number was asked for. */
  private requestBefore(projectId: string, streamId: string, seq: number): string | undefined {
    const earlier = this.deps.events.listProject(projectId)
      .filter(item => item.streamId === streamId && item.seq < seq && item.type === 'message' && !item.deleted && this.deps.product.getPersona(item.actorId) === undefined)
      .sort((a, b) => b.seq - a.seq)[0]
    const words = earlier?.body.replace(/\s+/gu, ' ').trim()
    return words === undefined || words === '' ? undefined : words.slice(0, 300)
  }

  private projects(): string[] {
    return this.deps.projects()
  }

  private records(projectId: string): IndicatorRecord[] {
    return this.deps.screens.list<IndicatorRecord>(projectId, KIND)
  }

  private put(row: IndicatorRecord): void {
    this.deps.screens.put(row.projectId, KIND, row.id, row)
  }

  private view(row: IndicatorRecord): IndicatorView {
    return {
      id: row.id, name: row.name, kind: row.data.kind, data: row.data, schedule: row.schedule, status: row.status, updatedAt: row.updatedAt,
      personaId: row.personaId, personaName: row.personaName, sourceMessageId: row.sourceMessageId,
      ...(row.alertDropPct === undefined ? {} : { alertDropPct: row.alertDropPct }),
      ...(row.failure === undefined ? {} : { failure: row.failure }),
      ...(row.alert === undefined ? {} : { alert: row.alert }),
    }
  }
}

export { INDICATOR_ALERT_DEFAULT_PCT }

/**
 * CV-8 (contracts/mentions-fanout.md): the host side of "Toda a equipe", "Quem tiver algo a dizer" and several `@menções`. One
 * message of the person becomes a block of TYPED lines, one per persona consulted (`MessageView.fanout`); the UI writes the words,
 * the body is a readable fallback. The pure part (who is asked, the pool, the answers) is `fanout-run.ts`; this file only binds it to
 * the host: the persona's state, one short model turn, the line in the thread, and the work chain `flush` waits for.
 */

import type { StoredEvent, StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { FAILED_ERROR, runFanout, type FanoutLine } from './fanout-run.ts'
import { classifyFanoutAnswer, type FanoutGate, type FanoutSource } from './fanout-plan.ts'
import type { FanoutLineView } from './types.ts'

/** What the host provides. */
export interface FanoutHostDeps {
  /** The persona's state now: paused, at the limit (and until when). */
  gateOf(projectId: string, persona: StoredPersona): FanoutGate
  /** ONE short, tool-free conversation turn on a session of its own. Resolves with the text. */
  answer(projectId: string, persona: StoredPersona, session: string, prompt: string): Promise<string>
  /** Write one line of a persona in the thread. */
  say(event: StoredEvent, persona: StoredPersona, id: string, body: string): void
  /** Remember what the line says, typed (survives a reload). */
  flag(projectId: string, lineId: string, view: FanoutLineView): void
  /** Replace the body of a line in place (a retry). */
  edit(lineId: string, body: string): void
  /** Mark the person's message as the start of a block — synchronously, before any line exists (the recovery sweep reads it). */
  begin(projectId: string, messageId: string, fanoutId: string): void
  /** Join the host's work chain (so `flush` waits for the block). */
  queue(job: () => Promise<void>): void
  /** Width of the pool of simultaneous calls. */
  readonly concurrency?: number
}

/** One block to run. */
export interface FanoutStart {
  /** The message of the person that asked (the lines hang from it). */
  readonly event: StoredEvent
  readonly source: FanoutSource
  readonly personas: readonly StoredPersona[]
  /** Speaks for "nobody was picked" and makes the pick of "Quem tiver algo a dizer". */
  readonly coordination?: StoredPersona
  /** The instruction each persona gets (default: the whole-team prompt). */
  readonly promptOf?: (persona: StoredPersona, total: number) => string
  /** The text the personas read (default: the message's body). */
  readonly message?: string
}

/** The readable fallback of a line (the UI writes its own words from the typed fields). */
function bodyOf(line: FanoutLine<StoredPersona>): string {
  const name = line.persona.name
  switch (line.kind) {
    case 'reply': return line.text ?? ''
    case 'nothing': return line.nobody === true ? 'Ninguém tem algo a acrescentar agora.' : `${name}: nada a acrescentar.`
    case 'limit': return `${name} está no limite agora.`
    case 'paused': return `${name} está em pausa.`
    case 'failed': return `${name} não conseguiu responder agora.`
  }
}

/** One persona to repeat in a block that already exists. */
export interface FanoutRetry {
  readonly event: StoredEvent
  readonly persona: StoredPersona
  /** The line as it is now (kept: block id, source, total, position). */
  readonly line: FanoutLineView
  /** The instruction the persona gets again. */
  readonly prompt: string
}

/** Runs fan-out blocks. */
export class TeamFanout {
  private readonly deps: FanoutHostDeps
  private readonly retrying = new Set<string>()

  /**
   * @param deps - The host's ports.
   */
  constructor(deps: FanoutHostDeps) {
    this.deps = deps
  }

  /**
   * “Tentar de novo”: ask ONE persona again and replace her line in place (same id, same place in the block). One attempt at a time per line.
   * @param input - The block's message, the persona, her current line and the instruction.
   * @returns false when an attempt for this line is already running.
   */
  retry(input: FanoutRetry): boolean {
    const { deps } = this
    const lineId = `coord-${input.event.id}-fan-${input.persona.id}`
    if (this.retrying.has(lineId)) return false
    this.retrying.add(lineId)
    deps.queue(async () => {
      try {
        let kind: FanoutLineView['kind'] = 'failed'
        let text = ''
        try {
          const answer = classifyFanoutAnswer(await deps.answer(input.event.projectId, input.persona, `fan-${input.event.id}-${input.persona.id}-retry`, input.prompt))
          if (answer.kind === 'reply') { kind = 'reply'; text = answer.text } else if (answer.kind === 'nothing') kind = 'nothing'
        } catch {
          kind = 'failed'
        }
        const { message: _gone, until: _until, ...keep } = input.line
        void _gone
        void _until
        const view: FanoutLineView = kind === 'failed'
          ? { ...keep, kind, message: FAILED_ERROR }
          : { ...keep, kind }
        deps.edit(lineId, kind === 'reply' ? text : kind === 'nothing' ? `${input.persona.name}: nada a acrescentar.` : `${input.persona.name} não conseguiu responder agora.`)
        deps.flag(input.event.projectId, lineId, view)
      } finally {
        this.retrying.delete(lineId)
      }
    })
    return true
  }

  /**
   * Run a block in the background (on the work chain). Every persona consulted gets exactly one line.
   * @param input - The message, the audience and where it came from.
   */
  start(input: FanoutStart): void {
    const { deps } = this
    const { event } = input
    const fanoutId = `fan-${event.id}`
    deps.begin(event.projectId, event.id, fanoutId)
    deps.queue(async () => {
      await runFanout<StoredPersona>({
        fanoutId,
        source: input.source,
        personas: input.personas,
        message: input.message ?? event.body,
        ...(input.coordination === undefined ? {} : { coordination: input.coordination }),
        ...(input.promptOf === undefined ? {} : { promptOf: input.promptOf }),
        deps: {
          gateOf: persona => deps.gateOf(event.projectId, persona),
          ask: (persona, prompt) => deps.answer(event.projectId, persona, `fan-${event.id}-${persona.id}`, prompt),
          ...(input.coordination === undefined ? {} : {
            pick: prompt => deps.answer(event.projectId, input.coordination!, `fanpick-${event.id}`, prompt),
          }),
          post: (line) => {
            const id = `coord-${event.id}-fan-${line.persona.id}`
            deps.say(event, line.persona, id, bodyOf(line))
            deps.flag(event.projectId, id, {
              id: line.fanoutId, source: line.source, total: line.total, index: line.index, personaId: line.persona.id, kind: line.kind,
              ...(line.until === undefined ? {} : { until: line.until }),
              ...(line.message === undefined ? {} : { message: line.message }),
              ...(line.nobody === true ? { nobody: true as const } : {}),
            })
          },
          ...(deps.concurrency === undefined ? {} : { concurrency: deps.concurrency }),
        },
      })
    })
  }
}

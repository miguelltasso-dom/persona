/**
 * IV-6: `/lado` for real. A side question to a persona is answered OUTSIDE the thread and the running task: its own
 * short model turn on a separate session, never a message of the conversation. The ask is stored first (`asking`), then
 * the answer (`answered`) or a typed, honest failure (`failed`) is written on the same document, so the UI shows every
 * state and a reload still finds it.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { SUMMARY_PROMPT_HEAD, SUMMARY_SHOWN } from './conversation-summary.ts'
import type { AsideAskView, OpenAsideAskRequest } from './types.ts'
import type { WorkingSendHost } from './working-send-host.ts'

const KIND = 'aside_ask'

/** Why a side question could not be answered (the UI owns the wording; `message` is a safe default). */
export type AsideFailure = 'paused' | 'no_engine' | 'failed'

/** The model turn, injected by the host. Resolves with the answer text. */
export interface AsideAnswerer {
  /** Idle reasons are reported before any model is reached. */
  blocked(projectId: string, personaId: string): { readonly code: AsideFailure; readonly message: string } | undefined
  answer(projectId: string, personaId: string, askId: string, question: string): Promise<string>
}

/**
 * A side question as the person may read it. An ask stored BEFORE it had a kind may carry the host's own `/resumo` prompt as its question
 * (the reload showed it): it is read as a `summary` with the short title, the stored text is never returned.
 */
function readable(view: AsideAskView): AsideAskView {
  if (view.kind !== undefined) return view
  return view.question.startsWith(SUMMARY_PROMPT_HEAD) ? { ...view, kind: 'summary', question: SUMMARY_SHOWN } : view
}

/** Stored side questions. */
export class AsideAsks {
  readonly docs: ScreenRepos
  readonly workingSend: WorkingSendHost
  readonly answerer: AsideAnswerer
  readonly now: () => string
  private readonly pending = new Set<Promise<void>>()

  /**
   * @param docs - Doc store.
   * @param workingSend - Creates the ask document (kept so the old contract stays).
   * @param answerer - The model turn.
   * @param now - Instant factory.
   */
  constructor(docs: ScreenRepos, workingSend: WorkingSendHost, answerer: AsideAnswerer, now: () => string) {
    this.docs = docs
    this.workingSend = workingSend
    this.answerer = answerer
    this.now = now
  }

  /**
   * Store the question and start answering it in the background. Returns at once with `status: 'asking'`
   * (or `failed` when the persona cannot answer right now).
   * @param request - The `/lado` question.
   */
  open(request: OpenAsideAskRequest): AsideAskView {
    // What is STORED and shown is what the person asked (or a short title for a /resumo); the host's prompt goes only to the answerer.
    const kind = request.kind ?? 'aside'
    const created = { ...this.workingSend.aside({ ...request, question: request.shown ?? request.question }), kind }
    const blocked = this.answerer.blocked(request.projectId, request.personaId)
    if (blocked !== undefined) return this.write(request.projectId, { ...created, status: 'failed', error: blocked.code, message: blocked.message })
    const asking = this.write(request.projectId, { ...created, status: 'asking' })
    const work = this.answerer.answer(request.projectId, request.personaId, created.id, request.question)
      .then((text) => { this.write(request.projectId, { ...asking, status: 'answered', answer: text, answeredAt: this.now() }) })
      .catch((error: unknown) => {
        this.write(request.projectId, {
          ...asking, status: 'failed', error: 'failed',
          message: error instanceof Error && error.message !== '' ? error.message : 'Não consegui responder agora. Tente de novo.',
        })
      })
      .finally(() => { this.pending.delete(work) })
    this.pending.add(work)
    return asking
  }

  /**
   * @param projectId - Tenant.
   * @param id - Ask id.
   */
  get(projectId: string, id: string): AsideAskView | undefined {
    const view = this.docs.get<AsideAskView>(projectId, KIND, id)
    return view === undefined ? undefined : readable(view)
  }

  /**
   * @param projectId - Tenant.
   * @param personaId - Persona asked.
   * @param subjectId - Conversation subject.
   */
  list(projectId: string, personaId: string, subjectId: string): AsideAskView[] {
    return this.docs.list<AsideAskView>(projectId, KIND)
      .filter(row => row.personaId === personaId && row.subjectId === subjectId)
      .map(readable)
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  /** Resolves when every answer in flight has been written (tests, shutdown). */
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending])
  }

  private write(projectId: string, view: AsideAskView): AsideAskView {
    this.docs.put(projectId, KIND, view.id, view)
    return view
  }
}

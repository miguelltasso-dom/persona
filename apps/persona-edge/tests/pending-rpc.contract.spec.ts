import { expect, it } from 'vitest'
import {
  commentGestorPlan,
  composeCitedMessage,
  dropQueuedMessage,
  editQueuedMessage,
  enqueueWorkingMessage,
  groupTurnActivity,
  matchComposerSlash,
  openAsideAsk,
  pauseAtLimit,
  resolveGestorTie,
  resolveWorkingSend,
  resumeAfterLimit,
  type GestorPlan,
  type TurnActivityEvent,
} from '../../../packages/persona/persona-core/src/domain/index.ts'

/** In-memory stand-in for `team_manager_plan` until the host remotes land. */
class PlanBook {
  readonly rows: GestorPlan[] = []

  put(plan: GestorPlan): void {
    const index = this.rows.findIndex(row => row.id === plan.id)
    if (index === -1) this.rows.push(plan)
    else this.rows[index] = plan
  }

  open(scopeKey: string): GestorPlan[] {
    return this.rows.filter(row => row.scopeKey === scopeKey && row.status === 'proposed')
  }

  display(): GestorPlan[] {
    return this.rows.filter(row =>
      row.status === 'proposed' || row.status === 'commented'
      || row.status === 'applied' || row.status === 'rejected')
  }
}

it('GES-3: second Gestor comments; human tie rejects the rest; original stays proposed', () => {
  const book = new PlanBook()
  const first: GestorPlan = {
    id: 'plan-a',
    workspaceId: 'ws',
    gestorId: 'g1',
    action: 'hire',
    scopeKey: 'proj:pp',
    summary: 'contratar Nina',
    reason: 'porque o quadro está vazio',
    status: 'proposed',
    createdAt: '2026-11-04T05:00:00Z',
  }
  book.put(first)
  const comment = commentGestorPlan({
    open: book.open('proj:pp'),
    scopeKey: 'proj:pp',
    commenterId: 'g2',
    workspaceId: 'ws',
    commentId: 'plan-b',
    comment: 'prefiro o tamanduá',
    at: '2026-11-04T05:01:00Z',
  })
  expect(comment.kind).toBe('comment')
  if (comment.kind !== 'comment') return
  expect(comment.existingId).toBe('plan-a')
  expect(comment.plan.status).toBe('commented')
  expect(comment.plan.commentOnId).toBe('plan-a')
  book.put(comment.plan)
  expect(book.open('proj:pp').map(row => row.id)).toEqual(['plan-a'])
  expect(book.display().some(row => row.id === 'plan-b' && row.commentOnId === 'plan-a')).toBe(true)

  const tie = resolveGestorTie({
    plans: book.display(),
    chosenId: 'plan-b',
  })
  book.put(tie.winner)
  for (const row of tie.rejected) book.put(row)
  expect(tie.winner.status).toBe('proposed')
  expect(tie.rejected.map(row => row.id)).toContain('plan-a')
  expect(tie.rejected.every(row => row.status === 'rejected')).toBe(true)
  expect(book.display().find(row => row.id === 'plan-a')?.status).toBe('rejected')
})

it('T3 §9: listTurnActivity fold — empty is not 0% success; failure is not done', () => {
  expect(groupTurnActivity([])).toEqual([])
  const events: TurnActivityEvent[] = [
    {
      id: 'e1', personaId: 'fox', threadId: 'geral', kind: 'command',
      title: 'git status', status: 'done', at: '2026-11-04T05:00:00Z',
    },
    {
      id: 'e2', personaId: 'fox', threadId: 'geral', kind: 'file',
      title: 'README', status: 'failed', at: '2026-11-04T05:00:01Z',
    },
    {
      id: 'e3', personaId: 'fox', threadId: 'geral', kind: 'read',
      title: 'docs', status: 'waiting', at: '2026-11-04T05:00:02Z',
    },
  ]
  const folds = groupTurnActivity(events)
  expect(folds).toHaveLength(1)
  expect(folds[0].doneByKind.command).toBe(1)
  expect(folds[0].doneByKind.file).toBeUndefined()
  expect(folds[0].failedCount).toBe(1)
  expect(folds[0].unfinished).toBe(true)
  expect(folds[0].shownKinds).toEqual(['command'])
})

it('T3 §4/§11/§12: working queue persists across pause; /lado stays off-thread', () => {
  expect(resolveWorkingSend(false, 'queue', false)).toBe('steer')
  expect(resolveWorkingSend(true, 'queue', true)).toBe('steer')
  const queued = enqueueWorkingMessage({
    id: 'q1', personaId: 'fox', subjectId: 'geral', text: '  depois  ', createdAt: '2026-11-04T05:00:00Z',
  })
  expect(queued.text).toBe('depois')
  const edited = editQueuedMessage([queued], 'q1', 'agora sim')
  expect(edited[0].text).toBe('agora sim')
  expect(dropQueuedMessage(edited, 'q1')).toEqual([])
  const aside = openAsideAsk({
    id: 'a1', personaId: 'fox', subjectId: 'geral', question: 'quanto falta?',
  })
  expect(aside.onThread).toBe(false)
  const pause = pauseAtLimit('cota da conta', '2026-11-04T06:00:00Z', [queued])
  expect(resumeAfterLimit(pause).keepQueue).toBe(true)
  expect(resumeAfterLimit(pause).queue).toEqual([queued])
  expect(matchComposerSlash('/lado o que falta?')).toBe('lado')
  expect(composeCitedMessage('trecho', 'e aí?').prompt).toContain('citacao')
})

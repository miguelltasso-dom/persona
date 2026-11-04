import { expect, it } from 'vitest'
import {
  asideStaysOffThread,
  composeCitedMessage,
  dropQueuedMessage,
  editQueuedMessage,
  enqueueWorkingMessage,
  matchComposerSlash,
  openAsideAsk,
  pauseAtLimit,
  resolveWorkingSend,
  resumeAfterLimit,
} from '../src/index.ts'

const at = '2026-11-04T03:40:00.000Z'

it('queues by default while working and steers on Ctrl+Enter', () => {
  expect(resolveWorkingSend(false, 'queue', false)).toBe('steer')
  expect(resolveWorkingSend(true, 'queue', false)).toBe('queue')
  expect(resolveWorkingSend(true, 'queue', true)).toBe('steer')
  expect(resolveWorkingSend(true, 'steer', true)).toBe('queue')
})

it('edits and drops a dashed queued bubble; empty text is refused', () => {
  const row = enqueueWorkingMessage({
    id: 'q1', personaId: 'nina', subjectId: 's1', text: '  usa integral  ', createdAt: at,
  })
  expect(row.text).toBe('usa integral')
  const edited = editQueuedMessage([row], 'q1', 'usa integral e gergelim')
  expect(edited[0]?.text).toContain('gergelim')
  expect(dropQueuedMessage(edited, 'q1')).toEqual([])
  expect(() => enqueueWorkingMessage({
    id: 'q2', personaId: 'nina', subjectId: 's1', text: '   ', createdAt: at,
  })).toThrow('INVALID_PERSONA')
})

it('keeps /lado off the thread', () => {
  const ask = openAsideAsk({
    id: 'a1', personaId: 'nina', subjectId: 's1', question: 'qual o preço do pão?',
  })
  expect(ask.onThread).toBe(false)
  expect(asideStaysOffThread(ask)).toBe(true)
})

it('keeps a citation and a comment in separate blocks', () => {
  const cited = composeCitedMessage('prazo 30 dias', 'confira a cláusula')
  expect(cited.prompt).toContain('origem="citacao"')
  expect(cited.prompt).toContain('origem="comentario"')
  expect(cited.quote).toBe('prazo 30 dias')
})

it('pauses at a limit without dropping the queue, and resumes keeping it', () => {
  const queued = enqueueWorkingMessage({
    id: 'q1', personaId: 'nina', subjectId: 's1', text: 'usa integral', createdAt: at,
  })
  const pause = pauseAtLimit('cota Claude até 18:30', '2026-11-04T21:30:00.000Z', [queued])
  expect(resumeAfterLimit(pause)).toEqual({ keepQueue: true, queue: [queued] })
  expect(matchComposerSlash('/lado qual o preço?')).toBe('lado')
  expect(matchComposerSlash('/limites')).toBe('limites')
})

/**
 * OPT-10: the runner session wraps the FIRST delivery of a worker session in the worker prompt (`prefixOwnerNorms`). The answer-only route's prompt
 * (`firstDeliveryExecutionPrompt`) already IS a worker prompt, so wrapping it again sent the whole template and the owner norms twice (measured on the
 * real first-delivery prompt: 3,299 characters, 910 of them the second copy). The wrap is idempotent now; a prompt that is only an assignment still gets
 * the one worker prompt, exactly as before.
 */
import { WORKER_LEAN_REPORT_RULE, WORKER_PROMPT_MARK, firstDeliveryExecutionPrompt, firstDeliveryTask } from '@deepseek-ai/dsh-persona-engine'
import { expect, it } from 'vitest'
import { OWNER_NORMS, executorPrompt, prefixOwnerNorms } from '../src/index.ts'

const NINA = { id: 'nina', name: 'Nina', title: 'Padeira-chefe', instructions: 'Montar cardápios e conferir estoque.' }
const count = (text: string, needle: string): number => text.split(needle).length - 1

function answerOnlyPrompt(): string {
  const task = firstDeliveryTask({ companyBrief: 'Padaria Estrela: pães artesanais, entrega local, 3 funcionários.', executorName: 'Nina' })
  return firstDeliveryExecutionPrompt({
    fields: {
      identity: { name: 'Nina', title: 'Padeira-chefe' }, personality: 'Calorosa.', instructions: NINA.instructions, functionLabel: 'Padeira-chefe', vault: '',
      capabilities: 'Primeira entrega em texto. Sem ferramentas, shell ou arquivos. Execute a atribuição diretamente.',
    },
    assignment: task.assignment,
  })
}

it('an assignment that is only an assignment gets the ONE worker prompt, as before', () => {
  const wrapped = prefixOwnerNorms('Implemente o filtro de pedidos.', NINA)
  expect(wrapped).toBe(`${executorPrompt(NINA)}\n\nImplemente o filtro de pedidos.`)
  expect(count(wrapped, WORKER_PROMPT_MARK)).toBe(1)
  expect(count(wrapped, 'Normas de dono')).toBe(1)
  expect(wrapped).toContain(OWNER_NORMS)
})

it('the answer-only route\'s prompt already is a worker prompt: the wrap leaves it alone (one template, no second copy of the norms)', () => {
  const inner = answerOnlyPrompt()
  expect(count(inner, WORKER_PROMPT_MARK)).toBe(1)
  const wrapped = prefixOwnerNorms(inner, NINA)
  expect(wrapped).toBe(inner)
  expect(count(wrapped, WORKER_PROMPT_MARK)).toBe(1)
  // the persona's instructions and the assignment are all still in it, once
  expect(count(wrapped, 'Montar cardápios e conferir estoque.')).toBeGreaterThanOrEqual(1)
  expect(wrapped).toContain('Esta tarefa pede apenas uma resposta em texto')
  // 3,299 characters before the fix; the second copy was 910 of them
  expect(wrapped.length).toBeLessThan(2500)
})

it('the lean-report rule, when asked for, still rides in on a prompt that is already a worker prompt (once)', () => {
  const inner = answerOnlyPrompt()
  const lean = prefixOwnerNorms(inner, NINA, { leanReport: true })
  expect(lean.startsWith(WORKER_LEAN_REPORT_RULE)).toBe(true)
  expect(count(lean, WORKER_LEAN_REPORT_RULE)).toBe(1)
  expect(prefixOwnerNorms(lean, NINA, { leanReport: true })).toBe(lean)
})

it('executorPrompt for a call without tools drops the two tool sentences and keeps the norms', () => {
  const none = executorPrompt(NINA, { tools: 'none' })
  expect(none).not.toContain('ferramentas da Persona quando disponíveis')
  expect(none).toContain(OWNER_NORMS)
  expect(executorPrompt(NINA)).toContain('ferramentas da Persona quando disponíveis')
})

// ---- W3 for short answers only (default OFF) ----------------------------------------------------------------------------------

it('leanShortAnswers: only a short-answer task gets the lean report; a deliverable, a review, a handoff and the first delivery keep the full one', () => {
  const lean = (text: string): boolean => prefixOwnerNorms(text, NINA, { leanShortAnswers: true }).includes(WORKER_LEAN_REPORT_RULE)
  expect(lean('Quanto dá 12 pães a R$ 1,50 e 4 bolos a R$ 18?')).toBe(true)
  expect(lean('Confira se temos farinha para sábado.')).toBe(true)
  expect(lean('Monte o cardápio da semana com preços')).toBe(false)
  expect(lean('Implemente o filtro de pedidos.')).toBe(false)
  expect(lean('Qual a cor? <bilhete>\nFalta:\n- tudo\n</bilhete>')).toBe(false)
  expect(lean(answerOnlyPrompt())).toBe(false)
})

it('the rule rides in ONCE, before the norms-and-instructions block is closed, and the rest of the wrap is exactly the one worker prompt', () => {
  const text = 'Quantas encomendas temos para amanhã?'
  const wrapped = prefixOwnerNorms(text, NINA, { leanShortAnswers: true })
  expect(count(wrapped, WORKER_LEAN_REPORT_RULE)).toBe(1)
  expect(count(wrapped, WORKER_PROMPT_MARK)).toBe(1)
  expect(wrapped.endsWith(`\n\n${text}`)).toBe(true)
})

it('off by default: without the switch no task is lean; the old all-tasks switch (leanReport) still means every task', () => {
  expect(prefixOwnerNorms('Quantas encomendas temos para amanhã?', NINA)).not.toContain(WORKER_LEAN_REPORT_RULE)
  expect(prefixOwnerNorms('Monte o cardápio da semana', NINA, { leanReport: true })).toContain(WORKER_LEAN_REPORT_RULE)
  expect(prefixOwnerNorms('Monte o cardápio da semana', NINA, { leanShortAnswers: false })).not.toContain(WORKER_LEAN_REPORT_RULE)
})

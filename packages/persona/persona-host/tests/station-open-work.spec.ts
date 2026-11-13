import { describe, expect, it } from 'vitest'
import { countOpenWork, type OpenWorkTicket } from '../src/station/open-work.ts'

const ticket = (state: string, report?: string, ended?: boolean): OpenWorkTicket => ({
  ...(ended === true ? { ended: '2026-11-12T03:00:00.000Z' } : {}),
  assignments: [{ state, ...(report === undefined ? {} : { report: { state: report } }) }],
})

describe('M4: quantos cartões a estação ainda pode andar sozinha', () => {
  it('conta o que está em andamento: pendente, rodando sem relatório ou com progresso', () => {
    expect(countOpenWork([[ticket('pending'), ticket('running'), ticket('running', 'progress')]])).toBe(3)
  })

  it('não conta o que espera a pessoa ou um gatilho, nem o que já acabou', () => {
    const waiting = [ticket('running', 'blocked'), ticket('running', 'failed'), ticket('running', 'waiting'), ticket('running', 'ready'), ticket('ended'), ticket('pending', undefined, true)]
    expect(countOpenWork([waiting])).toBe(0)
  })

  it('soma vários projetos e ignora cartão sem atribuição', () => {
    expect(countOpenWork([[ticket('pending')], [ticket('running', 'progress'), { assignments: [] }]])).toBe(2)
  })

  it('sem projetos, zero', () => {
    expect(countOpenWork([])).toBe(0)
  })
})

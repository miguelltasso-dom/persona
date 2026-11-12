// @vitest-environment jsdom
// COLHEITA §6 (Quill): a frase do passo que o host manda em PersonaNowView.sentence (Flint, busy-status) chega ao membro e à linha do fio.
// Só com `working`; sem frase, a linha diz "Trabalhando". O cliente não inventa a frase.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkStepLine } from '../src/client/chat/work-step/WorkStepLine.tsx'
import { plainStepSentence, workStepText } from '../src/client/chat/work-step/work-step-model.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { mapPersonaNowRow } from '../src/client/remote/map-host-ui.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

const LABELS = { line: (name: string, text: string) => `${name} · ${text}`, working: 'Trabalhando' }
const TEAM = { personas: [] } as never

function row(over: Record<string, unknown>) {
  return { personaId: 'bia', name: 'Bia', title: 'Redatora', state: 'working', currentTask: '', queueCount: 0, ...over } as never
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('frase do passo · regra do cliente', () => {
  it('a frase do host vem com a primeira letra maiúscula na linha', () => {
    expect(plainStepSentence('lendo os arquivos')).toBe('Lendo os arquivos')
    expect(workStepText({ name: 'Bia', step: 'pesquisando na internet', labels: LABELS })).toBe('Bia · Pesquisando na internet')
  })

  it('a frase só existe com `working`: em repouso o membro não leva passo', () => {
    expect(mapPersonaNowRow(row({ state: 'working', sentence: 'lendo os arquivos' }), TEAM).member.step).toBe('lendo os arquivos')
    expect(mapPersonaNowRow(row({ state: 'resting', sentence: 'lendo os arquivos' }), TEAM).member.step).toBeUndefined()
  })

  it('sem frase, ou com frase só de espaços, o membro não leva passo (a linha diz "Trabalhando")', () => {
    expect(mapPersonaNowRow(row({ state: 'working' }), TEAM).member.step).toBeUndefined()
    expect(mapPersonaNowRow(row({ state: 'working', sentence: '   ' }), TEAM).member.step).toBeUndefined()
  })
})

describe('frase do passo · na linha do fio', () => {
  it('o membro com passo mostra "Nome · Frase" depois de 5 s, sem a prop step', () => {
    const member: ChannelPersonaMember = { id: 'bia' as never, name: 'Bia', role: 'x', state: 'working', step: 'escrevendo um arquivo' }
    render(<WorkStepLine t={t as never} member={member} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('Bia · Escrevendo um arquivo')).toBeTruthy()
  })

  it('sem passo no membro, a linha diz "Bia · Trabalhando"', () => {
    const member: ChannelPersonaMember = { id: 'bia' as never, name: 'Bia', role: 'x', state: 'working' }
    render(<WorkStepLine t={t as never} member={member} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('Bia · Trabalhando')).toBeTruthy()
  })
})

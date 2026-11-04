// @vitest-environment jsdom
// Skills do perfil: ações reais (ativar, voltar a candidata, compartilhar com confirmação) e nenhum botão sem ação.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { skillViewsToRecords } from '../src/client/data/adapters/skills.ts'
import { pt } from '../src/client/locale/skills/locales.ts'
import { SkillsPanel } from '../src/client/skills/SkillsPanel.tsx'
import type { SkillRecord } from '../src/client/skills/mock-data.ts'

afterEach(() => { cleanup() })

const dictionary: Readonly<Record<string, string>> = pt
const t = (key: string, params: Readonly<Record<string, string | number>> = {}): string =>
  (dictionary[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`))

const taughtCandidate: SkillRecord = { id: 'taught-1', name: 'Aprovar entregas', version: 1, status: 'candidate', sharedWithTeam: false, origin: 'taught' }
const plainActive: SkillRecord = { id: 'sk-pr', name: 'Revisão de PR', version: 3, status: 'active', sharedWithTeam: true }
const plainFirst: SkillRecord = { id: 'sk-v1', name: 'Resumo diário', version: 1, status: 'active', sharedWithTeam: true }
const proposal: SkillRecord = { id: 'sk-mail', name: 'E-mail para cliente', version: 1, status: 'candidate', sharedWithTeam: false, proposer: 'Sol' }

describe('SkillsPanel actions', () => {
  it('without handlers no row shows a button (the old ones did nothing)', () => {
    render(<SkillsPanel skills={[taughtCandidate, plainActive, proposal]} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('marks taught skills by their id', () => {
    const records = skillViewsToRecords([
      { id: 'taught-teach-1', name: 'X', version: 1, status: 'candidate', body: '', sharedWithTeam: false },
      { id: 'sk1', name: 'Y', version: 1, status: 'active', body: '', sharedWithTeam: true },
    ])
    expect(records.map(row => row.origin)).toEqual(['taught', undefined])
  })

  it('a taught candidate: Ativar → shows active now, then "Voltar a candidata" brings it back', async () => {
    const onActivate = vi.fn(async (skill: SkillRecord): Promise<SkillRecord> => ({ ...skill, status: 'active' }))
    const onRollback = vi.fn(async (skill: SkillRecord): Promise<SkillRecord> => ({ ...skill, status: 'candidate' }))
    render(<SkillsPanel skills={[taughtCandidate]} onActivate={onActivate} onRollback={onRollback} />)
    fireEvent.click(screen.getByRole('button', { name: t('action.activate') }))
    expect(await screen.findByRole('button', { name: t('action.backToCandidate') })).toBeTruthy()
    expect(screen.getByText(t('status.active'))).toBeTruthy()
    expect(onActivate).toHaveBeenCalledWith(taughtCandidate)
    fireEvent.click(screen.getByRole('button', { name: t('action.backToCandidate') }))
    expect(await screen.findByRole('button', { name: t('action.activate') })).toBeTruthy()
    expect(onRollback).toHaveBeenCalledTimes(1)
  })

  it('a refused activation says what to do and leaves the skill a candidate', async () => {
    render(<SkillsPanel skills={[taughtCandidate]} onActivate={async () => { throw new Error('ACCESS_ESCALATION') }} />)
    fireEvent.click(screen.getByRole('button', { name: t('action.activate') }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', t('error.activate', { name: 'Aprovar entregas' }))
    expect(screen.getByText(t('status.candidate'))).toBeTruthy()
  })

  it('sharing always asks first, in words, and only the confirm button shares', async () => {
    const onShare = vi.fn(async (skill: SkillRecord): Promise<SkillRecord> => ({ ...skill, sharedWithTeam: true }))
    render(<SkillsPanel skills={[taughtCandidate]} onShare={onShare} />)
    fireEvent.click(screen.getByRole('button', { name: t('action.shareTeam') }))
    expect(screen.getByRole('dialog', { name: t('share.title', { name: 'Aprovar entregas' }) })).toBeTruthy()
    expect(onShare).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('share.confirm') }))
    await waitFor(() => { expect(onShare).toHaveBeenCalledTimes(1) })
    expect(await screen.findByText(t('status.shared'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('action.shareTeam') })).toBeNull()
  })

  it('"Reverter versão" exists only for a plain skill that has an earlier version; a proposal reviews where it is decided', () => {
    const onRollback = vi.fn(async () => {})
    const onReview = vi.fn()
    render(<SkillsPanel skills={[plainActive, plainFirst, proposal]} onRollback={onRollback} onReview={onReview} />)
    expect(screen.getAllByRole('button', { name: t('action.rollback') })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: t('action.reviewProposal') }))
    expect(onReview).toHaveBeenCalledWith(proposal)
  })
})

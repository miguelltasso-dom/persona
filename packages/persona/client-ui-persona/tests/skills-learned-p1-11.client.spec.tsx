// @vitest-environment jsdom
// Carbon P1-11 (skills aprendidas): the skill the Playbook offered ("Virar skill?", id `learned-…`) can be shared with the team and turned back off,
// like a taught one. Before: the panel and the adapter only knew `taught-…`, so a learned skill was a row with no way out.
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

const learnedActive: SkillRecord = { id: 'learned-pb-cartaz', name: 'Cartaz da promoção', version: 1, status: 'active', sharedWithTeam: false, origin: 'learned' }
const learnedCandidate: SkillRecord = { ...learnedActive, id: 'learned-pb-legenda', name: 'Legenda do post', status: 'candidate' }

describe('learned skills (Playbook)', () => {
  it('the adapter marks a skill by how it was made: taught-…, learned-…, or neither', () => {
    const records = skillViewsToRecords([
      { id: 'taught-teach-1', name: 'A', version: 1, status: 'candidate', body: '', sharedWithTeam: false },
      { id: 'learned-pb-cartaz', name: 'B', version: 1, status: 'active', body: '', sharedWithTeam: false },
      { id: 'sk1', name: 'C', version: 1, status: 'active', body: '', sharedWithTeam: true },
    ])
    expect(records.map(row => row.origin)).toEqual(['taught', 'learned', undefined])
  })

  it('an active learned skill offers "Voltar a candidata" and "Compartilhar" (even at version 1), and neither "Reverter versão" nor "Ativar"', () => {
    render(<SkillsPanel skills={[learnedActive]} onRollback={async () => {}} onShare={async skill => skill} onActivate={async skill => skill} onReview={() => {}} />)
    expect(screen.getByRole('button', { name: t('action.backToCandidate') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('action.shareTeam') })).toBeTruthy()
    expect(screen.queryByRole('button', { name: t('action.rollback') })).toBeNull()
    expect(screen.queryByRole('button', { name: t('action.activate') })).toBeNull()
  })

  it('a learned candidate is decided where the offer lives (Aprovações): "Revisar proposta", never "Ativar" here', () => {
    const onReview = vi.fn()
    render(<SkillsPanel skills={[learnedCandidate]} onActivate={async skill => skill} onReview={onReview} />)
    expect(screen.queryByRole('button', { name: t('action.activate') })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t('action.reviewProposal') }))
    expect(onReview).toHaveBeenCalledWith(learnedCandidate)
  })

  it('sharing a learned skill asks first, then calls onShare; turning it off calls onRollback and says so', async () => {
    const onShare = vi.fn(async (skill: SkillRecord): Promise<SkillRecord> => ({ ...skill, sharedWithTeam: true }))
    const onRollback = vi.fn(async (skill: SkillRecord): Promise<SkillRecord> => ({ ...skill, status: 'candidate' }))
    render(<SkillsPanel skills={[learnedActive]} onShare={onShare} onRollback={onRollback} />)
    fireEvent.click(screen.getByRole('button', { name: t('action.shareTeam') }))
    expect(onShare).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('share.confirm') }))
    await waitFor(() => { expect(onShare).toHaveBeenCalledTimes(1) })
    expect(await screen.findByText(t('status.shared'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('action.backToCandidate') }))
    await waitFor(() => { expect(onRollback).toHaveBeenCalledTimes(1) })
    expect(await screen.findByText(t('status.candidate'))).toBeTruthy()
  })
})

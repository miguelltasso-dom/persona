// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { triageLogFromHost } from '../src/client/data/adapters/triage.ts'
import { dailySummariesToUi } from '../src/client/data/adapters/proactive.ts'
import { routineScheduleToRuns } from '../src/client/data/adapters/routines.ts'
import { deriveKanbanFilterOptions } from '../src/client/kanban/derive-filter-options.ts'
import { connectionsToEntries } from '../src/client/data/adapters/connections.ts'
import { reviewBlockedFromAccept, reviewSummaryFromHost } from '../src/client/data/adapters/review.ts'

describe('lumen RPC adapters', () => {
  it('maps triage log rows for rules UI', () => {
    const rows = triageLogFromHost([
      {
        id: 'log-1',
        at: '14:02',
        summary: 'Teria aberto ticket',
        mode: 'logOnly',
        threadId: 'geral',
        gateText: 'gate',
        assessmentText: 'assess',
        decidedBy: 'Atlas',
        reason: 'logOnly',
      },
    ])
    expect(rows[0]?.summary).toBe('Teria aberto ticket')
    expect(rows[0]?.mode).toBe('logOnly')
  })

  it('excludes attention cards from daily proactive summaries', () => {
    const summaries = dailySummariesToUi([
      {
        personaId: 'p1',
        personaName: 'Nina',
        date: '2026-11-03',
        proposals: [
          {
            id: 'a1',
            kind: 'attention',
            title: 'Deploy',
            question: 'Aprovar?',
            status: 'pending',
            personaId: 'p1',
            personaName: 'Nina',
          },
          {
            id: 'a2',
            kind: 'vault',
            title: 'Cofre',
            question: 'Atualizar?',
            status: 'pending',
            personaId: 'p1',
            personaName: 'Nina',
          },
        ],
      },
    ])
    expect(summaries[0]?.proposals).toHaveLength(1)
    expect(summaries[0]?.proposals[0]?.title).toBe('Cofre')
    expect(summaries[0]?.proposals[0]?.approvalKind).toBe('vault')
  })

  it('derives kanban filters from card rows', () => {
    const options = deriveKanbanFilterOptions([
      {
        id: 'c1',
        title: 'T',
        projectId: 'p1',
        projectName: 'Site',
        teamId: 't1',
        teamName: 'Equipe',
        column: 'todo',
        waitingEvent: false,
        blocked: false,
        reviewApproved: false,
        assignee: { id: 'atlas', name: 'Atlas', initials: 'A' },
      },
    ])
    expect(options.projects[0]?.name).toBe('Site')
    expect(options.personas[0]?.name).toBe('Atlas')
  })

  it('maps reviewSummary host view to panel model', () => {
    const ui = reviewSummaryFromHost({
      ticketId: 't1',
      files: [{ path: 'a.ts', added: 1, deleted: 0 }],
      added: 1,
      deleted: 0,
      patch: 'diff',
      patchTruncated: false,
      secretsRedacted: true,
      testsClaimed: ['vitest a.ts'],
      hasWorktree: true,
    })
    expect(ui?.testsClaimed[0]).toBe('vitest a.ts')
    expect(reviewBlockedFromAccept({ kind: 'blocked', mode: 'ff', explanation: 'conflito' })?.explanation).toBe('conflito')
  })

  it('maps listConnections rows with loginHint and copy command', () => {
    const entries = connectionsToEntries([
      {
        id: 'cursor',
        kind: 'cursor',
        available: true,
        loggedIn: false,
        phase: 'checking',
        loginHint: 'Abra o terminal e rode cursor-agent login',
        error: { code: 'not_logged_in', message: 'CLI cursor não está logada. Abra o terminal e rode cursor-agent login' },
      },
    ])
    expect(entries[0]?.copyCommand).toBe('cursor-agent login')
    expect(entries[0]?.errorCode).toBe('not_logged_in')
    expect(entries[0]?.detail).toContain('cursor')
  })

  it('maps routine schedule runs onto week grid', () => {
    const runs = routineScheduleToRuns([
      {
        id: 'r1',
        projectId: 'pp',
        name: 'Stand-up',
        rrule: '',
        timeZone: 'UTC',
        paused: false,
        catchUp: 'skip',
        silenceStart: '',
        silenceEnd: '',
        runs: [{
          id: 'run1',
          routineId: 'r1',
          scheduledFor: '2026-11-03T12:00:00.000Z',
          status: 'done',
          attempt: 1,
        }],
      },
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0]?.routineName).toBe('Stand-up')
  })
})

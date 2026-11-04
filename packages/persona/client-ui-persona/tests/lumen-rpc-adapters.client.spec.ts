// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { triageLogFromHost } from '../src/client/data/adapters/triage.ts'
import { dailySummariesToUi } from '../src/client/data/adapters/proactive.ts'
import { routineScheduleToRuns } from '../src/client/data/adapters/routines.ts'
import { deriveKanbanFilterOptions } from '../src/client/kanban/derive-filter-options.ts'
import { connectionsToEntries } from '../src/client/data/adapters/connections.ts'
import { connectionAccountsBundleToUi } from '../src/client/data/adapters/connection-accounts.ts'
import { reviewBlockedFromAccept, reviewSummaryFromHost } from '../src/client/data/adapters/review.ts'
import { memoryViewsToRows } from '../src/client/data/adapters/memory.ts'
import { skillViewsToRecords } from '../src/client/data/adapters/skills.ts'
import { usageBookToMeters } from '../src/client/data/adapters/usage.ts'
import { approvalsToInbox } from '../src/client/data/adapters/approvals.ts'
import { activationFunnelToUi, personaImpactToUi } from '../src/client/data/adapters/insights.ts'
import { pt as usagePt } from '../src/client/locale/usage/locales.ts'

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
    expect(entries[0]?.name).toBe('Cursor')
    expect(entries[0]?.copyCommand).toBe('cursor-agent login')
    expect(entries[0]?.errorCode).toBe('not_logged_in')
    expect(entries[0]?.detail).toContain('cursor')
  })

  it('dedupes listConnections rows by id (keeps the stronger status)', () => {
    const entries = connectionsToEntries([
      { id: 'dsh', kind: 'dsh', available: false, loggedIn: false, phase: 'checking', loginHint: '' },
      {
        id: 'dsh',
        kind: 'dsh',
        available: true,
        loggedIn: true,
        phase: 'ready',
        loginHint: '',
      },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0]?.name).toBe('Harness DeepSeek')
    expect(entries[0]?.status).toBe('ready')
  })

  it('groups multi-account bundle by provider with seat labels', () => {
    const ui = connectionAccountsBundleToUi({
      swapPolicy: 'ask_before_swap',
      swapPolicyScope: 'persona',
      accounts: [
        {
          id: 'c1',
          provider: 'claude',
          label: 'Pessoal',
          available: true,
          loggedIn: true,
          phase: 'ready',
          loginHint: '',
          inUseCount: 2,
        },
        {
          id: 'c2',
          provider: 'claude',
          label: 'Trabalho',
          available: true,
          loggedIn: false,
          phase: 'ready',
          loginHint: 'claude login',
          error: { code: 'not_logged_in', message: 'rode claude login' },
        },
      ],
    })
    expect(ui.legacySingleSeat).toBe(false)
    expect(ui.groups).toHaveLength(1)
    expect(ui.groups[0]?.accounts).toHaveLength(2)
    expect(ui.groups[0]?.accounts[0]?.accountLabel).toBe('Pessoal')
    expect(ui.swapPolicy).toBe('ask_before_swap')
  })

  it('labels official quota meters per connected account', () => {
    const meters = usageBookToMeters({
      period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z' },
      folds: [],
      tokens: 0,
      runs: 0,
      origin: 'official',
      originLabel: 'oficial',
    }, [{
      provider: 'claude',
      origin: 'official',
      accountId: 'c-work',
      accountLabel: 'Trabalho',
      windows: [{ id: '5h', origin: 'official', usedPercent: 42 }],
    }])
    expect(meters[0]?.label).toContain('Trabalho')
    expect(meters[0]?.id).toContain('c-work')
  })

  it('dedupes listConnections rows by kind (one card per CLI)', () => {
    const entries = connectionsToEntries([
      { id: 'dsh-a', kind: 'dsh', available: false, loggedIn: false, phase: 'checking', loginHint: '' },
      { id: 'dsh-b', kind: 'dsh', available: true, loggedIn: false, phase: 'ready', loginHint: 'login', error: { code: 'not_logged_in', message: 'x' } },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe('dsh')
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

  it('maps usage book without faking 0% when unavailable', () => {
    const meters = usageBookToMeters({
      period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z' },
      folds: [],
      tokens: 0,
      runs: 0,
      origin: 'unavailable',
      originLabel: 'indisponível',
    }, [{ provider: 'claude', origin: 'unavailable', windows: [] }])
    expect(meters.some(m => m.origin === 'unavailable' && m.percent === undefined)).toBe(true)
    expect(JSON.stringify(meters)).not.toMatch(/"percent":0/u)
  })

  it('maps idle project usage as notYet instead of 0% measured', () => {
    const meters = usageBookToMeters({
      period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T00:00:00.000Z' },
      folds: [],
      tokens: 0,
      runs: 0,
      origin: 'measured',
      originLabel: 'medido',
      tokensPerMonthLimit: 1_000_000,
    }, [])
    const project = meters.find(m => m.id === 'project-tokens-month')
    expect(project?.origin).toBe('notYet')
    expect(project?.percent).toBeUndefined()
  })

  it('maps memory and skill host views', () => {
    const rows = memoryViewsToRows([
      { id: 'm1', body: 'Prefere terças', status: 'pending', origin: 'conversation' },
    ], 'ws', 'pp')
    expect(rows[0]?.pendingApproval).toBe(true)
    const skills = skillViewsToRecords([
      { id: 's1', name: 'Revisão', version: 2, status: 'active', body: '', sharedWithTeam: true },
    ])
    expect(skills[0]?.name).toBe('Revisão')
  })

  it('maps hire approvals using hireAvatarRef, not display name', () => {
    const [hire] = approvalsToInbox([
      {
        id: 'h1',
        kind: 'hire',
        title: 'Kira',
        question: 'Contratar Kira?',
        status: 'pending',
        personaId: 'p-atlas',
        personaName: 'Atlas',
        hireAvatarRef: 'sol-default',
      },
    ])
    expect(hire?.hirePortraitKey).toBe('sol')
  })

  it('maps local insights funnel and impact rows', () => {
    const steps = activationFunnelToUi(usagePt, {
      onboarded: true,
      firstUsefulReply: false,
      firstTaskDone: false,
      returnedIn7Days: false,
      stage: 'first_reply',
    })
    expect(steps[0]?.done).toBe(true)
    expect(steps[1]?.done).toBe(false)
    const impacts = personaImpactToUi(usagePt, [{
      personaId: 'p1',
      tasksCompleted: 2,
      timeToReadyMs: 120_000,
      proposalsAccepted: 1,
      hoursSavedEstimate: 1,
      hoursSavedLabel: 'estimativa',
    }], { p1: 'Sol' })
    expect(impacts[0]?.displayName).toBe('Sol')
    expect(impacts[0]?.hoursSavedLabel).toContain('estimativa')
  })
})

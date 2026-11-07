import { expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import PersonaHost from '../src/index.ts'
import { TEACH_CONSENT, isolatedAccountHome } from '../src/wave2.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const scope = { workspaceId: 'ws', projectId: 'pp' }
const stream = { ...scope, streamKind: 'channel' as const, ownerId: 'geral' }

it('an isolated account reports only its own login and returns the isolated PowerShell command', () => {
  const h = host()
  seed(h)
  const homeDir = mkdtempSync(join(tmpdir(), 'persona-account-login-'))
  h.addConnectionAccount({ ...scope, provider: 'claude', label: 'Isolada', homeDir })
  const before = h.listConnectionAccounts(scope).accounts.find(row => row.label === 'Isolada')
  expect(before?.loggedIn).toBe(false)
  expect(before?.loginCommand).toContain(`$env:CLAUDE_CONFIG_DIR='${homeDir}'`)
  expect(before?.loginCommand).toMatch(/; claude login$/u)
  writeFileSync(join(homeDir, '.credentials.json'), '{}', 'utf8')
  expect(h.listConnectionAccounts(scope).accounts.find(row => row.label === 'Isolada')?.loggedIn).toBe(true)
  h.setRunnerSwapPolicy({ ...scope, policy: 'fixed', scope: 'persona', personaId: 'nina' })
  expect(h.listConnectionAccounts({ ...scope, personaId: 'nina' })).toMatchObject({
    swapPolicy: 'fixed', swapPolicyScope: 'persona', personaPolicies: [{ personaId: 'nina', policy: 'fixed' }],
  })
})

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'nina', name: 'Nina', title: 'Design',
    description: 'UI.', personality: 'Calma.', instructions: 'Desenhe.',
    avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'cli', runnerCli: 'claude',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

it('listConversationSubjects is cheap: a burst hits one SQLite read', () => {
  const h = host()
  seed(h)
  const first = h.listConversationSubjects(stream)
  for (let i = 0; i < 80; i += 1) {
    expect(h.listConversationSubjects(stream)).toBe(first)
  }
  h.createConversationSubject({ ...stream, name: 'UI', colorIndex: 1 })
  expect(h.listConversationSubjects(stream).subjects.some(row => row.name === 'UI')).toBe(true)
})

it('lists Geral by default, creates a second subject, and isolates message history', () => {
  const h = host()
  seed(h)
  const first = h.listConversationSubjects(stream)
  expect(first.subjects[0]).toMatchObject({ name: 'Geral', colorIndex: 0 })
  const created = h.createConversationSubject({ ...stream, name: 'UI', colorIndex: 1 })
  expect(created.subjects.some(row => row.name === 'UI')).toBe(true)
  expect(created.activeSubjectId).toContain(':t1')
  h.postMessage({
    id: 'm-ui', ...stream, body: 'só UI', actorId: 'ana', subjectId: 's',
    occurredAt: '2026-11-03T15:00:00.000Z', topicId: created.activeSubjectId,
  })
  h.setActiveConversationSubject({ ...stream, subjectId: first.subjects[0]!.id })
  h.postMessage({
    id: 'm-geral', ...stream, body: 'só geral', actorId: 'ana', subjectId: 's',
    occurredAt: '2026-11-03T15:00:01.000Z',
  })
  const uiPage = h.listMessages({ ...stream, actorId: 'ana', afterSeq: 0, limit: 20, topicId: created.activeSubjectId })
  expect(uiPage.events.map(row => row.body)).toEqual(['só UI'])
  expect(uiPage.events[0]?.topicId).toBe(created.activeSubjectId)
})

it('lists the working persona on the subject of an open ticket', () => {
  const h = host()
  seed(h)
  const geral = h.listConversationSubjects(stream).subjects[0]!
  h.postMessage({
    id: 'm-work', ...stream, body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 's',
    occurredAt: '2026-11-03T15:00:00.000Z', topicId: geral.id,
  })
  const tasks = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })
  expect(tasks.length).toBeGreaterThan(0)
  expect(tasks[0]?.topicId).toBe(geral.id)
  expect(tasks[0]?.conversationSubjectId).toBe(geral.id)
  expect(h.getProjectBoard(scope).cards[0]?.topicId).toBe(geral.id)
  const again = h.listConversationSubjects(stream)
  const row = again.subjects.find(item => item.id === geral.id)
  expect(row?.workingPersonaIds.length).toBeGreaterThan(0)
})

it('moves a message and binds the ticket subject chip', () => {
  const h = host()
  seed(h)
  const geral = h.listConversationSubjects(stream).subjects[0]!
  const ui = h.createConversationSubject({ ...stream, name: 'UI', colorIndex: 1 })
  h.postMessage({
    id: 'm-move', ...stream, body: 'mover', actorId: 'ana', subjectId: 's',
    occurredAt: '2026-11-03T15:00:00.000Z', topicId: geral.id,
  })
  expect(h.moveMessageToSubject({ ...stream, eventId: 'm-move', subjectId: ui.activeSubjectId })).toBe(true)
  const page = h.listMessages({ ...stream, actorId: 'ana', afterSeq: 0, limit: 10, topicId: ui.activeSubjectId })
  expect(page.events.map(row => row.id)).toEqual(['m-move'])
})

it('stores several accounts, swap policy, and isolated homes', () => {
  const h = host()
  seed(h)
  h.addConnectionAccount({ ...scope, provider: 'claude', label: 'Pessoal' })
  h.addConnectionAccount({ ...scope, provider: 'claude', label: 'Trabalho' })
  const bundle = h.listConnectionAccounts(scope)
  expect(bundle.accounts).toHaveLength(2)
  expect(bundle.accounts[0]?.label).toBe('Pessoal')
  expect(h.setRunnerSwapPolicy({ ...scope, policy: 'fixed', scope: 'workspace' })).toBe(true)
  const again = h.listConnectionAccounts(scope)
  expect(again.swapPolicy).toBe('fixed')
  const pessoal = h.accounts.get('claude:pessoal')
  expect(pessoal?.homeDir).toContain('accounts')
  expect(pessoal?.homeDir).toContain('claude')
  expect(isolatedAccountHome('ana', 'claude', 'claude:pessoal')).toMatch(/[\\/]accounts[\\/][a-f0-9]{32}[\\/]claude[\\/][a-f0-9]{32}$/u)
  const card = h.getPersonaCard({ ...scope, personaId: 'nina' })
  expect(card.activeAccount?.label).toBe('Pessoal')
})

it('renames, archives, searches, and reports unread per subject', () => {
  const h = host()
  seed(h)
  const geral = h.listConversationSubjects(stream).subjects[0]!
  const created = h.createConversationSubject({ ...stream, name: 'UI', colorIndex: 1 })
  h.renameConversationSubject({ ...stream, subjectId: created.activeSubjectId, name: 'Interface' })
  h.postMessage({
    id: 'm-unread', ...stream, body: 'filtro UI', actorId: 'nina', subjectId: 's',
    occurredAt: '2026-11-03T15:00:02.000Z', topicId: created.activeSubjectId,
  })
  const listed = h.listConversationSubjects(stream)
  const ui = listed.subjects.find(row => row.id === created.activeSubjectId)
  expect(ui?.name).toBe('Interface')
  expect(ui?.unreadCount).toBeGreaterThan(0)
  const hits = h.search({ ...scope, actorId: 'ana', query: 'filtro', limit: 10, topicId: created.activeSubjectId })
  expect(hits.map(row => row.id)).toEqual(['m-unread'])
  const other = h.search({ ...scope, actorId: 'ana', query: 'filtro', limit: 10, topicId: geral.id })
  expect(other).toEqual([])
  h.archiveConversationSubject({ ...stream, subjectId: created.activeSubjectId })
  expect(h.listConversationSubjects(stream).subjects.every(row => row.id !== created.activeSubjectId)).toBe(true)
})

it('W2-10: the name the person chose in the review card becomes the candidate\'s title; without one the default stays', async () => {
  const h = host()
  seed(h)
  const taught = async (skillTitle?: string): Promise<{ skillTitle: string; name: string | undefined }> => {
    const start = h.startTeachSession({ ...scope, personaId: 'nina', consentVersion: TEACH_CONSENT })
    await h.stopTeachSession({
      ...scope, sessionId: start.sessionId, includeMicrophone: false, transcript: 'Abra o catálogo e publique.',
      frames: [{ atMs: 0, imageRef: 'file://local/f0.webp', changeScore: 1 }],
    })
    const draft = h.getTeachDraft({ ...scope, sessionId: start.sessionId })
    const saved = h.submitTeachDraft({
      ...scope, sessionId: start.sessionId, steps: draft.steps, activate: false,
      ...(skillTitle === undefined ? {} : { skillTitle }),
    })
    return { skillTitle: saved.skillTitle, name: h.screens.listSkills(scope.projectId).find(row => row.id === saved.candidateSkillId)?.name }
  }
  expect(await taught('  Publicar produto   na loja ')).toEqual({ skillTitle: 'Publicar produto na loja', name: 'Publicar produto na loja' })
  expect(await taught()).toEqual({ skillTitle: 'Skill ensinada', name: 'Skill ensinada' }) // no field: today's behavior
  expect((await taught('   ')).skillTitle).toBe('Skill ensinada') // blank is "no name"
  await expect(taught('a'.repeat(81))).rejects.toThrow(/80 letras/iu)
})

it('drafts a taught skill without enabling it', async () => {
  const h = host()
  seed(h)
  const start = h.startTeachSession({ ...scope, personaId: 'nina', consentVersion: TEACH_CONSENT })
  expect(start.retentionDays).toBe(30)
  await h.stopTeachSession({
    ...scope, sessionId: start.sessionId, includeMicrophone: false,
    transcript: 'Abra o catálogo e publique.',
    frames: [{ atMs: 0, imageRef: 'file://local/f0.webp', changeScore: 1 }],
  })
  const draft = h.getTeachDraft({ ...scope, sessionId: start.sessionId })
  expect(draft.steps.length).toBeGreaterThan(0)
  const saved = h.submitTeachDraft({
    ...scope, sessionId: start.sessionId, steps: draft.steps, activate: true,
  })
  expect(saved.candidateSkillId).toBe(`taught-${start.sessionId}`)
  const skill = h.screens.listSkills(scope.projectId).find(row => row.id === saved.candidateSkillId)
  expect(skill?.status).toBe('candidate')
  expect(h.screens.getSkillRecord(scope.projectId, saved.candidateSkillId!)?.origin).toBe('taught')
  const live = h.activateTaughtSkill({ ...scope, skillId: saved.candidateSkillId! })
  expect(live.status).toBe('active')
  const rolled = h.rollbackTaughtSkill({ ...scope, skillId: saved.candidateSkillId! })
  expect(rolled.status).toBe('candidate')
})

it('accepts a taught candidate only through acceptTaughtCandidate', async () => {
  const h = host()
  seed(h)
  const start = h.startTeachSession({ ...scope, personaId: 'nina', consentVersion: TEACH_CONSENT })
  await h.stopTeachSession({
    ...scope, sessionId: start.sessionId, includeMicrophone: false,
    transcript: 'Abra o catálogo e publique.',
    frames: [{ atMs: 0, imageRef: 'file://local/f0.webp', changeScore: 1 }],
  })
  const accepted = h.acceptTaughtCandidate({ ...scope, sessionId: start.sessionId })
  expect(accepted.status).toBe('candidate')
  expect(h.screens.getSkillRecord(scope.projectId, accepted.id)?.origin).toBe('taught')
})

it('refuses to publish a taught skill to the team without explicit confirm', async () => {
  const h = host()
  seed(h)
  const start = h.startTeachSession({ ...scope, personaId: 'nina', consentVersion: TEACH_CONSENT })
  await h.stopTeachSession({
    ...scope, sessionId: start.sessionId, includeMicrophone: false,
    transcript: 'Abra o catálogo e publique.',
    frames: [{ atMs: 0, imageRef: 'file://local/f0.webp', changeScore: 1 }],
  })
  const accepted = h.acceptTaughtCandidate({ ...scope, sessionId: start.sessionId })
  expect(() => h.publishTaughtSkill({
    ...scope, skillId: accepted.id, scope: 'team', explicit: false,
  })).toThrow('ACCESS_ESCALATION')
  const published = h.publishTaughtSkill({
    ...scope, skillId: accepted.id, scope: 'team', explicit: true,
  })
  expect(published.sharedWithTeam).toBe(true)
  expect(published.status).toBe('candidate')
})

it('refuses to activate a taught skill that adds tools', () => {
  const h = host()
  seed(h)
  h.screens.putCandidateSkill({
    id: 'taught-escalation',
    projectId: 'pp',
    personaId: 'nina',
    name: 'Bash',
    body: '# Bash\n\n## 1. Passo\nRode.\nFerramentas: bash',
    origin: 'taught',
  })
  expect(() => h.activateTaughtSkill({ ...scope, skillId: 'taught-escalation' })).toThrow('ACCESS_ESCALATION')
})

/**
 * W2-11 (WAVE2.md §Aceite) — ADVERSARIAL host acceptance for assuntos, várias contas e Ensinar, on top of the owners'
 * wave2.spec.ts: cross-stream/cross-project writes, limits, isolation of account homes, consent. REAL PersonaHost,
 * scripted runner, fake accounts, 0 AI. App layer (SubjectBar keyboard, Conexões, Ensinar consent): {@link ./real-gov-pb-app.spec.ts}.
 */
import { describe, expect } from 'vitest'
import PersonaHost from '../../persona-host/src/index.ts'
import { TEACH_CONSENT } from '../../persona-host/src/wave2.ts'
import { openJourney, seedJourney, it } from '../../persona-host/tests/journeys/journey-host.ts'

const CLOCK = '2026-11-03T15:00:00.000Z'

const PP = { workspaceId: 'ws', projectId: 'pp' } as const

function world(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [{ id: 'bento', name: 'Bento', title: 'Engenharia', coordination: true }])
  h.createPersona({
    workspaceId: 'ws', projectId: 'pp', id: 'nina', name: 'Nina', title: 'Design', description: 'UI.', personality: 'Calma.',
    instructions: 'Desenhe.', avatarKind: 'gallery', avatarRef: 'nina', runnerKind: 'cli', runnerCli: 'claude', runnerModel: 'm',
    canRecruit: false, createdBy: 'ana',
  })
  h.createDm({ id: 'dm-bento', ...PP, participantA: 'ana', participantB: 'bento' })
  h.createDm({ id: 'dm-nina', ...PP, participantA: 'ana', participantB: 'nina' })
  return h
}

const dmScope = (ownerId: string) => ({ ...PP, streamKind: 'dm' as const, ownerId })
const say = (h: PersonaHost, ownerId: string, id: string, body: string, topicId: string, at: string) =>
  h.postMessage({ id, ...dmScope(ownerId), body, actorId: 'ana', subjectId: `s-${id}`, occurredAt: at, topicId })

describe('W2-1 — assuntos: históricos separados na mesma DM', () => {
  it('[W2-1a] 3 assuntos na mesma DM mantêm os históricos das mensagens separados', async () => {
    const h = world()
    const scope = dmScope('dm-bento')
    const geral = h.listConversationSubjects(scope).subjects[0]!
    const ui = h.createConversationSubject({ ...scope, name: 'Interface', colorIndex: 1 }).activeSubjectId
    const preco = h.createConversationSubject({ ...scope, name: 'Preços', colorIndex: 2 }).activeSubjectId
    expect(h.listConversationSubjects(scope).subjects).toHaveLength(3)
    say(h, 'dm-bento', 'm-geral', 'oi, tudo bem?', geral.id, CLOCK)
    await h.orchestration.flush('pp')
    say(h, 'dm-bento', 'm-ui', 'sobre a interface, oi', ui, '2026-11-03T15:01:00.000Z')
    await h.orchestration.flush('pp')
    say(h, 'dm-bento', 'm-preco', 'sobre os preços, oi', preco, '2026-11-03T15:02:00.000Z')
    await h.orchestration.flush('pp')
    const read = (topicId: string) => h.listMessages({ ...scope, actorId: 'ana', afterSeq: 0, limit: 50, topicId }).events.filter(row => row.actorId === 'ana').map(row => row.id)
    expect(read(geral.id)).toEqual(['m-geral'])
    expect(read(ui)).toEqual(['m-ui'])
    expect(read(preco)).toEqual(['m-preco'])
  })

  it('[W2-1b] a RESPOSTA da persona fica no assunto certo: hoje ela nasce com topicId vazio, então ao filtrar por assunto só aparece a pergunta do usuário (o assunto parece sem resposta)', async () => {
    const h = world()
    const scope = dmScope('dm-bento')
    const geral = h.listConversationSubjects(scope).subjects[0]!
    const ui = h.createConversationSubject({ ...scope, name: 'Interface', colorIndex: 1 }).activeSubjectId
    say(h, 'dm-bento', 'm-geral', 'oi, tudo bem?', geral.id, CLOCK)
    await h.orchestration.flush('pp')
    say(h, 'dm-bento', 'm-ui', 'sobre a interface, oi', ui, '2026-11-03T15:01:00.000Z')
    await h.orchestration.flush('pp')
    for (const topicId of [geral.id, ui]) {
      const events = h.listMessages({ ...scope, actorId: 'ana', afterSeq: 0, limit: 50, topicId }).events
      expect(events.some(row => row.actorId === 'bento'), `sem resposta da persona no assunto ${topicId}`).toBe(true)
    }
    const all = h.listMessages({ ...scope, actorId: 'ana', afterSeq: 0, limit: 50 }).events
    expect(all.filter(row => row.actorId === 'bento').every(row => row.topicId !== ''), 'resposta sem assunto').toBe(true)
  })

  it('[W2-1d] a Tarefa pedida num assunto que NÃO é o primeiro leva ESSE assunto (lista e quadro), e o nome e a cor do assunto de origem são resolvíveis', async () => {
    const h = world()
    const stream = { ...PP, streamKind: 'channel' as const, ownerId: 'geral' }
    const geral = h.listConversationSubjects(stream).subjects[0]!
    const ui = h.createConversationSubject({ ...stream, name: 'Interface', colorIndex: 3 }).activeSubjectId
    h.postMessage({ id: 'm-readme', ...stream, body: 'preciso de um README no projeto', actorId: 'ana', subjectId: 's-readme', occurredAt: CLOCK, topicId: ui })
    await h.orchestration.flush('pp')
    const task = h.listTasks(PP)[0]
    expect(task, 'o pedido gerou uma Tarefa').toBeDefined()
    expect(task!.topicId, 'a Tarefa nasce no assunto de onde foi pedida, não no primeiro').toBe(ui)
    expect(task!.conversationSubjectId).toBe(ui)
    const card = h.getProjectBoard(PP).cards.find(row => row.ticketId === task!.id)
    expect(card?.topicId, 'o cartão do quadro aponta o assunto de origem').toBe(ui)
    const origin = h.listConversationSubjects(stream).subjects.find(row => row.id === card?.topicId)
    expect(origin, 'o assunto de origem do cartão existe e é legível').toBeDefined()
    expect(origin!.name).toBe('Interface')
    expect(origin!.colorIndex).toBe(3)
    expect(card?.topicId, 'não herdou o primeiro assunto por engano').not.toBe(geral.id)
  })

  it('[W2-1b] uma mensagem do usuário na DM gera UMA resposta, não duas idênticas ("coord-<id>-reply" + "coord-<hash>") — reproduz no host com runner scriptado; confirmar no app com a CLI fake', async () => {
    const h = world()
    const scope = dmScope('dm-nina')
    h.postMessage({ id: 'm-one', ...scope, body: 'oi, tudo bem?', actorId: 'ana', subjectId: 's-one', occurredAt: CLOCK })
    await h.orchestration.flush('pp')
    const replies = h.listMessages({ ...scope, actorId: 'ana', afterSeq: 0, limit: 50 }).events.filter(row => row.actorId === 'nina')
    expect(replies).toHaveLength(1)
  })

  it('[W2-1b] o não lido é por assunto: mensagem nova em um assunto inativo acende só aquele', async () => {
    const h = world()
    const scope = dmScope('dm-bento')
    const geral = h.listConversationSubjects(scope).subjects[0]!
    const ui = h.createConversationSubject({ ...scope, name: 'Interface', colorIndex: 1 }).activeSubjectId
    h.setActiveConversationSubject({ ...scope, subjectId: geral.id })
    h.postMessage({ id: 'm-late', ...scope, body: 'novidade na interface', actorId: 'bento', subjectId: 's-late', occurredAt: '2026-11-03T15:05:00.000Z', topicId: ui })
    const list = h.listConversationSubjects(scope).subjects
    expect(list.find(row => row.id === ui)?.unreadCount).toBeGreaterThan(0)
    expect(list.find(row => row.id === geral.id)?.unreadCount).toBe(0)
  })

  it('[W2-1] no máximo 7 assuntos por conversa; o 8º é recusado ou limitado, nunca um 8º pontinho', () => {
    const h = world()
    const scope = dmScope('dm-bento')
    let last = h.listConversationSubjects(scope)
    for (let i = 1; i <= 7; i += 1) {
      try { last = h.createConversationSubject({ ...scope, name: `Assunto ${String(i)}` }) } catch { break }
    }
    expect(last.subjects.length).toBeLessThanOrEqual(7)
    expect(new Set(last.subjects.map(row => row.colorIndex)).size, 'cores repetidas').toBe(last.subjects.length)
  })

  it('[W2-1] nome vazio é recusado ao renomear e o nome antigo permanece', () => {
    const h = world()
    const scope = dmScope('dm-bento')
    const ui = h.createConversationSubject({ ...scope, name: 'Interface', colorIndex: 1 }).activeSubjectId
    expect(() => h.renameConversationSubject({ ...scope, subjectId: ui, name: '   ' })).toThrow()
    expect(h.listConversationSubjects(scope).subjects.find(row => row.id === ui)?.name).toBe('Interface')
  })

  it('[W2-1] arquivar mantém o histórico (a mensagem continua legível pelo assunto arquivado)', () => {
    const h = world()
    const scope = dmScope('dm-bento')
    const ui = h.createConversationSubject({ ...scope, name: 'Interface', colorIndex: 1 }).activeSubjectId
    say(h, 'dm-bento', 'm-keep', 'guarde isto', ui, CLOCK)
    h.archiveConversationSubject({ ...scope, subjectId: ui })
    expect(h.listConversationSubjects(scope).subjects.map(row => row.id)).not.toContain(ui)
    expect(h.listMessages({ ...scope, actorId: 'ana', afterSeq: 0, limit: 20, topicId: ui }).events.map(row => row.id)).toContain('m-keep')
  })

  it('[W2-1] ESCRITA CRUZADA: renomear/arquivar/ativar um assunto de OUTRA conversa (outro DM) usando o escopo da minha — renameConversationSubject/archive/setActive não checam que o subjectId pertence ao escopo', () => {
    const h = world()
    const mine = dmScope('dm-bento')
    const theirs = dmScope('dm-nina')
    const foreign = h.createConversationSubject({ ...theirs, name: 'Contrato da Nina', colorIndex: 3 }).activeSubjectId
    expect(() => h.renameConversationSubject({ ...mine, subjectId: foreign, name: 'Sequestrado' })).toThrow()
    expect(() => h.archiveConversationSubject({ ...mine, subjectId: foreign })).toThrow()
    expect(() => h.setActiveConversationSubject({ ...mine, subjectId: foreign })).toThrow()
    expect(h.listConversationSubjects(theirs).subjects.find(row => row.id === foreign)?.name).toBe('Contrato da Nina')
  })

  it('[W2-1] mover uma mensagem de OUTRA conversa para um assunto meu (ou uma minha para um assunto alheio) é recusado', () => {
    const h = world()
    const mine = dmScope('dm-bento')
    const theirs = dmScope('dm-nina')
    const minePick = h.createConversationSubject({ ...mine, name: 'Meu', colorIndex: 1 }).activeSubjectId
    const theirPick = h.createConversationSubject({ ...theirs, name: 'Deles', colorIndex: 1 }).activeSubjectId
    say(h, 'dm-nina', 'm-deles', 'conversa da Nina', theirPick, CLOCK)
    expect(() => h.moveMessageToSubject({ ...mine, eventId: 'm-deles', subjectId: minePick })).toThrow()
    say(h, 'dm-bento', 'm-meu', 'minha conversa', minePick, CLOCK)
    expect(() => h.moveMessageToSubject({ ...mine, eventId: 'm-meu', subjectId: theirPick })).toThrow()
    expect(h.listMessages({ ...theirs, actorId: 'ana', afterSeq: 0, limit: 20, topicId: theirPick }).events.map(row => row.id)).toEqual(['m-deles'])
  })

  it('[W2-1] criar assunto com uma cor JÁ usada nunca apaga o nome do assunto existente (recusa com conflito ou usa outra cor)', () => {
    const h = world()
    const scope = dmScope('dm-bento')
    const first = h.createConversationSubject({ ...scope, name: 'Interface', colorIndex: 1 }).activeSubjectId
    try { h.createConversationSubject({ ...scope, name: 'Outro assunto', colorIndex: 1 }) } catch { /* conflito é a resposta correta */ }
    expect(h.listConversationSubjects(scope).subjects.find(row => row.id === first)?.name, 'o 1º assunto perdeu o nome').toBe('Interface')
  })
})

describe('W2-3 — várias contas por provedor: isolamento e política', () => {
  it('[W2-3a] 2 contas do mesmo provedor: cada uma com home PRÓPRIO, sem segredo na visão, política persistida', () => {
    const h = world()
    h.addConnectionAccount({ ...PP, provider: 'claude', label: 'Pessoal' })
    h.addConnectionAccount({ ...PP, provider: 'claude', label: 'Trabalho' })
    const bundle = h.listConnectionAccounts(PP)
    expect(bundle.accounts.map(row => row.label)).toEqual(expect.arrayContaining(['Pessoal', 'Trabalho']))
    const homes = ['claude:pessoal', 'claude:trabalho'].map(id => h.accounts.get(id)?.homeDir ?? '')
    expect(homes.every(home => home !== '')).toBe(true)
    expect(homes[0]).not.toBe(homes[1])
    const norm = homes.map(path => path.replaceAll('/', '\\').toLowerCase())
    expect(norm[1]!.startsWith(`${norm[0]!}\\`), 'home da conta B dentro do home da conta A').toBe(false)
    expect(norm[0]!.startsWith(`${norm[1]!}\\`), 'home da conta A dentro do home da conta B').toBe(false)
    expect(JSON.stringify(bundle)).not.toMatch(/sk-|secret|password|token/iu)
    h.setRunnerSwapPolicy({ ...PP, policy: 'ask_before_swap', scope: 'workspace' })
    expect(h.listConnectionAccounts(PP).swapPolicy).toBe('ask_before_swap')
  })

  it('[W2-3a] remover a conta A não apaga a B nem o home da B', () => {
    const h = world()
    h.addConnectionAccount({ ...PP, provider: 'claude', label: 'Pessoal' })
    h.addConnectionAccount({ ...PP, provider: 'claude', label: 'Trabalho' })
    const accounts = h.listConnectionAccounts(PP).accounts
    const first = accounts.find(row => row.label === 'Pessoal')!
    h.removeConnectionAccount({ ...PP, accountId: first.id })
    const left = h.listConnectionAccounts(PP).accounts
    expect(left.map(row => row.label)).toEqual(['Trabalho'])
    expect(h.accounts.get('claude:trabalho')?.homeDir ?? '').not.toBe('')
  })

  it('[W2-3] rótulo com ../ não pode levar o home da conta para FORA da pasta de contas (isolatedAccountHome com rótulo hostil)', () => {
    const h = world()
    h.addConnectionAccount({ ...PP, provider: 'claude', label: '../../evil' })
    expect(h.listConnectionAccounts(PP).accounts).toHaveLength(1)
    const home = ['claude:evil', 'claude:..-..-evil', 'claude:----evil'].map(id => h.accounts.get(id)?.homeDir).find(Boolean) ?? ''
    expect(home, 'conta com rótulo hostil não criou home').not.toBe('')
    const normalized = home.replaceAll('\\', '/')
    expect(normalized).not.toMatch(/\.\.\//u)
    expect(normalized).toMatch(/\/accounts\//u)
  })

  it('[W2-3] duas contas com o MESMO rótulo não podem se sobrescrever em silêncio (o id vem do rótulo: claude:trabalho)', () => {
    const h = world()
    h.addConnectionAccount({ ...PP, provider: 'claude', label: 'Trabalho' })
    let second = true
    try { h.addConnectionAccount({ ...PP, provider: 'claude', label: 'Trabalho' }) } catch { second = false }
    const count = h.listConnectionAccounts(PP).accounts.filter(row => row.label.startsWith('Trabalho')).length
    expect(second ? count : 1, 'a 2ª conta "Trabalho" ou é recusada ou convive com a 1ª').toBe(second ? 2 : 1)
  })

  it('[W2-3] convidado não adiciona nem remove contas', () => {
    const h = world()
    h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
    h.sessionMemberId = 'gus'
    expect(() => h.addConnectionAccount({ ...PP, provider: 'claude', label: 'Intruso' })).toThrow()
    h.sessionMemberId = 'ana'
    expect(h.listConnectionAccounts(PP).accounts.map(row => row.label)).not.toContain('Intruso')
  })
})

describe('W2-2 — Ensinar a persona: consentimento, rascunho e nada ativa sozinho', () => {
  it('[W2-2d] sem o consentimento correto a gravação nem começa', () => {
    const h = world()
    expect(() => h.startTeachSession({ ...PP, personaId: 'nina', consentVersion: '' })).toThrow()
    expect(() => h.startTeachSession({ ...PP, personaId: 'nina', consentVersion: 'v0-antigo' })).toThrow()
    expect(h.startTeachSession({ ...PP, personaId: 'nina', consentVersion: TEACH_CONSENT }).sessionId).toMatch(/\S/u)
  })

  it('[W2-2c] o rascunho vira skill CANDIDATA e fica desligada até o humano ativar; ativar não amplia ferramentas', async () => {
    const h = world()
    const start = h.startTeachSession({ ...PP, personaId: 'nina', consentVersion: TEACH_CONSENT })
    await h.stopTeachSession({
      ...PP, sessionId: start.sessionId, includeMicrophone: false, transcript: 'Abra o catálogo e publique.',
      frames: [{ atMs: 0, imageRef: 'file://local/f0.webp', changeScore: 1 }],
    })
    const draft = h.getTeachDraft({ ...PP, sessionId: start.sessionId })
    expect(draft.steps.length).toBeGreaterThan(0)
    const saved = h.submitTeachDraft({ ...PP, sessionId: start.sessionId, steps: draft.steps, activate: true })
    const skill = h.screens.listSkills('pp').find(row => row.id === saved.candidateSkillId)
    expect(skill?.status, '"activate: true" na revisão não pode ligar sozinho').toBe('candidate')
  })

  it('[W2-2a] nenhum quadro/arquivo da gravação é publicado para o time sem confirmação explícita', async () => {
    const h = world()
    const start = h.startTeachSession({ ...PP, personaId: 'nina', consentVersion: TEACH_CONSENT })
    await h.stopTeachSession({ ...PP, sessionId: start.sessionId, includeMicrophone: false, transcript: 'Abra e publique.', frames: [{ atMs: 0, imageRef: 'file://local/f0.webp', changeScore: 1 }] })
    const accepted = h.acceptTaughtCandidate({ ...PP, sessionId: start.sessionId })
    for (const scope of ['project', 'team'] as const) {
      expect(() => h.publishTaughtSkill({ ...PP, skillId: accepted.id, scope, explicit: false })).toThrow('ACCESS_ESCALATION')
    }
    expect(h.screens.listSkills('pp').find(row => row.id === accepted.id)?.status).toBe('candidate')
  })

  it('[W2-2] a gravação/rascunho de Ensinar de um projeto NÃO é legível por quem só tem acesso a OUTRO projeto (getTeachDraft/submitTeachDraft não conferem o projeto da sessão)', async () => {
    const h = world()
    h.createMember({ id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
    h.createProject({ id: 'p2', workspaceId: 'ws', name: 'Compartilhado', description: 'x' })
    const start = h.startTeachSession({ ...PP, personaId: 'nina', consentVersion: TEACH_CONSENT })
    await h.stopTeachSession({ ...PP, sessionId: start.sessionId, includeMicrophone: false, transcript: 'Passo secreto da Nina.', frames: [{ atMs: 0, imageRef: 'file://local/f0.webp', changeScore: 1 }] })
    h.sessionMemberId = 'bia'
    const other = { workspaceId: 'ws', projectId: 'p2' } as const
    expect(() => h.getTeachDraft({ ...other, sessionId: start.sessionId })).toThrow()
    expect(() => h.submitTeachDraft({ ...other, sessionId: start.sessionId, steps: [], activate: false })).toThrow()
  })
})

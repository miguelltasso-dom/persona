/**
 * E2E-V11 — CV-5 (`@nome` and the Task "com {nome}") and CV-8 ("Toda a equipe" fan-out) on the real persona profile, web, fake CLI, 0 AI. Contract:
 * `persona-spec/contracts/mentions-fanout.md`. The host keeps the opt-ins OFF by default: here `PERSONA_TEAMWORK=1` and `PERSONA_FANOUT=1` are set in the host's
 * environment (the app passes no Config). Each test asserts the host state (typed lines through the same remotes the UI uses) AND what the thread shows.
 * Opt-in `PERSONA_E2E=1`; one host, ~3–4 min.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { hostRpcOk } from '../src/gauge-sb-ges.ts'
import { channelMessages, personasOf, postAsPerson, until, v11Tenant, type PersonaRow, type V11Tenant } from '../src/v11-helpers.ts'
import { openV11Session, type V11Session } from '../src/v11-app.ts'

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run).sequential('V11 web — CV-5 menções e CV-8 "Toda a equipe" (fake, teamwork+fanout ligados no host)', () => {
  let v11: V11Session
  let tenant: V11Tenant
  let team: PersonaRow[]
  const byName = (name: string): PersonaRow => team.find(persona => persona.name === name) ?? (() => { throw new Error(`no persona ${name} in ${team.map(row => row.name).join(', ')}`) })()

  beforeAll(async () => {
    v11 = await openV11Session({ teamwork: true, fanout: true, engine: { turnMs: 1_500 } })
    tenant = await v11Tenant(v11.page)
    team = await personasOf(v11.page, tenant)
  }, 420_000)

  afterAll(async () => {
    // What the host stored, so a red test can be read: the thread as listed (typed lines included) and the Tasks.
    try {
      const dir = join(ARTIFACTS_DIR, 'v11', 'mentions-fanout')
      mkdirSync(dir, { recursive: true })
      const messages = await channelMessages(v11.page, tenant)
      const tasks = await hostRpcOk<unknown[]>(v11.page, 'listTasks', { workspaceId: tenant.workspaceId, projectId: tenant.projectId })
      writeFileSync(join(dir, 'host-state.json'), JSON.stringify({ team, tasks, messages: messages.map(message => ({ id: message.id, type: message.type, actorId: message.actorId, body: message.body.slice(0, 200), taskWith: message.taskWith, fanout: message.fanout })) }, null, 1))
    } catch { /* the run is already over */ }
    await v11?.close()
  }, 60_000)

  it('the hired team is there (the fixture of every test below)', () => {
    expect(team.length, team.map(row => row.name).join(', ')).toBeGreaterThanOrEqual(4)
    for (const name of ['Mídia', 'Criação', 'Atendimento']) expect(team.map(row => row.name)).toContain(name)
  })

  it('CV-5: "@Mídia e @Criação …" is ONE Task, led by Mídia, "com Criação" — typed line, Task view and the thread all say so', async () => {
    const media = byName('Mídia')
    const creation = byName('Criação')
    const id = await postAsPerson(v11.page, tenant, '@Mídia e @Criação, preparem o texto do cartaz da promoção do pão de queijo')
    const line = await until(v11.page, async () => (await channelMessages(v11.page, tenant)).find(message => message.id === `coord-${id}-with`), 60_000)
    expect(line, 'the lead says it ("coord-<id>-with") within a minute').toBeDefined()
    expect(line!.taskWith, 'MessageView.taskWith').toMatchObject({ lead: { personaId: media.id, name: 'Mídia' }, with: [{ personaId: creation.id, name: 'Criação' }] })
    const tasks = await hostRpcOk<Array<{ id: string; title: string; collaborators?: Array<{ personaId: string; name: string }> }>>(v11.page, 'listTasks', { workspaceId: tenant.workspaceId, projectId: tenant.projectId })
    const task = tasks.find(item => item.id === line!.taskWith!.ticketId)
    expect(task, 'the Task exists').toBeDefined()
    expect(task!.collaborators, 'TaskView.collaborators').toEqual([{ personaId: creation.id, name: 'Criação' }])
    expect(tasks.filter(item => item.collaborators?.some(collaborator => collaborator.personaId === creation.id)), 'ONE Task, not one per mention').toHaveLength(1)
    // the thread shows who works with whom (the line is the lead's, in words: "Mídia está com Criação em “…”" / "…, com Criação")
    await v11.page.getByText(/Mídia.*Criação|Criação.*Mídia/u).first().waitFor({ state: 'visible', timeout: 30_000 })
  }, 120_000)

  it('CV-5: the whole name counts — "@Anabela" is not "@Ana" and an e-mail address calls nobody', async () => {
    // Any channel message may open a Task for whoever answers by default (that is not a mention), so the claim is narrower: the address calls NOBODY — no
    // collaborator on the Task it opened, no "<lead> está com <colega>" line — and "@Anabela" never turns into "@Ana".
    const listTasks = async (): Promise<Array<{ id: string; title: string; collaborators?: unknown[] }>> => hostRpcOk(v11.page, 'listTasks', { workspaceId: tenant.workspaceId, projectId: tenant.projectId })
    const knownTaskIds = new Set((await listTasks()).map(task => task.id))
    const emailId = await postAsPerson(v11.page, tenant, 'mande o orçamento para criacao@Mídia.com quando puder')
    const anabelaId = await postAsPerson(v11.page, tenant, '@Anabela, pode olhar o cartaz?')
    await v11.page.waitForTimeout(8_000)
    const fresh = (await listTasks()).filter(task => !knownTaskIds.has(task.id) && !task.title.startsWith('Revisar:'))
    for (const task of fresh) expect(task.collaborators ?? [], `"${task.title}": no one was called by a mention`).toHaveLength(0)
    const lines = await channelMessages(v11.page, tenant)
    expect(lines.filter(line => line.id === `coord-${emailId}-with` || line.id === `coord-${anabelaId}-with`), 'no "com {nome}" line for an e-mail or a name that is nobody').toHaveLength(0)
    expect(lines.some(line => line.id === emailId), 'the e-mail message stays in the channel').toBe(true)
    expect(lines.some(line => line.body.includes('@Anabela') && line.actorId === tenant.memberId), 'the "@Anabela" message stays in the channel').toBe(true)
  }, 90_000)

  it('CV-8: "Toda a equipe" — ONE line per persona, same block id, never mute (reply / nothing / limit / paused / failed)', async () => {
    const id = await postAsPerson(v11.page, tenant, 'O que vocês acham de um cartaz azul com bolinhas vermelhas?', { fanout: 'everyone' })
    const block = await until(v11.page, async () => {
      const lines = (await channelMessages(v11.page, tenant)).filter(message => message.id.startsWith(`coord-${id}-fan-`))
      return lines.length >= (lines[0]?.fanout?.total ?? 99) ? lines : undefined
    }, 120_000)
    expect(block, 'the whole block arrived within 2 minutes').toBeDefined()
    const lines = block!
    expect(new Set(lines.map(line => line.fanout!.id)).size, 'one block').toBe(1)
    expect(lines.every(line => line.fanout!.source === 'everyone')).toBe(true)
    expect(lines.map(line => line.fanout!.total)).toEqual(lines.map(() => lines.length))
    expect(new Set(lines.map(line => line.fanout!.personaId)).size, 'one line per persona').toBe(lines.length)
    expect(lines.length, 'the whole team was asked').toBe(team.length)
    for (const line of lines) expect(['reply', 'nothing', 'limit', 'paused', 'failed']).toContain(line.fanout!.kind)
    expect(lines.map(line => line.fanout!.index).sort((a, b) => a - b), '1-based places, no gaps').toEqual(lines.map((_unused, index) => index + 1))
  }, 180_000)

  it('CV-8: the estimate of "Toda a equipe" is EXACT in calls (one per persona consulted)', async () => {
    const estimate = await hostRpcOk<{ fanout?: { source: string; replies: number; asked: number; chamadas: { min: number; max: number } } }>(v11.page, 'estimateAsk', {
      workspaceId: tenant.workspaceId, projectId: tenant.projectId, texto: 'O que vocês acham do cartaz?', streamKind: 'channel', ownerId: tenant.channelId, audience: 'everyone',
    })
    expect(estimate.fanout, 'estimateAsk answers with a fan-out part').toBeDefined()
    expect(estimate.fanout!.source).toBe('everyone')
    expect(estimate.fanout!.chamadas.min, 'calls are exact, not a range').toBe(estimate.fanout!.chamadas.max)
    expect(estimate.fanout!.chamadas.max).toBeLessThanOrEqual(team.length)
  }, 60_000)
})

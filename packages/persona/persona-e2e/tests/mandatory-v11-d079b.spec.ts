/**
 * E2E-V11 — D-079(b) with a CLI worker: "the persona asks a question and the person's answer CONTINUES that Task". With a REAL CLI the host only opens "espera a pessoa"
 * through the `persona_ask` tool (HT-14, `PERSONA_PRODUCT_TOOLS=1`, Bolt 05/11 01:37: host ready, the real transport is being proven by Rivet). The fake CLI stub cannot call a host
 * tool, so the question never arrives through it: this test states the REQUIRED behaviour (a question card + "Resposta enviada para …: continua “…”") and is `it.fails` — a
 * GATE, not a regression — until the stub (or the real transport) can ask; it flips red the day it passes. The same behaviour IS proven at the host (Bolt's `conversation-d079.spec`,
 * scripted worker reports). Web, fake CLI, 0 AI. Opt-in `PERSONA_E2E=1`; one host, ~3 min.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openV11Session, type V11Session } from '../src/v11-app.ts'
import { channelMessages, postAsPerson, until, v11Tenant, type V11Tenant } from '../src/v11-helpers.ts'

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run).sequential('V11 web — D-079(b): pergunta de um worker de CLI e a resposta que CONTINUA a Tarefa (gate HT-14)', () => {
  let v11: V11Session
  let tenant: V11Tenant

  beforeAll(async () => {
    v11 = await openV11Session({ productTools: true, engine: { turnMs: 4_000 } })
    tenant = await v11Tenant(v11.page)
  }, 420_000)

  afterAll(async () => { await v11?.close() }, 60_000)

  it.fails('[GATE → Bolt/Rivet HT-14] a CLI worker asks (persona_ask) and the person\'s answer continues THE SAME Task: the answer line "Resposta enviada para …: continua “…”" and the final report', async () => {
    const id = await postAsPerson(v11.page, tenant, '@Mídia atualize o cardápio com os preços novos')
    // The question must arrive as a card the person can answer (not as the delivery text).
    const card = v11.page.getByRole('button', { name: /^Responder$/u }).first().or(v11.page.getByText(/Preciso saber|Qual o preço/u).first())
    await card.waitFor({ state: 'visible', timeout: 60_000 })
    await postAsPerson(v11.page, tenant, 'O pão francês passa a custar R$ 1,10')
    const absorbed = await until(v11.page, async () => (await channelMessages(v11.page, tenant)).find(message => /Resposta enviada para .+: continua/u.test(message.body)), 45_000)
    expect(absorbed, `the answer to the question was absorbed by the Task that asked (after ${id})`).toBeDefined()
  }, 240_000)
})

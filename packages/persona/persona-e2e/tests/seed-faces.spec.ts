/**
 * SEED das CARAS DAS MENSAGENS (`src/seed-faces.ts`): o veredito PURO sempre roda; a rodada REAL é opt-in (`PERSONA_SEED_FACES=1`, 1 host pesado pela trava build): semeia o home LIMPO (#geral com 4 personas falando +
 * DM com a Atendimento), prova no host, reabre uma CÓPIA no app real e confere NA TELA o #geral e a DM (capturas em `artifacts/seed-faces/`).
 *   PERSONA_E2E=1 PERSONA_SEED_FACES=1 node scripts/persona/with-lock.mjs "Probe seed caras" --lock build -- pnpm exec vitest run packages/persona/persona-e2e/tests/seed-faces.spec.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { copySeededHome, openSeededEmberApp } from '../src/seed-ember.ts'
import { FACES_CHANNEL, FACES_DM, facesProblems, seedFacesHome, type FacesSeedProof } from '../src/seed-faces.ts'

const run = process.env.PERSONA_SEED_FACES === '1'
const HOME = process.env.PERSONA_SEED_FACES_HOME ?? join(ARTIFACTS_DIR, 'seed-faces', 'home')

describe('seed das caras — veredito (puro)', () => {
  const person = 'ana'
  const geral = [{ actorId: person, body: 'oi' }, { actorId: 'coordena-o', body: 'Bom dia!' }, { actorId: 'atendimento', body: 'Oi!' }, { actorId: 'cria-o', body: 'Adorei!' }, { actorId: 'm-dia', body: 'Hmm.' }]
  const dm = [{ actorId: person, body: 'oi' }, { actorId: 'atendimento', body: 'Oi!' }, { actorId: person, body: 'obrigada' }, { actorId: 'atendimento', body: 'Imagina!' }]

  it('passa com 3+ personas no #geral e fala dos dois lados na DM; acusa persona só uma, DM de um lado só e erro do motor no fio', () => {
    expect(facesProblems(geral, dm, person)).toEqual([])
    expect(facesProblems(geral.slice(0, 3), dm, person)).toEqual([expect.stringContaining('esperava ao menos 3')])
    expect(facesProblems(geral, dm.slice(0, 2), person)).toEqual([expect.stringContaining('esperava ao menos 2 de cada')])
    expect(facesProblems([...geral, { actorId: 'coordena-o', body: '[[run-error:{"code":"engine_unavailable"}]]' }], dm, person)).toEqual([expect.stringContaining('erro do motor')])
  })

  it('cada troca tem um trecho próprio que só existe na frase dela (o stub responde pelo trecho) e a persona certa', () => {
    const keys = [...FACES_CHANNEL, ...FACES_DM].map(exchange => exchange.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const exchange of [...FACES_CHANNEL, ...FACES_DM]) expect(exchange.say).toContain(exchange.key)
    // a frase da pessoa é conversa, nunca pedido de trabalho (um pedido abriria Tarefa e a linha "X assume este pedido")
    for (const exchange of FACES_CHANNEL) expect(exchange.say.endsWith('?')).toBe(true)
  })
})

describe.skipIf(!run)('seed das caras — a rodada real (app real, CLI de mentira, 0 IA)', () => {
  const out = dirname(HOME)
  let proof: FacesSeedProof | undefined

  it('semeia o home limpo: #geral com 4 personas falando e DM com a Atendimento (o host prova)', async () => {
    rmSync(HOME, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    proof = await seedFacesHome({ home: HOME })
    writeFileSync(join(out, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`)
    expect(proof.channel.speakers.length).toBeGreaterThanOrEqual(3)
    expect(proof.dm.lines).toBeGreaterThanOrEqual(4)
  }, 900_000)

  it('reabre uma CÓPIA: as falas das personas estão NA TELA do #geral e as da DM na DM (capturas)', async () => {
    expect(proof, 'o seed não rodou').toBeDefined()
    const copy = copySeededHome(HOME, mkdtempSync(join(tmpdir(), 'seed-faces-copy-')).concat('-home'))
    const session = await openSeededEmberApp({ home: copy, renewCode: false })
    try {
      const { page } = session
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
      await page.getByText(/Claude · pronto/u).first().waitFor({ state: 'visible', timeout: 90_000 })
      const last = FACES_CHANNEL[FACES_CHANNEL.length - 1]
      const lastLine = page.getByText(last?.reply.slice(0, 30) ?? '', { exact: false }).first()
      await lastLine.waitFor({ state: 'visible', timeout: 60_000 })
      await lastLine.scrollIntoViewIfNeeded()
      await page.waitForTimeout(1_500)
      await page.screenshot({ path: join(out, 'geral.png') })
      await page.locator('[data-conversation-kind="dm"][data-persona-id="atendimento"]').first().click()
      const dmLast = FACES_DM[FACES_DM.length - 1]
      const dmLine = page.getByText(dmLast?.reply.slice(0, 30) ?? '', { exact: false }).first()
      await dmLine.waitFor({ state: 'visible', timeout: 60_000 })
      await dmLine.scrollIntoViewIfNeeded()
      await page.waitForTimeout(1_500)
      await page.screenshot({ path: join(out, 'dm.png') })
    } finally {
      await session.close()
      rmSync(copy, { recursive: true, force: true })
    }
  }, 600_000)
})

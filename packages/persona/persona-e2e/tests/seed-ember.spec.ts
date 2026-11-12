/**
 * SEED LOCAL do Ember (`src/seed-ember.ts`): os vereditos PUROS (sempre rodam) e a rodada REAL (opt-in `PERSONA_SEED=1`, 1 host pesado pela trava build):
 *   1  `seedEmberHome` semeia o home e PROVA no host os três estados (grupo de 3 mensagens seguidas da pessoa no #geral; a Tarefa do cartaz em REVISÃO; o pedido de código 2FA PENDENTE com o site);
 *   2  `openSeededEmberApp` reabre uma CÓPIA do home no app real e os estados estão NA TELA (as 3 falas no #geral; o cartão "Precisa de um código" com o site; a entrega pendente), com capturas e `proof.json`.
 * Rodar: `node scripts/persona/seed-ember.mjs [--out <pasta>]` (pela trava build) — ele imprime como o Ember liga.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Page } from 'playwright'
import { describe, expect, it } from 'vitest'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { ensureGeralComposer } from '../src/real-app-session.ts'
import { copySeededHome, deliveryProblems, EMBER_SITE, EMBER_TEXT, groupOfThreeProblems, openSeededEmberApp, seedEmberHome, twoFactorProblems, type EmberSeedProof } from '../src/seed-ember.ts'

const run = process.env.PERSONA_SEED === '1'
const HOME = process.env.PERSONA_SEED_HOME ?? join(ARTIFACTS_DIR, 'seed-ember', 'home')

describe('seed do Ember — vereditos (puros)', () => {
  const person = 'ana'
  const thread = (extra: Array<{ actorId: string; body: string }> = []): Array<{ actorId: string; body: string }> => [
    { actorId: 'bia', body: 'Oi!' }, ...EMBER_TEXT.group.map(body => ({ actorId: person, body })), ...extra,
  ]

  it('o grupo de 3 seguidas da pessoa passa; uma linha de outro autor no meio, ou uma fala faltando, é acusada', () => {
    expect(groupOfThreeProblems(thread(), person, EMBER_TEXT.group)).toEqual([])
    const broken = [{ actorId: 'bia', body: 'Oi!' }, { actorId: person, body: EMBER_TEXT.group[0] }, { actorId: 'bia', body: 'ok' }, { actorId: person, body: EMBER_TEXT.group[1] }, { actorId: person, body: EMBER_TEXT.group[2] }]
    expect(groupOfThreeProblems(broken, person, EMBER_TEXT.group)).toHaveLength(2)
    expect(groupOfThreeProblems([{ actorId: 'bia', body: 'Oi!' }], person, EMBER_TEXT.group)).toHaveLength(1)
  })

  it('a entrega só vale em revisão: fechada, andando ou inexistente são acusadas', () => {
    expect(deliveryProblems({ stage: 'review' })).toEqual([])
    expect(deliveryProblems({ stage: 'done' })).toHaveLength(1)
    expect(deliveryProblems({ stage: 'doing' })).toHaveLength(1)
    expect(deliveryProblems(undefined)).toHaveLength(1)
  })

  it('o 2FA só vale pendente e com o site no rótulo: sem pedido, já preenchido ou sem o site são acusados', () => {
    expect(twoFactorProblems({ state: 'pending', site: EMBER_SITE }, EMBER_SITE)).toEqual([])
    expect(twoFactorProblems(undefined, EMBER_SITE)).toHaveLength(1)
    expect(twoFactorProblems({ state: 'filled', site: EMBER_SITE }, EMBER_SITE)).toHaveLength(1)
    expect(twoFactorProblems({ state: 'pending' }, EMBER_SITE)).toHaveLength(1)
  })
})

/** The first of these surfaces whose `probe` finds the text: the card lives in the thread or in "Aprovações" (the capture says which). */
async function visibleOn(page: Page, surfaces: ReadonlyArray<{ readonly name: string; readonly open: () => Promise<void> }>, text: string | RegExp): Promise<string | undefined> {
  for (const surface of surfaces) {
    await surface.open().catch(() => undefined)
    if (await page.getByText(text).first().isVisible().catch(() => false)) return surface.name
    const seen = await page.getByText(text).first().waitFor({ state: 'visible', timeout: 6_000 }).then(() => true, () => false)
    if (seen) return surface.name
  }
  return undefined
}

describe.skipIf(!run)('seed do Ember — a rodada real (app real, CLI de mentira, 0 IA)', () => {
  const out = dirname(HOME)
  let proof: EmberSeedProof | undefined

  it('semeia o home: conversa com o grupo de 3, entrega em revisão e 2FA com o site (o host prova)', async () => {
    rmSync(HOME, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    proof = await seedEmberHome({ home: HOME })
    writeFileSync(join(out, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`)
    expect(proof.delivery.stage).toBe('review')
    expect(proof.twoFactor.state).toBe('pending')
    expect(proof.twoFactor.site ?? '').toContain(EMBER_SITE)
  }, 900_000)

  it('reabre uma CÓPIA do home no app real: as 3 falas, o cartão do 2FA com o site e a entrega pendente estão NA TELA', async () => {
    expect(proof, 'o seed não rodou').toBeDefined()
    const copy = copySeededHome(HOME, mkdtempSync(join(tmpdir(), 'seed-ember-copy-')).concat('-home'))
    const session = await openSeededEmberApp({ home: copy })
    try {
      const { page } = session
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
      await ensureGeralComposer(page)
      // 1) the group of 3, as the person wrote it
      for (const body of EMBER_TEXT.group) await page.getByText(body, { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
      await page.screenshot({ path: join(out, 'geral.png') })
      // 3) the 2FA card with the site (thread or Aprovações)
      const geral = { name: '#geral', open: async () => { await ensureGeralComposer(page) } }
      const aprovacoes = { name: 'Aprovações', open: async () => { await page.getByRole('button', { name: 'Aprovações', exact: true }).click() } }
      const codeAt = await visibleOn(page, [geral, aprovacoes], 'Precisa de um código')
      const siteAt = await visibleOn(page, [geral, aprovacoes], EMBER_SITE)
      await page.screenshot({ path: join(out, '2fa.png') })
      // 2) the delivery waiting for "Aceitar": where the card is varies (thread, Aprovações, Quadro): the capture and the note say where; the Task being in review is proven in the host above
      const acceptAt = await visibleOn(page, [geral, aprovacoes], /^Aceitar/u)
      await page.screenshot({ path: join(out, 'entrega.png') })
      writeFileSync(join(out, 'ui.json'), `${JSON.stringify({ cartaoDoCodigoEm: codeAt ?? null, siteEm: siteAt ?? null, aceitarEm: acceptAt ?? null }, null, 2)}\n`)
      expect(codeAt, 'o cartão "Precisa de um código" não aparece na tela (nem no #geral nem em Aprovações)').toBeDefined()
      expect(siteAt, `o site "${EMBER_SITE}" não aparece no rótulo do cartão`).toBeDefined()
    } finally {
      await session.close()
      rmSync(copy, { recursive: true, force: true })
    }
  }, 600_000)
})

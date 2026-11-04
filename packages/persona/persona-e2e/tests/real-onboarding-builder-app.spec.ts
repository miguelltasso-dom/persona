/**
 * SCOPE-1 (B8) — onboarding "do zero" pelo construtor conversacional (passo 4): o usuário descreve quem precisa, revisa o
 * rascunho e a persona nova aparece no rail SEM equipe pré-semeada (nada de Atlas/Bento/Nina/Sol/Luna fixos).
 * Precisa de um home limpo → sobe o próprio host (não roda com GAUGE_HOST_URL). Substitui o it.todo de mandatory-scope.
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { captureDir } from '../src/gauge-app.ts'
import { firstDeliveryCopy } from '../src/first-delivery-flow.ts'
import { onboarding } from '../src/real-app-locale.pt.ts'
import { openRealPersonaApp } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1' && (process.env.GAUGE_HOST_URL ?? '') === ''
const TEMPLATE_NAMES = ['Atlas', 'Bento', 'Nina', 'Sol', 'Luna']

describe.skipIf(!run)('SCOPE-1 — onboarding do zero pelo construtor conversacional', () => {
  it('[SCOPE-1] descreve a persona em linguagem natural → rascunho → equipe só com o que foi pedido, sem elenco fixo', async () => {
    const session = await openRealPersonaApp({ keepOnboarding: true, viewport: { width: 1440, height: 900 } })
    const dir = await captureDir('scope')
    try {
      const { page } = session
      const next = page.getByRole('button', { name: onboarding.continue, exact: true })
      await page.getByPlaceholder(onboarding.step1Placeholder).fill('Gauge Builder')
      await next.click()
      await page.getByText(onboarding.step2VaultBadge).waitFor({ state: 'visible' })
      await next.click()
      await page.getByRole('heading', { name: onboarding.step3Title }).waitFor({ state: 'visible' })
      await page.waitForTimeout(1_500)
      if (await next.isEnabled().catch(() => false)) await next.click()
      else await page.getByRole('button', { name: firstDeliveryCopy.skipHarness }).click()

      await page.getByRole('heading', { name: 'Monte sua equipe' }).first().waitFor({ state: 'visible', timeout: 30_000 })
      await page.screenshot({ path: join(dir, 'scope1-passo4-modelos.png') })
      const toggle = page.getByRole('button', { name: /Prefere descrever com suas palavras\?/u })
      if (await toggle.count() > 0) await toggle.click()
      const field = page.getByLabel('Descreva quem você precisa').or(page.getByPlaceholder(/Preciso de alguém para/u)).first()
      await field.fill('Preciso de alguém para revisar contratos e responder clientes com calma.')
      await page.getByRole('button', { name: 'Gerar rascunho' }).click()
      await page.getByText(/Montei um rascunho/u).first().waitFor({ state: 'visible', timeout: 30_000 })
      await page.screenshot({ path: join(dir, 'scope1-passo4-rascunho.png') })
      await next.click()

      const enter = page.getByRole('button', { name: onboarding.enterApp }).or(page.getByRole('button', { name: onboarding.finish })).first()
      await enter.waitFor({ state: 'visible', timeout: 30_000 })
      await enter.click()
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 60_000 })
      await page.waitForTimeout(2_500)
      const railText = await page.locator('#persona-rail-team-title').innerText().catch(() => '')
      const count = Number(/(\d+)/u.exec(railText)?.[1] ?? '0')
      expect(count, `rail: ${railText}`).toBeGreaterThanOrEqual(1)
      expect(count, 'só a(s) persona(s) pedida(s), nunca o elenco fixo de 5').toBeLessThan(5)
      const body = await page.locator('body').innerText()
      for (const name of TEMPLATE_NAMES) expect(body, `elenco pré-semeado: ${name}`).not.toMatch(new RegExp(`Conversar com ${name}\\b`, 'u'))
      await page.screenshot({ path: join(dir, 'scope1-equipe-final.png') })
    } finally {
      await session.close()
    }
  }, 420_000)
})

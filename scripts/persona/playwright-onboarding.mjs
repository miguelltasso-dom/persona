/** Drive the 5-step Persona onboarding overlay (production path for gates/shots). */

const onboardingPt = {
  step1Title: 'Como podemos te chamar?',
  step1Placeholder: 'Ex.: Miguel',
  step2VaultBadge: 'Memória da empresa',
  step2Placeholder: 'Descreva em linguagem natural ou cole um texto…',
  step3Title: 'Ferramentas de IA neste computador',
  step4TemplateBlank: 'Em branco',
  step5Title: 'Boas-vindas ao #geral',
  step5SkipFirstDelivery: 'Entrar sem pedir agora',
  continue: 'Continuar',
  finish: 'Entrar na Persona',
}

/**
 * @param {import('playwright').Page} page
 * @param {{ displayName?: string, vaultLine?: string }} [opts]
 */
export async function completePersonaOnboardingOverlay(page, opts = {}) {
  const displayName = opts.displayName ?? 'Miguel'
  const vaultLine = opts.vaultLine ?? 'Tom de voz: claro e humano.'
  if ((await page.getByRole('heading', { name: onboardingPt.step1Title }).count()) === 0) {
    const legacy = await page.getByText(/Passo 1 de 5|Step 1 of 5/u).isVisible().catch(() => false)
    if (!legacy) return false
  }
  const continueBtn = () => page.getByRole('button', { name: onboardingPt.continue, exact: true })
  await page.getByPlaceholder(onboardingPt.step1Placeholder).fill(displayName)
  await continueBtn().click()
  // The badge text ("Memória da empresa") now also names the sidebar place and guide bubbles, so wait on the step-2 input, which is unique.
  await page.getByPlaceholder(onboardingPt.step2Placeholder).or(page.locator('textarea').first()).first().waitFor({ state: 'visible', timeout: 30_000 })
  const vaultField = page.getByPlaceholder(onboardingPt.step2Placeholder)
  if (await vaultField.isVisible().catch(() => false)) {
    await vaultField.fill(vaultLine)
  } else {
    const textarea = page.locator('textarea').first()
    if (await textarea.isVisible().catch(() => false)) await textarea.fill(vaultLine)
  }
  await continueBtn().click()
  await page.getByRole('heading', { name: onboardingPt.step3Title }).waitFor({ state: 'visible', timeout: 30_000 })
  const skipHarness = page.getByRole('button', { name: 'Continuar sem conectar', exact: true })
  if (await skipHarness.isVisible().catch(() => false)) {
    await skipHarness.click()
  } else {
    await continueBtn().click()
  }
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: onboardingPt.step4TemplateBlank }).click()
  await continueBtn().click()
  // Step 5 is either the classic welcome ("Entrar na Persona") or, since V1-P0-4, the "Primeira entrega" step whose
  // gate-safe exit is "Entrar sem pedir agora" (never "Pedir agora": that would start a real execution).
  const skipFirstDelivery = page.getByRole('button', { name: onboardingPt.step5SkipFirstDelivery, exact: true })
  await page.getByRole('heading', { name: onboardingPt.step5Title }).or(skipFirstDelivery).first().waitFor({ state: 'visible', timeout: 60_000 })
  if (await skipFirstDelivery.isVisible().catch(() => false)) await skipFirstDelivery.click({ timeout: 15_000 })
  else await page.getByRole('button', { name: onboardingPt.finish }).click({ timeout: 15_000 })
  await page.waitForTimeout(5000)
  return true
}

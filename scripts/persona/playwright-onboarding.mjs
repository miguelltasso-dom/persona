/** Drive the 5-step Persona onboarding overlay (production path for gates/shots). */

/**
 * @param {import('playwright').Page} page
 * @param {{ displayName?: string, vaultLine?: string }} [opts]
 */
export async function completePersonaOnboardingOverlay(page, opts = {}) {
  const displayName = opts.displayName ?? 'Miguel'
  const vaultLine = opts.vaultLine ?? 'Tom de voz: claro e humano.'
  const hasOnboarding = await page.getByText(/Passo 1 de 5|Step 1 of 5/u).isVisible().catch(() => false)
  if (!hasOnboarding) return false
  await page.locator('input').first().fill(displayName)
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.waitForTimeout(400)
  const textarea = page.locator('textarea').first()
  if (await textarea.isVisible().catch(() => false)) {
    await textarea.fill(vaultLine)
  }
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.waitForTimeout(400)
  const skipHarness = page.getByRole('button', { name: 'Continuar sem conectar', exact: true })
  if (await skipHarness.isVisible().catch(() => false)) {
    await skipHarness.click()
    await page.waitForTimeout(400)
  }
  const continueBtn = () => page.getByRole('button', { name: 'Continuar', exact: true })
  if (await continueBtn().isVisible().catch(() => false)) {
    await continueBtn().click()
    await page.waitForTimeout(400)
  }
  const finish = page.getByRole('button', { name: /Entrar no Persona|Enter Persona|Concluir|Finish/u })
  await finish.first().click({ timeout: 15_000 })
  await page.waitForTimeout(5000)
  return true
}

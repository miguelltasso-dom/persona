/**
 * E2E-V11 discovery (read-only): boot the real persona profile with the team opt-in and the single lilac bar ON, hire the team, and dump what the DOM says for each
 * v1.1 function (rail, "Quem responde", composer queue/stop, Configurações › Personas, Quadros) so the specs assert real selectors, not guesses. 0 AI, fake CLI.
 *
 *   node scripts/persona/with-lock.mjs "Probe v11 discovery" --lock build --wait-max 1200000 -- node --import tsx/esm packages/persona/persona-e2e/scripts/v11-discovery.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { geralComposerLocator } from '../src/geral-composer.ts'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { ensureGeralComposer } from '../src/real-app-session.ts'
import { openV11Session } from '../src/v11-app.ts'

const OUT = join(ARTIFACTS_DIR, 'v11-discovery')
await mkdir(OUT, { recursive: true })
const notes: string[] = []
const note = (line: string): void => { notes.push(line); console.log(line) }

async function aria(page: Page, selector: string, label: string): Promise<void> {
  const nodes = page.locator(selector)
  const count = await nodes.count()
  note(`## ${label} (${selector}): ${String(count)}`)
  for (let index = 0; index < Math.min(count, 40); index += 1) {
    const node = nodes.nth(index)
    const info = await node.evaluate(element => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      label: element.getAttribute('aria-label'),
      text: (element.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 80),
      attrs: [...element.attributes].filter(attribute => attribute.name.startsWith('data-')).map(attribute => `${attribute.name}=${attribute.value.slice(0, 40)}`).join(' '),
    })).catch(() => null)
    if (info !== null) note(`   - <${info.tag}${info.role === null ? '' : ` role=${info.role}`}${info.label === null ? '' : ` aria-label="${info.label}"`}> "${info.text}" ${info.attrs}`)
  }
}

const v11 = await openV11Session({ teamwork: true, fanout: true, navPlaces: true, viewport: { width: 1440, height: 900 }, engine: { turnMs: 8_000 } })
const { page } = v11
try {
  note('# V11 discovery — rail / nav (navPlaces ON)')
  await page.screenshot({ path: join(OUT, '01-shell.png') })
  await aria(page, '[data-nav-item]', 'nav items')
  await aria(page, '[data-nav-panel]', 'nav panels')
  await aria(page, '[data-persona-rail] button, aside button', 'rail buttons (aside)')
  note(`rail text: ${(await page.locator('aside, [data-persona-rail]').first().innerText().catch(() => '')).replace(/\s+/gu, ' ').slice(0, 900)}`)

  note('# #geral composer')
  await ensureGeralComposer(page)
  await page.screenshot({ path: join(OUT, '02-geral.png') })
  await aria(page, '[data-persona-area="composer"] button', 'composer buttons')
  await aria(page, '[data-persona-area="composer"] [role], [data-persona-area="composer"] textarea', 'composer roles')
  note(`composer area text: ${(await page.locator('[data-persona-area="composer"]').first().innerText().catch(() => 'no [data-persona-area=composer]')).replace(/\s+/gu, ' ').slice(0, 500)}`)
  await aria(page, 'button[aria-label*="responde" i], button[aria-haspopup]', 'who-responds triggers')
  await aria(page, 'section[aria-labelledby="persona-team-strip-title"] button', 'team strip buttons')

  note('# open "Quem responde" popover')
  const trigger = page.getByRole('button', { name: /Quem responde|Coordenação/u }).first()
  note(`who-responds trigger count: ${String(await page.getByRole('button', { name: /Quem responde|Coordenação/u }).count())}`)
  if (await trigger.count() > 0) {
    await trigger.click({ timeout: 8_000 }).catch(error => note(`click failed: ${String(error).slice(0, 120)}`))
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(OUT, '03-who-responds.png') })
    await aria(page, '[role="dialog"], [role="listbox"], [role="menu"], [role="option"], [role="menuitem"]', 'popover roles')
    await page.keyboard.press('Escape')
  }

  note('# "@" in the composer')
  const composer = geralComposerLocator(page).first()
  await composer.focus()
  await composer.fill('@')
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, '04-at.png') })
  await aria(page, '[role="listbox"], [role="option"], [role="dialog"]', '@ popover roles')
  await composer.fill('')

  note('# a running turn: queue / stop controls')
  await composer.fill('Escreva o texto do cartaz da promoção do pão de queijo')
  await composer.press('Enter')
  await page.waitForTimeout(2_500)
  await composer.fill('e inclua o preço')
  await composer.press('Enter')
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: join(OUT, '05-running.png') })
  await aria(page, 'button[aria-label*="Parar" i], button[aria-label*="Tirar" i], button[aria-label*="Editar" i], button[aria-label*="Direcionar" i], button[aria-label*="fila" i]', 'queue/stop buttons')
  note(`thread tail: ${(await page.locator('main').first().innerText().catch(() => '')).replace(/\s+/gu, ' ').slice(-700)}`)
  await page.waitForTimeout(12_000)

  note('# Configurações › Personas')
  await page.getByRole('button', { name: /Configurações/u }).first().click({ timeout: 8_000 }).catch(error => note(`settings click failed: ${String(error).slice(0, 100)}`))
  await page.waitForTimeout(800)
  await aria(page, '[role="tab"], [role="tablist"] button, nav button', 'settings tabs')
  const personasTab = page.getByRole('tab', { name: /Personas/u }).or(page.getByRole('button', { name: /^Personas$/u })).first()
  if (await personasTab.count() > 0) {
    await personasTab.click().catch(() => {})
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(OUT, '06-settings-personas.png') })
    await aria(page, '[role="combobox"], select, [role="listbox"], [role="radiogroup"], [aria-label*="Capricho" i], [aria-label*="modelo" i]', 'model / effort controls')
    note(`settings text: ${(await page.locator('main').first().innerText().catch(() => '')).replace(/\s+/gu, ' ').slice(0, 1100)}`)
  }

  note('# Quadros')
  await page.getByRole('button', { name: /^Quadros$/u }).first().click({ timeout: 8_000 }).catch(error => note(`boards click failed: ${String(error).slice(0, 100)}`))
  await page.waitForTimeout(1_200)
  await page.screenshot({ path: join(OUT, '07-boards.png') })
  await aria(page, '[data-persona-surface="boards"] [role="listitem"], [data-persona-surface="boards"] article, [data-persona-surface="boards"] [data-card-id]', 'board cards')
  note(`boards text: ${(await page.locator('[data-persona-surface="boards"]').first().innerText().catch(() => '')).replace(/\s+/gu, ' ').slice(0, 900)}`)
} finally {
  await writeFile(join(OUT, 'discovery.md'), `${notes.join('\n')}\n`)
  await v11.close()
}

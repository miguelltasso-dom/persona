/**
 * Padaria Lua dogfood walk on the real Persona web profile (clean home).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { REPO_ROOT } from './paths.ts'
import { REAL_GALLERY_PANELS } from './real-gallery/panels.ts'
import { navigateGalleryPanel } from './real-gallery/navigate-panel.ts'
import { geralComposerLocator } from './geral-composer.ts'
import { chat, onboarding, openRealPersonaApp } from './real-app-session.ts'
import { isBuildLockBootFailure } from './web-host.ts'

export type DogfoodOwner = 'Prism' | 'Lumen' | 'Muse' | 'Anvil' | 'Rivet' | 'Forge' | 'Probe'
export type DogfoodSeverity = 'P0' | 'P1' | 'P2' | 'P3' | 'ok'

export interface DogfoodFinding {
  id: string
  title: string
  severity: DogfoodSeverity
  owner: DogfoodOwner
  steps: string
  capture: string
  expected: string
  got: string
}

export interface DogfoodReport {
  findings: DogfoodFinding[]
  stepsOk: string[]
  home: string
  realCliUsed: number
}

const COMPANY = 'Padaria Lua — padaria de bairro em São Paulo. Pão, bolo e café. Tom caloroso e direto. Não inventar preços. Clientes: vizinhos e encomendas de festa.'

const SHOTS = join(REPO_ROOT, '.maestri', 'tmp', 'shots', 'dogfood-padaria')
const REPORT = join(REPO_ROOT, 'persona-spec', 'reports', 'dogfood-padaria.md')

/** Visible copy: Playwright getByText (layout-aware). Never infer from parent `textContent` (DF-003: glues siblings → "Bem-vindoao#geral"). See `visible-copy.ts`. */
async function hasVisibleCopy(page: Page, text: string | RegExp): Promise<boolean> {
  const locator = typeof text === 'string'
    ? page.getByText(text, { exact: true })
    : page.getByText(text)
  return (await locator.count()) > 0
}

function shotPath(name: string): string {
  return join(SHOTS, `${name}.png`)
}

/**
 * Walk the Padaria Lua scenario. Always writes the report. Callers must close the session.
 */
export async function runPadariaDogfood(): Promise<DogfoodReport> {
  mkdirSync(SHOTS, { recursive: true })
  const findings: DogfoodFinding[] = []
  const stepsOk: string[] = []
  let n = 0
  let session: Awaited<ReturnType<typeof openRealPersonaApp>>
  try {
    session = await openRealPersonaApp()
  } catch (bootError: unknown) {
    const lock = isBuildLockBootFailure(bootError)
    writeDogfoodMarkdown([{
      id: lock ? 'DF-LOCK' : 'DF-000',
      title: lock ? 'Harness: fila do build lock (host não chegou a subir)' : 'App real não subiu',
      severity: lock ? 'P2' : 'P0',
      owner: lock ? 'Probe' : 'Prism',
      steps: 'openRealPersonaApp (perfil persona, home limpo; lock só no boot via --release-on dsh web:)',
      capture: '',
      expected: lock ? 'lock livre ou PERSONA_HOST_NO_LOCK=1 com artifacts frescos' : 'shell visível',
      got: String(bootError),
    }], [], '(sem home)', 0)
    throw bootError
  }
  let page = session.page

  const shot = async (name: string): Promise<string> => {
    const path = shotPath(name)
    await page.screenshot({ path, fullPage: true }).catch(() => {})
    return path.replace(/\\/g, '/')
  }

  const note = (
    title: string,
    severity: DogfoodSeverity,
    owner: DogfoodOwner,
    steps: string,
    capture: string,
    expected: string,
    got: string,
  ): void => {
    n += 1
    findings.push({
      id: `DF-${String(n).padStart(3, '0')}`,
      title,
      severity,
      owner,
      steps,
      capture,
      expected,
      got,
    })
  }

  try {
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
    const boot = await shot('00-boot')
    stepsOk.push('boot shell')

    if (await page.getByRole('heading', { name: onboarding.step1Title }).count() === 0) {
      note('Onboarding não apareceu em home limpo', 'P0', 'Prism', 'Abrir perfil persona com PERSONA_HOME novo', boot, 'Passo 1 visível', 'sem heading do passo 1')
    } else {
      const wizardContinue = () => page.getByRole('button', { name: onboarding.continue, exact: true }).last()
      const assistantContinue = () => page.locator('[data-step]').getByRole('button', { name: onboarding.continue, exact: true })

      await page.getByPlaceholder(onboarding.step1Placeholder).fill('Clara')
      await wizardContinue().click()
      await page.getByLabel('Sobre a empresa').getByText(onboarding.step2VaultBadge, { exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
      await shot('01-sobre-empresa')
      await page.getByPlaceholder('Descreva em linguagem natural ou cole um texto…').fill(COMPANY)
      await wizardContinue().click()
      await page.getByRole('heading', { name: onboarding.step3Title }).waitFor({ state: 'visible', timeout: 30_000 })
      await shot('02-harnesses')
      const skip = page.getByRole('button', { name: 'Continuar sem conectar' })
      if (await skip.count() > 0) await skip.click()
      else await wizardContinue().click()
      await page.getByRole('button', { name: 'Assistente de estrutura' }).waitFor({ state: 'visible', timeout: 30_000 })
      await page.getByRole('button', { name: 'Assistente de estrutura' }).click()
      await page.getByRole('heading', { name: 'Monte uma equipe que faça sentido' }).waitFor({ state: 'visible', timeout: 15_000 })
      if ((await page.getByRole('button', { name: onboarding.continue, exact: true }).count()) > 1) {
        note(
          'Dois botões Continuar com o assistente aberto',
          'P1',
          'Prism',
          'Onboarding passo 4 → Assistente de estrutura',
          await shot('03-dois-continuar'),
          'só o Continuar do assistente (o do overlay some ou muda de rótulo)',
          'footer do overlay continua visível e avança o passo 4 sem aplicar a equipe',
        )
      }
      await page.getByRole('button', { name: 'Loja online' }).click()
      await assistantContinue().click()
      await assistantContinue().click()
      await assistantContinue().click()
      const apply = page.getByRole('button', { name: 'Usar esta equipe no onboarding' })
      if (await apply.count() > 0) await apply.click()
      else {
        await page.getByRole('button', { name: 'Voltar ao template' }).click()
        await page.getByRole('button', { name: 'Equipe sugerida (animais)' }).click()
        note('Assistente não aplicou roster — caí no template animais', 'P1', 'Prism', 'Assistente 4 passos + Usar esta equipe', await shot('03-estrutura-fallback'), 'roster do assistente', 'botão ausente')
      }
      await shot('03-equipe')
      await wizardContinue().click()
      await page.getByRole('heading', { name: onboarding.step5Title }).waitFor({ state: 'visible', timeout: 30_000 })
      await page.getByRole('button', { name: onboarding.finish }).click()
      const overlay = page.locator('[role="presentation"][class*="scrim"]')
      await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
      await page.waitForTimeout(2_500)
      if (await overlay.count() > 0 || await page.getByRole('heading', { name: onboarding.step5Title }).count() > 0) {
        note(
          'Overlay remonta ou não fecha após Entrar na Persona',
          'P0',
          'Prism',
          'Passo 5 → Entrar na Persona (completeOnboarding + refresh firstUse)',
          await shot('04-overlay-remount'),
          'overlay some e não volta',
          'scrim/dialog ainda visível — host firstUse provavelmente ainda true',
        )
        await page.getByRole('button', { name: onboarding.finish }).click({ force: true }).catch(() => {})
        await page.waitForTimeout(2_000)
      }
      const stillOnStep5 = await page.getByRole('heading', { name: onboarding.step5Title }).count() > 0
        || await page.locator('[role="presentation"][class*="scrim"]').count() > 0
      if (!stillOnStep5) {
        await geralComposerLocator(page).first().waitFor({ state: 'visible', timeout: 90_000 })
        await shot('04-geral')
        if (await page.getByText('Monte sua equipe').count() > 0 && await page.getByText(/Chame os primeiros|Vaga aberta/i).count() > 0) {
          note(
            'Equipe do assistente não foi contratada',
            'P0',
            'Prism',
            'Assistente Loja online → Usar esta equipe → Entrar na Persona → #geral',
            await shot('04-equipe-vazia'),
            'personas da recomendação no rail / #geral',
            'CTA Monte sua equipe / Vaga aberta — roster do assistente não virou hire',
          )
        }
        stepsOk.push('onboarding + estrutura + #geral')
      } else {
        await shot('04-geral-stuck-overlay')
      }
    }

    const overlayStuck = await page.locator('[role="presentation"][class*="scrim"]').count() > 0
      || await page.getByRole('heading', { name: onboarding.step5Title }).count() > 0
    if (overlayStuck) {
      note(
        'Caminho real preso no overlay — live.completeOnboarding manda roster/projectId; host CompleteOnboardingRequest exige team/personalProjectId/templateIds/cofreSeed (seed-default-team.ts já manda o contrato certo)',
        'P0',
        'Prism',
        'Entrar na Persona → getOnboarding.firstUse continua true → remount',
        await shot('04-overlay-stuck'),
        'firstUse false e rail clicável',
        'scrim do passo 5 ainda no ar; Quadros/DM não são o overlay',
      )
      await session.close()
      session = await openRealPersonaApp({ dismissOnboardingViaStorage: true, devSeed: true })
      page = session.page
      stepsOk.push('reabriu seed (PERSONA_DEV_SEED) para o resto do cenário')
    }

    await walkPostOnboarding(page, note, shot, stepsOk)
  } catch (walkError: unknown) {
    note('Passeio abortou', 'P0', 'Forge', 'cenário Padaria Lua completo', await shot('99-abort'), 'completar o cenário', String(walkError))
  } finally {
    writeDogfoodMarkdown(findings, stepsOk, session.host.home, 0)
    await session.close()
  }

  return { findings, stepsOk, home: session.host.home, realCliUsed: 0 }
}

async function walkPostOnboarding(
  page: Page,
  note: NoteFn,
  shot: (n: string) => Promise<string>,
  stepsOk: string[],
): Promise<void> {
  const boards = REAL_GALLERY_PANELS.find(p => p.slug === 'kanban')!
  await tryNav(page, boards, note, shot)
  await shot('05-quadros')
  // DESIGN-01 #10: Projetos opens on the board of the project of the moment, whose subtitle says the flow is the project's own.
  if (!(await hasVisibleCopy(page, /Fluxo próprio deste projeto/i))) {
    note(
      'Subtítulo do quadro do projeto não encontrado (getByText)',
      'P1',
      'Lumen',
      'Projetos após onboarding',
      await shot('05-quadros-copy'),
      'Fluxo próprio deste projeto',
      'getByText ausente (não usar textContent agregado)',
    )
  }
  await tryNewProject(page, 'Site / produto', 'Site novo', shot, note)
  await tryNewProject(page, 'Contratação', 'Contratar confeiteiro', shot, note)
  await trySprint(page, shot, note)
  stepsOk.push('quadros')

  const geral = REAL_GALLERY_PANELS.find(p => p.slug === 'geral')!
  await tryNav(page, geral, note, shot)
  const composer = geralComposerLocator(page).first()
  if (await composer.count() > 0) {
    await composer.fill('Preciso de um rascunho da home da Padaria Lua e de um cardápio de fim de semana.')
    const send = page.getByRole('button', { name: chat.send, exact: true })
    if (await send.count() > 0) await send.click()
    else await page.keyboard.press('Control+Enter')
    await page.waitForTimeout(2_000)
    await shot('06-geral-pedido')
    stepsOk.push('#geral pedido')
  } else {
    note('Composer #geral ausente após onboarding', 'P0', 'Prism', 'Entrar na Persona → Canais → #geral', await shot('06-geral-sem-composer'), 'placeholder do canal', 'composer não montou')
  }

  const dms = REAL_GALLERY_PANELS.find(p => p.slug === 'dms')!
  await tryNav(page, dms, note, shot)
  await shot('07-dms')
  const dmComposer = page.getByPlaceholder(/mensagem|Escreva/i).first()
  if (await dmComposer.count() > 0) {
    await dmComposer.fill('Oi — me ajuda a listar o que falta no site?')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1_500)
    stepsOk.push('DM')
  } else {
    note(
      'DM sem composer ou sem persona para falar',
      'P1',
      'Prism',
      'Abrir Mensagens diretas após contratar equipe',
      await shot('07-dms-vazio'),
      'composer de DM',
      await page.locator('body').innerText().then(t => t.slice(0, 240)),
    )
  }

  for (const slug of ['visao-geral', 'aprovacoes', 'team-health', 'perfil'] as const) {
    const spec = REAL_GALLERY_PANELS.find(p => p.slug === slug)
    if (spec === undefined) continue
    try {
      await tryNav(page, spec, note, shot)
      await shot(`08-${slug}`)
      stepsOk.push(slug)
    } catch (navError: unknown) {
      note(`Navegação falhou: ${slug}`, 'P1', spec.owner, `Rail → ${spec.navLabel}`, await shot(`08-${slug}-fail`), 'painel visível', String(navError))
    }
  }

  const twoDay = page.getByRole('button', { name: 'Teste dos 2 dias' })
  if (await twoDay.count() > 0) {
    await twoDay.first().click()
    await page.waitForTimeout(800)
    await shot('09-dois-dias')
    stepsOk.push('teste 2 dias')
  } else {
    note('Botão Teste dos 2 dias ausente ou não habilitado', 'P2', 'Lumen', 'Saúde da equipe após onboarding', await shot('09-dois-dias-ausente'), 'botão Teste dos 2 dias', 'não encontrado')
  }

  const away = page.getByRole('button', { name: /Fora|Ausente|fora/i })
  if (await away.count() > 0) {
    await away.first().click()
    await page.waitForTimeout(500)
    stepsOk.push('marcar fora')
  } else {
    note('Não achei controle para marcar-se fora', 'P1', 'Lumen', 'Perfil / Quem cuida / cartão da persona', await shot('10-fora-ausente'), 'ação Fora/Ausente', 'controle ausente')
  }

  const overview = REAL_GALLERY_PANELS.find(p => p.slug === 'visao-geral')!
  await tryNav(page, overview, note, shot)
  const whileAway = page.getByRole('heading', { name: 'Enquanto você estava fora' })
  if (await whileAway.count() === 0) {
    note('Painel Enquanto você estava fora não apareceu', 'P2', 'Prism', 'Marcar fora → Visão geral', await shot('11-away-panel'), 'heading do painel', 'ausente (pode ser vazio honesto)')
  } else {
    await shot('11-away-ok')
    stepsOk.push('enquanto fora')
  }

  const hireCard = page.getByText(/Contratar .+\?/u)
  if (await hireCard.count() === 0) {
    note('Nenhum cartão "Contratar X?" após o passeio', 'P2', 'Anvil', 'Onboarding + #geral + Aprovações (fake CLI)', await shot('12-hire-ausente'), 'proposta de contratação de outro agente', 'cartão ausente (fake CLI pode não disparar iniciativa)')
  }

  const body = await page.locator('body').innerText()
  if (/Carregando…/u.test(body) && /Aprovações|Quadros|Conhecimento/u.test(body)) {
    note('Painel ainda em Carregando…', 'P0', 'Lumen', 'Navegar Aprovações/Quadros após onboarding', await shot('12-loading'), 'dados ou empty honesto', 'Carregando… persistente')
  }
  if (/\bonb-\d+\b|hire:/u.test(body)) {
    note('Id interno vazou na UI', 'P0', 'Forge', 'Ler texto visível pós-onboarding', await shot('12-id-interno'), 'só nome de exibição', body.match(/onb-\d+|hire:\S+/)?.[0] ?? 'id')
  }
}

async function tryNav(
  page: Page,
  spec: (typeof REAL_GALLERY_PANELS)[number],
  note: NoteFn,
  shot: (n: string) => Promise<string>,
): Promise<void> {
  try {
    await navigateGalleryPanel(page, spec)
  } catch (navError: unknown) {
    const scrim = page.locator('[role="presentation"][class*="scrim"]')
    if (await scrim.count() > 0) {
      note(
        `Scrim do onboarding bloqueia o rail (${spec.slug})`,
        'P0',
        'Prism',
        `Clicar ${spec.navLabel} após Entrar na Persona`,
        await shot(`nav-${spec.slug}-scrim`),
        'rail clicável',
        String(navError),
      )
    }
    await page.getByRole('button', { name: spec.navLabel, exact: true }).first().click({ force: true }).catch(() => {})
    if (spec.readySelector !== undefined) {
      await page.locator(spec.readySelector).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    }
  }
}

type NoteFn = (
  title: string,
  severity: DogfoodSeverity,
  owner: DogfoodOwner,
  steps: string,
  capture: string,
  expected: string,
  got: string,
) => void

async function tryNewProject(
  page: Page,
  model: string,
  name: string,
  shot: (n: string) => Promise<string>,
  note: NoteFn,
): Promise<void> {
  let neu = page.getByRole('button', { name: 'Novo projeto' })
  if (await neu.count() === 0) {
    // On a board the action is an item of the project switcher menu (the header keeps two controls).
    const switcher = page.getByRole('button', { name: /Trocar de projeto/u })
    if (await switcher.count() > 0) {
      await switcher.first().click({ force: true })
      neu = page.getByRole('menuitem', { name: 'Novo projeto' })
    }
  }
  if (await neu.count() === 0) {
    note(`Novo projeto ausente (queria ${name})`, 'P1', 'Lumen', 'Quadros → Novo projeto', await shot(`proj-${name}-sem-botao`), 'botão Novo projeto', 'ausente')
    return
  }
  await neu.first().click({ force: true })
  const modelBtn = page.getByRole('button', { name: new RegExp(model, 'i') })
  if (await modelBtn.count() === 0) {
    note(`Modelo ${model} ausente`, 'P1', 'Lumen', `Novo projeto → ${model}`, await shot(`proj-${name}-modelo`), `card ${model}`, 'não listado')
    await page.keyboard.press('Escape').catch(() => {})
    return
  }
  await modelBtn.first().click()
  const confirm = page.getByRole('button', { name: 'Usar este modelo' })
  if (await confirm.count() > 0) await confirm.click()
  const nameField = page.getByLabel(/nome/i).or(page.getByPlaceholder(/nome/i)).first()
  if (await nameField.count() > 0) {
    await nameField.fill(name)
    await page.getByRole('button', { name: /criar|salvar|usar/i }).first().click().catch(() => {})
  } else {
    note(`Modal de modelo não pede nome — não deu para chamar o projeto "${name}"`, 'P1', 'Lumen', `Quadros → Novo projeto → ${model} → Usar este modelo`, await shot(`proj-${name}-sem-nome`), `campo nome = ${name}`, 'só escolhe modelo; createWorkflowFromTemplate no projeto atual')
  }
  await shot(`proj-${name}`)
}

async function trySprint(
  page: Page,
  shot: (n: string) => Promise<string>,
  note: NoteFn,
): Promise<void> {
  const plan = page.getByRole('button', { name: /Planejar|Iniciar sprint/i })
  if (await plan.count() === 0) {
    note('Sprint 1 não dá para iniciar no Site novo', 'P2', 'Lumen', 'Abrir projeto Site → Sprints', await shot('sprint-ausente'), 'Planejar/Iniciar sprint', 'botão ausente')
    return
  }
  await plan.first().click()
  await shot('sprint-plan')
}

/**
 * @param findings - Bugs and frictions.
 * @param stepsOk - Completed beats.
 * @param home - Disposable PERSONA_HOME.
 * @param realCliUsed - Real model turns (0 = scripted).
 */
export function writeDogfoodMarkdown(
  findings: readonly DogfoodFinding[],
  stepsOk: readonly string[],
  home: string,
  realCliUsed: number,
): void {
  const bugs = findings.filter(row => row.severity !== 'ok')
  const lines = [
    '# Dogfood — Padaria Lua',
    '',
    `Home limpo: \`${home.replace(/\\/g, '/')}\`. Perfil \`persona\`. Runners scriptados. Execuções reais: ${String(realCliUsed)} / 20.`,
    '',
    '## Cenário percorrido',
    ...stepsOk.map(step => `- ok: ${step}`),
    '',
    `## Atritos (${String(bugs.length)})`,
    '',
  ]
  if (bugs.length === 0) lines.push('_Nenhum atrito registrado neste passeio._', '')
  for (const row of bugs) {
    lines.push(
      `### ${row.id} — ${row.title}`,
      '',
      `- Severidade: **${row.severity}**`,
      `- Dono: **${row.owner}**`,
      `- Passos: ${row.steps}`,
      `- Captura: \`${row.capture}\``,
      `- Esperado: ${row.expected}`,
      `- Obtido: ${row.got}`,
      '',
    )
  }
  lines.push(
    '## Notas',
    '',
    '- Encerrado o host e o Chrome ao final do passeio.',
    '- Sem `PERSONA_REAL_TALK` neste dogfood (scripted).',
    '- Se o overlay não fechou no caminho real, o resto do cenário rodou com `PERSONA_DEV_SEED` (contrato certo de completeOnboarding).',
    '',
  )
  writeFileSync(REPORT, `${lines.join('\n')}\n`)
}

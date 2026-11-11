// PRÉ-ACEITE MECÂNICO · a sonda que roda na página, DEPOIS da captura (Keel/Muse 05/11 03:27).
// Cada dono chama `collectProbe(page, {...})` logo depois do `page.screenshot` da cena e grava o resultado ao lado da imagem
// (`writeProbe(pngPath, probe)` → `<cena>-<tema>-<tamanho>.probe.json`); `preaccept.mjs` lê esses arquivos e dá PASSOU/FALHOU.
//
//   import { collectProbe, writeProbe } from './preaccept-probe.mjs'
//   const png = `${outDir}/${name}.png`
//   await page.screenshot({ path: png })
//   writeProbe(png, await collectProbe(page, { axePath: process.env.EMBER_AXE, consoleErrors: errorsSinceLastShot }))
//
// A sonda não muda a tela: lê o texto visível, as imagens, os ícones, o tema e a folhagem; roda o axe (inclui target-size, 24 px);
// e por último aperta Tab UMA vez para ver se o foco aparece (com e sem o foco: se a região muda, o foco é visível).
import { readFileSync, writeFileSync } from 'node:fs'

/** 2 = mede o diálogo (cabe na janela, rodapé à vista). 3 = D-103c: fala das personas, chip duplicado no composer, popover sobre mensagem, chip "Exemplo", rosto em inicial. */
export const PROBE_VERSION = 3

/** Roda dentro da página; sem referências de fora (o Playwright serializa a função). */
function inPageProbe() {
  const rendered = (el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const cs = getComputedStyle(node)
      if (cs.display === 'none' || (node === el && cs.visibility === 'hidden') || Number(cs.opacity) === 0) return false
    }
    return true
  }
  const inViewport = (rect) => rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
  const short = (text, max = 80) => String(text).replace(/\s+/gu, ' ').trim().slice(0, max)

  // 1) O texto que a pessoa lê: o innerText (respeita display/visibility), mais o que está dentro dos campos.
  const fieldText = []
  for (const field of document.querySelectorAll('input, textarea')) {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !rendered(field)) continue
    if (field instanceof HTMLInputElement && ['checkbox', 'radio', 'hidden', 'range', 'file', 'color'].includes(field.type)) continue
    if (field.value !== '') fieldText.push(field.value)
    if (field.placeholder !== '') fieldText.push(field.placeholder)
  }
  const text = `${document.body.innerText}\n${fieldText.join('\n')}`

  // 2) Títulos (cartões, cabeçalhos): '@nome' no começo de um título de tarefa é erro.
  const titles = []
  for (const el of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"], [data-task-title], [data-card-title], [class*="title" i]:not([class*="subtitle" i])')) {
    if (!rendered(el)) continue
    const first = short(el.innerText.split('\n')[0] ?? '', 160)
    if (first !== '' && !titles.includes(first)) titles.push(first)
    if (titles.length >= 400) break
  }

  // 3) Imagens quebradas (naturalWidth 0) entre as que estão desenhadas.
  const brokenImages = []
  for (const img of document.images) {
    if (!rendered(img)) continue
    if (img.currentSrc === '' || img.src === '' || (img.complete && img.naturalWidth === 0) || !img.complete) {
      brokenImages.push(`${img.complete ? 'sem pixels' : 'não carregou'}: ${short(img.currentSrc || img.src || '(sem src)', 90)}`)
    }
  }

  // 4) Ícones vazios: <svg> sem nada para desenhar (ou <use> apontando para o nada) e <span class="…icon…"> sem filho, sem texto e sem máscara.
  const emptyIcons = []
  const drawable = 'path, circle, rect, line, polyline, polygon, ellipse, image, text, foreignObject'
  for (const svg of document.querySelectorAll('svg')) {
    if (!rendered(svg)) continue
    const uses = svg.querySelectorAll('use')
    const hasOwn = svg.querySelector(drawable) !== null
    let ok = hasOwn
    for (const use of uses) {
      const href = use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? ''
      if (href.startsWith('#') ? document.getElementById(href.slice(1)) !== null : href !== '') ok = true
    }
    if (!ok) emptyIcons.push(`<svg> vazio${svg.getAttribute('class') ? ` .${short(svg.getAttribute('class'), 40)}` : ''}`)
  }
  for (const el of document.querySelectorAll('span[class*="icon" i], i[class*="icon" i], [data-icon]')) {
    if (!rendered(el) || el.children.length > 0 || (el.textContent ?? '').trim() !== '') continue
    const cs = getComputedStyle(el)
    const painted = cs.backgroundImage !== 'none' || (cs.maskImage ?? 'none') !== 'none' || (cs.webkitMaskImage ?? 'none') !== 'none' || cs.borderStyle !== 'none'
    if (!painted) emptyIcons.push(`ícone sem desenho: ${el.tagName.toLowerCase()}.${short(String(el.className).split(' ')[0] ?? '', 40)}`)
  }

  // 5) Alvos pequenos, medida bruta (informativa; a regra com as exceções do WCAG é a target-size do axe).
  const targetSelector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="radio"], [role="option"]'
  const smallTargets = []
  for (const el of document.querySelectorAll(targetSelector)) {
    if (!rendered(el) || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') continue
    const rect = el.getBoundingClientRect()
    if (rect.width >= 24 && rect.height >= 24) continue
    // Campo só para leitor de tela (padrão "visualmente oculto": 1×1 recortado) não é alvo de clique de ninguém.
    if (rect.width <= 2 && rect.height <= 2) continue
    if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type) && el.labels && el.labels.length > 0) continue
    smallTargets.push({ tag: el.tagName.toLowerCase(), label: short(el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('title') ?? '', 40), w: Math.round(rect.width), h: Math.round(rect.height) })
    if (smallTargets.length >= 40) break
  }

  // Diálogo que cabe na janela (a 200% a janela tem 360 px de altura): a caixa inteira e o ÚLTIMO controle (o rodapé: Cancelar/Salvar) têm de estar à vista.
  const dialogs = []
  for (const dialog of document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')) {
    if (!rendered(dialog)) continue
    const box = dialog.getBoundingClientRect()
    const controls = [...dialog.querySelectorAll('button, [role="button"], a[href], input:not([type="hidden"]), select, textarea')].filter(rendered)
    const last = controls[controls.length - 1]
    const lastBox = last?.getBoundingClientRect()
    const cut = []
    if (box.top < -1) cut.push(`topo ${Math.round(-box.top)} px acima da janela`)
    if (box.bottom > window.innerHeight + 1) cut.push(`base ${Math.round(box.bottom - window.innerHeight)} px abaixo da janela`)
    if (box.left < -1 || box.right > window.innerWidth + 1) cut.push('lado cortado')
    if (last !== undefined && lastBox !== undefined && (lastBox.bottom > window.innerHeight + 1 || lastBox.top < -1)) {
      cut.push(`último controle “${short(last.getAttribute('aria-label') ?? last.textContent ?? '', 30)}” fora da janela`)
    }
    dialogs.push({ label: short(dialog.getAttribute('aria-label') ?? dialog.querySelector('h1, h2, h3')?.textContent ?? '', 50), cut })
  }

  // 7) Rosto em inicial (D-069 + D-103c: o "T" do Téo, o "SR" do cartão do Kanban, o "E" da fila): uma persona nunca é uma letra. O Avatar de retrato (classe `portrait`) sem imagem nem ícone
  // desenha as iniciais, e só nesse modo leva `data-tone`; o trilho tem o seu `span.initials`. O círculo da PESSOA (`person`) pode ter iniciais, salvo dentro da linha de uma persona.
  const initialsAvatars = []
  const seenAvatars = new Set()
  const addInitials = (owner, letters) => {
    if (seenAvatars.has(owner) || initialsAvatars.length >= 20) return
    seenAvatars.add(owner)
    initialsAvatars.push(letters)
  }
  for (const el of document.querySelectorAll('[data-tone]')) {
    if (!/portrait/iu.test(String(el.getAttribute('class') ?? '')) || !rendered(el) || el.querySelector('img, svg') !== null) continue
    const letters = short(el.textContent ?? '', 6)
    if (letters !== '') addInitials(el, letters)
  }
  for (const el of document.querySelectorAll('[class*="initials" i]')) {
    if (el.children.length > 0 || !rendered(el)) continue
    const letters = short(el.textContent ?? '', 6)
    if (!/^[\p{L}\p{N}?]{1,4}$/u.test(letters)) continue
    const owner = el.closest('[class*="avatar" i], [data-tone]') ?? el.parentElement ?? el
    const personaRow = el.closest('[data-author]')?.getAttribute('data-author') === 'persona'
    if (/person/iu.test(String(owner.getAttribute('class') ?? '')) && !personaRow) continue
    addInitials(owner, letters)
  }

  // 8) A fala das PERSONAS (D-103c): o texto dos balões de persona e das respostas de opinião, sem o cromo (nome, hora, botões). É onde "a pessoa" não pode aparecer.
  const speechRoots = [...document.querySelectorAll('[data-persona-bubble][data-author="persona"], [data-author="persona"] [data-persona-markdown], li[data-author="persona"] [class*="replyText" i]')]
  const personaSpeech = []
  for (const el of speechRoots) {
    if (speechRoots.some(other => other !== el && other.contains(el)) || !rendered(el)) continue
    const speech = String(el.textContent ?? '').replace(/\s+/gu, ' ').trim()
    if (speech !== '') personaSpeech.push(speech.slice(0, 4000))
    if (personaSpeech.length >= 200) break
  }

  // 9) Composer: o MESMO texto visível em dois controles/chips do composer (D-103c: o "Decide o rotineiro" aparecia duas vezes). Só o elemento mais externo conta (o chip DENTRO do botão não),
  // e botão só de ícone fica de fora (dois "fechar" de chips diferentes são legítimos).
  const composerDuplicates = []
  for (const root of document.querySelectorAll('[data-persona-area="composer"]')) {
    if (!rendered(root)) continue
    const found = [...root.querySelectorAll('button, [role="button"], a[href], [data-chip], [class*="chip" i], [class*="badge" i], [class*="pill" i]')].filter(rendered)
    const groups = new Map()
    for (const el of found.filter(item => !found.some(other => other !== item && other.contains(item)))) {
      const label = short(el.textContent ?? '', 60)
      if (label.length < 2) continue
      const group = groups.get(label.toLocaleLowerCase()) ?? { label, count: 0 }
      group.count += 1
      groups.set(label.toLocaleLowerCase(), group)
    }
    for (const group of groups.values()) if (group.count > 1) composerDuplicates.push(group)
  }

  // 10) Popover que COBRE mensagem (D-103c: o balão "A Coordenação distribui o pedido" que não fecha): um flutuante NÃO modal, menor que metade da janela, que tapa de verdade o balão de uma mensagem
  // do fio (a interseção é ≥ 12×12 e o elemento no topo daquele ponto é o próprio popover; um popover por baixo da mensagem não cobre nada). Diálogo modal cobre por desenho: fica de fora.
  const popoverCovers = []
  const messageBoxes = [...document.querySelectorAll('[data-persona-bubble], [data-message-id]:not(:has([data-persona-bubble]))')].filter(rendered)
  const popoverCandidates = [...document.querySelectorAll('[popover], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], dialog[open], [class*="popover" i], [class*="balloon" i]')].filter(rendered)
  const popovers = popoverCandidates.filter(el => !popoverCandidates.some(other => other !== el && other.contains(el)))
  const windowArea = window.innerWidth * window.innerHeight
  for (const pop of popovers) {
    const box = pop.getBoundingClientRect()
    const modal = pop.getAttribute('aria-modal') === 'true' || (pop instanceof HTMLDialogElement && pop.matches(':modal'))
    if (modal || !['fixed', 'absolute'].includes(getComputedStyle(pop).position) || box.width * box.height >= windowArea / 2) continue
    for (const message of messageBoxes) {
      if (message.contains(pop) || pop.contains(message)) continue
      const rect = message.getBoundingClientRect()
      const left = Math.max(box.left, rect.left, 0)
      const right = Math.min(box.right, rect.right, window.innerWidth)
      const top = Math.max(box.top, rect.top, 0)
      const bottom = Math.min(box.bottom, rect.bottom, window.innerHeight)
      if (right - left < 12 || bottom - top < 12) continue
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
      if (hit === null || !pop.contains(hit)) continue
      popoverCovers.push({ popover: short(pop.getAttribute('aria-label') ?? pop.querySelector('h1, h2, h3, p')?.textContent ?? pop.textContent ?? '', 50), message: short(message.textContent ?? '', 50), w: Math.round(right - left), h: Math.round(bottom - top) })
      if (popoverCovers.length >= 5) break
    }
  }

  // 11) Chip "Exemplo" (D-103c): o selo dos cartões de amostra do dev-seed. Só o elemento mais interno cujo texto INTEIRO é o selo (o envoltório do chip não conta de novo).
  const exampleChipRe = /^(?:exemplo|example|sample)$/iu
  const exampleChips = []
  for (const el of document.querySelectorAll('span, small, em, b, strong, [data-chip], [class*="chip" i], [class*="badge" i], [class*="tag" i], [class*="pill" i]')) {
    const label = short(el.textContent ?? '', 20)
    if (!exampleChipRe.test(label) || [...el.children].some(child => exampleChipRe.test(short(child.textContent ?? '', 20))) || !rendered(el)) continue
    exampleChips.push(label)
    if (exampleChips.length >= 10) break
  }

  // Quantos elementos o Tab pode alcançar: cena sem nenhum (cartão já respondido, estado vazio sem ação) não tem foco para mostrar.
  let focusableCount = 0
  for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]')) {
    if (el.hasAttribute('disabled') || el.getAttribute('tabindex') === '-1' || !rendered(el)) continue
    focusableCount += 1
  }

  // 6) Folhagem do trilho: alguma imagem de folhagem desenhada, carregada e dentro da janela.
  let foliageImages = 0
  let foliageVisible = false
  for (const img of document.querySelectorAll('img')) {
    const mark = `${img.getAttribute('class') ?? ''} ${img.currentSrc || img.src} ${img.hasAttribute('data-persona-foliage-dark') ? 'foliage' : ''}`
    if (!/foliage/iu.test(mark)) continue
    foliageImages += 1
    if (rendered(img) && img.complete && img.naturalWidth > 0 && inViewport(img.getBoundingClientRect())) foliageVisible = true
  }

  const darkAttr = document.body.getAttribute('data-ds-dark-theme')
  return {
    text,
    taskTitles: titles,
    brokenImages,
    emptyIcons,
    smallTargets,
    dialogs,
    initialsAvatars,
    personaSpeech,
    composerDuplicates,
    popoverCovers,
    exampleChips,
    focusableCount,
    foliageImages,
    foliageVisible,
    darkTheme: darkAttr === 'true',
    darkAttr,
    overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
  }
}

/** O que o 1º Tab alcançou (roda na página, logo depois do Tab). */
function inPageFocusProbe() {
  const el = document.activeElement
  if (el === null || el === document.body || el === document.documentElement) return { reached: false }
  const rect = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const transparent = (color) => /rgba\([^)]*,\s*0\)$/u.test(color) || color === 'transparent'
  const outline = cs.outlineStyle !== 'none' && Number.parseFloat(cs.outlineWidth) > 0 && !transparent(cs.outlineColor)
  const shadow = cs.boxShadow !== 'none'
  const label = (el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('title') ?? '').replace(/\s+/gu, ' ').trim().slice(0, 40)
  return {
    reached: true,
    element: `${el.tagName.toLowerCase()}${label === '' ? '' : ` “${label}”`}`,
    focusVisible: el.matches(':focus-visible'),
    styleRing: outline || shadow,
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    inView: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth,
  }
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']

const axeReady = (page) => page.evaluate(() => typeof globalThis.axe?.run === 'function').catch(() => false)

/**
 * Põe o axe na página. 1º a avaliação do CDP (`page.evaluate(<fonte>)`): a CSP do app INSTALADO bloqueia <script> inline, e o `addScriptTag` do Playwright é inline
 * (além de falhar, deixaria "Refused to execute inline script" no console da cena seguinte). Só se isso não deixar o `axe` pronto cai para o `addScriptTag`.
 * Quem já tem o axe na página (a cena anterior da mesma receita) o reaproveita.
 */
async function loadAxe(page, axePath) {
  if (await axeReady(page)) return
  try { await page.evaluate(readFileSync(axePath, 'utf8')) } catch { /* cai para o addScriptTag */ }
  if (await axeReady(page)) return
  await page.addScriptTag({ path: axePath })
}

async function runAxe(page, axePath) {
  await loadAxe(page, axePath)
  return page.evaluate(async (tags) => {
    const result = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: tags }, rules: { 'target-size': { enabled: true } } })
    return result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => n.target.join(' ').slice(0, 120)) }))
  }, AXE_TAGS)
}

/**
 * Colhe tudo de uma cena. `axePath` (axe.min.js) liga o axe; `consoleErrors` são os erros de console/página DESTA cena
 * (o chamador fatia o seu vetor desde a captura anterior); `focus: false` pula o Tab (cenas que o Tab estragaria).
 */
export async function collectProbe(page, { axePath, consoleErrors = [], focus = true } = {}) {
  const base = await page.evaluate(inPageProbe)
  const probe = { version: PROBE_VERSION, ...base, consoleErrors: [...consoleErrors] }
  if (axePath !== undefined) {
    try { probe.axe = await runAxe(page, axePath) } catch (error) { probe.axeError = String(error).slice(0, 160) }
  }
  if (focus) probe.focus = probe.focusableCount === 0 ? { visible: true, none: true, element: '(nada focável na cena)' } : await probeFirstTab(page)
  return probe
}

async function probeFirstTab(page) {
  try {
    // "O 1º Tab da cena" começa no topo da página: se o foco ficou no último elemento (o composer, o cartão clicado), o Tab sairia da página.
    // Tira o foco do elemento e põe o ponto de partida da navegação por teclado no próprio <body> (focar o body o torna o ponto de partida).
    await page.evaluate(() => {
      // Guarda quem tinha o foco: a sonda não pode deixar um anel de foco na próxima imagem da mesma receita.
      globalThis.__preacceptPrior = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur()
      const hadTabindex = document.body.hasAttribute('tabindex')
      if (!hadTabindex) document.body.setAttribute('tabindex', '-1')
      document.body.focus({ preventScroll: true })
      if (!hadTabindex) document.body.removeAttribute('tabindex')
    })
    await page.keyboard.press('Tab')
    await page.waitForTimeout(120)
    let reached = await page.evaluate(inPageFocusProbe)
    // Se o Tab ainda saiu da página (o foco estava no fim dela), o seguinte volta ao 1º elemento: é o "1º Tab" da cena.
    if (!reached.reached) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(120)
      reached = await page.evaluate(inPageFocusProbe)
    }
    if (!reached.reached) return { visible: false, element: 'o Tab não chegou em nenhum elemento' }
    if (!reached.inView) return { visible: false, element: `${reached.element} (fora da janela)` }
    let visible = reached.focusVisible && reached.styleRing
    if (!visible && reached.focusVisible) {
      // O anel pode estar num envoltório (:focus-within): se a região muda quando o foco sai, o foco era visível.
      const pad = 8
      const clip = { x: Math.max(0, Math.floor(reached.rect.x - pad)), y: Math.max(0, Math.floor(reached.rect.y - pad)), width: Math.ceil(reached.rect.w + pad * 2), height: Math.ceil(reached.rect.h + pad * 2) }
      const viewport = page.viewportSize()
      if (viewport !== null) { clip.width = Math.min(clip.width, viewport.width - clip.x); clip.height = Math.min(clip.height, viewport.height - clip.y) }
      if (clip.width > 0 && clip.height > 0) {
        const focused = await page.screenshot({ clip, animations: 'disabled' })
        await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
        await page.waitForTimeout(80)
        const unfocused = await page.screenshot({ clip, animations: 'disabled' })
        visible = !focused.equals(unfocused)
      }
    }
    return { visible, element: reached.element, focusVisible: reached.focusVisible, styleRing: reached.styleRing }
  } catch (error) {
    return { visible: false, element: `a sonda do foco falhou: ${String(error).slice(0, 100)}` }
  } finally {
    // Devolve a página ao que era: o elemento que o Tab alcançou perde o foco (e o anel); quem o tinha antes o recupera, sem anel de teclado.
    await page.evaluate(() => {
      const current = document.activeElement
      if (current instanceof HTMLElement && current !== document.body) current.blur()
      const prior = globalThis.__preacceptPrior
      globalThis.__preacceptPrior = undefined
      if (prior instanceof HTMLElement && prior.isConnected) prior.focus({ preventScroll: true, focusVisible: false })
    }).catch(() => undefined)
  }
}

export function probeSidecarPath(pngPath) {
  return pngPath.replace(/\.png$/iu, '.probe.json')
}

export function writeProbe(pngPath, probe) {
  writeFileSync(probeSidecarPath(pngPath), JSON.stringify(probe, null, 1))
}

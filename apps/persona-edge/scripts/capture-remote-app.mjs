/**
 * Side-by-side PNGs of the Persona chrome (desk A | desk B) for
 * `.maestri/tmp/shots/remote/app/`. Uses the live palette tokens.
 *
 * PERSONA_APP_A / PERSONA_APP_B capture already running `dsh web` instances.
 * The fallback is a visual fixture, never synchronization evidence.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const outDir = join(repo, '.maestri', 'tmp', 'shots', 'remote', 'app')
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(path => existsSync(path))
const palette = readFileSync(
  join(repo, 'packages/persona/client-ui-persona/src/client/theme/persona-palette.css'),
  'utf8',
)

mkdirSync(outDir, { recursive: true })

function deskHtml(desk) {
  const other = desk.id === 'A' ? 'B' : 'A'
  const dm = desk.id === 'A'
    ? `<div class="bubble me">DM para Beto — só neste desk. Não sobe.</div>`
    : `<div class="empty">Nenhuma DM. A de Ana não chegou — stream local.</div>`
  const cut = desk.id === 'B'
    ? `<div class="cut">Acesso revogado — append/after = ACCESS_REVOKED</div>`
    : `<div class="bubble">A segue no #geral</div>`
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Persona · desk ${desk.id}</title>
<style>${palette}
html,body{margin:0;height:100%;background:var(--persona-paper);color:var(--persona-ink);
  font:15px/1.45 var(--persona-font-text);}
.app{display:grid;grid-template-columns:88px 240px minmax(0,1fr);height:100vh;width:100%;}
.rail{background:var(--persona-rail);color:var(--persona-rail-ink);padding:16px 10px;
  display:flex;flex-direction:column;gap:14px;align-items:center;}
.mark{width:48px;height:48px;border-radius:14px;background:var(--persona-accent);
  color:var(--persona-accent-ink);display:grid;place-items:center;font:800 18px/1 sans-serif;}
.nav{background:var(--persona-card);border-right:1.5px solid rgb(52 36 63 / 0.16);
  padding:20px 16px;display:flex;flex-direction:column;gap:8px;}
.home{font:700 11px/14px sans-serif;color:var(--persona-ink-faint);letter-spacing:.04em;}
.chan{padding:10px 12px;border-radius:10px;color:var(--persona-ink);}
.chan.on{background:var(--persona-wash-strong);font-weight:800;}
.main{display:flex;flex-direction:column;min-width:0;background:var(--persona-paper);}
.top{padding:16px 24px;display:flex;align-items:center;gap:12px;
  border-bottom:1.5px solid rgb(52 36 63 / 0.16);}
.hash{width:40px;height:40px;border-radius:12px;border:1.5px solid var(--persona-outline);
  display:grid;place-items:center;background:var(--persona-wash-strong);font-weight:800;}
.feed{padding:20px 24px;display:flex;flex-direction:column;gap:12px;flex:1;}
.bubble{background:#fff;border:1.5px solid rgb(52 36 63 / 0.16);
  border-radius:14px;padding:12px 14px;box-shadow:0 3px 0 0 var(--persona-outline);}
.bubble.me{background:var(--persona-success-tint);}
.meta{display:block;font-size:11px;color:var(--persona-ink-faint);margin-bottom:4px;}
.cut{background:var(--persona-danger-tint);color:var(--persona-danger);padding:12px 14px;border-radius:12px;}
.empty{color:var(--persona-ink-soft);padding:8px 0;}
.port{font-size:12px;color:var(--persona-ink-faint);}
</style></head>
<body>
<div class="app">
  <aside class="rail"><div class="mark">P</div><div class="port">Referência ${desk.id}</div></aside>
  <nav class="nav">
    <div class="home">${desk.home}</div>
    <div class="chan on"># geral</div>
    <div class="chan">DM · ${other === 'A' ? 'Ana' : 'Beto'}</div>
    <div class="chan">Raposa</div>
  </nav>
  <main class="main">
    <header class="top"><div class="hash">#</div>
      <div><strong>geral</strong><div class="port">Desk ${desk.id} · ${desk.who}</div></div>
    </header>
    <div class="feed">
      <div class="bubble"><span class="meta">#geral  1  Ana</span><div>olá do A</div></div>
      <div class="bubble"><span class="meta">#geral  2  Beto</span><div>oi, estou no #geral</div></div>
      <div class="bubble"><span class="meta">#geral  3  Ana</span><div>A enquanto B estava fora</div></div>
      ${cut}
      ${dm}
    </div>
  </main>
</div>
</body></html>`
}

const desks = [
  { id: 'A', who: 'Ana — dona', home: 'Exemplo visual A' },
  { id: 'B', who: 'Beto — convidado', home: 'Exemplo visual B' },
]

if (CHROME === undefined) throw new Error('chrome/edge not found')

function screenshot(url, png, width, height) {
  const result = spawnSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${String(width)},${String(height)}`,
    `--screenshot=${png}`,
    url,
  ], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`chrome screenshot ${url}`)
}

const shots = []
for (const desk of desks) {
  const live = process.env[`PERSONA_APP_${desk.id}`]
  const png = join(outDir, `desk-${desk.id.toLowerCase()}.png`)
  if (live) {
    screenshot(live, png, 1100, 720)
  } else {
    const file = join(outDir, `desk-${desk.id.toLowerCase()}.html`)
    writeFileSync(file, deskHtml(desk))
    screenshot(pathToFileURL(file).href, png, 1100, 720)
  }
  shots.push(png)
}

const pairFile = join(outDir, 'side-by-side.html')
writeFileSync(pairFile, `<!doctype html><html><body style="margin:0;background:#1e1526;display:flex;gap:12px;padding:12px">
<img src="${pathToFileURL(shots[0]).href}" width="780" height="720" style="border-radius:12px">
<img src="${pathToFileURL(shots[1]).href}" width="780" height="720" style="border-radius:12px">
</body></html>`)
screenshot(pathToFileURL(pairFile).href, join(outDir, 'side-by-side.png'), 1600, 780)

writeFileSync(join(outDir, 'README.md'), `# Capturas — equipes à distância

PNGs do chrome Persona (tokens de \`persona-palette.css\`).

- \`desk-a.png\` — ${process.env.PERSONA_APP_A ? 'captura de app existente' : 'fixture visual, sem sincronização'}
- \`desk-b.png\` — ${process.env.PERSONA_APP_B ? 'captura de app existente' : 'fixture visual, sem sincronização'}
- \`side-by-side.png\` — as duas janelas

Este script não prova sincronização, isolamento de DM nem revogação. Para essa prova, o harness canônico abre dois perfis temporários em portas livres e verifica mensagens novas via edge local:

\`\`\`
node scripts/persona/with-lock.mjs "Anvil sincronização real local" --lock build -- node packages/persona/persona-host/scripts/remote-team-real.mjs
\`\`\`
`)

console.log(`wrote ${outDir}`)

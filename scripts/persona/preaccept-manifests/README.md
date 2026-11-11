# Pré-aceite mecânico (Keel/Muse 05/11 03:27)

A Muse só julga **desenho**. Tudo o que uma máquina confere vem antes: `node scripts/persona/preaccept.mjs`.

## Para cada dono (3 passos)

1. **Sonda na sua régua** (3 linhas, depois do `page.screenshot` de cada cena):
   ```js
   import { collectProbe, writeProbe } from './preaccept-probe.mjs'   // scripts/persona/
   const png = `${outDir}/${cena}-${tema}-${tamanho}.png`
   await page.screenshot({ path: png })
   writeProbe(png, await collectProbe(page, { axePath: process.env.EMBER_AXE, consoleErrors: errosDesdeACapturaAnterior }))
   ```
   Isso grava `<captura>.probe.json` ao lado da imagem: texto visível, axe (com `target-size`), imagens quebradas, ícones vazios, tema
   (`body[data-ds-dark-theme]`), folhagem do trilho, overflow e o foco no 1º Tab. `focus: false` pula o Tab (cena que o Tab estraga).
2. **Manifesto** do seu lote (`--init` esboça a partir das imagens que já existem; edite para ficar com o que você PROMETE, não com o que saiu):
   `node scripts/persona/preaccept.mjs --init --dir <pasta> --owner <Nome> > scripts/persona/preaccept-manifests/<dono>.json`
3. **Rodar** antes de chamar a Muse:
   `node scripts/persona/preaccept.mjs --manifest scripts/persona/preaccept-manifests/<dono>.json`
   → `preaccept-report.json` + `.md` na pasta das capturas (ou `--out`). Sai com código 1 se alguma cena não está pronta (`--report-only` sempre 0).
   Só as cenas da lista **"Pronto para a Muse"** vão para ela.

## O que confere (18 checagens por captura, cena × claro/escuro × 1440/960/200%)

cobertura (imagem existe, não está em branco, tem texto) · axe crítico/sério 0 · alvos ≥ 24 px (`target-size` do axe; os < 24 px que ele aceita por espaçamento viram AVISO) · overflow horizontal 0 ·
**diálogo** (a caixa inteira e o último controle/rodapé cabem na janela; a 200% ela tem 360 px de altura; sidecar da sonda v1 não media: só avisa) ·
console limpo · texto proibido (lista da Muse, pt e en: Maestro, MCP, allowlist, runner, harness, slug, undefined, null, NaN, [object, TODO, lorem,
mock, fixture, `$`/`US$`, cota não medida, autor com `:`, id hex ≥ 8, `@nome` no começo de título, Skill ensinada, `[[`, `persona_`, "Em andamento:" avulso) ·
artigo antes de nome de persona ("o Atlas", "com a Nina", "A Nina terminou" reprovam; "pediu a Téo" / "Ensinar a Nina" viram **aviso**) ·
tema certo · folhagem do trilho a 1440/960 · imagens quebradas · ícones vazios · foco visível no 1º Tab.

**D-103c (11/11, reforma do aceite; sonda v3) — 5 checagens novas que REPROVAM, cada uma com um caso RED e um GREEN em `preaccept.test.mjs`:**
- `proibidos` agora também pega **`RealTurnCapError`** e **"NOVA VERSÃO:" cru** (o marcador do host; sem distinção de caixa).
- `fala` — **"a pessoa"** (também "à/da/pela/na/pra pessoa") dentro do balão de PERSONA (`[data-persona-bubble][data-author="persona"]`, o markdown da persona e as respostas de opinião). O resto da tela não conta; "uma/essa/cada pessoa" e "as pessoas" passam.
- `exemplo` — chip **"Exemplo"/"Example"** (o selo das amostras do dev-seed) em captura de aceite. Sem a sonda v3 vale a linha do texto que é só o selo.
- `rosto` — **inicial no lugar do rosto** (o "SR" do cartão do Kanban, o "E" da fila, o "T" do Téo). Era AVISO (D-069), agora reprova. O círculo da PESSOA pode ter iniciais, salvo dentro da linha de uma persona.
- `composer` — **chip/controle duplicado** no composer (`[data-persona-area="composer"]`): o mesmo texto visível em dois controles/chips (o "Decide o rotineiro" apareceu duas vezes). Só o elemento mais externo conta e botão só de ícone fica de fora.
- `popover` — **popover cobrindo mensagens**: um flutuante NÃO modal (`position: absolute/fixed`, `aria-modal` ≠ true, menor que metade da janela) que de fato tapa um balão do fio (interseção ≥ 12×12 e o elemento no topo daquele ponto é o próprio popover; popover por baixo da mensagem não cobre). Diálogo modal cobre por desenho e fica de fora.

Dispensa por cena, só quando a cena existe PARA isso (aparece na seção "Dispensas do manifesto" do relatório; a 2ª leitura olha estas cenas): `{ "id": "…", "allowExample": true }` (mostra o selo de propósito, ex.: galeria de estados), `"allowPopover": true` (menu/popover aberto de propósito), `"allowPessoa": true` (a persona escreve texto para um cliente: "a pessoa que comprar…"). As mesmas chaves no topo do manifesto valem para todas as cenas.
Sidecar de sonda anterior à v3 (`probe.json` sem `version: 3`) = `fala`, `rosto`, `composer` e `popover` **não verificados → INCOMPLETO** (nunca PASSOU): recapture com a sonda nova (o `collectProbe` é o mesmo; nada muda no seu spec). Lote antigo: `--legacy-ok` dispensa essas quatro (o relatório avisa).

Resultado por captura: **PASSOU** · **FALHOU** (com a razão) · **INCOMPLETO** (não falhou, mas falta a sonda/log para provar).

## Campos do manifesto

`owner, bundle, dir, scenes:[id | {id, allowCurrency?, allowExample?, allowPopover?, allowPessoa?, shell?, schemes?, viewports?, rejected? ("motivo": cena que a Muse já rejeitou nunca volta como pronta)}], allowExample?, allowPopover?, allowPessoa?, schemes?, viewports?, foliageViewports?, shell? (false = sem trilho, ex.: galeria),
roster?, fileTemplate? ("{scene}-{scheme}-{viewport}"), schemeNames?, viewportNames?, sizes?, logs?, reports?, skipChecks?`.

Lotes antigos (sem sonda): `--legacy-ok` + `logs`/`reports`/`--log`/`--report` dão cobertura, axe, overflow e tema pelos logs; o resto fica de fora (o relatório avisa).
Os 4 manifestos desta pasta são a prova nos lotes que já existiam: `ember-shell`, `ember-gallery`, `prism-shell`, `gauge-day-app`.

## App instalado (CSP) e por onde o axe entra

O axe entra na página por `page.evaluate(<fonte do axe.min.js>)` (CDP), NÃO por `addScriptTag`: o `addScriptTag` do Playwright injeta um `<script>` inline e a CSP do app instalado o bloqueia (e ainda suja o console da cena seguinte com "Refused to execute inline script").
Quem chama `collectProbe` não muda nada: a sonda cai para o `addScriptTag` só se o axe não ficar pronto pelo CDP, e reaproveita o axe que a cena anterior já carregou. Teste: `preaccept.test.mjs` ("o axe entra numa página com CSP que bloqueia script inline").
A varredura final da Muse no instalado (`muse-installed.json`) usa exatamente esta sonda: `node scripts/persona/preaccept.mjs --manifest scripts/persona/preaccept-manifests/muse-installed.json --dir <pasta do hash>` (o `accept-installed-v11.mts` captura UM tema por execução e a pasta recebe claro e escuro: rode o pré-aceite depois dos DOIS temas, senão os modos do tema que falta saem como "falta a imagem").

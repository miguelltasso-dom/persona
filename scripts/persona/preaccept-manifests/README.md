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

## O que confere (13 checagens por captura, cena × claro/escuro × 1440/960/200%)

cobertura (imagem existe, não está em branco, tem texto) · axe crítico/sério 0 · alvos ≥ 24 px (`target-size` do axe; os < 24 px que ele aceita por espaçamento viram AVISO) · overflow horizontal 0 ·
**diálogo** (a caixa inteira e o último controle/rodapé cabem na janela; a 200% ela tem 360 px de altura; sidecar da sonda v1 não media: só avisa) ·
console limpo · texto proibido (lista da Muse, pt e en: Maestro, MCP, allowlist, runner, harness, slug, undefined, null, NaN, [object, TODO, lorem,
mock, fixture, `$`/`US$`, cota não medida, autor com `:`, id hex ≥ 8, `@nome` no começo de título, Skill ensinada, `[[`, `persona_`, "Em andamento:" avulso) ·
artigo antes de nome de persona ("o Atlas", "com a Nina", "A Nina terminou" reprovam; "pediu a Téo" / "Ensinar a Nina" viram **aviso**) ·
tema certo · folhagem do trilho a 1440/960 · imagens quebradas (e AVISO de avatar de PERSONA em inicial, D-069: o "T" do Téo, o "N" da Nina; só a sonda nova mede) · ícones vazios · foco visível no 1º Tab.

Resultado por captura: **PASSOU** · **FALHOU** (com a razão) · **INCOMPLETO** (não falhou, mas falta a sonda/log para provar).

## Campos do manifesto

`owner, bundle, dir, scenes:[id | {id, allowCurrency?, shell?, schemes?, viewports?, rejected? ("motivo": cena que a Muse já rejeitou nunca volta como pronta)}], schemes?, viewports?, foliageViewports?, shell? (false = sem trilho, ex.: galeria),
roster?, fileTemplate? ("{scene}-{scheme}-{viewport}"), schemeNames?, viewportNames?, sizes?, logs?, reports?, skipChecks?`.

Lotes antigos (sem sonda): `--legacy-ok` + `logs`/`reports`/`--log`/`--report` dão cobertura, axe, overflow e tema pelos logs; o resto fica de fora (o relatório avisa).
Os 4 manifestos desta pasta são a prova nos lotes que já existiam: `ember-shell`, `ember-gallery`, `prism-shell`, `gauge-day-app`.

## App instalado (CSP) e por onde o axe entra

O axe entra na página por `page.evaluate(<fonte do axe.min.js>)` (CDP), NÃO por `addScriptTag`: o `addScriptTag` do Playwright injeta um `<script>` inline e a CSP do app instalado o bloqueia (e ainda suja o console da cena seguinte com "Refused to execute inline script").
Quem chama `collectProbe` não muda nada: a sonda cai para o `addScriptTag` só se o axe não ficar pronto pelo CDP, e reaproveita o axe que a cena anterior já carregou. Teste: `preaccept.test.mjs` ("o axe entra numa página com CSP que bloqueia script inline").
A varredura final da Muse no instalado (`muse-installed.json`) usa exatamente esta sonda: `node scripts/persona/preaccept.mjs --manifest scripts/persona/preaccept-manifests/muse-installed.json --dir <pasta do hash>` (o `accept-installed-v11.mts` captura UM tema por execução e a pasta recebe claro e escuro: rode o pré-aceite depois dos DOIS temas, senão os modos do tema que falta saem como "falta a imagem").

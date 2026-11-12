# Tempo de abertura — análise do perfil do verificador em 752e85396a (Rivet, 12/11/2026)

Pedido do Keel (09:16): onde vai o tempo até a tela útil (meta v1.1.1: < 2,5 s). Só leitura: `proof/light.cpuprofile` (perfil do RENDERER, CDP, do momento em que a
página `dsh-app://app` existe até o onboarding visível) e `light.log` de `.maestri/tmp/rivet-cut/752e85396a/proof/`, cruzados com `MEDICAO.md` §7–§15 e `PLANO.md`.
Máquina CARREGADA (RAM livre ~5 GB, outros jobs rodando): servem para a PROPORÇÃO, não para o valor absoluto. A medição ociosa fica para a janela do Setup.

## O que o perfil mostra (renderer, 16,1 s de perfil; o `elapsedMs` de 17,4 s do verificador soma ~1–3 s do próprio verificador: CDP, screenshots, `innerText`)

| trecho (desde o início do perfil) | o que acontece | tempo |
| --- | --- | ---: |
| 0 – 1,1 s | `preload-app.cjs` (`nativeColor` 645 ms de CPU própria, a 166 ms), boot overlay, `findNextMatchSync` (vendor, 90 ms) | **~1,0 s de CPU** |
| **1,1 – 13,0 s** | **o renderer fica OCIOSO** (2–8 ms/s de CPU): espera o host (o `await __DSH_BOOT_READY__` do cliente só resolve depois do `desktop.ready()`, que espera o host) | **~12 s parados (≈ 75–80% do total)** |
| 13,0 – 15,2 s | `client.js` (`materialize` 398 ms desde 13,08 s), `index-*.js` 366 ms, vendor 303 ms, `client.js` 311 ms: monta o shell até o onboarding | **~1,9 s de CPU** |
| 15,2 – 16,1 s | verificador (tema, screenshots) | — |

CPU não ociosa do renderer no total: ~2,9 s (717 `(program)` + 704 preload + ~1,4 s dos bundles). É o mesmo "2,9 s de trabalho" que o Zinc mediu em 11/11
(ocioso de 1,1 a 8,2 s na máquina quieta; aqui 1,1 a 13,0 s na carregada). **O renderer NÃO é o gargalo: ele espera o host.**

## O que NÃO dá para separar com estes arquivos (e como separar)
`light.log` não tem tempo (7 linhas: DevTools, o erro de IPC `dsh-desktop:mandatory-status` sem handler [inofensivo, mas ruído no console do main] e a linha `dsh web:`). Faltam marcas:
spawn do host, módulos carregados, abertura do banco / migrações V26, servidor Web pronto, janela criada, `desktop.ready()` resolvido, primeiro mount. Proposta (20 linhas, baixo
risco): gravar essas marcas no `personaLogger` (main e host) com `performance.now()`; a janela do Setup passa a medir por fase em vez de por proxy.

## As 3 maiores alavancas
1. **Shell estático + transporte tardio (o "P0.5" do PLANO)** — o renderer deixa de esperar o host: o índice estático + manifesto de módulos vão no asar, o shell monta com "acordando o
   time" e conecta quando o host responde. É a ÚNICA que alcança a meta (os cortes no host sozinhos chegam a ~6 s). Ganho: tela útil de ~9–12 s (quieta) / 17 s (carregada) para
   **~2–3 s** (≈ o trabalho do renderer, 1,9–2,9 s), independente do boot do host. Custo 2–3 dias (Zinc), risco médio (contrato do preload e `boot.ts`), pede OK do Keel/Atlas e
   o estado de espera do Prism. Cuidado medido em 11/11: a janela antecipada custou **+1,5 s de shell** porque o renderer disputa CPU com o host — vem junto com renderer em
   prioridade baixa/splash estático até o host ficar pronto.
2. **Dieta do boot do host (7,2 s quieta → ~4 a 4,5 s)** — o host carrega 498 módulos do asar (cold: 4,8 mil `readFileSync` = 4,3 s; quente 0,13 s). (a) compile cache V8 PRÉ-GERADO no
   `afterPack` (o runtime já está no main; falta o passo do empacotamento): −0,75 s de `compileSourceTextModule` e boa parte do frio do 1º start; (b) adiar o que não é da 1ª tela:
   `gh --version` (0,15 s, picos de 3,5 s), warmups de CLI/conectores/prewarm (o `spawn` de 1,18 s cria 4 processos) e a curadoria de relatórios; (c) migrações só quando há versão
   pendente (116–553 ms típicos, picos de 3,3 s a frio); (d) menos arquivos/resoluções no asar (9,3 mil `realpath`): empacotar o host em arquivo único. Ganho estimado 2,5–3 s no
   host pronto, custo 1–2 dias, risco baixo a médio. Sozinho NÃO bate 2,5 s (piso ≈ host 4 s + renderer ~2 s = ~6 s), mas é o que melhora o primeiro uso e a máquina fraca.
3. **Trabalho próprio do renderer/preload (−0,8 a −1,1 s, barato)** — `nativeColor` do `preload-windows.ts:28` gasta 645 ms de CPU na janela nova (a 166 ms; é a maior função
   do renderer): calcular a cor sem criar elemento/canvas por chamada, cachear e rodar depois do primeiro frame (−0,6 s medido). Mais: code-splitting do shell por painel
   (`client.js` tem 8,7 MB hoje; o plano prevê −0,2 a −0,5 s) e não pagar `materialize` de 398 ms de módulos que a 1ª tela não usa. Custo 0,5–1 dia, risco baixo.

## Ordem sugerida
3 (hoje, seguro) → 2(a)+(b) (compile cache do pack + adiar `gh`/warmups, antes do Setup, medindo por fase com as marcas) → 1 (v1.1.2, com decisão do Atlas) — a meta < 2,5 s só fecha com a 1.
Honesto: a v1.1.1 provavelmente fecha em ~6–7 s (quieta) com 2+3; < 2,5 s é v1.1.2.

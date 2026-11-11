# Plano de desempenho da Persona (Cobalt, 07/11/2026)

Pedido do Atlas: a Persona tem que **abrir rápido**, rodar lisinha e ser leve. Primeiro medir, depois propor — nada de reescrever sem número.
Medição: `MEDICAO.md` (app/Electron/instalador, Cobalt) + `HOST-BOOT.md` (host, Zinc) + `../t3code/DESEMPENHO.md` (referência de como o T3 abre).

## 1. Metas (o critério do Miguel)

| Meta | Hoje | Onde |
| --- | --- | --- |
| Janela na tela | **6,9–8,5 s** (medido 09/11 no instalado v1.1, janela visível) | `MEDICAO.md` §7 |
| Primeira tela útil | **9,2–11,7 s** (shell; meta < 2 s) | `MEDICAO.md` §7 |
| RAM parada | **1,1 GB** (host 413–414 MB, GPU 270 MB); host do Zinc 93 MB | `MEDICAO.md` §7, `HOST-BOOT.md` |
| Instalador | **329,6 MiB** (1,18 GiB instalado) | `MEDICAO.md` §7 |
| Host pronto | servidor Web **7,5 s**; shell ~9–12 s | `MEDICAO.md` §7 |

Metas propostas: **janela < 1 s**, **primeira tela útil < 2 s**, **RAM parada < 300 MB**, **instalador ≤ 250 MiB** (sem tocar no produto),
medidos pelo `perf-probe-visible.mjs` no mesmo artefato. O artefato do corte **abre** (janela visível em 6,9–8,5 s; shell em 9,2–11,7 s; `MEDICAO.md` §7); o probe antigo media com `windowsHide` e ficou como referência do artefato.

## 2. O que pesa (com número)

1. **A janela espera o host.** `reconcileBackend` (`apps/desktop/src/main.ts:829-835`) faz `await backend.start(...)` antes de `openInitialWindow`
   (`:1915`); no instalado v1.1 a janela visível só aparece em **6,9–8,5 s** e o shell em **9,2–11,7 s** (`MEDICAO.md` §7). O splash
   (`attachBootUi`, `:962`) só cobre o renderer, que nem existe ainda. **É o maior ganho de percepção e o mais barato.**
2. **Carga de módulo + construtor do host:** ~0,45 s + ~0,51 s no bundle do `persona-host` (Zinc), mas o **perfil completo** sobe o servidor
   Web em **7,5 s** no instalado (`MEDICAO.md` §7); o `persona-host` sozinho não explica o boot. O compile cache do V8 pré-gerado no
   empacotamento corta a carga no primeiro start depois de instalar/atualizar (T3 2.14/3.15).
3. **`gh --version` síncrono no construtor:** 160–240 ms (picos 0,5–3,5 s), sempre, mesmo sem GitHub.
4. **Warmups de CLI/conectores/prewarm/scheduler no construtor:** em segundo plano, mas disputam CPU/RSS com a primeira tela (Zinc: no
   fonte+tsx o construtor cai de 5,2–7,1 s para 0,74 s com o bloco adiado).
5. **Renderer/bundle:** `client-ui-persona/lib/client.js` 3,6 MB no asar, carregado no boot; o T3 faz code splitting por rota + `router.load()`
   antes do primeiro render (T3 1.1/1.3).
6. **Instalador:** o asar final tem **20.944 arquivos / 248.585.695 B** + 254,1 MiB de `app.asar.unpacked` + 266,8 MB de runtime + 50,6 MB de
   locales + 96,2 MB de mingit (`MEDICAO.md` §7); o NSIS final é **329,6 MiB** e instala **1,18 GiB**.
7. **Migrações/índices no frio:** 116–553 ms (picos 0,7–3,3 s) no `persona-host` (Zinc); no instalado a diferença fria/quente foi ~1,6 s na
   janela e ~2,5 s no shell (`MEDICAO.md` §7), sem isolar migrações.

## 3. Mudanças em TypeScript, em ordem (ganho esperado × risco)

> Dieta de tamanho (instalador ≤ 250 MiB): `DIETA.md` — os cortes de LibreOffice (183 MB), Python (145 MB), locales (47 MB), experimentais (72 MB)
> e pnpm (21 MB) levam o instalador de 328 MiB para ~185 MiB; a < 150 MiB pede Cursor/sharp opcionais.

### P0 — a janela nasce antes do host (percepção, ~5 s de tela) — **PATCH PRONTO** (`perf-p0.patch`)
- `reconcileBackend` cria a janela e carrega `dsh-app://app/` (o splash já é servido pelo protocolo do main) **antes** de `backend.start`; o host
  sobe em paralelo e o cliente espera no `dshDesktopBoot.ready()` (o IPC de boot já espera `startup`). O splash existente (`boot-ui.ts`) cobre a
  espera; nada de tela inexistente.
- Arquivo: `apps/desktop/src/main.ts` (3 hunks). Ganho esperado: janela/splash visível em **~1–2 s** (hoje a janela visível aparece em
  **6,9–8,5 s**, depois do `backend.start`); o shell continua em **9,2–11,7 s** até o host/renderer. Risco: baixo.
- **Medido (11/11, `MEDICAO.md` §10):** janela **123–201 ms** contra 7.296–7.775 ms do controle v1.1 na mesma máquina (meta < 1,5 s batida); shell **10,4–12,6 s** contra 9,9–10,2 s — o splash visível durante o boot do host custa ~0,5–2,4 s de shell (host pronto 8,1 s vs 7,2 s; renderer 2,3–4,5 s vs 1,6–2,1 s). O ganho de percepção é real (7 s de tela), mas o shell só cai com o P0.5 abaixo.
- **Patch:** `C:/p8w-cobalt/.maestri/tmp/cobalt/perf-p0.patch` (3 hunks em `apps/desktop/src/main.ts`, sobre a base de 07/11; regerar sobre a base do corte).
  Testes do desktop na cópia: 2383, 20 vermelhos — todos pré-existentes/ambiente (assets `persona-assets/brand` ausentes no snapshot, `app` do
  Electron indefinido no harness de `welcome-startup`, empacotamento/credenciais); nenhum no caminho que o patch toca.

### P0.5 — o renderer não carrega NADA antes do host (o gate `__DSH_BOOT_READY__`) — **PROPOSTA, decisão do Keel/Atlas**
- Fato de código: `packages/client/web/src/boot.ts:59` faz `await __DSH_BOOT_READY__?.promise` **antes** de criar o `__ModuleLoader__` e
  carregar qualquer módulo do cliente; no desktop o gate só resolve depois de `desktop.ready()` (o IPC `boot` espera o host). O trace do Zinc no
  instalado mostra o renderer **ocioso de 1,1 s a 8,2 s** e só então 2,9 s de trabalho (bundle 520 ms + materialize 427 ms + eval 564 ms + fontes
  205 ms) até o shell.
- Consequência: com o P0 a janela/splash aparece em ~1–2 s, mas a **primeira tela útil continua = host pronto + ~2,9 s**. Nenhum corte no host
  (compile cache, warmups, diet) muda a ordem: o renderer só começa depois do `ready`.
- Proposta: separar o gate em dois — carregar módulos e montar o shell **imediatamente** (o splash já é HTML), e deixar o gate bloquear apenas a
  conexão/transporte: o shell abre com o estado "acordando o time" e o `streamBaseUrl`/injections chegam quando o host responde. Arquivos:
  `packages/client/web/src/boot.ts` (não bloquear o `ModuleLoader`), `packages/client/connection` (transporte tardio), `apps/desktop/src/preload-app.ts`
  (um `boot.pending` + `boot.ready`), UI do estado de espera (Prism). Ganho esperado: **shell em ~2–2,5 s** em vez de 9–12 s; risco médio (mexe no
  boot do cliente e no contrato do preload), precisa do OK do Keel/Atlas e do Prism na UI.
- **Bloqueio descoberto (Zinc, `SEM-DSH.md`):** o `__ModuleLoader__` e o manifesto de módulos vêm das **injections do host** — sem o host não há
  como carregar o bundle do cliente. O P0.5 exige o **cliente estático** (boot próprio, sem as injections do web-app): ~2–3 dias de protótipo
  (Zinc estima). Sem ele, o shell não começa antes do host; com ele, o shell monta em ~1 s e conecta quando o host responde.
- **Contrato do cliente estático (próximo passo, Cobalt):** (1) o pack gera um `index.html` estático + o manifesto de módulos do cliente
  (`__ModuleLoader__`) a partir do bundle já empacotado — hoje esses bytes vêm de `collectIndexInjections` do host; (2) o main serve esse
  índice em `dsh-app://app/` antes do host (o protocolo já existe) e o renderer carrega os módulos e monta o shell; (3) o `dshDesktopBoot.ready()`
  deixa de bloquear o boot: ele entrega `streamBaseUrl`/injections quando o host responde, e o shell mostra "acordando o time" até lá; (4) o
  `connection`/`api-remotes` aceitam transporte tardio (a primeira chamada espera o ready). O ready do main vira `{ window, staticShell }` e o do
  host continua o mesmo — nenhuma linha do perfil é mutilada (o caminho que falhou no `authenticatedUrl`). Medição: shell < 2,5 s com o host ainda
  subindo; o custo do host deixa de estar no caminho da primeira tela.
- Alternativa mais barata, se o gate não puder mudar agora: **pré-aquecer o bundle do cliente** no main antes do host (request HTTP local ao próprio
  web server quando ele subir) — não resolve o gate, só tira o `request do bundle 520 ms` do caminho depois do ready.

### P0 — compile cache V8 (runtime pronto; pré-geração no empacotamento é o passo 2) — **PATCH PRONTO**
- Metade de runtime no `perf-p0.patch`: `module.enableCompileCache(userData/compile-cache)` no main + `NODE_COMPILE_CACHE` no ambiente do host
  (o filho Node-mode). Vale a partir da 2ª abertura (a 1ª popula).
- Passo 2 (empacotamento, T3 2.14/3.15): pré-gerar o cache no `afterPack` com o próprio Electron e semear por hardlink/symlink — ataca o
  **primeiro** start depois de instalar/atualizar. Arquivo: `apps/desktop/scripts/electron-builder-config.mjs` (afterPack).

### P1 — `gh --version` lazy (160–240 ms; picos 0,5–3,5 s)
- `detectGh()` deixa de rodar no construtor; vira lazy na primeira fonte GitHub (Zinc já prototipou com `PERSONA_BOOT_DEFER_GH=1`).
- Arquivos: `packages/persona/persona-host/src/index.ts` (construtor) + `github.ts`. Ganho: 160–240 ms típicos, até 3,5 s no pior caso.

### P1 — warmups no primeiro pedido do cliente (não no construtor)
- `connections.warm()`, `connectorBridge.refresh()`, `prewarmAll()`, `proactivityScheduler.start()` no primeiro pedido (ou ~1 s ocioso).
- Ganho: CPU/RSS do boot fora da primeira tela (Zinc mediu no fonte+tsx; **medir no instalado** antes de tratar como P0).

### P1 — renderer: primeiro render depois do necessário
- Code splitting do shell por painel (o T3 faz por rota) + `router.load()`-equivalente antes do primeiro render; o bundle do shell não deve
  carregar os painéis que a pessoa não abriu (o `client-ui-persona/lib/client.js` tem 3,6 MB).
- Arquivos: `apps/desktop/tsdown.config.ts` / `packages/persona/client-ui-persona` (Prism). Ganho: −200 a −500 ms na primeira tela; medir.

### P2 — runtime/curadoria de relatórios sob demanda (~20 ms típico, até 0,4 s)
- `orchestration.runtime` + `curateProjectReports` no primeiro evento (Zinc `PERSONA_BOOT_DEFER_PROJECT_WORK=1`).

### P2 — instalador/app mais leve (328 MiB → meta 250)
- Locales só pt-BR/en-US (49 MB → ~2 MB); excluir source maps, prebuilds não usados e binários opcionais do asar (T3 3.4/3.5); revisar os
  26.415 arquivos de `node_modules` do host (o maior peso). Arquivos: `electron-builder-config.mjs` + `tsdown`/bundle do host.
- Ganho: −50 a −80 MiB no instalador e menos I/O de instalação/atualização; medir o tempo de instalação antes/depois.

### P2 — migrações/índices no frio
- Medir migração por migração no instalado; remover índices sem leitor; só mover para worker se o pico (> 1 s) aparecer no app.

## 4. Rust/Go: quanto valeria?

**Nada, hoje, com número.** O perfil medido é I/O, spawn e DDL: o host pronto em ~0,9 s é carga de módulo (V8) + construtor; `gh` é `spawnSync`
(160–240 ms) e as CLIs ~16–20 s são autenticação/spawn de cada CLI. Um helper nativo para sondar as 4 CLIs em paralelo cortaria parte dos
~16–20 s **de fundo**, não a primeira tela — e custa build/assinatura por plataforma. O SQLite já é C. Um rewrite em Rust/Go não reduz o que o
Node carrega (RSS ~93 MB). **Veredito: não.** Revisitar só se aparecer um cálculo puro e quente (ex.: parsing de transcrição em massa).

## 5. Tauri no lugar do Electron: viabilidade, ganho, custo

- **Ganho esperado:** o Chromium embutido sai (~350 MB de app; ~150–250 MB de RAM do processo tree do renderer/GPU) e entra o WebView2 do
  Windows (já instalado na máquina). Instalador cairia de 328 MiB para algo na casa de 80–150 MiB (o runtime Node/host continua), e a RAM
  parada pode chegar perto da meta de 300 MB.
- **Custo:** o shell é Electron de ponta a ponta — `apps/desktop/src/main.ts` (~2.100 linhas: janela, IPC, tray, protocolo `dsh-app://`,
  safeStorage/DPAPI, updater, computer-use, overlays), preloads, empacotamento/assinatura NSIS e o harness E2E por CDP. O host é Node (segue
  igual, como sidecar) e o cliente é Web (segue igual). A troca é uma **reescrita do main + empacotamento + E2E**, semanas de trabalho, e perde
  a consistência Chromium/Node que o produto usa hoje (CDP nos testes, computer-use, protocolo custom).
- **Veredito:** **não agora.** Primeiro os P0/P1 em TS (baratos, medíveis); se depois deles a RAM parada seguir > 400 MB ou o instalador
  > 250 MiB, o Tauri vira a única alavanca grande — e aí a decisão é do Miguel/Atlas, com o número na mão.

## 6. Como provar cada mudança

- `C:/p8w-cobalt/scripts/persona/perf-probe.mjs` (instalado/`win-unpacked`): janela, CDP, primeira tela, host, memória por processo, CPU parado —
  5 execuções (1 fria + 4 quentes), JSON por execução. Rodar **antes e depois** de cada mudança, no mesmo artefato.
- `HOST-BOOT.md` (Zinc): `host-boot-probe.mjs` para o host (bundle `--built`).
- Gates: o E2E do instalado (V1-P0-5/V1-P0-6) continua verde; o probe não chama IA.

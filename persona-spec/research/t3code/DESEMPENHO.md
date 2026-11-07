# Desempenho do T3 Code — como ele abre rápido e fica leve

**Fonte:** `C:/Users/migue/dev/_ext/t3code`, commit `25bf84ab07f53f141c20239c63e383823a9d5ea0` (07/11/2026).
**Para quem:** Cobalt (mede a abertura da Persona) e Rivet/Keel (boot e empacotamento).
**Regra:** só entra o que está escrito no código ou nos docs do repo, com `arquivo:linha`. Números de tempo/tamanho só aparecem quando o próprio repo os declara.

## Resumo executivo

O T3 abre rápido por seis decisões estruturais, não por micro-otimização:

1. **Splash é HTML puro, pintado antes de qualquer JS.** O React só substitui o nó quando está pronto (`apps/web/index.html:674-680`).
2. **Tema resolvido por script inline síncrono** antes do React montar — sem flash, sem repaint (`apps/web/index.html:13`).
3. **Cache de compilação do Node ligado no processo principal** (`apps/desktop/src/compileCache.ts:5`), que corta o custo de parse de módulo a cada abertura.
4. **Módulos nativos nunca carregam no main process no caminho de boot**; os dois que existem rodam em filho ou worker (`docs/internals/overview.md`, seção "Waiting for asynchronous work").
5. **Code splitting por rota + `router.load()` antes do primeiro render** (`apps/web/vite.config.ts:282`; `apps/web/src/main.tsx:37-39`).
6. **Virtualização em dois níveis** (timeline e log de ferramentas) com cache de parse, highlight e fórmula, todos com teto (`apps/web/src/components/chat/MessagesTimeline.tsx:1322`; `TimelineWorkGroupRows.tsx:237`).

O que a Persona deve copiar primeiro: itens 1, 2, 3, 5 e o par "virtualização + cache com teto". O resto é polimento incremental.

---

## 1. Cliente web (render e bundle)

| # | Fato | Onde |
|---|---|---|
| 1.1 | Code splitting automático por rota: o plugin do TanStack Router gera um chunk por arquivo de `src/routes/` (41 rotas); só a rota aberta entra no bundle | `apps/web/vite.config.ts:282` |
| 1.2 | React Compiler ligado no build (`react({ compiler: true })`); `useMemo`/`useCallback` manuais são **proibidos por lint** | `apps/web/vite.config.ts:283`; `docs/internals/web-ui.md` |
| 1.3 | O primeiro render só acontece depois de `router.load()` resolver, em paralelo ao shell de auth; nenhum chunk de rota é buscado com a tela já pintada | `apps/web/src/main.tsx:37-39` |
| 1.4 | O build **falha** em ciclo de import entre chunks, porque um ciclo executa um chunk antes dos valores que ele importa e deixa a tela branca no boot | `apps/web/vite.config.ts:225-227` |
| 1.5 | Chunk lazy obsoleto (deploy/troca de servidor) causa exatamente um reload, guardado em `sessionStorage`, sem loop | `apps/web/src/lib/chunkReloadGuard.ts:2` |
| 1.6 | Tema, `class="dark"` e cores do splash são resolvidos por script inline de ~375 linhas antes do React montar | `apps/web/index.html:13` |
| 1.7 | O splash é HTML/CSS puro dentro de `#root` (`#boot-shell`), pintado antes de qualquer JS de app e substituído pelo React no mesmo nó | `apps/web/index.html:674-680` |
| 1.8 | A fonte Inter é self-hosted (`@fontsource-variable/inter` no entry); não há request a CDN nem `<link rel=preload>` de fonte | `apps/web/src/main.tsx:4` |
| 1.9 | A timeline do chat é virtualizada com `LegendList` e `estimatedItemSize={90}` | `apps/web/src/components/chat/MessagesTimeline.tsx:1322-1329` |
| 1.10 | `getItemType` agrupa linhas por bucket `log2(tamanho/1000)` para a lista não inflar a estimativa de altura nem entrar em loop de atualização aninhada | `apps/web/src/components/chat/MessagesTimeline.tsx:1431-1438` |
| 1.11 | Só a primeira e a última mensagem (mais as citadas) ficam sempre montadas; o resto existe apenas na janela virtual | `apps/web/src/components/chat/MessagesTimeline.tsx:803-818` |
| 1.12 | Cada linha da timeline é `memo` própria, e a lista inteira também; streaming de uma linha não re-renderiza as outras | `apps/web/src/components/chat/MessagesTimeline.tsx:1438` |
| 1.13 | A projeção de linhas reaproveita o resultado anterior (`deriveMessagesTimelineRowsWithState(input, previous)`) em vez de reconstruir tudo a cada evento | `apps/web/src/components/chat/MessagesTimeline.logic.ts:2484` |
| 1.14 | O log de ferramentas dentro de um turno é uma **segunda** lista virtualizada aninhada, com `drawDistance={240}` e `recycleItems` | `apps/web/src/components/chat/TimelineWorkGroupRows.tsx:237-245` |
| 1.15 | Diff e preview usam `CodeView`/`Virtualizer` do Pierre com métricas fixas (`diffHeaderHeight: 32`, `hunkSeparatorHeight: 24`) para posicionar linhas sem remedir | `apps/web/src/components/diffs/StyledDiffCodeView.tsx:229-244` |
| 1.16 | O highlight de diff roda em pool de Web Workers dimensionado pela máquina: `max(2, min(6, floor(cores/2)))`, com cache AST LRU de 240 entradas | `apps/web/src/components/DiffWorkerPoolProvider.tsx:24-27` |
| 1.17 | O pool de workers de diff é encerrado após 30 s sem consumidores (`DIFF_WORKER_IDLE_TTL_MS = 30_000`) | `apps/web/src/components/DiffWorkerPoolProvider.tsx:21` |
| 1.18 | O highlighter são lexers WASM próprios, documentados no repo como 10–40× mais rápidos que o Shiki em arquivos grandes, sem backtracking de regex JS | `apps/web/src/lib/syntaxHighlighting.ts:18-22` |
| 1.19 | Blocos de código finalizados vão para um LRU de 500 entradas / 50 MB; remontar uma linha virtualizada não re-highlighta | `apps/web/src/components/chat/MarkdownCodeBlock.tsx:32-33` |
| 1.20 | Durante streaming o highlight é incremental por linha: linhas concluídas mantêm o nó, só a última é retokenizada | `apps/web/src/lib/incrementalHighlighting.ts:57` |
| 1.21 | O markdown parseado vira `ReactElement` num cache global de 500.000 chars (~10 MB, ~20 bytes por char de origem), reusado em remount e troca de thread | `apps/web/src/components/chat/markdownRenderer.ts:24-25` |
| 1.22 | Texto em streaming é cortado em blocos por linha em branco; só o último bloco re-renderiza e os anteriores reaproveitam o parse | `apps/web/src/components/ChatMarkdown.tsx:1733-1739` |
| 1.23 | Enquanto o Shiki carrega, o bloco de código fica em `<Suspense>` com um `<pre>` invisível como fallback, reservando o layout sem flash | `apps/web/src/components/ChatMarkdown.tsx:1597-1611` |
| 1.24 | KaTeX vive em chunk lazy; fórmulas ficam num LRU de 1.000 entradas / 4 MB para o remount não re-typeset | `apps/web/src/components/chat/MathTypeset.tsx:8` |
| 1.25 | Diagramas Mermaid carregam um chunk **por tipo** (`diagramLoads`); um flowchart não baixa o parser de sequência nem o de classe | `apps/web/src/components/chat/MermaidDiagram.tsx:14-16` |
| 1.26 | Preview, diff, device e preview de arquivo do painel direito são `lazy()`, fora do carregamento inicial do chat | `apps/web/src/components/chat/RightPanelSurfaceContent.tsx:28-35` |
| 1.27 | Linhas da sidebar usam `[content-visibility:auto]` com `contain-intrinsic-size`, pulando layout e paint de threads fora da tela **sem** virtualizar a lista | `apps/web/src/components/sidebar/SidebarThreadRow.tsx:1205` |
| 1.28 | Animações nascem pausadas (`animation-play-state: var(--visible-animation-state, paused)`) e só ganham `will-change: transform` quando o IntersectionObserver as marca visíveis | `apps/web/src/index.css:582-583` |
| 1.29 | O keyframe de skeleton usa `steps(4)`, descrito no repo como a diferença entre ~14 e ~288 atualizações por ciclo num display de 120 Hz | `apps/web/src/index.css:295-300` |
| 1.30 | O command palette usa `useDeferredValue(query)`, mantendo o input responsivo enquanto a busca reavalia os grupos | `apps/web/src/components/CommandPalette.tsx:427` |
| 1.31 | Prefetch por intenção: 150 ms de hover/focus numa linha de PR dispara a query de detalhe e sair cancela; o clique pinta do cache. **Não há prefetch equivalente para threads** | `apps/web/src/components/pullRequest/usePullRequestIntentPrefetch.ts:8` |
| 1.32 | Todos os `IntersectionObserver` do app são compartilhados por root + conjunto de opções, em vez de um por elemento | `apps/web/src/lib/observeIntersection.ts:64-66` |
| 1.33 | O próximo lote de arquivos do diff é pedido quando o sentinela entra a 600 px do viewport (`rootMargin: "600px"`), com skeleton no lugar | `apps/web/src/components/diffs/DiffFileLoadingBoundary.tsx:15` |
| 1.34 | Imagens do markdown usam `loading="lazy"` + `decoding="async"`; vídeos só pedem metadata perto da viewport (`preload="none"` até lá) | `apps/web/src/components/chat/ChatMarkdownMedia.tsx:209-210` |
| 1.35 | Saída de comando ao vivo é throttled **no servidor**: 1 frame por 100 ms por subscriber, troca de tail a cada 500 ms quando atrasa, corte em 16 KiB, 64 comandos vivos e 16 finalizados | `apps/server/src/orchestration-v2/CommandOutputHub.ts:32-40` |
| 1.36 | Budget de snapshot fixado em teste: ~1 MiB de rows codificadas, 10 turnos de usuário (20 em páginas antigas) ou 500 rows, e 75 rows fora desse caso | `docs/internals/performance-regressions.md:15-17` |
| 1.37 | Catch-up de resume checa 1 MiB antes de decodificar e reenvia no máximo 128 eventos de thread antes de cair para snapshot | `docs/internals/performance-regressions.md:31-33` |
| 1.38 | Existe medição de render no repo: cenários contam commits e renders de componentes, com 3 execuções exigidas idênticas antes de comparar refs | `scripts/render-metrics.ts:9-20` |
| 1.39 | Todo arquivo de `apps/web/src` é compilado pelo React Compiler num teste que falha em qualquer bailout — memoização garantida por CI, não por disciplina | `apps/web/src/reactCompilerCoverage.test.ts:44` |
| 1.40 | `ChatView` não remonta ao abrir Settings/Usage: a rota modal renderiza por cima e o alvo anterior fica em `backgroundTarget` | `apps/web/src/routes/_chat.tsx:35-45` |

---

## 2. Processo e abertura (servidor + desktop)

| # | Fato | Onde |
|---|---|---|
| 2.1 | O desktop empacota o servidor em `server.asar` (Windows) / `app.asar` (mac/Linux) com `apps/server/dist/bin.mjs`; o app não depende de Node externo | `scripts/build-desktop-artifact.ts:1028`; `:3364` |
| 2.2 | O servidor **não roda no main do Electron**: é processo filho Node com `process.execPath` + `ELECTRON_RUN_AS_NODE=1` | `apps/desktop/src/backend/DesktopBackendConfiguration.ts:524-536` |
| 2.3 | O `start` do backend só forka o processo (`Effect.forkIn`) e retorna; a janela é criada em paralelo, **antes** da prontidão | `apps/desktop/src/backend/DesktopBackendManager.ts:988` |
| 2.4 | A janela nasce `show: false` e só é revelada no `ready-to-show` (no Linux também em `did-finish-load`) | `apps/desktop/src/window/DesktopWindow.ts:404`; `:841-843` |
| 2.5 | `backgroundThrottling: false` até a primeira revelação, para o renderer oculto não estrangular o primeiro paint | `apps/desktop/src/window/DesktopWindow.ts:414` |
| 2.6 | Prontidão do backend é polling HTTP em `/.well-known/t3/environment` a cada 100 ms, com timeout de 3 min | `apps/desktop/src/backend/DesktopBackendManager.ts:39-40`; `:51` |
| 2.7 | Splash "connecting" só aparece no modo WSL-only; nos demais a janela real é criada direto | `apps/desktop/src/app/DesktopApp.ts:249-251` |
| 2.8 | Toda requisição HTTP do servidor espera o gate de command-ready (middleware global): nada responde antes do boot terminar | `apps/server/src/server.ts:756-761` |
| 2.9 | Ordem de boot do servidor: `http.wait` → raízes auxiliares parked → activate → aceita comandos → publica `ready` | `apps/server/src/serverRuntimeStartup.ts:637-664` |
| 2.10 | O lock de ownership (um servidor por T3 home) é adquirido **antes** de qualquer abertura de banco | `apps/server/src/server.ts:838-839` |
| 2.11 | SQLite: WAL + `synchronous=NORMAL` + `busy_timeout=5000` + `temp_store=MEMORY` + `journal_size_limit` 128 MiB | `apps/server/src/persistence/Sqlite.ts:18-35` |
| 2.12 | Leituras do SQLite rodam em pool de **4 worker threads**; checkpoint do WAL em worker separado, fora do event loop | `packages/shared/src/nodeSqliteClient.ts:297`; `apps/server/src/persistence/Sqlite.ts:56-58` |
| 2.13 | Statements preparados ficam em cache de 200 entradas com TTL de 10 min | `packages/shared/src/nodeSqliteClient.ts:979-983` |
| 2.14 | O build empacotado **pré-gera o V8 compile cache** do servidor e o semeia por hardlink/symlink no cache ativo | `scripts/lib/server-compile-cache.ts:105-133`; `apps/desktop/src/compileCache.ts:17-21` |
| 2.15 | O CLI liga compile cache em `~/.cache/t3code/compile-cache` (ou tmpdir), exceto em AppImage/SEA | `apps/server/src/cliCompileCache.ts:15` |
| 2.16 | `binMain` despacha fast paths (`acp-mcp-bridge`, workers) **antes** do grafo completo do CLI, cujo carregamento custa "seconds of evaluation" | `apps/server/src/binMain.ts:8-9`; `:39-42` |
| 2.17 | O renderer é servido do disco pelo scheme `t3code://` com `codeCache: true`, não pelo backend | `apps/desktop/src/electron/ElectronProtocol.ts:122`; `docs/internals/remote.md:184-186` |
| 2.18 | O entry importa o app dinamicamente e só cria a root após `Promise.all([managedAuthShell, router.load()])` | `apps/web/src/main.tsx:37-45`; `apps/web/src/bootstrap.ts:4` |
| 2.19 | Todos os serviços de vida do app sobem **uma única vez** antes da primeira renderização | `apps/web/src/appInit.tsx:164-168` |
| 2.20 | Preload de rota por intenção (`defaultPreload: "intent"`), sem prefetch especulativo | `apps/web/src/router.ts:10` |
| 2.21 | Em dev, o grafo é aquecido (`warmup.clientFiles: main.tsx`) e 6 chunks de startup são pré-bundleados no `listening` | `apps/web/vite.config.ts:344-346`; `apps/web/vite/warmBundledDev.ts:4-11` |
| 2.22 | Compressão HTTP global; no dev, brotli qualidade 5 (q11 trocaria stall de transferência por stall de encode) | `apps/server/src/http.ts:252-254`; `apps/web/vite.config.ts:217-219` |
| 2.23 | Assets com hash: `max-age=31536000, immutable`; HTML `no-cache`; ETag/If-None-Match devolve 304 | `apps/server/src/http.ts:654-670` |
| 2.24 | O WebSocket fala JSON puro (sem permessage-deflate) e divide frames em partes de 48 KiB | `apps/server/src/ws.ts:3575`; `packages/shared/src/socketFrameParts.ts:10` |
| 2.25 | O cliente sempre pede `frameParts=1`, pinga a cada 5 s e derruba o socket após 15 s sem frame | `packages/client-runtime/src/rpc/session.ts:233`; `packages/client-runtime/src/rpc/protocol.ts:10-12` |
| 2.26 | Reconexão: backoff 1 s → 300 s com jitter, establishment 15 s e sincronização 75 s | `packages/client-runtime/src/connection/supervisor.ts:43-50` |
| 2.27 | Eventos live são coalescidos em janela de **50 ms**, com no máximo 512 updates pendentes | `apps/server/src/orchestration-v2/ThreadLiveEventCoalescer.ts:18-19` |
| 2.28 | Saída de comando: frame a cada 100 ms, replace a cada 500 ms, append máx. 16 KiB e 64 comandos vivos | `apps/server/src/orchestration-v2/CommandOutputHub.ts:32-41` |
| 2.29 | Retomada de thread: no máximo 128 eventos e 1 MiB de JSON projetado antes de cair para snapshot | `apps/server/src/orchestration-v2/ThreadStream.ts:18-23` |
| 2.30 | Página de histórico: 1 MiB codificado, 10 turnos de usuário, 500 itens por turno, 75 itens fora de turno | `apps/server/src/orchestration-v2/threadHistoryPaging.ts:16-21` |
| 2.31 | O shell snapshot omite settled antigos além dos 25 mais novos por projeto (a contagem vem em `olderSettled`) | `apps/server/src/orchestration-v2/ShellStream.ts:92` |
| 2.32 | Primeira tela: **1 GET** `/api/orchestration/shell` (timeout 20 s, fallback para o snapshot no socket) + config via WS | `packages/client-runtime/src/state/shellSnapshotHttp.ts:25`; `packages/contracts/src/environmentHttp.ts:705` |
| 2.33 | Abrir thread: 1 GET `/api/orchestration/threads/:threadId` e depois `subscribeThread` no WS para os deltas | `packages/contracts/src/environmentHttp.ts:713`; `packages/client-runtime/src/state/threads.ts:993-994` |
| 2.34 | Cache local em IndexedDB `t3code:connection-runtime` v5 com stores shell/thread/server-config/vcs-refs | `apps/web/src/connection/storage.ts:45-51`; `:836` |
| 2.35 | Cache de thread em memória expira após **5 min** ocioso, mantendo estado + cursor de replay | `packages/client-runtime/src/state/threadRetention.ts:1` |

## 3. Empacotamento, instalador e memória (desktop)

| # | Fato | Onde |
|---|---|---|
| 3.1 | electron-builder **26.16.1** sobre Electron **44.10.1**, ambos fixados no pacote do desktop | `apps/desktop/package.json:25`; `:39` |
| 3.2 | Alvos: macOS `dmg`+`zip`, Linux `AppImage`+`deb` numa única passada, Windows `nsis` | `scripts/build-desktop-artifact.ts:2832`; `:2904`; `:2947` |
| 3.3 | A config do electron-builder é **gerada em TypeScript**: `appId` `com.t3tools.t3code`, `artifactName` `T3-Code-${version}-${arch}.${ext}`, só o locale `en-US` | `scripts/build-desktop-artifact.ts:2784-2787`; `:985` |
| 3.4 | Windows guarda o servidor em `resources/server.asar` (sidecar) para o NSIS não extrair milhares de arquivos; `smartUnpack` desligado, só `.node/.dll/.exe/.so/.dylib` vão para `.unpacked`, payload limitado a **80 arquivos** | `scripts/build-desktop-artifact.ts:1027-1031`; `:2801`; `:1064` |
| 3.5 | O bundle exclui source maps, `.d.cts`, binários opcionais do Claude e prebuilds da arquitetura não usada | `scripts/build-desktop-artifact.ts:986-1010`; `:1019-1026` |
| 3.6 | Assinatura macOS: Developer ID em lote via `@electron/osx-sign`, com entitlements e provisioning profile de passkeys | `scripts/sign-macos.ts:3-5`; `scripts/build-desktop-artifact.ts:2870-2873` |
| 3.7 | Assinatura Windows: Azure Trusted Signing no Windows e `jsign` em runner Linux, assinando também `.node` e `.dll` | `scripts/build-desktop-artifact.ts:2954-2960`; `scripts/lib/windows-jsign.ts:26-50` |
| 3.8 | Linux: o `.deb` instala o `LICENSE` como copyright, fixa o runtime AppImage 1.0.3 (FUSE 3 sem libfuse2) e o `afterPack` remove permissão world-writable | `scripts/build-desktop-artifact.ts:2899`; `:2924-2927`; `scripts/linux-after-pack.ts:13-19` |
| 3.9 | Auto-update checa 15 s após abrir e a cada 4 min, **sem** download nem instalação automática | `apps/desktop/src/updates/DesktopUpdates.ts:58-59`; `docs/operations/release.md:473-475` |
| 3.10 | Atualização delta: `differentialPackage` no NSIS, `*.blockmap` publicado e teto de **60 MB** para update sidecar-a-sidecar; `latest*.yml`/`nightly*.yml` por canal | `scripts/build-desktop-artifact.ts:2948`; `docs/operations/release.md:483`; `:531-532` |
| 3.11 | O CLI é um Node single-executable (SEA) em 5 alvos; **não existe macOS x64** porque o binário segfaulta | `docs/operations/release.md:47-49` |
| 3.12 | O archive do CLI leva `t3` + `client/` + `node_modules/` + `resource-monitor/` + `libatomic` no Linux, e roda sem Node, npm ou compilador | `scripts/build-cli-archive.ts:636-649` |
| 3.13 | `npx t3` é só um launcher: baixa o archive exato da release, confere `SHA256SUMS` e extrai em `~/.t3/runtime/versions/<version>` | `scripts/npm-launcher/t3.mjs:13`; `:69`; `:79`; `:171` |
| 3.14 | O JS (servidor, cliente web e main do Electron) é construído **uma vez** no job `build_bundle` e entregue como artefato aos 6 jobs de plataforma | `docs/operations/release.md:33` |
| 3.15 | Bytecode V8 do servidor é gerado no `afterPack` com o próprio Electron empacotado e semeado por hardlink/symlink; nenhum byte de cache é copiado no startup | `docs/operations/development.md:271-286`; `scripts/lib/server-compile-cache.ts:91-98` |
| 3.16 | O main process é empacotado em CJS **sem code splitting**; nativos e `electron` ficam externos ao bundle | `apps/desktop/vite.config.ts:59-71` |
| 3.17 | Módulos nativos: `node-pty` (terminal), `@napi-rs/keyring` (segredos/cookies), `ffi-rs` (Win32), `@crowecawcaw/xa11y` (acessibilidade), `playwright-core` (browser), `transcribe-cpp` (voz), `@ff-labs/fff-node` (busca) e `dbus-next` (portais Linux) | `apps/server/src/terminal/NodePtyAdapter.ts:38-42`; `apps/desktop/src/preview/BrowserImport/ChromiumKeys.ts:58-60`; `apps/server/src/workspace/WorkspaceSearchIndex.ts:13`; `apps/server/src/speech/native.ts:203-222` |
| 3.18 | **Nenhum nativo carrega no main no caminho de startup**: `xa11y` roda em filhos Node e `ffi-rs` carrega lazy | `docs/internals/overview.md:125-130` |
| 3.19 | O monitor de recursos é um binário Rust separado; amostra só com assinantes ao vivo e retém no máximo 64 MiB / 20.000 entradas | `docs/internals/resource-telemetry.md:3-12`; `native/resource-monitor/src/main.rs:14-25` |
| 3.20 | O backend roda em processo filho Electron-as-Node, separado do main | `apps/desktop/src/backend/DesktopBackendConfiguration.ts:536` |
| 3.21 | O bootstrap do servidor é limitado a 1 MiB para preservar o ganho de memória do launcher de serviço | `apps/server/scripts/cli.ts:160-167` |
| 3.22 | Limites de memória: extração de documento em filho com heap de **192 MB**, terminal com 5.000 linhas/8 MiB e histórico com ~1 MiB por página | `apps/server/src/provider/DocumentText.ts:78`; `docs/user/terminal.md:3`; `docs/internals/performance-regressions.md:15` |
| 3.23 | Observabilidade de memória: atribui crescimento a partir de 8 MB por span e emite `server.heap.spike` a partir de 128 MB; event loop considera stall ≥2 s, amostrado a cada 30 s | `apps/server/src/observability/HeapAttribution.ts:10-11`; `apps/server/src/observability/EventLoopMonitor.ts:22-24` |
| 3.24 | O browser embutido do servidor sobe Chromium com `--disable-gpu` (composição por software, WebGL via SwiftShader) | `apps/server/src/preview/ServerBrowserContexts.ts:98-101` |
| 3.25 | Sandbox: janela principal com `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; webview de preview também `sandbox=true` | `apps/desktop/src/window/DesktopWindow.ts:412-418`; `apps/desktop/src/preview/WebviewPreferences.ts:1-3` |
| 3.26 | CI monta 6 jobs de desktop; Windows empacota em runner Linux e valida os nativos em runner Windows | `.github/workflows/release.yml:634-785`; `docs/operations/release.md:34` |
| 3.27 | Caches de build: download do Electron (evita **130 MB** por worktree), pnpm store, install staged sem lockfile, alvo Rust e task cache remoto com retenção de 7 dias/64 GB | `.github/workflows/ci.yml:91-97`; `apps/desktop/scripts/ensure-electron-runtime.mjs:119-122`; `infra/task-cache/README.md:63` |
| 3.28 | Telemetria de build: cada task do Vite enfileira um evento com `savedMs` (hit local/remoto) e o envio roda em processo Node separado | `infra/task-cache/src/telemetry.ts:80-87`; `:162-164` |
| 3.29 | Licenças: o build web emite `third-party-licenses.json` ao lado do `index.html` e **falha** se um pacote não tiver identificador ou texto de licença | `docs/internals/open-source-licenses.md:5-11`; `:27-30` |
| 3.30 | Toolchain fixa: `engines.node` 26.12.1 exato, `packageManager` pnpm 12.14.0; `allowBuilds` só compila `node-pty` | `package.json:70-73`; `pnpm-workspace.yaml:18-27` |

---

## O que a Persona deve copiar, em ordem

1. **Splash inline no HTML + tema síncrono no `<head>`** (`apps/web/index.html:13`, `:674-681`). Resolve o P0-6 e o P0-25 sem tocar em React.
2. **Compile cache V8 pré-gerado no empacotamento** (`scripts/lib/server-compile-cache.ts:105-133`; `apps/desktop/src/compileCache.ts:17-21`). Ataca o pior caso: primeiro start depois de instalar/atualizar.
3. **Backend em processo filho, janela revelada em `ready-to-show`, `backgroundThrottling: false` até lá** (`DesktopBackendConfiguration.ts:524-536`; `DesktopWindow.ts:404`, `:414`).
4. **Prontidão por polling curto em endpoint público** (`DesktopBackendManager.ts:39-40`), em vez de sleep fixo.
5. **Code splitting por rota + `router.load()` antes do primeiro render** (`apps/web/vite.config.ts:282`; `apps/web/src/main.tsx:37-39`).
6. **Virtualização com tipo de item** (`MessagesTimeline.tsx:1431-1438`) — o bucket por tamanho é o detalhe que impede o loop de medição.
7. **Caches com teto explícito** (markdown ~10 MB, highlight 50 MB, fórmulas 4 MB) e **workers com TTL ocioso** (`markdownRenderer.ts:24-25`; `MarkdownCodeBlock.tsx:32-33`; `MathTypeset.tsx:8`; `DiffWorkerPoolProvider.tsx:21`).
8. **`content-visibility: auto`** para listas que não valem virtualizar (`SidebarThreadRow.tsx:1205`).
9. **Animações pausadas fora da tela + `steps()`** (`index.css:582-583`, `:295-300`).
10. **Budgets com gate de CI** (1 MiB de rows, 128 eventos, 500 rows, 75 rows) — `docs/internals/performance-regressions.md:15-17`, `:31-33`.

## O que **não** copiar

- **Empacotamento em 6 alvos com sidecar ASAR e assinatura Azure** — a Persona é Windows primeiro; o custo de manter isso antes do instalador existir não se paga.
- **CLI SEA em 5 alvos** — não temos CLI pública.
- **Browser embutido com Chromium** (`--disable-gpu`, SwiftShader) — é o maior peso de memória do T3 e não é o nosso produto.
- **React Compiler como exigência de build** — vale se a equipe já escreve no estilo dele; impor isso agora troca um problema de performance por um de adoção.
- **`settings.json` esparso com watcher** só compensa depois que existir uma tela de configurações com herança (§10.31).

## Medição

Nenhum tamanho de instalador está escrito no repo (só 130 MB do download do Electron e 120 MB do Chromium headless). **Não publique número de tamanho nem de tempo de boot antes de medir o nosso** — a regra da casa é "nunca inventar".

<!-- APPEND -->

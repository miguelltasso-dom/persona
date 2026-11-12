# Onyx — relatos de implementação (colheita)

## 11/11 22:35 — Item 8 (fatia Codex/Cursor/OpenCode) VERDE + Item 17 motor (Chrome + perfis + vez) VERDE

**Sala limpa:** nada copiado do clone; a única leitura foi de ADRs (ideia) e do `AGENTES-CHAT.md`. `check-cleanroom` não aponta nenhum arquivo meu.

### Item 8 — o porteiro nos motores que não são o Claude

- **Codex 0.167.1: hooks existem, mas não despacham.** `scripts/persona/codex-hooks-dry.mjs` (prova seca, provedor Responses falso, zero modelo) mede as quatro propriedades: o app-server **descobre** o hook (`hooks/list` → `preToolUse`), o estado `[hooks.state."<key>"] trusted_hash` o deixa **trusted**, e **nada é despachado** — nem `PreToolUse`, nem `SessionStart`/`UserPromptSubmit`, nem em `codex exec` nem numa volta do app-server; o comando roda. Resultado em `.maestri/tmp/codex-hooks-dry.json`. Consequência: Codex segue **falha fechada** (conector só leitura; escrita confinada pelo sandbox `workspace-write`).
- **Cursor: falha fechada de verdade.** `resolve/cli-policy.ts#cursorPolicy` nega `Bash`, `Shell`, `Write`, `Edit`, `Delete` e `ApplyPatch` com **qualquer** grant; só o grant de web passa. Teste em `cli-policy.spec.ts` falha se alguém reabrir.
- **OpenCode: o bloco estático do Lumen, ligado.** `resolve-runner.ts` passa `OPENCODE_CONFIG_CONTENT` (de `authority/opencode-config.ts`) em toda chamada: `bash` sempre `deny`, `edit` só com grant e rascunho, `external_directory` `deny`. Prova no CLI real (zero modelo): `OPENCODE_CONFIG_CONTENT=… opencode debug config` resolve o bloco. Teste em `resolve-runner.spec.ts`.
- **Fonte única:** a tabela e o `judgeCommand` são do Lumen (`R/authority/`); os meus duplicados (`R/resolve/command-policy.ts`, `R/oar/opencode-gate.ts`) foram apagados antes de integrar.
- **Provas:** `persona-runners` 83 arquivos / 664 testes verdes; `check-pkg` limpo nos meus arquivos.

### Item 17 — o navegador é o Chrome do Windows (motor)

`H/browser/`:

- `chrome.ts` — acha o Google Chrome nas três pastas padrão, lê a versão pela pasta ao lado do `chrome.exe`, recusa um Chrome **maior** mais velho que o que já rodou no perfil, e monta as flags (perfil do produto, porta de depuração em loopback, headless com user agent real, `--test-type` quando headed, chave de login por plataforma).
- `launch.ts` — sobe o Chrome num perfil descartável, espera o endpoint DevTools, mata a árvore (`taskkill /T`) e limpa `Singleton*` de um crash anterior.
- `turn.ts` — **a vez**: lease de 2 min, persona sem grant não pega, persona nunca toma de persona, a pessoa toma de persona e nunca de outra pessoa, e quem perdeu a vez **não manda comando**.
- `profiles.ts` — perfil nomeado (nome único sem caixa), grant por persona (com `*`), uma pasta por perfil.
- `service.ts` — um Chrome por perfil, aberto só para quem tem a vez; `close`/`closeAll`; estado para a tela.

**Provas reais, sem modelo:** `scripts/persona/chrome-dry.ts` → Chrome 157.0.8103.51 do Windows, perfil descartável, DevTools em ~819 ms. Encadeamento completo: nosso launcher + `chrome-devtools-mcp --browserUrl` → `list_pages` devolve `about:blank [selected]`. 26 testes (`browser-chrome`, `browser-turn`, `browser-service`).

**Persistência:** `profile-store.ts` grava `browser-profiles.json` no data folder de forma atômica (temp + rename); arquivo ausente ou editado à mão vira lista vazia, nunca crash. `BrowserService` avisa o host (`onChange`) depois de criar/renomear/conceder/revogar.

**Prova da vez, com o Chrome real:** `scripts/persona/browser-turn-dry.ts` — persona sem grant recebe `no-grant`; a Bia pega a vez e abre o Chrome 157; o Téo recebe `busy` com quem segura e desde quando; a pessoa assume o controle; a próxima abertura da Bia é recusada; a pessoa devolve e a vez fica livre. 31 testes nos quatro specs do navegador.

**Decisão do Keel (22:39):** (A) servidor MCP separado por turno, com o `chrome-devtools-mcp` anexado ao Chrome do perfil. Condições: só persona com grant e com a vez; ferramentas do navegador passam pela tabela do Lumen (navegar/ler/capturar permitido; `evaluate_script` e `upload_file` negados; senha só no Cofre v2); Cursor com capacidade explícita "sem navegador"; peso medido.

**Peso medido:** `chrome-devtools-mcp` 1.9.0 = **13 MB** (348 arquivos, bundle fechado, **zero Chromium/binário nativo**): `third_party/index.js` 7,5 MB (puppeteer-core) + lighthouse 3,9 MB + formatter worker 0,6 MB. Aceito pelo Keel nesta fatia (6,5% do teto de 200 MiB da D-101); depois se avalia o on-demand.

**`sessionFor`:** o que um turno chama — resolve o perfil (pelo nome, ou o único liberado), pega/renova a vez e abre o Chrome; sem perfil, sem grant ou com outra pessoa dirigindo, falha com frase de tela.

**Pendências (donos):** Cobalt — gancho no `adapter.ts` para um segundo servidor MCP por turno (`mcpServers = [binding.server, ...extra]`), já pedido. Lumen — linha da tabela para as ações do navegador e a capacidade por CLI (`browser: GateKind`?) em `cli-gates.ts`. Muse — 1 tela curta (lista de perfis, "Assumir controle"/"Devolver", vazio, Chrome ausente, linha do Cursor), pedida. Sem essas três não cruzo dono.

## 11/11 23:00 — Item 17: turno, janela compartilhada e composição do host

- **Erros de tipo do Tally corrigidos:** eram os meus dry-runs (`scripts/persona/chrome-dry.ts` e `browser-turn-dry.ts`: `process.argv[i]` é `string | undefined`). `host aggregate` compila; o erro do client (`persona-choice-card.client.spec.tsx:146`) não é meu.
- **`evaluate_script` negado na origem:** `browserMcpServer()` passa `--no-javascriptEvaluation` (o chrome-devtools-mcp 1.9 desliga `evaluate_script`, `initScript` e URLs `javascript:`). A negação não depende de filtro do CLI. Prova com o Chrome real: o servidor sobe com as flags, anuncia **28 ferramentas sem `evaluate_script`** e `list_pages` devolve `about:blank [selected]`. `upload_file` fica restrito ao workspace padrão (temp) do servidor.
- **Janela compartilhada = headed.** O Chrome do perfil sobe com janela: é nela que a pessoa vê a persona trabalhar e assume o controle; um Chrome headless não teria como ser assumido sem perder a página. O dry-run força headless (não abre janela na máquina de quem roda a prova).
- **A vez não vence com a sessão aberta.** Um Chrome aberto fixa o dono da vez (o lease de 2 min só vale entre turnos); `onTakeover` avisa o host quando a pessoa toma de uma persona, para o run dela parar.
- **`turn-browser.ts`:** `openTurnBrowser()` (perfil + vez + Chrome + entrada MCP) e `browserTurnOpener()` com recusa tipada e sem derrubar o turno: `sem-navegador` (Cursor), `sem-perfil`, `sem-vez` (ocupado), `sem-chrome`. `BrowserDeniedError` carrega a frase da tela.
- **`host.ts`:** `BrowserHost` compõe serviço + `browser-profiles.json` + a view da tela (quem dirige, personas com grant, perfil padrão de cada uma, Chrome presente) e as ações (criar/renomear/conceder/revogar/assumir/devolver/fechar).
- **Contrato (adição, Keel avisado):** `StartTurnInput.extraMcpServers?: readonly TurnMcpServer[]` em `R/contract.ts`. O caminho real é `OarSessionOptions.serversFor` em `R/oar/session.ts` (3 linhas, pedido ao Keel/Zinc) + `adapter.ts` (Cobalt) + `HostRunnerRequest.extraMcpServers` (meu).
- **Provas:** `chrome-dry` → Chrome 157.0.8103.51, DevTools 1468 ms; `browser-turn-dry` → grant/busy/pessoa assume/Bia recusada/devolve, com o Chrome real. 20 testes em `browser-service` + `browser-host`.

## 11/11 23:25 — Item 17: os ganchos entraram (host → CLI) e a tela existe

- **O caminho completo do servidor MCP:** `orchestration.browserOf` (1 por runner) → `HostRunnerRequest.extraMcpServers` → `OarSessionOptions.serversFor` → `StartTurnInput.extraMcpServers` → `adapter.ts` (`sessionOptions.mcpServers = [binding.server?, ...extras]`, `warmKey` com nome+comando+args e `resume`). Cursor (`mcpTools: 'unavailable'`) não recebe nenhum.
- **A vez dura o runner, não o turno.** Liberar a cada turno deixaria um runner quente com o servidor anexado e sem a vez; então o lease é liberado quando o runner é esquecido (`dropWarm`/`evictWarmRunners`/`disposeRunners`). "Assumir controle" da pessoa dispara `onTakeover`, que expulsa os runners quentes daquela persona — o CLI morre e nada mais é enviado ao Chrome.
- **Boot (`index.ts`):** `BrowserHost` com `dataRoot = dirname(databasePath)` (banco em memória usa `tmpdir`), `serverPath` de `Config.browserServerPath` ou `import.meta.resolve('chrome-devtools-mcp/...')` (ausente = "navegador não disponível nesta instalação", nunca falha de turno), `carriesMcp` lido das capabilities dos runners (sem segunda lista).
- **Remotes (8):** `browserView`, `createBrowserProfile`, `renameBrowserProfile`, `grantBrowserProfile`, `revokeBrowserProfile`, `takeBrowserProfile`, `releaseBrowserProfile`, `closeBrowserProfile` — todos com `requireProject`/`requireWrite` e devolvendo a tela inteira. Typert regenerado (40 pacotes).
- **Tela:** `C/browser/BrowserProfilesCard.tsx` (apresentação pura; ação sem handler não vira botão), `ConnectedBrowserProfiles.tsx` (Remote + equipe para o menu de liberação) e o cartão montado em Configurações › Conexões. Locale próprio `persona.browser` (pt/en + gerador; zh/ja/es/fr/de/ru espelham en).
- **Testes:** persona-runners 90 arquivos / 858 verdes, incluindo `session-extra-servers.spec.ts` (2: o turno leva os servidores que o opener deu; lista vazia não anexa nada); host browser 20/20; client card 8/8; `boot-fail-soft`/`engine-wait` 13/13; `check-cleanroom` PASSOU.
- **Dependência declarada:** `chrome-devtools-mcp` 1.9.0 entra em `persona-host/package.json` (dependencies, versão exata) — sem ela o `import.meta.resolve` não resolveria numa instalação limpa. Fail-soft provado por teste: com `serverPath` vazio o host sobe, a tela lista os perfis e o turno recebe `sem-navegador` com a frase da instalação; nada lança no boot.
- **Pendências de dono:** Lumen — linha da tabela de autoridade para as ações do navegador (`upload_file` negado por padrão; hoje o servidor já nega `evaluate_script` na origem e restringe arquivos ao workspace temp). Muse — leitura visual da tela.

## 12/11 00:32 — Item 15b (digitação cega de senha no navegador): motor + ferramenta

- **Motor (`H/browser/cdp.ts` + `blind-typing.ts`):** cliente CDP mínimo sobre o `WebSocket` global (só loopback). Confere a origem **exata** do frame e um `input[type=password]` visível, digita com `Input.insertText` e devolve só que digitou. Por 2 min vigia o endereço: senha que cai na URL (form GET, redirecionamento) vira `vazou-na-url`. `SecretMask` mantém o valor fora das saídas por 10 min (inclusive a forma URL-encoded).
- **Chrome:** o perfil do produto nasce com `credentials_enable_service=false` e `profile.password_manager_enabled=false` (`launch.ts`), então o navegador não guarda uma segunda cópia.
- **Ferramenta:** `browser_login` no harness (definição em `R/mcp/harness-tools.ts` na última posição; `case` em `H/harness-dispatch.ts`; porta `BrowserLoginPort` em `H/harness-ports.ts`; classificação `read` em `R/resolve/tool-level.ts`). O modelo só diz "entrar em <login do cofre>"; a resposta é `typed` + uma frase, nunca a senha nem a página. O livro de atividade guarda qual login, sem valor.
- **Quando é oferecida:** só no turno que está com o navegador aberto (`BrowserService.liveSessionOf`, sem efeito colateral) e quando o Cofre tem ao menos um Login. `StableTools` ganhou `browser_login` como ferramenta "sticky": oferecida uma vez, fica — o navegador abrir/fechar entre turnos não muda a lista (warmKey estável).
- **Provas:** `browser-blind-typing.host.spec.ts` (Chrome real + site local falso, 5/5): digita na origem certa sem a senha no resultado; origem diferente recusa sem digitar; página que joga a senha na URL é detectada; Preferences desligado; máscara expira. `browser-login-tool` 3/3 (nome/usuário/site, ambíguo recusa, origem exata) e `browser-login-port` 3/3 (sem navegador, login desconhecido, sem senha, ambíguo, máscara).
- **Gate (correção do Lumen, 00:24):** a tabela do navegador já estava pronta em `R/authority/browser-policy.ts` + `authority-table.ts` (ação `interact`), e `permission-gate.ts` julga `mcp__browser__*` com `configure({browser:true})`. Desfiz o meu patch em `resolve/tool-action.ts` (não duplicar tabela) e liguei o que faltava: `carriesBrowser: true` no `resolve()` quando o runner leva o servidor, e o navegador só é oferecido onde há gate por chamada — `hasBrowserGate(cli)` (hoje, o Claude), que também alimenta a linha "sem navegador" da tela. Codex/OpenCode/Cursor ficam sem o navegador até o Keel decidir o contrário. O gate do host já recebe `configure({browser:true})` pelo `nativeGateFor` (Lumen), então o navegador é julgado pela linha dele em qualquer caminho com gate. **Livro de atividade das interações (Keel autorizou, 00:48):** `action-bridge.ts#settle` drena `takeInteractions()` e entrega ao host (`onInteractions`), que grava uma linha por interação — `browser_click`/`browser_fill` com o site, nunca o valor; a tela já escreve "clicou em / preencheu em" (locale `persona.chat`). No gate próprio do runner as interações ainda não são expostas (Lumen ofereceu expor).
- **Pendente:** o cartão de 2FA continua sendo o `ask_vault_code` do Zinc (o modelo chama depois do login); a leitura de tela do cartão é da Muse.

## 12/11 01:05 — Item 24 (computador dedicado 24/7): fatias desta máquina

- **`H/station/admission.ts`:** admissão por RAM — piso de 1,5 GB + ~600 MB por CLI, fecha os CLIs ociosos em LRU antes de recusar, e uma recusa é `sem-vaga` (fila calma), nunca erro. Puro; 5 testes.
- **`H/station/power.ts`:** sem suspensão **enquanto há trabalho** — um PowerShell segura `SetThreadExecutionState(ES_CONTINUOUS|ES_SYSTEM_REQUIRED)` e é fechado quando a fila zera; nada de mexer no `powercfg` do sistema. Prova real: o script devolve o estado anterior (`2147483649`), e o holder vive enquanto segura e some ao liberar. 3 testes (um só no Windows).
- **`H/station/pairing.ts`:** código `XXXX-XXXX` de 8 caracteres sem ambíguos, TTL 10 min, uso único, **só o SHA-256** guardado; caixa e traços perdoados. 3 testes.
- **`H/station/tailscale.ts`:** detecta `tailscale status --json` e a interface `100.64.0.0/10`, diz ativo/parado/ausente e oferece `winget install Tailscale.Tailscale` — nunca loga por ninguém. 4 testes.
- **`H/station/station.ts`:** o estado que a tela e o host leem (pareada, ligada, RAM livre/piso/por CLI, fila, CLIs quentes, Tailscale) + `admitTurn`/`noteTurnEnded` para o Windows só ficar acordado com trabalho. 4 testes.
- **`H/station/pairing-port.ts`:** contrato `StationPairingPort` (publish do hash + espera do hello) para o item 23 do Bolt plugar o WS E2EE sem eu tocar no E2EE.
- **Provas:** 19 testes nos cinco arquivos; `oxlint` limpo; `tsc` do host sem erro nos meus arquivos.
- **Host:** `Station` no boot (`freemem()` real) + 4 remotes (`stationView`, `issueStationCode`, `pairStation`, `setStationRunning`) e tipos `StationView`/`StationPairingCode`/`StationPairRequest`/`StationRunningRequest`; Typert regenerado (40 pacotes, `stationView` no remote client).
- **Tela:** locale `persona.station` (pt/en, gerado) pronto; o componente do cartão "Estação de Agentes" entra depois do congelamento do snapshot.
- **Falta:** o gancho de admissão no turno (precisa da lista de CLIs quentes do Cobalt) e o pareamento remoto (item 23 do Bolt).


## 12/11 01:54 — Congelamento do snapshot 1: dívida de oxlint e staging

- **Dívida de oxlint do commit:** zero nos meus arquivos. Rodei o config staged (`scripts/run-oxlint.ts --config .oxlintrc.staged.json`) em 27 arquivos de `H/station`, `H/browser`, `harness-*`, `tool-stability`, `R/mcp/harness-tools`, `R/resolve/tool-level`, `R/oar/session` e 2 scripts: 0 erros. Nos testes/client/index só sobraram 2 avisos de `eslint-disable` não usados em `index.ts` (linhas 673 e 2960), que não são meus.
- **Staging (congelamento):** a tela da Estação de Agentes está pronta em `.maestri/tmp/onyx/` — `StationCard.tsx`, `StationCard.module.css`, `ConnectedStation.tsx`, `station-card.client.spec.tsx`, `connected-station.client.spec.tsx` e `POS-CONGELAMENTO.txt` com os passos de aplicação. Nada em `packages/persona` ou `scripts/persona` foi tocado depois de 01:20.


## 12/11 02:13 — Estação de Agentes aplicada (pós-congelamento)

- **Tela:** `C/station/StationCard.tsx` (puro), `StationCard.module.css`, `ConnectedStation.tsx` (Remote + view) montada em Configurações › Conexões depois do cartão Navegador; locale `persona.station` (pt/en) já gerado.
- **Testes:** `station-card.client.spec.tsx` (5: estado/RAM/fila, Tailscale só quando ausente, código mostrado uma vez e pareamento, ligar/desligar, recusa do host em palavras) e `connected-station.client.spec.tsx` (2: carrega a view e pede o código) — 8/8 com o teste da aba Conexões.
- **Lint:** 0 erros nos arquivos novos com o config staged. **Dívida do commit:** nenhuma minha (as 2 diretivas sem uso em index.ts:673/2961 são do Forge, conforme a lista do Keel).
- **Falta:** o gancho de admissão no turno (precisa da lista de CLIs quentes do Cobalt) e o pareamento remoto (item 23 do Bolt).

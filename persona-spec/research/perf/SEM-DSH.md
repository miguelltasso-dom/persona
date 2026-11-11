# Persona sem o núcleo do DSH — estudo (11/11/2026)

Pedido do Atlas (11/11, 11:42): medir o que a Persona **realmente usa** do DSH e quanto custa um shell mínimo (main Electron + `persona-host` standalone + cliente estático + RPC próprio), em dias e em boot/RAM medidos. Divisão: **Cobalt** = desktop main, empacotamento e boot; **Zinc** = o que `client-ui-persona`, `persona-host` e `persona-runners` usam do DSH (servidor web, transporte RPC, plugins, auth, assets). Este arquivo é a entrega conjunta; a seção “Cobalt” é dele e pode ser reescrita.

## Resumo (a resposta)

1. **O peso é o núcleo do DSH em RAM e boot, não em disco.** No instalado limpo, o host fica pronto em **8,11 s / 401 MB**; o `persona-host` isolado sobe em **0,9 s / 93 MB** (HOST-BOOT.md). O núcleo do DSH custa **~308 MB e ~7,2 s** de boot. A poda de plugins do perfil rende só **−42 MB** (401→359 MB) — o resto é o núcleo (agente/sessão/ferramentas/equipe/web-app).
2. **Em disco, o núcleo do DSH é pequeno.** Os pacotes `@deepseek-ai/*` no asar somam **292 MB lógicos**, mas os pesos são LibreOffice **182 MB**, inspector experimental **22,4 MB**, `client-ui-persona` **15,9 MB**, preview de documento **14,1 MB**, `persona-host` **7,1 MB**, `dsh-web-frontend` **5,3 MB**; o núcleo do DSH (agente/sessão/ferramentas/equipe) é ~**20–40 MB** lógicos (~5–10 MB no instalador). O instalador de 329,6 MiB é a dieta (LibreOffice/Python/MinGit/locales/experimentais), não o núcleo.
3. **A Persona já é quase DSH-free no código.** O `persona-host` declara `static inject = ['typert']` e lê `personaRunners`, `webServer`, `personaVault` e `credentials` como **opcionais** (`ctx.get`). O `client-ui-persona` usa do runtime do cliente só `ctx.remote` (38), `ctx.locale` (36), `ctx.slots` (34) e `ctx.effect` (21). O `persona-runners` só toca o DSH no runner `dsh`, por uma porta mínima (`DshAgentPort`/`ctx.agents`); Claude/Codex/Cursor/OpenCode vão por OAR e são DSH-free.
4. **O shell mínimo é viável em ~1–2 semanas** (paralelo): manter o **RPC typert** + o **runtime de cliente do DSH** (slots/locale/remote/renderer/store) + um **servidor HTTP simples** + o `persona-host` + o cliente estático; **derrubar** agente/sessão/ferramentas/equipe do DSH e deixar o runner `dsh` **sob demanda**. Boot estimado **~3–3,5 s** (host 0,9 + main ~0,9 + cliente ~1,5–2) e RAM **~620 MB–1 GB** (host 93 + main ~176 + renderer ~197 + GPU 100–474 + utility 56). A meta de 550 MB depende do GPU/animações e do renderer, não do núcleo.
5. **Recomendação:** **emagrecer saindo do núcleo do DSH** (manter o DSH fino: typert + runtime de cliente + servidor simples) é mais barato e mais seguro que a base nova; a base nova só se o cliente/RPC também forem reescritos. A dieta do instalador é independente e continua.

## Medido (instalado limpo, C:/p8perf, 11/11)

| Etapa | Frio (`clean-cold2`) | Quente (`rss-baseline`) |
| --- | ---: | ---: |
| host ready (`dsh web:`) | **8,11 s** | 8,69 s |
| janela visível | 9,34 s | — |
| shell (`[data-persona-shell]`) | **10,97 s** | 12,05 s |
| host (inner, `dsh-desktop-host`) | **401 MB** | 396 MB |
| main Electron | 189 MB | 193 MB |
| renderer | 197 MB | 205 MB |
| GPU | 474 MB | 523 MB |
| utility | 56 MB | 60 MB |
| **total do app** | **~1,32 GB** | ~1,38 GB |

- **Main (CPU profile, 13,5 s):** `getOrCreateArchive` **200,9 ms** (0–0,5 s), `createWindow` 29,6 ms, `spawn` do host 21,4 ms; depois **ocioso de 1,5 s a 8,1 s** (espera o host).
- **Renderer (CPU profile, 12,5 s):** ocioso de 1,1 s a 8,1 s; pós-ready **2,86 s**: `materialize` **331,6 ms**, `(program)` **496,9 ms** (eval do bundle), request do bundle de plugins **520 ms**, `findNextMatchSync` 75,9 ms, `get` 56,9 ms, `send` 45,3 ms.
- **Buraco do host:** no frio limpo o host fica de **~2,6 s a ~3,7 s** com CPU parada (0,45 s) e leitura parada (14 MB): **~1,1 s** de espera própria (primeiro asar/AV ou cofre/DB). Com o pack do Rivet gravando 1,2 GB, o mesmo buraco ia a 2,5 s — o pack agrava, mas não é a causa inteira.
- **Dois processos de host:** o `dsh-desktop-host` (o host do perfil, 401 MB) e o processo Electron main (189 MB); o “host 414 MB” do baseline é o host do perfil.
- **Poda D-101a medida:** baseline 401 MB; candidato de 48 rows (controllers do web-app que a UI da Persona não usa + equipe/subagente/workflow/PTC/skills/goals/plan/todo/commands + títulos/user-questions/otel) = **359 MB (−42 MB, −10 %)** e o shell sobe. O candidato de 52 rows (também sem `session-controller`/`job-controller`/`settings-controller`/`account-controller`) = 329 MB, mas **quebra o boot do cliente**: `ui-session` (required) espera `sessions`; o welcome/locale também precisa de settings/account. Patch em `.maestri/tmp/zinc/prune/candidate.patch.yml`.

## O que o `persona-host` usa do DSH

- **Import estático:** só `@deepseek-ai/dsh-attachment-local` (1 uso, em `svg-to-png.ts`, para o `sharp` do SVG→PNG) e `@deepseek-ai/dsh-typert-protocol` (3). O resto são pacotes `dsh-persona-*`.
- **Serviço Cordis:** `static inject = ['typert']` — **o typert é o único serviço obrigatório**. `personaRunners` (4 usos), `webServer` (1), `personaVault` (1) e `credentials` (1) são lidos com `ctx.get` e são **opcionais**; `ctx.effect` (3) é o Cordis.
- **`webServer`:** só registra uma rota HTTP exata (webhook do GitHub); sem ele, a rota não existe. Os Remotes da pessoa vão pelo **typert**, não pelo webServer.
- **`credentials`/`personaVault`:** o cofre da conta/chaves; o `persona-vault` (DPAPI) é o dono; o `credentials` do DSH é fallback. O host funciona sem o `credentials` do DSH.
- **`personaRunners`:** o plugin `@deepseek-ai/dsh-persona-runners` (o próprio produto); o host pega o serviço. O runner `dsh` é o único que toca o agente do DSH (ver abaixo).
- **Conclusão:** o `persona-host` é **DSH-free** exceto o **typert** (o protocolo RPC) e o `sharp` do `attachment-local`. Um shell mínimo precisa de um typert (o `dsh-typert-registry` 0,12 MB + `dsh-api-gateway` 0,45 MB) e de um `sharp` (18,9 MB) — ou de um PNG próprio.

## O que o `client-ui-persona` usa do DSH

- **Serviços do runtime de cliente:** `ctx.remote` **38**, `ctx.locale` **36**, `ctx.slots` **34**, `ctx.effect` **21**; o resto (`ctx.theme`, `ctx.selectPanel`, `ctx.swapAccount`, …) são slots/serviços da própria Persona.
- **`dsh.client.inject`:** `api-remotes`, `client-locale`, `client-ui-primitives`, `client-ui-renderer`, `client-ui-slots`, `api-gateway`, `client-ui-plugin-manager`, `persona-host`; `external`: `api-gateway/client`.
- **Imports estáticos:** `dsh-persona-host` 120 (tipos/Remotes), `dsh-client-ui-slots` **103**, `dsh-api-remotes` **33**, `dsh-persona-core` 9, `dsh-client-store` 5, `dsh-client-locale` 3, `dsh-client-ui-renderer` 2, `dsh-typert-protocol` 1, `dsh-persona-usage` 1.
- **O que isso significa:** o acoplamento do cliente é o **runtime de cliente do DSH** (slots, locale, remote, renderer, store) + o **typert**; não é o web-app do DSH (as telas do DSH já estão desligadas no `persona-app/cordis.patch.yml`). O `client-ui-persona` (15,9 MB, com as ilustrações/poses/ícones) é o produto; o runtime do cliente é uma camada fina (~2–3 MB: `api-remotes` 1,38 + `api-gateway` 0,45 + `client-modules` 0,14 + `client-connection` 0,15 + slots/locale/store/renderer).
- **Assets:** as ilustrações/poses/ícones/fontes são servidos pelo protocolo `dsh-app://` do main (o `web-runtime`/`modules` do DSH); um shell mínimo serve os mesmos arquivos por um servidor estático simples.
- **Conclusão:** o cliente pode **manter o runtime de cliente do DSH** (slots/locale/remote/renderer/store) e **trocar o web-app do DSH** (modules/connection/web-runtime/web-frontend) por um boot estático + o typert. Reescrever o runtime de cliente é a alternativa caríssima (103 imports de slots + 33 de remote); não é necessária para emagrecer.

## O que o `persona-runners` usa do DSH

- **Import estático:** `dsh-goal-round-driver` (1) + os pacotes `dsh-persona-*`.
- **Runner `dsh`:** usa uma porta mínima `DshAgentPort` (`start`/`resume`/`cancel`/`usage`) ligada a `ctx.agents`; sem o agente do DSH, o runner responde `dsh agent port unbound` — **as CLIs externas (Claude/Codex/Cursor/OpenCode via OAR) continuam**.
- **Conclusão:** o agente do DSH é **opcional**: o runner `dsh` pode ser carregado sob demanda (quando a pessoa escolhe o motor DSH) ou removido do produto. É o único consumidor do núcleo do DSH no caminho do produto.

## O que o DSH faz no boot (e o que sai com ele)

- **O host do perfil (401 MB / 8,1 s)** carrega o `dsh-base` + `dsh-web-app` + `persona-app`: o agente, a sessão, as ferramentas, a equipe, o web server, o typert, os providers, o storage, o settings, o credentials, o web-app. O `persona-host` isolado (93 MB / 0,9 s) não carrega nada disso.
- **O núcleo do DSH = 401 − 93 = ~308 MB e ~7,2 s.** É o alvo do shell mínimo; a poda de plugins só tira 42 MB.
- **O main Electron (189 MB)** carrega o `main.js` do desktop + o Electron; o `getOrCreateArchive` (200,9 ms) é o primeiro acesso ao asar. O Cobalt cobre o main/empacotamento.
- **O renderer (197 MB)** carrega o runtime de cliente do DSH + o `client-ui-persona`; o pós-ready é 2,86 s (materialize 331,6 ms + eval 496,9 ms + bundle 520 ms). Um cliente estático com o runtime de cliente mantido deve ficar na mesma ordem; o ganho do shell mínimo é o **host** e o **web-app**, não o renderer.
- **O GPU (474 MB)** é o Chromium/compositor + as animações; não é o DSH. A meta de RAM de 550 MB depende das animações/blur (D-101b) e do renderer, não do núcleo.

## Shell mínimo — componentes, dias e estimativa medida

| Componente | O que fica | O que sai | Dias (estimativa) |
| --- | --- | --- | ---: |
| Main Electron | o main do desktop (Cobalt), a janela, o IPC, o `persona-host` filho | o `dsh` profile/asar como runtime do host | Cobalt: 2–3 |
| `persona-host` standalone | o host + o typert + o `persona-vault` + o `persona-runners` (sem o agente do DSH) + um `node:http` simples | o `dsh-base`/`dsh-web-app`/`persona-app` como perfil do host | 1–2 |
| RPC | o **typert** (`dsh-typert-registry` 0,12 + `dsh-api-gateway` 0,45 + `api-remotes` 1,38) | o web-app do DSH (controllers/modules/connection/web-runtime) | 0 (manter) ou 2–3 (JSON-RPC próprio) |
| Cliente estático | o `client-ui-persona` + o runtime de cliente do DSH (slots/locale/remote/renderer/store) + um boot estático (Vite/servidor simples) | o `dsh-web-frontend` (5,3 MB), o `web-runtime`/`modules`/`connection` do web-app, o preview de documento (14,1 MB) | 2–3 |
| Runner `dsh` | a porta `DshAgentPort` + o agente do DSH **sob demanda** (lazy) | o agente/sessão/ferramentas/equipe no boot | 1–2 |
| Empacotamento | o asar/app do shell mínimo (Cobalt) | os pacotes do núcleo do DSH não usados | Cobalt: 1–2 |

- **Total:** ~**6–10 dias** em paralelo (1–2 semanas com integração/testes). O caminho mais barato mantém o typert e o runtime de cliente; o caro é reescrever o cliente/RPC.
- **Boot estimado:** host **0,9 s** (medido) + main ~0,9 s (HOST-BOOT/Cobalt) + cliente ~1,5–2 s (o runtime de cliente mantido; o pós-ready atual é 2,86 s com o web-app do DSH) = **~3–3,5 s** até o shell; a janela <1,5 s depende do splash do P0 (Cobalt).
- **RAM estimada:** host **93 MB** (medido) + main ~176 MB + renderer ~197 MB + GPU 100–474 MB + utility 56 MB = **~620 MB–1 GB**. A meta de 550 MB não fecha só com o núcleo: precisa do GPU/animações (D-101b) e do renderer (cliente/bundle).
- **Instalador:** o núcleo do DSH é ~20–40 MB lógicos (~5–10 MB comprimidos); o instalador de 329,6 MiB é a dieta (LibreOffice 182, Python 144,5, MinGit 91,8, locales 48,3, experimentais 44,8, pnpm 20,5). O shell mínimo **não** substitui a dieta; as duas contas são independentes.

## Cobalt — desktop main, empacotamento e boot

Números do Cobalt (11/11, consolidado; a versão anterior foi sobrescrita pelo Zinc e os números dele foram mantidos na seção acima):

- **O main não importa DSH em runtime**: ele lança o `dsh-desktop-host` e serve os estáticos; o peso do main é o Electron + o `main.js` do desktop, não o núcleo do DSH.
- **O cliente usa do DSH**: slots (**98 de 598 arquivos**), `api-remotes` (24), `client-store`/`locale`/`renderer`. O resto do `client-ui-persona` é o produto.
- **Asar novo (v1.1.1, commit 28dbb7f000): 213 MiB / 23.445 entradas** (v1.1: 237,1 MiB / 24.395), `asar.unpacked` 232 MiB (antes 254,1), `locales` 2 (antes 55), `win-unpacked` 1.112 MiB / 8.157 arquivos (antes 1.264 MB / 8.218) = **−152 MiB instalados**. O `dsh-*` no asar caiu com a dieta (inspector/sherpa/cua fora; 0 entradas); a poda de rows não muda o asar, muda o que o host carrega.
- **Atribuição do boot do host** (`MEDICAO.md` §9): 498 módulos compilados do asar; `compileSourceTextModule` 0,75 s, `spawn` 1,18 s (criação de processos dos warmups), resolução ~0,44 s; `fs.readFileSync` do asar 0,13 s quente / **4,3 s frio** (antivírus varrendo o asar na 1ª leitura); `gh --version` 0,15 s. **Não é DB nem `gh`**: é carga de módulo + spawn.
- **Timeline do boot no artefato novo** (`boot-timeline.mjs`): `dsh web:` (host pronto) em **8,1 s**; janela visível em **123–201 ms** (P0); shell **10,4–12,6 s** (controle v1.1 9,9–10,2 s; host pronto 7,2 s). O splash visível durante o boot custa ~0,5–2,4 s de shell.
- **Poda de backend (D-101a, commit 89394edad8)**: 38 rows fora; host **396 MB** (antes 436–440), CPU de boot 5,5 s (antes 7,4); boot-smoke 9/9 verde. O que sobra é o núcleo DSH que o cliente usa (connection/typert/webserver/session/llm/storage) + persona-host + OAR.
- **Pendente do Cobalt**: o custo do main no shell mínimo (sem o `dsh` profile como runtime do host), o empacotamento do shell e o boot do Electron; o lado do cliente (slot estático + RPC). Contrato do cliente estático no `PLANO.md` (P0.5).

## Respostas ao Cobalt (host/RPC/web server)

**(a) O que o `persona-host` exige de verdade.**

- **`typert` (obrigatório, `static inject = ['typert']`)**: o host estende `TypertRemoteService`; os métodos `@Remote` são registrados no `typert` e servidos pelo `api-gateway` (`dsh-typert-registry` 0,12 MB + `dsh-api-gateway` 0,45 MB + `dsh-api-remote-access` 0,13 MB). A assinatura que o host usa é a do protocolo: `TypertRemoteService` + `remoteMethods()` (o metadata dos `@Remote`) + o gateway HTTP; o cliente fala pelo `api-remotes` (1,38 MB) sobre o `connection`.
- **`webServer` (opcional)**: `ctx.get('webServer')` devolve `{ register(route: { kind: 'exact'; path: string; handler(req: IncomingMessage, res: ServerResponse): void | Promise<void> }): () => void }`. O host registra **uma** rota (webhook do GitHub) e devolve o disposer; sem o serviço, a rota não existe. Os Remotes **não** passam por ele: vão pelo `typert`/`api-gateway`.
- **`connection` (cliente)**: o transporte do `api-remotes` (fetch/SSE sob `/api`, com a política de loopback/`trustedHosts`); é um pacote de cliente de 0,15 MB. O host não usa `connection` diretamente.
- **`credentials`/`personaVault` (opcional)**: o cofre da conta/chaves; o `persona-vault` (DPAPI) é o dono; o `credentials` do DSH é fallback. O host funciona sem o `credentials` do DSH.
- **`personaRunners` (opcional)**: o plugin do produto; o host pega o serviço. O runner `dsh` é o único que toca o agente do DSH (`DshAgentPort`/`ctx.agents`); as CLIs externas (OAR) não.
- **`sharp`/`attachment-local`**: o host usa o `sharp` (18,9 MB) para SVG→PNG; é o único import de pacote DSH do host.

**(b) Custo de um RPC próprio + container sem Cordis.**

- **Manter o typert + o Cordis** (o caminho barato): **0 dia**; o typert é o RPC (os `@Remote`, o ACL do `remote-guard`/`auth`, o proxy do cliente) e o Cordis é 0,17 MB. O host já é um plugin Cordis (`static inject=['typert']`).
- **RPC próprio (JSON-RPC/HTTP) sem typert**: replicar o metadata dos `@Remote` (~100 métodos), o ACL (`remote-guard`/`auth`), o dispatch, o proxy do cliente, os erros tipados e o streaming (`followMessages`/SSE): **3–5 dias**.
- **Container sem Cordis**: substituir `ctx.get`/`ctx.effect`/o ciclo de vida dos plugins do host + o `TypertRemoteService` + os plugins `persona-runners`/`persona-vault`/`persona-usage`: **1–2 dias** (o `ctx.get`/`effect`/`on`/`emit` e os disposers; o Cordis é pequeno, não é o peso).
- **Servidor HTTP próprio** (`node:http` + o `register` do webServer + os estáticos + o webhook): **1–2 dias**.
- **Cliente estático** (o runtime de cliente do DSH mantido; o `modules`/`connection`/`web-runtime` do web-app trocados por um boot estático + o `api-remotes`): **2–3 dias**.
- **Total**: o **DSH fino** (typert + Cordis + runtime de cliente + servidor simples) ~**3–6 dias** em paralelo; o **RPC/container próprios** somam **+4–7 dias**. Recomendação: manter o typert/Cordis (0 dia) e trocar só o web-app.

**(c) RSS/boot do host standalone com os substitutos.**

- **Medido (HOST-BOOT.md, bundle de produção)**: `persona-host` isolado **0,9 s / 93 MB** (primeira chamada `listProjects` em ~2 ms); o host não é o gargalo do boot.
- **Com os substitutos** (typert + `node:http` + `persona-vault` + `persona-runners` sem o agente do DSH): **~1,0–1,2 s / ~100–120 MB**; o `sharp` é lazy (~20–30 MB quando o SVG→PNG roda).
- **Perfil mínimo no app** (as linhas do `dsh-base`/`dsh-web-app` pesadas desligadas, o typert/api-gateway/webserver + o `persona-*` mantidos): estimativa **~150–200 MB / ~2–3 s**; a medição é o próximo experimento (o protótipo de 1–2 h).
- **Shell completo** (host + main + cliente + GPU): **~3–3,5 s / ~620 MB–1 GB**; a meta de 550 MB depende do GPU/animações (D-101b) e do renderer, não do núcleo.

## Protótipo (1–2 h)

- **Feito/medido**: o `persona-host` isolado (0,9 s / 93 MB) e o app completo (8,11 s / 401 MB) — o delta é o núcleo.
- **Primeiro corte (11/11, 12:30)**: o perfil sem o `web-runtime`/cliente falhou no main com `DesktopHostFatalError: Cannot read properties of undefined (reading 'authenticatedUrl')`: o `web-runtime` é quem produz a URL autenticada do ready. O perfil mínimo tem de manter o `web-runtime` + as linhas de cliente **required** (`ui-session` → `sessions` → `session-controller`/`session`) — ou o main precisa de um ready próprio. O próximo corte mantém o `web-runtime` + o runtime de cliente + a sessão do DSH e derruba só o agente/ferramentas/equipe/LLM.
- **Segundo corte (11/11, 11:55)**: mesmo com o `web-runtime` mantido, o main continua falhando em `authenticatedUrl` — o ready do `dsh-desktop-host` espera o contrato completo do web-app (URL autenticada + auditoria de entradas required), não só o `web-runtime`. Conclusão: o perfil mínimo **no app atual** não é o caminho de medição; o host standalone (o `persona-host` + typert + `node:http`, 0,9 s/93 MB medido) é o número válido, e o shell mínimo troca o ready do main (lado do Cobalt) em vez de mutilar o perfil. O cliente estático é o lado do Cobalt. O `boot-trace.mjs` (`.maestri/tmp/zinc/`) já mede host/RSS/renderer/rede; o perfil mínimo é uma cópia do home com o `cordis.patch.yml` reduzido. O host direto (`host-prof.mjs`) falha no cofre (DPAPI) sem o Electron; o app é o caminho.

## P0.5 — cliente estático: o que o cliente precisa (Zinc)

O boot atual (`packages/client/web/src/boot.ts`) faz `await __DSH_BOOT_READY__?.promise` **antes** de criar o `__ModuleLoader__`; o `__ModuleLoader__`/`__DSH_BOOT__` vêm das injections do host (`webserver/index-inject` → `collectIndexInjections`), e o `__DSH_TRANSPORT__` (bundle/assets) vem da `connection`. O cliente estático:

1. **O pack gera o `index.html` + o `__DSH_BOOT__`/`__ModuleLoader__`** a partir do bundle já empacotado (as mesmas linhas do `collectIndexInjections` para o grafo de módulos + o tema padrão; as linhas por Peer/acesso ficam para o ready do host). Arquivos: `packages/client/modules` (o manifest), `packages/host/webserver` (`renderIndexInjections`), o pack do desktop.
2. **O `boot.ts` não espera o gate para carregar os módulos**: o `__DSH_BOOT_READY__` do índice estático resolve na hora; o `__ModuleLoader__`/`__DSH_BOOT__` estáticos; o `getStaticModules`; o shell monta; o `__DSH_TRANSPORT__` chega depois.
3. **A `connection`/`api-remotes` aceitam transporte tardio**: a primeira chamada espera o ready; o `streamBaseUrl`/as injections do host chegam no `dshDesktopBoot.ready()`.
4. **O preload (`apps/desktop/src/preload-app.ts`) separa `boot.pending` (o índice estático) de `boot.ready` (o host)**; o main serve o índice antes do host e o ready vira `{ window, staticShell }`.
5. **A UI (Prism) mostra “acordando o time”** até o host responder.

**Dias:** o boot/transporte do cliente 1–2; o índice/manifest no pack 1 (Cobalt); o preload/main 1 (Cobalt); a UI 0,5 (Prism); total ~2–3. **Risco:** o manifesto de módulos tem de bater com o bundle empacotado (a versão/`rev`); o acesso por Peer (o token) só chega no ready; a primeira chamada (`listProjects`) espera o ready.

## Riscos e limites

1. **O runtime de cliente do DSH** (slots/locale/remote/renderer/store) é a fronteira do cliente; mantê-lo é o caminho barato, mas ainda é DSH. Reescrevê-lo é a base nova do cliente.
2. **O typert** é o RPC; mantê-lo é 0 dia e preserva os `@Remote`/ACL; trocar por JSON-RPC próprio é 2–3 dias e reescreve o proxy do cliente.
3. **O runner `dsh` sob demanda** precisa do agente/sessão/ferramentas do DSH; o lazy load tem de ser honesto (a primeira Tarefa no motor DSH paga o boot do núcleo).
4. **O `sharp`/`attachment-local`** (18,9 MB) é usado pelo SVG→PNG do host; um shell mínimo precisa dele ou de um PNG próprio.
5. **O `webServer`/`credentials`** do host são opcionais; o webhook do GitHub e o cofre têm de ser re-ligados no shell mínimo (o `persona-vault` cobre o cofre; a rota do GitHub vira um `node:http`).
6. **A medição do cliente estático** não foi feita neste estudo; a estimativa usa o renderer atual (197 MB, pós-ready 2,86 s). Um protótipo de 1–2 h mede o host standalone + um servidor simples; o cliente precisa de um boot estático para medir de verdade.
7. **O instalador** não é o núcleo do DSH; a dieta (D-101c) e o shell mínimo são contas separadas. Não vender o shell mínimo como corte de instalador.

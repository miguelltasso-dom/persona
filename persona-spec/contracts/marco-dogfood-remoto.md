# Marco dogfood · M5 — acesso remoto SEM Cloudflare (contrato do host)

**Dono:** Bolt (host, pareamento, bind). **Cliente web/celular:** Cobalt + Prism (Casa compartilhada) + Muse (desenho). **Segurança:** Lumen revisa. **Empacotar:** Rivet. **Estado:** DESENHO (12/11 14:40). Código só em staging (`.maestri/tmp/bolt/marco/`) até o Keel avisar "candidato validado" (~15:15). D-115: o acesso remoto liga só depois de auditoria própria (revisor independente); até lá nasce DESLIGADO (§9).

Critério 5 do marco (PLANO-COLHEITA, ajuste do Miguel 14:30): o celular e o navegador abrem a MESMA Casa do desktop (estilo Discord) do PC dedicado, pelo Tailscale, com código de pareamento, nunca na internet aberta. Dá para mandar mensagem a PESSOAS e a PERSONAS; só persona ATIVA (PC ligado e rodando) aparece como disponível; senha e Cofre só pelo PC; "segure para aprovar" funciona no toque; "Esta noite" e "Espera você" são atalhos da Casa.

## 1. Decisão em uma frase

O PC dedicado abre **uma segunda porta** (o "portão remoto"), presa só ao IP do Tailscale (100.64.0.0/10), que atende pessoas PAREADAS por código como **Peer não-dono** do Gateway (`paired`), com uma **lista fechada** de métodos e a identidade de um **membro** fixada no pareamento. A porta de loopback do Electron e o Peer dono não mudam.

## 2. O que o código de hoje já dá (fatos lidos, não suposições)

| # | Fato | Onde |
|---|---|---|
| F1 | O host do desktop é o host Node do Harness: `WebServer` em `127.0.0.1:0`; o Electron fala por `file://` + IPC; navegador entra por token de lançamento → cookie assinado → UM `browserPeer` com principal **dono**. | `apps/desktop-host/src/index.ts`, `packages/client/connection/src/rpc-host.ts:94,133` |
| F2 | `WebServer` aceita UM IP concreto e rejeita curinga (`0.0.0.0`, `::`) já na carga. Cerca de Host/Origin: Host = loopback, IP do bind ou `trustedHosts`; `sec-fetch-site: cross-site` recusado. | `packages/host/webserver/src/index.ts:362`, `connection/src/api-request-trust.ts` |
| F3 | `PrincipalMap` é extensível; `RemoteAccessService.registerPolicy(kind, policy)` define o que um principal NÃO-dono pode chamar; **sem política ou sem binding = recusa** (`remote-access/denied`), decidida ANTES de resolver ids ou decodificar argumentos. Dono nunca é checado. | `packages/api/remote-access/src/index.ts`, `typert/protocol/src/types.ts:455` |
| F4 | Precedente: o Liveshare cria Peers de espectador com `connection.createPeer({ principal })` e despacha as chamadas ao Gateway com esse Peer. | `packages/experimental/liveshare/src/host/viewer-lifecycle.ts:294` |
| F5 | `PersonaHost` é UM serviço; a identidade da ACL é `this.sessionMemberId` (campo do serviço, só os testes mexem). O ponto único é `actorOf()`; `requireStreamWriter` já trata "sessão ligada". Hoje toda chamada é "o dono ao teclado". | `persona-host/src/index.ts:9114, 9771, 982` |
| F6 | Já existem: `PairingBook` (8 caracteres `XXXX-XXXX`, só o SHA-256 fica, 10 min, uso único, 5 erros trancam 10 min), `REMOTE_STRICT_LIMITS.pairStation` (5/10 min), `readTailscale()` (acha o IP 100.64/10 e o estado), `requireMachineOwner`. | `persona-host/src/station/{pairing,tailscale}.ts`, `remote-guard.ts` |
| F7 | `RemoteTeamHost.presence()` (item 23, hub) diz quem está online; o gate de ficha (`sheetGate`) e a prontidão do motor dizem se uma persona pode rodar. | `remote-team.ts`, `orchestration.ts` |

## 3. Modelo de ameaça

| Ameaça | Resposta |
|---|---|
| **A1 Internet aberta** | Só existe listener no IP do Tailscale. Sem Tailscale ativo = sem listener (nunca cai para outra interface). Teste de aceite: a mesma porta em `127.0.0.1` e no IP da LAN RECUSA. Regra de firewall do instalador (Rivet): entrada só de `100.64.0.0/10`. |
| **A2 Outro nó do tailnet** (colega, aparelho comprometido, ACL frouxa do Tailscale) chega à porta | Sem sessão pareada só enxerga a página de parear e `POST /remote/pair`. Código de 8 caracteres (~40 bits), 10 min, uso único, hash, comparação em tempo constante; **5 erros de UM endereço trancam ESSE endereço** (recuo exponencial: 1 min, 2, 4… até 1 h; `429` + `Retry-After`) e **não atrapalham o dono nem outro aparelho** (Lumen, 14:55: um nó malicioso não pode fechar o pareamento do dono errando 5x); só o teto GLOBAL (30 erros por hora, contados só com código aberto) QUEIMA os códigos abertos e tranca o livro 10 min (o dono gera outro); **os contadores e a trava vivem NO DISCO** (reiniciar não zera). **O código sozinho NÃO basta: o dono APROVA no PC** ("O celular *Pixel da Ana* (100.x.y.z) quer entrar · Aprovar / Recusar"; §5). Cada pareamento novo notifica o dono. O código nunca vai a log, URL, auditoria nem mensagem de erro. |
| **A3 Celular perdido/roubado** | Sessão por aparelho, revogável no PC ("Celulares ligados › Desligar"): derruba streams e sockets em ≤ 1 s. Validade: ociosa 7 dias, absoluta 30 (valores do Lumen). Chave "Desligar acesso remoto" fecha a porta. A sessão remota nunca vale para Cofre, senha, backup, diagnóstico, diálogo de pasta, pareamento. |
| **A4 Quem fotografa o código** | Aparece só no PC (`requireMachineOwner`), vale 10 min, funciona 1 vez; depois da 1ª troca a foto não vale nada. |
| **A5 Página maliciosa/DNS rebinding/CSRF** | Cerca no portão: `Host` = `<ip-tailnet>:<porta>` (ou o nome MagicDNS configurado), `Origin` igual, `sec-fetch-site` ≠ cross-site; cookie `HttpOnly; SameSite=Strict; Path=/`; POST exige cabeçalho próprio (`x-persona-remote: 1`). |
| **A6 Cliente remoto tenta escalar** | Principal `paired` é NÃO-dono: **lista fechada** `PHONE_ALLOW` (um arquivo; cada nome com teste) + recusa por padrão do Gateway (F3). Teste gerado da lista COMPLETA de Remotes: tudo fora da lista recusa. Quem muda a lista muda um teste de propósito. |
| **A7 Autor falso** | O autor é a sessão: `request.actorId` ≠ membro da sessão = `forbidden` (já é a regra de `requireStreamWriter` para sessão ligada). |
| **A8 Texto de terceiros no fio** | Não muda: dado externo continua cercado; o celular só lê/escreve como o membro. |
| **FORA do modelo (dito, não prometido)** | Quem controla a conta Tailscale do Miguel (pode pôr nó novo; ainda precisa de um código aberto no PC); malware no PC; PC desbloqueado nas mãos de outro. |

**Transporte.** O túnel do Tailscale (WireGuard) já cifra de nó a nó, e os relés DERP só carregam pacote cifrado: não há relé NÃO-confiável a esconder. Por isso **não** reusamos a cifra E2EE de canal do item 23 (ela existe porque o relay Cloudflare não é confiável) — seria chave a gerir sem ameaça nova. O que reusamos do item 23 está no §8. v1 fala HTTP simples DENTRO do túnel; HTTPS por `tailscale cert` fica como opção (Q1).

## 3b. Requisitos do Lumen (`marco-dogfood-seguranca-remoto.md`, A–F) → como este desenho cobre (12/11 15:10)

| Req. | Cobertura no desenho | Prova |
|---|---|---|
| **A1** escuta só no endereço Tailscale; sem Tailscale não sobe | `tailnet-bind` + `watchTailnet`: sem IP 100.64/10 ativo não há listener; curinga/loopback/LAN recusados ANTES do socket. **v1 só IPv4**; `fd7a:115c:a1e0::/48` fica para depois (mais estrito que o pedido). | `tailnet-bind.spec`, `remote-gate.spec` (127.0.0.1 na mesma porta = ECONNREFUSED) |
| **A2** cada conexão confere o endereço REMOTO | o portão fecha sem resposta a conexão cujo `remoteAddress` não está em 100.64/10 (defesa em profundidade; em teste o "tailnet" é o alias de loopback injetado) | `remote-gate.spec` (conexão de endereço fora da faixa = fechada) |
| **A3/A4** Host e Origin | **Host fora do esperado = `421`** (não 403); Origin alheia = 403 e, no socket, fechado; cross-site = 403 | `remote-gate.spec` |
| **B1/B2** código | uso único, 10 min, só na tela do PC, tempo constante; **5 erros de um endereço trancam o ENDEREÇO** (recuo exponencial) e só o teto global (30 erros/h com código aberto) queima os códigos; `429`+`Retry-After`; **códigos (só o hash), contadores e trava no DISCO** (`pair-state.json`, escrita atômica; o `PairingBook` da Estação é só de memória, por isso o formato é o mesmo e a implementação é a deste desenho) | `device-book.spec`, `pair-guard.spec` (reiniciar no meio não zera) |
| **B3** o código nunca em log/URL/auditoria/erro | nenhum caminho de log recebe o código; o hash também não sai na resposta | varredura do log/auditoria nos testes |
| **B4** **aprovação do dono no PC** | §5: código certo abre PEDIDO; só `approvePair` no PC cria a sessão; notificação a cada pedido | `remote-gate.spec` (negado/vencido = sem sessão) |
| **C1** token ≥ 256 bits, só hash, nunca na URL | `segredo` de 32 bytes; `sha256`; `?token=` recusado (400) | `device-book.spec`, `remote-gate.spec` |
| **C2** validade e revogação ≤ 2 s | absoluta 90 d / ociosa 14 d (Lumen sugeriu 30/7: **aceito 30 d absoluta / 7 d ociosa no v1**); revogar fecha os sockets do aparelho na hora e uma checagem a cada segundo nos streams longos reconfere o aparelho | `remote-gate.spec` (≤ 1 s medido) |
| **C3** CSRF | `Origin`/`Sec-Fetch-Site` + cabeçalho próprio em POST | `remote-gate.spec` |
| **D1** lista de PERMITIDOS, `remote-not-allowed` | `PHONE_ALLOW` é a ÚNICA fonte: a política do Gateway (`registerPolicy`) E o funil `RemoteGuard` em modo `remote` leem a mesma lista; Remote novo nasce recusado; o motivo estável é `remote-not-allowed` (`explain()` da política) | `phone-allow-complete.spec` (todo `@Remote` do host classificado como permitido OU negado; um novo sem classificação FALHA, como o `surface-table-complete`) |
| **D2** nunca pelo remoto | a lista de NEGADOS explícitos (Cofre, navegador do PC, computer-use, pasta/arquivo, atualizar/sair, pareamentos exceto **revogar**, exportar Cofre, Estação) + teste de cada um | `phone-allow-complete.spec` |
| **D3** streams reconferem; cerca de projeto/DM igual | reconferência do aparelho a cada segundo + `reconfirmFollower` por membro (já existe, R2/sec.11 #5) | `remote-gate.spec`, e2e do Gauge |
| **D4** 2º gesto para enviar/pagar/apagar | `decideApproval` pelo Peer `paired` em item de envio/pagamento/exclusão exige `confirm: true` (o "segure" + um 2º toque) e grava `approvedVia: 'celular'` no cartão ("aprovado pelo celular"); item que pede senha/segredo = `pc-only`. **`confirm: true` é UX contra toque acidental, NÃO um controle de segurança** (quem tem o cookie manda `confirm: true`); ninguém deve vendê-lo como proteção de celular roubado e desbloqueado: essa proteção é a revogação (≤ 1 s) | teste de host |
| **E1** só o cliente empacotado | resolve + prefixo; sem `..`, **sem dotfile, sem symlink para fora** (`realpath`), sem listar diretório; CSP estrita (`default-src 'self'`, sem `eval`, `connect-src 'self'`, `frame-ancestors 'none'`), `nosniff`, `no-referrer` em TODA resposta | `remote-gate.spec` |
| **E2** limites | corpo (2 KB nas rotas públicas; teto no relé), conexões por endereço e totais, `headersTimeout`/`requestTimeout`, quadro de socket | `remote-gate.spec` |
| **F** bloqueios | escuta curinga, código reutilizável ou sem trava persistente, token em URL, alcance igual ao do desktop, pareamento sem aprovação: todos têm teste que falha se voltarem | idem |

**Revogar pelo remoto (Lumen D2 "além de revogar"):** `listDevices` e `revokeDevice` entram em `PHONE_ALLOW` SÓ para um aparelho cujo membro é o dono da equipe (perdi o celular: revogo pelo notebook); emitir código, aprovar pedido, ligar/desligar o acesso continuam só no PC.

## 4. Arquitetura

```
celular/notebook ──Tailscale (WireGuard)──▶ 100.x.y.z:PORTA   [portão remoto: node:http, 1 IP]
                                               │ sem sessão: GET /, estáticos, POST /remote/pair
                                               │ com sessão: cookie → DeviceBook → Peer `paired`
                                               ▼
                              Gateway (typert) com o Peer `paired`  ──▶ RemoteAccessService.decide (PHONE_ALLOW)
                                               ▼
                              PersonaHost (mesmos @Remote)  ── actorOf() = membro do aparelho
```

Arquivos NOVOS (todos em `packages/persona/persona-host/src/remote-web/`, anunciados ao Keel antes de aplicar):

| Arquivo | Papel |
|---|---|
| `tailnet-bind.ts` | Funções puras: `isTailnetAddress` (100.64.0.0/10), `pickBind(interfaces)`; recusa curinga, loopback, LAN, IPv6 (v1). Acompanha o IP a cada 15 s: sumiu = fecha; voltou/mudou = reabre no novo. |
| `device-book.ts` | Aparelhos pareados: `{deviceId, memberId, label, secretHash, createdAt, lastSeenAt, revokedAt?}`; só o SHA-256 do segredo; compara em tempo constante; expira ocioso/absoluto; persiste no store da máquina (como `station-store`). |
| `remote-gate.ts` | O servidor: cerca Host/Origin, limite sem sessão, rotas públicas, cookie → Peer, despacho ao Gateway, revogação (frame `{type:'revoked'}` + fecha 1008, o mesmo padrão do hub), serve o cliente web (`distDir`). |
| `remote-principal.ts` | `PrincipalMap.paired = { kind:'paired'; deviceId }` + `RemoteAccessPolicy` (bindings = `PHONE_ALLOW` em role `global`) + `invalidate()` em revogação. |
| `phone-allow.ts` | A lista fechada de endpoints do celular (por área). |
| `night-summary.ts` | "Esta noite" e "Espera você" (visões puras sobre o que o host já guarda). |

**Identidade por chamada (Lumen, P0 se feito ingenuamente).** O `PersonaHost` é UM serviço e as chamadas do desktop (dono) e do celular correm CONCORRENTES com `await` no meio; identidade em campo do serviço escala o celular a dono. Desenho: `caller-context.ts` (`AsyncLocalStorage<Caller>`, `Caller = { kind:'owner'|'paired', memberId, deviceId? }`) ligado em UM ponto — o funil `RemoteGuard` (que já está na frente de todo `@Remote`) e o despacho do portão. (1) o funil resolve o chamador UMA vez, da identidade que o Gateway fixou no Peer (nunca do corpo), e roda o método dentro de `runAs(caller, …)`; (2) um stream devolve um iterável assíncrono: o funil o **embrulha** (`bindIterable`) para que CADA `next()` reentre o contexto (o corpo de um gerador roda no contexto de quem o puxa, não de quem o criou); (3) todo listener que o host registra durante a chamada (por exemplo as reconferências do `followMessages`) é ligado com `AsyncResource.bind` (um evento emitido por OUTRA chamada nunca roda o listener no contexto errado); (4) `actorOf()` lê o `Caller`: com contexto, o membro dele; **sem contexto e sem chamada Remote** (timer interno, roteiro, escalonador) = comportamento atual (o host agindo); **sem contexto mas dentro de uma chamada de Peer NÃO-dono = `forbidden` (falha fechada, jamais cai no dono)**; um `paired` cujo aparelho já não está vivo = `forbidden`. Testes (nomes do Lumen): `caller-identity-isolated` (2 chamadas concorrentes de principais diferentes, intercaladas por `await`), `caller-identity-survives-stream` (o `followMessages` segue, depois de `await`/timer/evento de OUTRA chamada, como o membro certo), `paired-without-context-refused`, e um teste que QUEBRA o contexto de propósito e espera recusa. **Defesa em profundidade no host** (não só no Gateway): `requireMachineOwner` e todo Remote só-PC (`issueDeviceCode`, `approvePair`, `setRemoteAccess`, Cofre, `browser*`, `station*`, `*Computer*`, `movePersona`…) recusam quando o `Caller` é `paired`, mesmo que o Gateway falhe; teste: cada um chamado direto no host com contexto `paired` = `pc-only`/`forbidden`.

**Fatos lidos no código que fixam o gancho (S2):** (1) o Gateway chama `Reflect.apply(method, callReceiver, args)` (`packages/api/gateway/src/index.ts:438,473`), onde `callReceiver` é uma VISÃO do serviço por chamada: dentro do método, `this.ctx.invocation.peer.principal` é o principal do Peer da chamada (lexical, por chamada). (2) `installRemoteGuard(host, guard)` (`persona-host/src/remote-guard.ts:216`) troca cada `@Remote` por um invólucro `.bind(host)`, o que RODA no singleton e ESCONDE a visão: hoje nenhum método do persona-host enxerga o Peer (por isso tudo é "o dono ao teclado"). (3) O `PersonaHost` não usa campos `#privados`, então rodar o método na visão é seguro. **Gancho único (≤ 25 linhas, em `remote-guard.ts`):** o invólucro passa a preservar `this` (a visão da chamada), lê `this.ctx?.invocation?.peer.principal`, e para um principal `paired` resolve o aparelho no `DeviceBook` (vivo, senão `device-revoked`), roda o método dentro de `runAs(caller, …)` e embrulha um iterável de retorno com `bindIterable`. Dois portadores independentes da identidade: o dinâmico (`AsyncLocalStorage`, para os fechamentos que o construtor capturou no singleton, como o `sheetGate` do orquestrador) e o lexical (`this.ctx.invocation`, para o corpo do método); `resolveMember` recusa quando o lexical diz "não-dono" e o dinâmico sumiu. **Resíduo dito:** um fechamento do singleton que perde o contexto dinâmico NÃO tem o lexical, então depende de o funil ter embrulhado o iterável e de os listeners usarem `bindListener`; o teste `caller-identity-survives-stream` e a varredura dos `emitter.on` do `followMessages`/`attentionEvents` cobrem os dois casos que existem hoje. **Risco da mudança:** o método deixa de rodar em `this === host` e passa a rodar na visão: roda-se a suíte inteira do host UMA vez (uma execução pela trava) antes de entregar.

Ganchos em `index.ts` (arquivo quente; um por vez, ≤ 30 linhas, patch `.cjs` com âncora): (a) o funil/`actorOf()` leem o `Caller` como acima (nenhum campo mutável do serviço guarda identidade de chamada); (b) montar o portão sob a superfície `remoteAccess`; (c) fechar o portão no disposer (antes do `store`); (d) 6 Remotes de §7. `types.ts` e `surface-gates.ts` (do Tally): uma entrada cada.

**Risco técnico a fechar no spike (1 h, dia 1 do código):** despachar um Peer externo ao `remote.mux` (WebSocket). Para chamadas unárias o caminho existe (`createPeer` + fetch handler de `/api`, como o Liveshare). Para streams: (i) se o Gateway aceitar o socket com o Peer dado, o portão faz o upgrade; (ii) senão usamos o canal de request/poll do Liveshare. Se (i) exigir mudança no pacote do Harness (`api/gateway` ou `client/connection`), peço decisão ao Keel antes de tocar.

## 5. Pareamento (do clique ao cookie)

1. **PC › Configurações › Celular** (mesmo componente da Estação): "Ligar um celular" → `issueDeviceCode({ memberId? })` → `{ code: 'XXXX-XXXX', expiresAt, url }`. Sem `memberId` = o dono. Para uma pessoa da equipe, o dono escolhe o membro (que já existe; lei 2: o acesso dele ⊆ o do dono — é a ACL de `actorOf`). O código mora num `PairingBook` próprio (mesma classe do F6, outra instância).
2. O celular abre `http://<ip-tailnet>:<porta>/` (QR na tela do PC é da UI), vê só "Ligar ao PC", digita o código.
3. `POST /remote/pair { code, label }` com o código CERTO NÃO entrega sessão: queima o código e abre um **pedido de pareamento** → `202 { ok:true, state:'esperando-o-dono', requestId, pollToken }` (`pollToken` = 128 bits que só este celular guarda; o servidor guarda o hash). Na tela do PC (e como notificação) aparece "O celular *label* (endereço) quer entrar" com **Aprovar / Recusar** (`listPairRequests()`, `approvePair({requestId})`, `rejectPair({requestId})`; só dono, no PC, `requireMachineOwner`; o pedido vence em 2 min). O celular pergunta `GET /remote/pair/status` com o cabeçalho `x-persona-poll: <pollToken>` → `{state:'esperando-o-dono'}` | `{state:'recusado'}` | ao ser aprovado, `200 { state:'aprovado', workspace, member, device }` + `Set-Cookie: persona-device=<deviceId>.<segredo>; HttpOnly; SameSite=Strict; Path=/; Max-Age` (o `deviceId` de 128 bits e o `segredo` de 256 bits nascem NA APROVAÇÃO; só `sha256(segredo)` fica; o segredo sai uma vez, para quem tem o `pollToken`, e o `pollToken` morre). Recusa/vencimento = nenhuma sessão. Sem WebCrypto no cliente (a página em HTTP não é contexto seguro): o segredo nasce no servidor; **token nunca na URL** (um `?token=`/`?code=` na URL é recusado com 400).
4. Recusas (só DOIS motivos na tela, para a rota não virar oráculo do código): `429 { ok:false, reason:'bloqueado' }` + `Retry-After` → "Muitas tentativas. Gere outro código no PC."; qualquer outra (errado, expirado, já usado, **ou nenhum código aberto**) → `403 { ok:false, reason:'recusado' }` → "Código não confere. Veja se o código no PC ainda está aberto." Sem código aberto a rota responde igual e NÃO conta erro. Código certo → `202` do passo 3 (e só `200` + cookie quando o dono aprova).
5. `GET /remote/me` → `{ kind:'tailnet', hostLabel, paired:false }` ou `{ kind:'tailnet', hostLabel, paired:true, workspace:{id,name}, member:{id,name,role}, device:{id,label} }` (o workspace é o do membro do aparelho: o cliente remoto NÃO faz bootstrap — não chama `createWorkspace/createMember/createChannel/completeOnboarding/createPersona` — e acha o resto por `listTeam`/`listChannels`/`listProjects`); `POST /remote/leave` o celular esquece a si mesmo. **É a fonte do cliente para saber que é um Peer remoto** (esconde Senha/Cofre/Configurações/mover cartão pelo layout); as grants finas chegam pelo stream `remoteAccess/follow` (sempre permitido ao Peer) e o cliente as espelha com `useRemoteAccess`. Não há `@Remote getRemoteClient()`: um Remote exige sessão, e `/remote/me` existe antes dela.
6. O portão serve o **mesmo bundle** do cliente (a mesma Casa), construído com a entrada "remota"; NÃO é o `webServer` de loopback (esse continua `127.0.0.1` só para o Electron/dono). Mesmo origin para HTTP `/api` e para o socket, então o cookie vale nos dois.

## 6. O que o celular vê e faz (lista fechada, por área)

`PHONE_ALLOW` nasce da Casa (item 22) e das 4 telas da Muse (§31): **leitura** da Casa (canais, conversas, pessoas, personas com presença, assuntos, quadro por etapa, "Esta noite", "Espera você"); **fio**: ler, seguir, postar em canal e DM (autor = membro da sessão); **aprovar** o que o membro pode aprovar ("segure" no toque); **lembrar no PC**. Fica FORA, sempre: Cofre/senha/chaves de conexão, **mover cartão** (o quadro no celular é só leitura, Muse §31c), backup/restore/WAL/diagnóstico, diálogo de pasta e arquivos do disco, pareamento e aparelhos, ligar/desligar acesso remoto e Estação, motor/contas, apagar projeto. A lista exata sai do que o Cobalt pedir (§8) **vetada por mim**; nada entra sem teste "o celular consegue" e "o celular de OUTRO membro não vê o que não é dele".

**`PHONE_ALLOW` v0 (lista do Cobalt 12/11 14:40, lida do código do cliente; a vetoria final é minha, na S2, lendo o retorno de cada um):**
- **Ler:** `ping, listTeam, listPersonas, listProjects, listChannels, getChannelLayout, getChannelHeader, listDms, listMessages, followMessages, openTaskConversation, listTasks, listApprovals, listBoards, getProjectBoard, getOverview, getOverviewNow, getWhileAway, listTurnActivity, getTurnContext, getOrgChart, getPersonaCard, getAutonomy, listDailySummaries, search, listAsideAsks, getAsideAsk` + novos `getNightSummary, listWaitingForYou`. **Vetoria do Lumen (15:19, membro NÃO-dono, 35 respostas reais de 58 chamadas: ZERO vazamento de DM, memória privada, Pessoal ou chave de conector):** `getEngineStatus` e `getOfficialQuota` **ENTRAM** na v0 (não trazem e-mail nem identidade de conta; o cliente os usa na dica do compositor e no teto); `getOnboarding` fica **FORA** (decisão de produto minha: o cliente remoto usa `/remote/me`). Faltam `openTaskConversation` e `getAsideAsk` (ids) e a vetoria das ESCRITAS.
- **Escrever:** `postMessage` (autor = membro do aparelho), `createDm`, `reactToMessage`, `unreactToMessage`, `decideApproval` (o "segure"; o host recusa `pc-only` quando o item pede senha/segredo/pagamento), `dismissWhileAway`, `markVisit`, `markTaskThreadRead`, `answerAttention` (só pergunta que não pede segredo; senão `pc-only`), `remindAtPc`. Na S2 confiro que os de "lido/visita" gravam POR MEMBRO DA SESSÃO e não pelo `actorId` do pedido.
- **Fora, sempre:** Cofre inteiro, `saveConnectorSecret`, `setProjectRoot`, arquivos/documentos do cofre, `moveTicket` e todo o ciclo de sprint/fluxo, criar/alterar workspace/membro/canal/persona/projeto, motor/talk/autonomia/papéis (`set*`), `undo*`, `revokeConnector`, `browser*`, `station*`, `teach*`, `brain*`, tudo de aparelhos e de acesso remoto.

**Presença muda → o cliente relê `listPersonas` a cada 20 s no v1** (sem evento novo; a persona que cai some do "no ar" em até 20 s e a recusa `persona-offline` cobre a corrida). Evento de presença fica para depois.

**Persona ATIVA (Atlas: "presença da persona = PC ligado").** Nesta máquina uma persona está `ativa` quando: o host está de pé ∧ a persona não está pausada ∧ a ficha está assinada (`sheetGate` ok, lei 3) ∧ o motor dela está pronto. Senão `fora-do-ar`, com a razão em CÓDIGO fechado (`computador-desligado` | `pausada` | `sem-ficha` | `sem-motor` | `em-transferencia`, este último do D-116: a persona está mudando de computador) para o cliente escolher a frase e a arte (a "Fora do ar · N" recolhida da Muse é a lista das `fora-do-ar`; lê-se o fio, sem compositor). Persona de OUTRO membro (equipe pelo hub) usa `RemoteTeamHost.presence()` quando a superfície de convite estiver ligada; desligada, aparece `fora-do-ar`. Os TEXTOS por código são do cliente (Muse, 12/11 14:36: "Sol está fora do ar." etc.; o host nunca manda frase para a tela, só o código). O compositor some no cliente para `fora-do-ar` e o host recusa também (`persona-offline`, com `details.reasonCode`, para o cliente mostrar a mesma frase se a recusa chegar por corrida): mensagem a persona fora do ar não vira Tarefa fantasma.

**Pessoas no mesmo Tailscale já conversam por este caminho:** cada pessoa pareia o PRÓPRIO aparelho (código emitido pelo dono para o membro dela); conversa no host do dono; vê só o que a ACL do membro permite. Convidar quem está fora do tailnet continua sendo o item 23/25 (relay Cloudflare).

## 7. Interface host ↔ cliente (para o Cobalt)

**HTTP público do portão (antes da sessão):** `GET /` e estáticos; `POST /remote/pair`; `GET /remote/me`; `POST /remote/leave`.

**Remotes novos** (nomes iguais aos do host; os de gestão são só-dono no PC, `requireMachineOwner`; os "celular" entram em `PHONE_ALLOW`):

| Remote | Quem chama | Resposta |
|---|---|---|
| `getRemoteAccess()` | PC (dono) | `{ state: 'desligado'\|'esperando-tailscale'\|'ligado', url?, port?, tailscale, devices: DeviceView[], pendingCode? }` |
| `setRemoteAccess({ on })` | PC | idem (liga/desliga o portão) |
| `issueDeviceCode({ memberId? })` | PC | `{ code, expiresAt, url }` |
| `listDevices()` / `revokeDevice({deviceId})` / `renameDevice(...)` | PC | `DeviceView = { id, label, member:{id,name}, pairedAt, lastSeenAt, online }` |
| `getNightSummary({ workspaceId })` | celular | por projeto: cartões andaram/feitos/esperando, teto de turnos usado, erros; janela "desde as 18h" |
| `listWaitingForYou({ workspaceId })` | celular | o que espera o membro (aprovações, perguntas); item com `needsPc: true` quando pede senha |
| `remindAtPc({ itemId })` | celular | cria aviso na Atenção do PC ("Me lembrar no PC"); **nenhum segredo trafega** |
| `listPersonas` (ganha `presence: 'ativa'\|'fora-do-ar'` + `reasonCode?`) | celular/PC | presença como em §6; o rail "Personas no ar" / "Fora do ar · N" sai daqui |

**Faltas novas** (vocabulário fechado `RemoteFault.details.reason`): `persona-offline`, `pc-only` ("Isto só pelo PC."), `device-revoked`. Revogado: o socket recebe `{type:'revoked'}` e fecha; o cliente volta para "Ligar ao PC".

**O que pedimos ao Cobalt (hoje):** (1) a LISTA dos Remotes que o cliente web chama em cada tela (para eu vetar e fechar `PHONE_ALLOW`); (2) confirmar que a página inicial sem sessão é só "Ligar ao PC" e que `GET /remote/me` decide a tela; (3) sem service worker/PWA offline no v1 (HTTP não é contexto seguro, Q1); (4) o cliente nunca guarda o segredo (cookie HttpOnly) nem assume o `memberId` (vem do `me`); (5) lida com `{type:'revoked'}` e com `persona-offline`.

## 8. O que se reusa do item 23 e do 24

Reusa: `PairingBook` (código), `remote-guard` (limites por Peer; `deviceId` é o Peer), o padrão de revogação do hub (`{type:'revoked'}` + 1008, assert `readyState>=2`), o formato de presença/roster, a lei 3 (ficha assinada decide persona ativa), `readTailscale()`. **Não** reusa a cifra E2EE de canal (§3 Transporte) nem o relay.

## 9. Superfície, estado e rollout

`remoteAccess` entra em `surface-gates.ts` (dono: Tally) **desligada no produto**, ligada sob Vitest; `PERSONA_HOST_FLAGS=production` prova o padrão (nenhum listener, nenhum timer; `getRemoteAccess` → `feature-off`, "Isto ainda não está disponível nesta versão."); `PERSONA_SURFACE_REMOTEACCESS=1` liga. Liga no produto só depois da auditoria própria (D-115). O estado do portão (ligado/desligado, porta, aparelhos) fica no store da máquina e volta depois de reiniciar o PC (M4).

## 10. Provas (VERMELHO primeiro; staging)

| # | Prova |
|---|---|
| T1 bind | `isTailnetAddress` (bordas 100.63/100.64/100.127/100.128); curinga/loopback/LAN recusados; socket REAL: o portão em um IP de loopback alternativo (`127.0.0.2`, no lugar do IP do Tailscale, que o CI não tem) aceita nele e **recusa em `127.0.0.1`**; sem Tailscale = sem listener; IP muda = reabre; fecha no disposer sem sobra. |
| T2 pareamento | ok 1 vez; reuso/expirado/errado recusados; 5 erros trancam; **sem código aberto não conta erro**; novo código destranca; código nunca em claro no disco. |
| T3 sessão | sem cookie 401; segredo adulterado; cookie de outro aparelho; expira ocioso/absoluto; revogar derruba stream ≤ 1 s com `{type:'revoked'}`. |
| T4 autoridade | gerado da lista COMPLETA de Remotes: `paired` recusa tudo que não está em `PHONE_ALLOW`; Cofre/segredo/backup/pareamento/diálogo/ligar-desligar recusam; lista = fixture. |
| T5 membro | colega não lê projeto fora da ACL; autor forçado = membro; `requireStreamWriter` vale; trocar o `memberId` pelo fio é ignorado. |
| T6 presença | persona pausada/sem ficha/sem motor = `fora-do-ar` e `postMessage` a ela = `persona-offline`; ativa = ativa. |
| T7 cerca | Host trocado 403; Origin diferente 403; cross-site 403; POST sem cabeçalho 403. |
| T8 produção | `PERSONA_HOST_FLAGS=production`: nenhuma porta aberta; `getRemoteAccess` = `feature-off`. |
| Runtime | no PC dedicado com Tailscale de verdade (com o Probe, depois de "candidato validado"): celular e notebook pelo IP do Tailscale; a mesma porta pelo IP da LAN recusa. |

## 11. Fatias (cada uma com vermelho antes; tudo em staging até o aviso)

**S1** portão + bind + pareamento + `DeviceBook` (sem UI; T1/T2/T3/T7/T8) → **S2** principal `paired` + `PHONE_ALLOW` + `callerMemberId()` no `actorOf` (T4/T5) → **S3** presença e "Esta noite"/"Espera você"/`remindAtPc` (T6) → **S4** streams pelo portão (spike do §4) → **S5** Remotes de gestão no PC para o Prism (Configurações › Celular).

## 12. Decisões abertas (minha recomendação em negrito)

- **Q1 HTTPS:** HTTP no v1 (WireGuard cifra); `tailscale cert` (nome `*.ts.net`) só no v1.1, porque PWA, service worker e notificação do celular exigem contexto seguro. **v1 sem PWA offline.** (Lumen/Muse/Cobalt) **Residual registrado (Lumen, 14:55):** o cookie de um IP vale para TODAS as portas desse IP (cookie não isola porta); `HttpOnly` + `SameSite=Strict` ajudam, o v1 em HTTP dentro do WireGuard é aceitável, e o HTTPS por `tailscale cert` é o passo que fecha.
- **Q2 Identidade de colega:** **um código por pessoa, emitido pelo dono no PC, atado a um membro.** Alternativa descartada: ler o login do Tailscale (`tailscale serve`), que depende de HTTPS/admin do tailnet.
- **Q3 Custo:** mensagem de colega a persona gasta a cota/assinatura do dono (lei 1). **Teto por membro** (Forge/Anvil) antes de convidar além de nós.
- **Q4 Validade da sessão:** **ociosa 7 d / absoluta 30 d** (Lumen C2; fecha a Q4). Quem passa dos 30 dias pareia de novo.
- **Q5 "Me lembrar no PC":** **vira item na Atenção do PC, sem segredo.** (Prism)
- **Q6 Mudança no pacote do Harness** só se o spike do §4 exigir; **peço ao Keel antes.**
- **Q7 Porta:** **fixa e estável (padrão 47310, a confirmar livre), guardada no store**; ocupada = próxima livre, mostrada na tela. (Rivet: regra de firewall para `100.64.0.0/10`.)
- **Q8 IPv6 do Tailscale (`fd7a:115c:a1e0::/48`):** **fora do v1.**

## 13. M9 / D-117 — assistência ao vivo e "Parar" para a persona que mexe no computador (Keel 15:01; staging)

**Divisão:** Zinc (modelo "Só eu | Equipe", "Pode mexer no computador", regra 1 no código, prova viva W3-5) e Forge (laço) são donos de QUEM pode mexer e do COMO; o meu pedaço é o **canal remoto**: o pedido, o acompanhamento ao vivo e o Parar chegam ao PC pelo portão do M5, **só por Peer PAREADO**. Senha e Cofre continuam só no PC (D-115).

**Quem pode (autorização, no host, antes de qualquer coisa):** o aparelho (`Caller paired`) só comanda/acompanha uma execução se (1) a persona é de computador-controle e a permissão "Pode mexer no computador" está LIGADA (decisão do dono do computador; Zinc); (2) este computador é a casa dela (D-116); (3) persona PRIVADA ("Só eu"): o membro do aparelho é o dono dela; persona DA EQUIPE: o membro está em "Quem pode usar" (D-117 regra 5); (4) o computador pessoal só aceita persona "Só eu" (a regra 1 é do Zinc; o portão não a afrouxa: chamada que a viola = `pc-only`, teste negativo). Tudo isso é checado por chamada (não no começo da sessão).

**Nomes (adotados da lista do Cobalt, `marco-dogfood-computer-use.md` K4; Zinc/Forge dão a forma final ao laço) e o que entra em `PHONE_ALLOW`:** LER `listComputerRuns({ personaId? })`, `getComputerRun({ runId })` → `{ runId, personaId, status: 'rodando'|'pausada'|'esperando-aprovacao'|'parada'|'terminou', step, of, paused: 'humano'|'celular'|undefined, needsPc?: true }`, `followComputerRun({ runId })` (o stream de quadros, abaixo) e `getComputerReplay({ runId })` (replay W3-3, só refs e nomes, sem pixel bruto); ESCREVER **`stopComputerRun({ runId })`** e a aprovação de passo pelo `decideApproval` que já existe (o "segure" + 2º toque `confirm: true`; passo com senha/segredo = `pc-only`). **NUNCA pelo celular:** clique, tecla, digitar, `resume`, `takeControl` e qualquer `start` direto (a persona começa a execução por uma mensagem, como sempre). Não há `startComputerUse` no celular.

**O "Parar" é um caminho À PARTE e sempre disponível.** Vai por uma rota própria do portão (`POST /remote/computer/stop`, autenticada e com a cerca de sempre) que NÃO passa pelo funil de carga/taxa dos outros Remotes e NÃO depende de o stream estar de pé: derruba o laço pelo mesmo `SharedControlPort` do "humano assumiu" (nenhum passo seguinte age, o evento de entrada em curso não é entregue), é idempotente, responde em ≤ 300 ms (medido) e grava no histórico da equipe "parado pelo celular de {membro}". Qualquer membro que PODE comandar a execução pode parar; o dono do computador sempre pode. O Parar do PC (Esc e botão) continua igual.

**Tela ao vivo (acompanhar).** O stream é `followComputerRun` (pelo portão; quadros, só do que o aparelho tem direito de ver, só ENQUANTO há a execução que ele pediu para seguir): `{ seq, runId, at, w, h, jpeg, cursor: { x, y, persona: true }, step, paused }`. Regras: **o mais novo vence** (cliente lento perde frames velhos, nunca acumula fila); teto de taxa (≤ 2 quadros/s no v1) e de tamanho (≤ 150 KB/quadro, reduz qualidade e resolução antes de estourar); o stream só abre para quem pode comandar e fecha na hora em que a execução termina, o aparelho é revogado ou a persona perde a permissão (reconferência a cada segundo, como o `followMessages`); nada é gravado no celular nem no host além do replay do W3-3. **Privacidade da captura (Lumen revisa):** campos de senha (`IsPassword` na árvore de acessibilidade) e janelas marcadas como sensíveis saem MASCARADOS no quadro **antes** de sair do PC; título de janela só no replay, nunca no quadro; sem áudio.

**Trela (decisão a confirmar com Zinc/Lumen; recomendo LIGADA):** uma execução COMANDADA pelo celular **pausa sozinha** se o aparelho que a comanda ficar sem falar com o PC por 60 s (quem a pediu não consegue mais Parar). Retomar é explícito, no PC ou pelo mesmo celular.

**Provas (vermelho primeiro, staging):** `remote-computer-needs-permission`, `team-persona-never-personal-pc-via-phone` (teste negativo da regra 1 pelo portão), `private-persona-owner-only-via-phone`, `who-can-use-checked-per-call`, `stop-works-without-stream` (Parar com o stream morto) e `stop-under-300ms`, `stop-recorded-in-team-history`, `watch-latest-frame-wins` (cliente lento não acumula), `watch-frame-size-cap`, `watch-closes-on-revoke-within-1s`, `watch-masks-password-fields` (com a árvore de acessibilidade falsa), `leash-pauses-after-60s`, `approve-step-secret-is-pc-only`. Runtime real: com o Zinc na prova viva W3-5, depois do "candidato validado".

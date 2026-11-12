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
| **A2 Outro nó do tailnet** (colega, aparelho comprometido, ACL frouxa do Tailscale) chega à porta | Sem sessão pareada só enxerga a página de parear e `POST /remote/pair`. Código de 8 caracteres (~40 bits), 10 min, uso único, hash; 5 erros trancam; **só conta erro enquanto há código aberto** (sem código aberto `pair` responde 404 igual e não tranca nada: ninguém tranca o pareamento do dono de fora). Limite por IP nas rotas sem sessão. |
| **A3 Celular perdido/roubado** | Sessão por aparelho, revogável no PC ("Celulares ligados › Desligar"): derruba streams e sockets em ≤ 1 s. Validade: ociosa 14 dias, absoluta 90. Chave "Desligar acesso remoto" fecha a porta. A sessão remota nunca vale para Cofre, senha, backup, diagnóstico, diálogo de pasta, pareamento. |
| **A4 Quem fotografa o código** | Aparece só no PC (`requireMachineOwner`), vale 10 min, funciona 1 vez; depois da 1ª troca a foto não vale nada. |
| **A5 Página maliciosa/DNS rebinding/CSRF** | Cerca no portão: `Host` = `<ip-tailnet>:<porta>` (ou o nome MagicDNS configurado), `Origin` igual, `sec-fetch-site` ≠ cross-site; cookie `HttpOnly; SameSite=Strict; Path=/`; POST exige cabeçalho próprio (`x-persona-remote: 1`). |
| **A6 Cliente remoto tenta escalar** | Principal `paired` é NÃO-dono: **lista fechada** `PHONE_ALLOW` (um arquivo; cada nome com teste) + recusa por padrão do Gateway (F3). Teste gerado da lista COMPLETA de Remotes: tudo fora da lista recusa. Quem muda a lista muda um teste de propósito. |
| **A7 Autor falso** | O autor é a sessão: `request.actorId` ≠ membro da sessão = `forbidden` (já é a regra de `requireStreamWriter` para sessão ligada). |
| **A8 Texto de terceiros no fio** | Não muda: dado externo continua cercado; o celular só lê/escreve como o membro. |
| **FORA do modelo (dito, não prometido)** | Quem controla a conta Tailscale do Miguel (pode pôr nó novo; ainda precisa de um código aberto no PC); malware no PC; PC desbloqueado nas mãos de outro. |

**Transporte.** O túnel do Tailscale (WireGuard) já cifra de nó a nó, e os relés DERP só carregam pacote cifrado: não há relé NÃO-confiável a esconder. Por isso **não** reusamos a cifra E2EE de canal do item 23 (ela existe porque o relay Cloudflare não é confiável) — seria chave a gerir sem ameaça nova. O que reusamos do item 23 está no §8. v1 fala HTTP simples DENTRO do túnel; HTTPS por `tailscale cert` fica como opção (Q1).

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

Ganchos em `index.ts` (arquivo quente; um por vez, ≤ 30 linhas, patch `.cjs` com âncora): (a) `actorOf()` passa a ler `callerMemberId()` = membro do aparelho quando o Peer da chamada é `paired`, senão `sessionMemberId` (comportamento atual); (b) montar o portão sob a superfície `remoteAccess`; (c) fechar o portão no disposer (antes do `store`); (d) 6 Remotes de §7. `types.ts` e `surface-gates.ts` (do Tally): uma entrada cada.

**Risco técnico a fechar no spike (1 h, dia 1 do código):** despachar um Peer externo ao `remote.mux` (WebSocket). Para chamadas unárias o caminho existe (`createPeer` + fetch handler de `/api`, como o Liveshare). Para streams: (i) se o Gateway aceitar o socket com o Peer dado, o portão faz o upgrade; (ii) senão usamos o canal de request/poll do Liveshare. Se (i) exigir mudança no pacote do Harness (`api/gateway` ou `client/connection`), peço decisão ao Keel antes de tocar.

## 5. Pareamento (do clique ao cookie)

1. **PC › Configurações › Celular** (mesmo componente da Estação): "Ligar um celular" → `issueDeviceCode({ memberId? })` → `{ code: 'XXXX-XXXX', expiresAt, url }`. Sem `memberId` = o dono. Para uma pessoa da equipe, o dono escolhe o membro (que já existe; lei 2: o acesso dele ⊆ o do dono — é a ACL de `actorOf`). O código mora num `PairingBook` próprio (mesma classe do F6, outra instância).
2. O celular abre `http://<ip-tailnet>:<porta>/` (QR na tela do PC é da UI), vê só "Ligar ao PC", digita o código.
3. `POST /remote/pair { code, label }` → `ok`: o portão gera `deviceId` (128 bits) e `segredo` (256 bits), guarda só `sha256(segredo)`, devolve `Set-Cookie: persona-device=<deviceId>.<segredo>; HttpOnly; SameSite=Strict; Path=/; Max-Age` e `{ member: {id, name} }`. Sem WebCrypto no cliente (a página em HTTP não é contexto seguro): o segredo nasce no servidor.
4. Recusas: `bloqueado` → "Muitas tentativas. Gere outro código no PC." Qualquer outra → "Código não confere" (não revela se expirou/usou). Sem código aberto = 404.
5. `GET /remote/me` → `{ paired:false }` ou `{ paired:true, member, device:{id,label} }`; `POST /remote/leave` o celular esquece a si mesmo.

## 6. O que o celular vê e faz (lista fechada, por área)

`PHONE_ALLOW` nasce da Casa (item 22) e das 4 telas da Muse (§31): **leitura** da Casa (canais, conversas, pessoas, personas com presença, assuntos, quadro por etapa, "Esta noite", "Espera você"); **fio**: ler, seguir, postar em canal e DM (autor = membro da sessão); **aprovar** o que o membro pode aprovar ("segure" no toque); **lembrar no PC**. Fica FORA, sempre: Cofre/senha/chaves de conexão, **mover cartão** (o quadro no celular é só leitura, Muse §31c), backup/restore/WAL/diagnóstico, diálogo de pasta e arquivos do disco, pareamento e aparelhos, ligar/desligar acesso remoto e Estação, motor/contas, apagar projeto. A lista exata sai do que o Cobalt pedir (§8) **vetada por mim**; nada entra sem teste "o celular consegue" e "o celular de OUTRO membro não vê o que não é dele".

**Persona ATIVA (Atlas: "presença da persona = PC ligado").** Nesta máquina uma persona está `ativa` quando: o host está de pé ∧ a persona não está pausada ∧ a ficha está assinada (`sheetGate` ok, lei 3) ∧ o motor dela está pronto. Senão `fora-do-ar`, com a razão em CÓDIGO fechado (`computador-desligado` | `pausada` | `sem-ficha` | `sem-motor`) para o cliente escolher a frase e a arte (a "Fora do ar · N" recolhida da Muse é a lista das `fora-do-ar`; lê-se o fio, sem compositor). Persona de OUTRO membro (equipe pelo hub) usa `RemoteTeamHost.presence()` quando a superfície de convite estiver ligada; desligada, aparece `fora-do-ar`. O compositor some no cliente para `fora-do-ar` e o host recusa também (`persona-offline`): mensagem a persona fora do ar não vira Tarefa fantasma.

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

- **Q1 HTTPS:** HTTP no v1 (WireGuard cifra); `tailscale cert` (nome `*.ts.net`) só no v1.1, porque PWA, service worker e notificação do celular exigem contexto seguro. **v1 sem PWA offline.** (Lumen/Muse/Cobalt)
- **Q2 Identidade de colega:** **um código por pessoa, emitido pelo dono no PC, atado a um membro.** Alternativa descartada: ler o login do Tailscale (`tailscale serve`), que depende de HTTPS/admin do tailnet.
- **Q3 Custo:** mensagem de colega a persona gasta a cota/assinatura do dono (lei 1). **Teto por membro** (Forge/Anvil) antes de convidar além de nós.
- **Q4 Validade da sessão:** **ociosa 14 d / absoluta 90 d, deslizante.** (Lumen)
- **Q5 "Me lembrar no PC":** **vira item na Atenção do PC, sem segredo.** (Prism)
- **Q6 Mudança no pacote do Harness** só se o spike do §4 exigir; **peço ao Keel antes.**
- **Q7 Porta:** **fixa e estável (padrão 47310, a confirmar livre), guardada no store**; ocupada = próxima livre, mostrada na tela. (Rivet: regra de firewall para `100.64.0.0/10`.)
- **Q8 IPv6 do Tailscale (`fd7a:115c:a1e0::/48`):** **fora do v1.**

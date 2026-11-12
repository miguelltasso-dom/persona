# Marco DOGFOOD M5: o cliente web e celular estilo Discord

Dono: Cobalt (cliente responsivo). Parceiros: Bolt (host: bind só no Tailscale, pareamento, cifra do item 23), Prism (UI compartilhada da Casa), Muse (prancha do celular). Escrito 12/11 14:55. Plano e testes vermelhos em staging (`.maestri/staging/cobalt-web/`); o código só entra na árvore depois do "candidato validado" (~15:15).

## 1. O que é

O celular e o navegador abrem o MESMO app do desktop: a Casa da Equipe (COLHEITA-MUSE §29), servida pelo host do PC dedicado SÓ na rede Tailscale, com pareamento por código (§31c). Não é um painel reduzido. Tem canais, conversas e pessoas numa lateral (gaveta no celular) e o fio de mensagens com o compositor. Dá para escrever a PESSOAS e a PERSONAS, em canais e conversas diretas.

Decisão de desenho: duas coisas independentes, cada uma testável sozinha.
- **Layout** (pela largura): `<= 720 px` troca o trilho de 64 px por uma barra de topo mais a gaveta. A regra é do tamanho da janela, não de quem abriu. Um navegador pequeno no desktop recebe o mesmo layout.
- **Restrições de Peer remoto** (por quem abriu): o cliente sabe que é um Peer remoto pelo host. Isso esconde Senha, Cofre, Configurações, contratar e Regras. A decisão de verdade é do host (o Peer recusa a chamada); o cliente só espelha, para nunca desenhar um botão morto.

## 2. Divisão e fronteiras

| Peça | Dono | Observação |
|---|---|---|
| Bind só no Tailscale, rate-limit do código, cookie/token do Peer, lista "Celulares ligados" | Bolt | O cliente só consome. Nada exposto fora do Tailscale. |
| Fio, compositor, linhas da Casa (`ChannelSections`, conversas, rosto + "o que faz agora") | Prism | Reuso: o modo celular só ENCAIXA os componentes dele. Arquivo dele que precise de ajuste: trecho exato ao Prism antes. |
| Layout de celular, gaveta, rotas, presença "ativa / fora do ar", compositor no toque, ligar ao PC, banner de conexão | Cobalt | Só arquivos NOVOS em `client-ui-persona/src/client/mobile/` (mais 1 ponto de montagem no `PersonaAppFrame`, combinado com o Prism). |
| Prancha do celular (claro e escuro, 360 a 430 px) | Muse | `COLHEITA-MUSE.md` §31c; o aceite visual é dela. |

## 3. Regras de produto (o que NÃO muda)

1. Senha e Cofre NUNCA pelo celular. O texto é `🔒 Senha só pelo PC` com o botão `Me lembrar no PC`, que vira um aviso no PC. Nenhum botão morto.
2. "Segure para aprovar" funciona no toque: botão de 52 px de altura, largura toda, o enchimento igual ao do desktop. Sem arrastar cartão do quadro no celular (mover é só no PC).
3. "Esta noite" e "Espera você" são atalhos no topo da Casa no celular, não um app separado.
4. Só aparecem com compositor as personas ATIVAS (cujo computador está ligado e rodando). As outras ficam numa seção recolhida "Fora do ar", sem compositor e sem promessa de resposta.
5. Pessoas no mesmo Tailscale conversam por este caminho; convidar gente de fora da rede é o item 23/25 (relay), não este.
6. Sem ligação com o PC: o que já foi carregado continua visível e marcado `de 07:40`, com `Sem ligação com o PC` e `Tentar de novo`. Nunca uma tela em branco.
7. Falha fechada: o que o cliente não reconhece como permitido para Peer remoto cai em `Isto só no PC`, nunca abre.

## 4. Módulos (todos NOVOS, em `client-ui-persona/src/client/mobile/`)

Puros (testados sem DOM):
- `remote-client.ts` — `RemoteClientInfo` (`{ remote: boolean, paired: boolean, hostLabel?: string, member?: {id,name}, workspaceId?: string }`), `readRemoteMe(wire)` (a resposta de `GET /remote/me` do Bolt: `{ kind:'tailnet', hostLabel, paired, member?, device? }`; valor de fio nunca é confiado: `kind` desconhecido ou fio inválido = `remote: true, paired: false`, falha fechada; ausência total de `/remote/me` no desktop = dono, `remote: false`), `isPanelAllowed(info, panelId)` (lista branca para Peer remoto), `placeForRemote(info, panelId)` (devolve o painel pedido ou `'channels'` mais o motivo `so-no-pc`). O `memberId` vem só do `me`, nunca do cliente.
- `remote-faults.ts` — `faultToUi(details.reason)` para o vocabulário fechado do host: `persona-offline` (lê o fio, sem compositor), `pc-only` (`Isto só pelo PC.`), `device-revoked` (volta a `Ligar ao PC`); razão desconhecida = mensagem genérica honesta, nunca silêncio. `isRevokedFrame(frame)` para `{type:'revoked'}` do socket e `401` do `/api`.
- `presence.ts` — `splitByPresence(personas)` → `{ active, away }`; `canCompose(persona)` só para ativa; ordem estável (a ordem da Casa).
- `connection.ts` — `connectionBanner(state)` (`ok` | `lost`), `staleLabel(loadedAt, now)` → `de 07:40` no fuso do aparelho.
- `drawer-model.ts` — estado da gaveta (`closed` → `open`), `shouldCloseOnSwipe({ startX, endX, velocity })`, Esc e voltar do navegador fecham, abrir uma conversa fecha.
- `pairing-model.ts` — `normalizeCode(text)` (`XXXX-XXXX`, caixa e traços perdoados; alfabeto do `PairingBook`), `pairingMessage(reason)`: o host só devolve DOIS motivos, para a rota não virar oráculo do código: `recusado` → `Código não confere. Veja se o código no PC ainda está aberto.` e `bloqueado` → `Muitas tentativas. Gere outro código no PC.`. Qualquer outra resposta (rede, 5xx) → `Não consegui falar com o PC. Tente de novo.` (distinto de "código errado").

Visuais:
- `MobileCasaFrame.tsx` — barra de topo (gaveta, título do canal, chip `✓ Ligado ao PC`), atalhos `Esta noite` e `Espera você` (contagem âmbar), área principal, banner de conexão.
- `MobileDrawer.tsx` — gaveta com `ChannelSections`, conversas, pessoas (ativas) e `Fora do ar` recolhida; foco preso, `inert` no fundo, rolagem travada.
- `PairScreen.tsx` — `Ligar ao PC`: 8 caixas de 44 px, `Ligar` de 48 px, os 4 erros acima, nota `Só funciona na sua rede do Tailscale. Ninguém de fora vê.`
- `OnlyOnPc.tsx` — o cartão `🔒 Senha só pelo PC` e `Me lembrar no PC`.

Texto na camada de locale (`persona.mobile`, pt e en, gerado como as outras): nenhuma string solta no componente.

## 5. Host ↔ cliente (fonte: `marco-dogfood-remoto.md` do Bolt, §5 a §7; nomes fechados com ele 12/11 14:40)

- Chegada: `http://<IP Tailscale>:<porta>/` no portão remoto do PC dedicado, que serve o MESMO bundle (entrada "remota"); sem sessão só existe `Ligar ao PC`.
- `GET /remote/me` decide a tela (antes da sessão): `{ kind:'tailnet', hostLabel, paired:false }` → `PairScreen`; `paired:true` → Casa. Não existe `getRemoteClient()` (Remote exige sessão).
- `POST /remote/pair { code, label }` com cabeçalho `x-persona-remote: 1`. Como o DONO aprova no PC (Lumen B.4, o código sozinho não basta), a resposta normal é `202 { ok:true, state:'esperando-o-dono', requestId, pollToken }`; `403 recusado`; `429 bloqueado`. A tela diz `Aguardando o PC aprovar este celular.` e pergunta a cada 2 s `GET /remote/pair/status` com o cabeçalho `x-persona-poll: <pollToken>` (o token fica SÓ na memória da página, nunca em URL, vale 2 min): `esperando-o-dono` continua; `recusado` → `O PC não aprovou este celular.`; `vencido` ou 404 → `O pedido venceu.`; `aprovado` (`200 { ok:true, state:'aprovado', workspace, member, device }` com o `Set-Cookie` HttpOnly, uma vez) → entra. O JS nunca vê o segredo.
- Aprovar envio, pagamento ou exclusão pelo celular: o "segure" + um 2º toque (`decideApproval` com `confirm: true`). O cliente NÃO diz que é celular: o host deduz do Peer pareado e grava `approvedVia: 'celular'` no cartão (Bolt, 15:06).
- Layout restrito decide por `me.kind === 'tailnet'`; as grants finas chegam pelo stream `remoteAccess/follow` e os botões as espelham com `useRemoteAccess`. A política é do host (lista fechada `PHONE_ALLOW`); o cliente só espelha.
- Remotes que o cliente chama no celular (lista enviada ao Bolt, para ele vetar): ver §5b.
- Presença: `listPersonas` ganha `presence: 'ativa' | 'fora-do-ar'` + `reasonCode` (`computador-desligado | pausada | sem-ficha | sem-motor`). Persona `fora-do-ar`: lê o fio, sem compositor; o host também recusa com `persona-offline`.
- Novos: `getNightSummary`, `listWaitingForYou` (item com `needsPc: true` quando pede senha), `remindAtPc({ itemId })`.
- Revogado: `{type:'revoked'}` no socket (ou `401`) → volta a `Ligar ao PC` e apaga o conteúdo em memória. Sem service worker nem PWA no v1 (HTTP no túnel não é contexto seguro).

### 5b. Lista de Remotes do celular (proposta do Cobalt; o Bolt veta)
- Ler: `ping, getOnboarding, listTeam, listPersonas, listProjects, listChannels, getChannelLayout, getChannelHeader, listDms, listMessages, followMessages, openTaskConversation, listTasks, listApprovals, listBoards, getProjectBoard, getOverview, getOverviewNow, getWhileAway, listTurnActivity, getTurnContext, getOrgChart, getPersonaCard, getAutonomy, getEngineStatus, getOfficialQuota, listDailySummaries, search, listAsideAsks, getAsideAsk, getNightSummary, listWaitingForYou`.
- Escrever: `postMessage, createDm, reactToMessage, unreactToMessage, decideApproval, dismissWhileAway, markVisit, markTaskThreadRead, answerAttention, remindAtPc`.
- Fora, sempre: Cofre e segredos, mover cartão e tudo de sprint/fluxo, criar workspace/membro/canal/persona, completar onboarding, motor, ACL da persona, autonomia (escrita), anexos, backup, pareamento.
- O bootstrap do cliente (`bootstrap-tenant.ts`, `seed-default-team.ts`) NÃO roda no celular: o tenant vem de `me` + `listTeam` + `listChannels`. Pedido ao Bolt: `me` devolve também `workspace:{id}`.

## 6. Testes vermelhos (o contrato executável)

`remote-client.spec.ts`
- R1 dono: `remote: false`, tudo permitido (o desktop não muda).
- R2 Peer remoto reconhecido: `cofre`, `connections`, `tools`, `rules`, `members`, `importers`, `personas`, `personality` NÃO permitidos; `channels`, `directMessages`, `approvals`, `kanban`, `overview` permitidos.
- R3 falha fechada: fio vazio, `null`, string, `kind` desconhecido → `remote: true, paired: false`.
- R5 `readRemoteMe` do fio do Bolt (`paired:true`, `member`, `workspace`) devolve o membro; `memberId` nunca vem de outro lugar.

`remote-faults.spec.ts`
- X1 `persona-offline` → compositor some, fio segue legível; `pc-only` → `Isto só pelo PC.`; `device-revoked` e `{type:'revoked'}` e `401` → `revoked`.
- X2 razão desconhecida → mensagem genérica honesta (não vazia).
- R4 `placeForRemote` do Cofre → `{ panel: 'channels', reason: 'so-no-pc' }`.

`presence.spec.ts`
- P1 só `active: true` tem compositor; `away` vem separado e sem compositor.
- P2 a ordem da Casa se mantém dentro de cada grupo.
- P3 `active` ausente = fora do ar (não promete resposta).

`connection.spec.ts`
- C1 `lost` mostra o banner com `Tentar de novo`; `ok` não mostra nada.
- C2 `staleLabel` formata `de 07:40` (e `de ontem 23:10` quando é de outro dia).

`drawer-model.spec.ts`
- D1 abrir e fechar; Esc fecha; abrir uma conversa fecha.
- D2 deslizar para a esquerda mais de 64 px ou com velocidade > 0,4 px/ms fecha; menos que isso não.

`pairing-model.spec.ts`
- K1 `normalizeCode('abcd efgh')` → `ABCD-EFGH`; caracteres do alfabeto errado são recusados na digitação.
- K2 `recusado` e `bloqueado` viram as 2 frases; falha de rede/5xx vira a 3ª frase, diferente de "código errado".

`mobile-frame.client.spec.tsx` (jsdom, largura 390)
- F1 a barra de topo tem o botão da gaveta com nome acessível; o trilho de 64 px NÃO é desenhado.
- F2 abrir a gaveta mostra canais e conversas, `inert` no fundo, foco dentro; fechar devolve o foco ao botão.
- F3 persona ativa tem compositor; persona "Fora do ar" aparece recolhida, sem compositor.
- F4 `Esta noite` e `Espera você` ficam no topo; `Espera você` mostra a contagem.
- F5 sem ligação: banner, conteúdo anterior visível com `de 07:40`, e `Tentar de novo` chama a nova tentativa.
- F6 Peer remoto: nenhum item de Cofre, Configurações, contratar ou Regras na gaveta; um cartão que pede senha mostra `🔒 Senha só pelo PC` e `Me lembrar no PC`.
- F7 todo alvo de toque tem pelo menos 44 px (CSS lido pelo teste) e o botão de segure 52 px.

`pair-screen.client.spec.tsx`
- A1 8 caixas, digitar avança, colar `ABCD-EFGH` preenche; `Ligar` desligado até haver 8.
- A2 cada recusa do host (`recusado`, `bloqueado`, erro de rede) mostra a frase certa e mantém as caixas; com `bloqueado` o botão fica desligado.
- A3 sucesso chama `onPaired` uma vez e some a tela.

## 7. Prova de funcionamento (depois do "candidato validado")

1. Os specs acima verdes, sob a trava (`node scripts/persona/with-lock.mjs --lock check -- …`), mais `check-pkg client-ui-persona`.
2. O app subido de verdade e aberto em um navegador com a janela de 390 px (e, com o host do Bolt, pelo IP do Tailscale): capturas da gaveta, do fio com compositor, do pareamento e do banner sem ligação, claro e escuro, conferidas com o pré-aceite do Ember e com a Muse.
3. "Segure para aprovar" exercitado com eventos de toque reais (emulação do Chrome), sem menu de contexto e sem seleção de texto.

## 8. Fora desta fatia

Push notification no celular, PWA instalável, envio de anexo pelo celular, voz, e qualquer coisa de Cofre. Cada uma vira item próprio se o Miguel pedir.

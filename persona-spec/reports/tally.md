# Relatos — Tally (otimização de tokens)

Mais recente no topo. Escopo: OPT-2..OPT-6 e OPT-8 (com o Forge). Medição **offline** (runner scriptado fiel); zero chamada real de CLI. **Fila fechada em 04/11 13:30** (resumo no topo).

## 04/11 19:15 — D-079 (meu lado) fechado · OPT-9 (engine) feito · OPT-10 em PROPOSTA com censo local · OPT-8b pré-registrada

**D-079.** A mudança do Bolt em `followupOwners` não altera nenhum número meu (o `dia-padaria` do bench já trata cada pedido como Ticket próprio; o "host agrupa a rajada" saiu do bench na W5). Regressão com o código dele: `never-silent.spec` (19) + `courtesy-reaction` (7) + `token-wiring` + `suggestions-routing` (18 chips) + `conversation-d079` do Bolt (13) = **51/51** verdes. Bolt avisado por tell.

**OPT-9 (engine).** `estimateAsk` consome `source: 'history'`, `tokensPerCall`, `mediana`, `samples` do contrato do Anvil (`contracts/estimate-calibration.md`): os tokens medidos do tipo **substituem** "estimativa + base"; cada afirmação só vale com **≥ 5** linhas declaradas (`MIN_HISTORY_SAMPLES`), senão cai na estimativa; `vendorBaseTokens`/`tokenizerRatio` são ignorados com fonte `history` e saem rotulados `referencia-dev` quando não há fonte; o resultado ganha `fonte`, `amostras` e `tempo.mediana`; o `motivo` cita "pelas suas últimas N conversas/tarefas/triagens, … levou de a a b". Custo no caminho do histórico = faixa piso (cache lido ×0,1) a teto (cache gravado ×1,25), porque o livro guarda a entrada num número só. Provas: `estimate-ask.spec` (engine) 27, `estimate-history-tokens.spec` (host, novo) 5, mais o `estimate-calibration.spec` do Anvil e os do Remote/host: **47/47**; `check-pkg persona-engine` OK (o host tem erros só em `aside-ask.ts`/`proactivity-live.ts`, de outros donos). Pendente de outros: Anvil espelha `fonte?`/`amostras?`/`tempo.mediana?` no `EstimateAskView`; Rivet + Bolt gravam `durationMs` no livro (até lá o tempo segue "não sei").

**OPT-8b.** Atlas autorizou a 2ª pareada (n = 3 por célula, Haiku, teto 40, mesmo limitador e trava `real`) depois do V1-P0-5 do Probe e do D-079. **Regra pré-registrada antes de qualquer chamada em `reports/opt8b-prereg.md`** (mediana de 3; paridade se fria e quente ficam em ±10% com dispersão ≤ 0,5; senão "não mensurável com a CLI exploratória" e proponho medir pelo histórico). Keel: a rodada única do Probe vem primeiro, sem `--priority`; **aviso o Keel antes de lançar**.

**OPT-10 (proposta, zero gasto): `reports/opt10-proposal.md`.** Censo local com servidor Anthropic falso em 127.0.0.1 (`scripts/census-cli-requests.ts`, resultado `reports/opt10-census.json`): pelo mesmo `resolveRunner`/OAR do host, uma conversa faz **1** requisição de modelo e **0** ferramentas, uma tarefa faz **1**; nenhuma auxiliar; a contagem do OAR bate com o que o servidor declarou. Portanto prompt, política e contagem **não** geram as 2–6 requisições a mais da pareada real (2× e 7× a base com **tools = 0**, tempo sem relação com o número, mesmo total 305 652 em duas chamadas diferentes). O adaptador do produto lê o **total** do OAR (todas as chamadas de modelo, inclusive internas), não o laço principal; hoje o livro não separa o auxiliar. Hipóteses que o censo não alcança (HOME em branco, endpoint falso): recursos da CLI em segundo plano com login de assinatura, o ambiente pessoal da pessoa, nova tentativa de streaming, partida de sessão. Um "limite de exploração" não teria cortado nada e a CLI 2.1.318 nem tem `--max-turns`. O placar do D-080 **não** muda: o `cut-40` passa para qualquer base de 1 mil a 300 mil tokens (rajada −43% a −48%, espaçado −48%). Decisões pedidas ao Atlas: (a) campos do laço principal no `RunnerUsage` (Rivet) + captura dos dois contadores no harness da OPT-8b, sem gasto; (b) experimento real do OPT-10 só depois da OPT-8b e com o OK dele; (c) regra de produto: ambiente pessoal da pessoa fora das chamadas da Persona.

## 04/11 18:40 — D-080 (a)(b) FEITO: a base medida entra no gate como componente calibrado; placar OPT-8 3/4 (hora real do relógio; os carimbos 05/11 abaixo estavam adiantados)

**O que mudou no pipeline** (`opt8-faithful.ts`, `token-measure.ts`, `v1-close.ts`; `opt8-measured.ts` do Forge só com campos opcionais aditivos, ele aprovou):
- `cutRowsWithBase()`: as mesmas linhas do bench, com a base do vendor medida (40 977 tokens por chamada) somada **nos dois braços** (antes e depois). `cut-40` lê esta vista; a de só prompts continua calculada ao lado.
- `origin: 'calibrated'` com a ressalva escrita (`CALIBRATION_CAVEAT`: "1 máquina, Haiku, 1 rodada, contador = total da sessão da CLI … MESMA base nos dois braços"). `measured` fica só para o que o vendor devolveu.
- `cache-60` decidido pelo que o provedor reportou na rodada real (`MEASURED_PROVIDER_CACHE`: Claude, prefixo ≈ 0,97 ≥ 0,6) em vez de estimativa.
- W3 virou "adiada por decisão" (`DEFERRED_LEVERS`, `leverCandidates()` com status `deferred`); `allLeversWired()` ignora só as adiadas — qualquer outra alavanca desligada continua bloqueando.
- Relatório lado a lado (`opt8-faithful.md`, `v1-close.md`): rajada **−36% só prompts → −48% com a base**; espaçado **−48% → −48%**.

**Placar D-068 agora: 3 de 4.** `idle-zero` ✔, `cache-60` ✔ (medido pelo provedor), `cut-40` ✔ (−48% com a base, tokens não sobem, qualidade mantida), `pair-parity` **bloqueado** (pareada inconclusiva: n = 1 por célula, o agente variou ≈ 90 mil–306 mil tokens de entrada entre chamadas parecidas). Limites que continuam valendo: base de requisição única (não conta as requisições internas do agente), preço de lista do Haiku, uma máquina.

**Provas (todas com trava `check`, escopo por caminho):** engine (opt8-faithful, token-measure, v1-close, token-faithful, pair-real) 72 verdes; host (opt8-measured-remote, token-opt, token-wiring) + engine (opt8-faithful, token-measure, v1-close) 50 verdes; Forge `opt8-measured.spec` e e2e `mandatory-v1-close-contract` (3, inclui `assert-opt2` e `v1-close.spec` em subprocesso) e `mandatory-first-delivery-contract` verdes; `check-pkg persona-engine persona-host persona-e2e` OK. Specs que eu atualizei por mudar de número (nenhuma expectativa afrouxada): `opt8-measured-remote.spec`, `token-opt.spec` (host), `mandatory-v1-close-contract.spec` (títulos) e os do engine acima. Contrato: `contracts/token-wiring.md` (linha W3 e seção do placar lado a lado).

## 05/11 02:25 — RODADA PAREADA REAL FEITA (D-070 B): o que mediu, o que NÃO prova, e o placar recalibrado

Autorizada por Atlas e Keel; 1 par, Claude haiku nos dois braços, **13 de 20 chamadas** (9 da pareada, ledger do limitador do Rivet em 9; mais 4 de requisição única), limitador ligado (CAP=20, ledger próprio), trava `real` solta (Probe livre), `dispose` garantido, em diretório vazio, sem tocar o app nem dados do usuário. Contadores **brutos** em `reports/pair-real.md` / `.json` e `pair-real-base.json`.

**O que o contador é.** O do adaptador OAR é o **total da sessão da CLI** (`inputTokens` já inclui cache lido e gravado; medido: 305 652 = 299 762 + 5 888 + 2) e soma **todas as requisições internas** daquela chamada. A chamada direta, de uma linha, somou 305 652 de entrada ≈ 7 requisições de ~41 mil: o agente explorou. Por isso a pareada **não compara o desenho dos prompts** (os da Persona têm 0,3–0,5 mil tokens); ela mediu o que a CLI faz nesta máquina. Corrigi um erro meu no relatório (somava o cache de novo: "base 611 279", "razão 1336×" eram falsos).

**Medido (confiável)**
- **Base de UMA requisição nesta máquina: 37 729–44 224 tokens** (sistema + ferramentas + memória/skills/MCP da pessoa), não 12 000. Só ≈ 45% vem do cache; ≈ 55% é **regravado a cada chamada** (×1,25). Cada chamada custa quase o mesmo, qualquer que seja o prompt.
- **Razão do tokenizador (texto neutro em português, 1 requisição): 1,707×.** O estimador de 4 caracteres/token **subconta ≈ 41%** (≈ 2,3 caracteres por token). Os totais absolutos do bench ficam subestimados; os cortes relativos pouco mudam.
- **TTL do cache na assinatura > 5 min:** a sonda 6 min depois leu 302 561 tokens do cache. A premissa "TTL 5 min → prefixo 0,00 no dia espaçado" não vale aqui.
- **A triagem é uma chamada inteira:** 307 097 tokens de entrada, ~11 s, igual a uma execução. O `skipTriage` (D-073) corta uma chamada de CLI, não um prompt pequeno.
- **Tempo por chamada:** execução 10,3–13,8 s, triagem 10,2–11,3 s.
- **W3 (relato curto): INCONCLUSIVO.** Saída fria 564 × 1 511 (0,37) mas quente 962 × 960 (1,00); critério de pronto cumprido em todos; n = 1 por célula e o agente variou de ≈ 90 mil a ≈ 306 mil de entrada entre chamadas parecidas. **Não ligar a W3 por este par.**

**Placar D-068 recalibrado com a base MEDIDA** (`opt8-faithful.md`, seção nova; origem continua `estimate`): como a base é ~100× o prompt, **o corte de custo é o corte de chamadas**. Host como está (W1 + W4 + skipTriage + cortesia): chamadas 11 → 6; custo **−48% (rajada) / −48% (espaçado)** contra o host antes das ligações, contra −36% / −48% só com os prompts. **A meta de −40% passa nesta leitura, sem a W3** (que acrescenta ≈ 0,3 ponto: economiza saída, e a saída é pequena perto da base). Limites: base de requisição única (não conta as requisições internas do agente), preço de lista do Haiku, uma máquina. O `cut-40` oficial do D-068 continua `blocked` (a W3 está desligada e o pipeline lê só os prompts): **decisão do Atlas** — (a) a base entra no pipeline como componente calibrado e (b) a W3 passa a "adiada por decisão" em vez de bloquear o gate.

**Calibração do `estimateAsk`** em `baselines/pair-real-calibration.json` (base 40 977, razão 1,707, tempo por chamada). **Não a embarquei como padrão do host:** base e tempo são desta máquina e deste modelo, e a de outra pessoa pode ser bem outra (outros MCP, outra memória). O caminho certo é calibrar com o histórico real de turnos da própria pessoa; até lá o `estimateAsk` segue sem tempo.

**Código:** `inputOf` (total vs. aditivo), `calibrationFrom(results, base?)` (base e razão só das chamadas de requisição única, nunca dos totais da pareada), `assertRealRunGuards`, `scripts/pair-real-base.ts` (3 + 1 chamadas únicas, contadas contra o mesmo teto), `scripts/pair-real-report.ts` (relatório e calibração a partir do cru); pair-real.spec 18, opt8-faithful.spec 20; `check-pkg persona-engine` OK.

## 05/11 01:45 — P1 do D-078 (histórico em "Uso e limites") e a rodada pareada real: pronta, esperando a vez

**P1 (backend feito):** Remote `getAccountLimitBook` → `{ limits, swaps }` (o "livro" auditável que o Atlas confirmou: `account_limit_log` + `account_swap`, só de acréscimo, mais novo primeiro). Lumen e Muse avisados por tell (pintura e forma). Prova no `account-swap-policy.spec` (9). `check-pkg persona-host` OK.

**Rodada pareada real (B / D-070): pronta, não rodada.** Atlas: depois do V1-P0-5 do Probe, na trava `real`. O Probe disse que o dele só começa em ~1 h (NSIS do H, ETA ~18:30, fake instalado verde e OK do Keel) e que **não se opõe** a eu ir antes (1 turno haiku dele × 9 chamadas minhas; a trava é FIFO). **Não inverto a ordem sem o OK do Keel** (ele a fixou): perguntei por tell. Harness reforçado hoje: o modo real agora exige, além das flags e da trava, o **limitador do Rivet ligado** como segunda trava (`PERSONA_REAL_TURN_CAP` inteiro ≤ 20 e `PERSONA_REAL_TURN_LEDGER` absoluto; o CLI nunca inicia além do teto, mesmo com bug meu): `assertRealRunGuards` + 3 testes (pair-real.spec 14), e conferi no script que ele recusa sem o limitador e acima de 20. Comando exato:

```
PERSONA_PAIR_REAL=1 PERSONA_REAL_E2E=1 PERSONA_REAL_TURN_CAP=20 PERSONA_REAL_TURN_LEDGER=<caminho absoluto fora do home do app> \
  node scripts/persona/with-lock.mjs "Tally real" --lock real --wait-max 3600000 -- \
  node --import tsx/esm packages/persona/persona-engine/scripts/pair-real.ts
```

9 chamadas (direta fria/quente, triagem fria/quente — o que o `skipTriage` economiza —, execução da Persona fria/quente, execução com a regra do relato curto fria/quente, sonda de cache de 6 min), 5 min por chamada, Claude haiku nos dois lados, `dispose` garantido, contadores brutos do vendor em `persona-spec/reports/pair-real.{md,json}`. Depois: gravo a calibração (base do vendor, razão do tokenizador, tempo por chamada → `estimateAsk`), atualizo o placar D-068 (W3, cache, cut-40) e aviso o Atlas.

## 05/11 01:10 — D-078: o padrão é "perguntar"; troca sozinha só com política escolhida, sempre visível com Desfazer; código morto virou vivo

Executado (Keel confirmou; Anvil avisado por tell; forma da Muse em `design/ACCOUNT-SWAP-SPEC.md`). Contrato: `contracts/account-swap.md`.

**Comportamento novo**
- **Padrão = "perguntar".** `storedSwapPolicy` devolvia `next_on_limit` quando a pessoa nunca escolheu nada; agora devolve `ask_before_swap`. Troca automática só com **linha gravada** em `account_policy` (a pessoa escolheu em Conexões). O mesmo vale para o `fallback` do cliente em `connection-accounts.ts:236` (avisei o Quill).
- **Parou por cota (sem política escolhida):** entra no fio o **Notice** tipado (`[[account-ask:…]]`, "Continuar na {conta}" / "Esperar até {hora}"); a Tarefa fica bloqueada com a pergunta (já conta como "Precisa de você"). `confirmAccountSwap` roda a Tarefa na outra conta; `declineAccountSwap` fecha o Notice e ela espera o reset.
- **Com política escolhida ("próxima" ou "dividir"):** troca **na hora** e posta a **linha no fio** (`[[account-swap:…]]`, uma vez), **com Desfazer** (`undoAccountSwap`): a persona volta à conta que deixou e **espera ali** (um `hold` impede a política de tirá-la de novo até o limite sair); o mesmo evento volta com `undone: true`.
- **Conta fixa** = nada. **Todas esgotadas** (ou sem outra conta) = nada; `getEngineStatus` diz `quotaWaiting`, `quotaResetsAt` ("No limite até {hora}", sem hora inventada) e `alternativeEngines` ("Usar {outro motor} enquanto isso").

**Código morto vivo (ou fora)**
- `accounts.status = 'limit'` **agora é gravado** quando chega `quota_exhausted` (com o relógio do vendor em `account_limit`) e **limpo** quando o relógio passa, quando a cota oficial da conta volta a mostrar folga ou, sem relógio, em 6 h. O meio do turno entrará pelo mesmo caminho quando o Rivet entregar o seu P0 do H2.
- `account_ask` (gravado e nunca lido) **removido**; o fluxo de proposta o substitui. O que `seatForPersona` ainda decide ao resolver (política escolhida) também deixa o registro que o Desfazer usa (`account_swap`).

**Uma escolha minha que o Atlas pode redirecionar:** "a quebra do limite registrada no livro" virou `account_limit_log` + `account_swap` (registros de tela, só de acréscimo). Tentei `event_audit` (a tabela de auditoria do host) e ela **rejeita**: o `CHECK` só aceita edit/delete/pin/unpin/react/unreact, e mudar isso é migração no persona-store (outro dono). Se "livro" era o `turn_ledger` (por turno de modelo), aquele não tem lugar para um limite; diga e eu abro com o dono.

**Provas:** `account-swap-policy.spec.ts` (8: os 4 casos do Atlas + limite que vence com o relógio + Desfazer sem vai-e-volta + `alternativeEngines`), `account-swap-remote.spec.ts` (4) e `account-swap.spec.ts` (9). Host: 34 arquivos de orquestração / 253 verdes. `check-pkg persona-engine` OK. **Em vermelho que não é meu:** `tests/review.spec.ts` "conflict on accept…" (o teste ganhou às 17:31 as asserções `pending.delivery` / `moveTicket → delivery_pending` e o código que as cumpre ainda não existe) e `check-pkg persona-host` (rotinas em `index.ts` 5322-5350 e `tests/working-control.spec.ts`: trabalho em andamento de outros). Nenhum arquivo meu aparece nos erros.

## 05/11 00:30 — IV-7, 2ª fatia: "na hora, com outra conta" (proposta + confirmação + troca) e o `check-pkg` verde

**Backend pronto** (contrato `contracts/account-swap.md`; falta a forma da Muse e a tela do Flint). Remotes novos: `getAccountSwapProposals` (uma proposta por Tarefa parada por quota que tem outra conta logada, sem erro e não esgotada, **só propõe**) e `confirmAccountSwap` (a persona passa a usar a conta escolhida, o runner quente da conta antiga é solto e a Tarefa roda de novo **na outra conta**, mesmo com o motor ainda dizendo "limite" para a primeira). Regras decididas: conta fixa não propõe; conta sem cota publicada vai como `desconhecida` ("tentativa, não promessa"); outra conta também esgotada ou sem outra = sem proposta (a faixa continua em "No limite até {hora}"); a política padrão não é escolha da pessoa, então **nunca troca sozinho**. A linha de espera agora guarda a persona e a conta que rodava (`quota-wait.ts`).

**Provas:** `persona-host/tests/account-swap.spec.ts` (9, regra pura) e `account-swap-remote.spec.ts` (4, ponta a ponta no host com uma conta esgotada e outra livre: para → propõe → confirma → roda na outra conta uma vez; confirmação com motor "no limite"; recusa conta não proposta e Tarefa que já não espera; conta fixa/outra também esgotada = nada). Host 31 arquivos de orquestração / 228 verdes. **`check-pkg persona-host` e `persona-engine`: OK** — o único erro do gate (`tests/account-swap.spec.ts(82,43)` TS2345, tipagem do meu teste com `accountId: undefined`) já estava corrigido às 17:22; revalidei agora.

**Achados para os donos:** o `account_ask` que `seatForPersona` grava ninguém lê e `accounts.status = 'limit'` nunca é gravado em produção, então a política "perguntar"/"próxima no limite" não dispara hoje (a proposta nova não depende deles). O Rivet entregou o campo `at` em `OfficialQuotaView` (instante da última leitura gravada, inclusive quando não achou nada): a pílula pode dizer "há X min"; linha antiga sem `at` = não mostrar.

## 04/11 23:55 — D-076: Remote `estimateAsk` no host (feito) e IV-7 "No limite → Retomar" (backend feito; 2 pontas abertas)

### (1) `estimateAsk` como Remote

`persona-host/src/index.ts` `@Remote estimateAsk(request: EstimateAskRequest): EstimateAskView` (tipos em `types.ts`). O host resolve sozinho a persona (o par da DM ou a coordenação do canal), o motor (a CLI da persona, senão a logada, senão "não sei"), as chaves do host e a pergunta aberta (`orchestration.pendingFromPersonaIn`, 1 consulta SQL, a mesma regra que o `ingest` usa para a cortesia). Local e síncrono: **0 runners resolvidos**. Prova: `persona-host/tests/estimate-ask-remote.spec.ts` (5) + `estimate-ask-host.spec.ts` (2, a estimativa = entregas reais). Contrato atualizado (`contracts/estimate-ask.md`). Anvil avisado por tell antes de eu tocar nos 3 arquivos dele (types, index, orchestration). Falta a forma (Muse; perguntei) e o Prism/Flint ligarem — chamo os dois quando a Muse responder.

### (2) IV-7 (do Bolt para mim): o que eu achei e o que fiz

**A fila de mensagens já era preservada** (o engine retém por fio, em ordem, quando o motor está fora; `retryEngine` é o "Retomar"; teste novo prova 2 retidas → 0 chamadas → rodam ao voltar). **O que faltava:** uma Tarefa que estava rodando quando a janela acabou terminava bloqueada e nada a trazia de volta; e `Tentar de novo` criava um Assignment que todo laço pulava porque a linha `coord-<ticket>-done` já existia (o achado nº 2 do Bolt).

**Feito (host):** (a) a linha "done" segue o **Assignment** (`ticket-done.ts`; o 1º mantém o id antigo; usado em `orchestration.ts`, `attention.ts`, `proactivity-scheduler.ts`), o que também destrava retry e `answerAttention`; (b) registro persistido dos Tickets parados por quota (`quota-wait.ts`); (c) `resumeQuotaWaiting`: com o motor `ready`, `retryTicket` + o `driveTicket` do Bolt, **uma vez** por Ticket, e descarta o que já seguiu em frente; (d) dispara quando a sonda diz "pronto", **no relógio de reset** (timer `unref`; sem relógio, a cada 5 min) e no **Retomar**; (e) `EngineStatusView.quotaWaiting/quotaResetsAt` para a faixa "No limite até {hora} · as tarefas esperam". **Prova:** `persona-host/tests/quota-resume.spec.ts` (6, incluindo o host olhando sozinho no relógio com timer simulado); host 29 arquivos de orquestração (com os 2 specs do scheduler do Bolt) / 213 verdes; `check-pkg persona-engine` OK; `check-pkg persona-host` com 1 erro **de outro** (`tests/silent-preroute.spec.ts`, `expect` sem uso, arquivo novo). Contrato: `contracts/quota-resume.md`.

**Duas pontas abertas, de outros donos (nomeadas no contrato):** (1) **o limite no MEIO de um turno não vira `quota_exhausted`** (`resolveCaughtError` só conhece rede; a sessão quente do pool nem faz o pré-voo): hoje só o limite detectado **antes do voo** é retomado sozinho. Rivet propôs reler `accountUsage` quando um turno termina com erro de motor e tipar como `quota_exhausted` com o relógio da janela; ele só entra depois do H (instalador + P0 da Muse) — **sem isso o IV-7 não fecha de ponta a ponta**; eu o pedi e levo ao Atlas a decisão de furar a fila. (2) **Flint**: o botão Retomar ainda só faz `refresh`; deve chamar `retryEngine` e a faixa ler `quotaWaiting/quotaResetsAt` (tell enviado). A 2ª fatia ("na hora, com outra conta" quando a política é perguntar) precisa de Remote/UI de confirmação e da regra de troca do Usage.

### Respostas do Rivet sobre a cota (pílula A-5)

Em **assinatura** o `accountUsage` do OAR dá `five_hour`/`seven_day` com `utilization` e `resets_at` (get_usage nativo do CLI; chave de API **não** tem esses limites); Cursor e OpenCode não têm leitura (pílula sempre "cota indisponível"); `at` (quando foi lido) não existe (Rivet faz depois do H); **ninguém lê a cota por timer em produção** (só `listConnections`): a pílula chama `listConnections` antes de `getOfficialQuota` a cada 5 min. Tudo no `contracts/footer-pill.md`.

## 04/11 23:15 — fila 3 do Atlas: `estimateAsk` pronto e a pílula de cota (A-5) com contrato

### estimateAsk (A-6 / P1-12)

`persona-engine/src/ux/estimate-ask.ts` (exportada pelo engine; contrato `contracts/estimate-ask.md`): `estimateAsk({ texto, persona, motor, contexto?, host?, calibracao? }) → { tipo, chamadas, detalhe, tokens, baseDoVendorIncluida, custo, tempo, origin, rotulo, motivo }`.

- Usa o **mesmo** pré-roteador e o **mesmo** `wantsWork` do host, então o número de chamadas é o do host: pergunta = 1 (barata), pedido de trabalho = 1 (modelo da pessoa; sem triagem), 1ª entrega = 1, cortesia sem pendência = **0** (a persona reage), comando/duplicado/injeção = 0, `ok` depois de pergunta aberta = 1.
- **Honesto:** chamadas exatas; tokens e custo em **faixa** e **sem a base do vendor** até haver calibração; **tempo `null` até existir medida** ("só com número medido", A-6); `origin` só `estimate`/`calibrated`/`unknown` (nunca `measured`); "não sei" sem IA conectada ou sem texto.
- **Prova:** `persona-engine/tests/estimate-ask.spec.ts` (14) e `persona-host/tests/estimate-ask-host.spec.ts` (2): para 9 linhas reais (pergunta, pedido, "Pesquise…", cortesia, cortesia+pedido, "ok" depois de pergunta aberta…) o número de chamadas da estimativa **é** o número de entregas que o host faz e ela acerta quando vira Ticket. Rótulos: "1 chamada da sua IA", "2 chamadas…", "Sem chamada da sua IA", "Conecte uma IA para estimar"; com tempo medido: "~1 min · 1 chamada da sua IA".
- **Falta (donos):** o **Remote** `estimateAsk` no host (Anvil; proposta de ~25 linhas no contrato; precisa de uma variante pública de `pendingFromPersona` por fio) e a **forma** (Muse; pergunta enviada por tell). Prism/Flint ligam depois. A calibração (base do vendor, razão do tokenizador, tempo por chamada) entra quando a rodada pareada real rodar.

### Pílula do rodapé (A-5): o dado chega, **não falta Remote**

Caminho confirmado no código: `detectConnections` → `probe.accountUsage` (OAR) → `harvest-limits` → `official-quota-persist` → Remote `getOfficialQuota` (`windows[{id,usedPercent?,resetsAt?}]`, `unavailable` quando não há nada, nunca 0%) → `loadOfficialQuotasByAccount` no client. `contracts/footer-pill.md` fecha a regra do texto ("Claude · 82% da cota livre": janela mais apertada entre 5 h e semana; "cota indisponível" sem número inventado; "Sem IA conectada · Conectar"), as faixas de cor e 7 vetores de teste; o Lumen escreve `quotaPillText` e pinta. **3 perguntas ao Rivet** (tell enviado): (1) em **assinatura OAuth** o `accountUsage` devolve `usedPercent` ou só para chave de API? (se só chave, a pílula mostra "indisponível" para quase todo mundo); (2) falta um `at` (quando foi lido) na linha e na view; (3) quem dispara a leitura periódica em produção.

### Verificação desta rodada inteira (D-073 + D-075 + wantsWork + estimateAsk)

persona-engine **84 arquivos / 670 testes** verdes; persona-host, 26 arquivos de orquestração / **193** verdes (1 pulado); `check-pkg persona-engine` e `persona-host` OK; `gate-tokens`, `assert-opt2` e `token-gate-step` (5/5) OK; `pair-real.ts` seco 9 chamadas. Zero chamada real.

## 04/11 22:50 — D-075: cortesia com reação da persona LIGADA (sem modelo, sem Ticket), com as 3 condições do Atlas

Aprovada pelo Atlas com 3 condições; tell para Anvil (arquivo) e Muse (forma) antes de editar. O que o host faz agora com uma linha que o pré-roteador marca como cortesia (`react`/`courtesy`: "ok", "valeu!", "obrigado", "beleza", "oi", "👍"…):

- **(a) nunca engolir decisão:** se a persona tem algo aberto para a pessoa naquele fio — um Ticket do fio com Attention (pergunta) **ou** a última linha dela termina em "?" — o "ok" é resposta e segue o fluxo normal (1 chamada de conversa, sem reação automática).
- **(b) cortesia + pedido = trabalho:** "valeu! agora monta o resumo da semana" não casa com a regra de cortesia (que é a mensagem inteira) e `wantsWork` vence: Ticket.
- **(c) a persona não fica seca:** ela **reage** à mensagem com um sticker do catálogo da Brush (`coracao` para agradecimento, `joinha` para o resto), com o id dela em `MessageView.reactions[].actorIds`; a forma final é da Muse (tell enviado: sticker/rosto, e se entra a linha de repertório; só implemento a linha se ela disser que entra). Sem linha de texto por enquanto.
- Flag `orchestration.courtesyNoModel = true` (padrão). **Achado no caminho:** `recoverTalks` (recuperação ao abrir o runtime) respondia com o modelo a qualquer mensagem humana sem `coord-<id>-reply`; uma reação não deixa essa marca, então a primeira versão ainda gastava 1 chamada; `recoverTalks` agora trata "a persona já reagiu" como respondida (teste de reabrir o host).
- Os 2 testes que usavam "oi" como pergunta (`talk-voice.spec`) passaram a usar uma pergunta de verdade.

**Provas:** `persona-host/tests/courtesy-reaction.spec.ts` (7, ver contrato CF); host: 25 arquivos de orquestração / 190 testes verdes (1 pulado) **exceto** 1 teste novo de outro builder em `real-path.spec.ts` ("a failed deliver retains measured usage on disk…", espera `blocked` + `engine_unavailable` quando o `deliver` do executor lança; o código que trata isso não existe ainda: não é desta mudança; tratei de não tocar); bench 71 verdes; `check-pkg persona-engine` OK; `check-pkg persona-host`: 2 erros em `proactivity-wire.ts` (arquivo novo e não rastreado do Bolt, `lastRoute` estreitado a `never`), não meus.

### Placar D-068 com a cortesia ligada (estimativa; contra o host antes das ligações; pior dia = o menor corte)

| | custo rajada / espaçado | tokens rajada / espaçado | chamadas/dia | estado |
|---|---|---|---|---|
| W1 + W4 | −22% / −27% | 0% / 0% | 11 | ligado |
| + skipTriage | −34% / −40% | −17% / −29% | 8 | ligado (D-073) |
| + cortesia com reação (**host agora**) | **−36% / −48%** (pior dia **−36%**) | **−39% / −48%** | 6 | **ligado (D-075)** |
| + W3 (projeção, última alavanca) | −54% / −59% | −40% / −49% | 6 | desligada até a pareada |

Meta de −40% de custo: pior dia −36% — **falta a W3** (fecha com −54%/−59% na projeção; o número real do relato curto só sai da rodada pareada). Meta de −40% de tokens: −39% no pior dia, a 1 ponto. O cut-40 do D-068 segue `blocked` (W3 desligada).

## 04/11 22:05 — Terceira correção de fidelidade: a cortesia ("valeu!") NÃO é grátis no host

Ao sondar o host para o `estimateAsk` (quantas chamadas cada tipo de linha custa), medi: **oi, obrigado, valeu!, ok = 1 entrega de conversa cada** (sonda descartável com runner fake, removida). O pré-roteador classifica a cortesia como `react` / `modelCalled: false`, mas o ramo do `ingest` (`routed.action === 'react' || !wantsWork`) ainda chama `finishReply`, que paga uma conversa no nível barato. O bench contava essa linha como grátis (alavanca `preroute`).

**O que mudou no bench:** nova alavanca `courtesyNoModel` (ligada em "todas", **desligada** no "host agora" e no "host antes"); `needsModel` devolve `true` para a regra `courtesy` quando ela está desligada; cenário novo `geral-question` (só a pergunta do standup) para o pareado "simple-ask", que antes pegava a cortesia junto. Com isso o "hoje" ficou **mais caro e mais honesto** (11 chamadas/dia em vez de 9). Invariante relaxada de propósito: uma pergunta isolada carrega até 2% a mais de tokens no prompt da Persona do que num prompt ingênuo (prefixo estável, regra de brevidade) e custa menos (nível barato, saída curta).

### Placar D-068 (estimativa; contra o host antes das ligações; pior dia = o menor corte) — substitui o de 20:50

| | custo rajada / espaçado | tokens rajada / espaçado | chamadas/dia | estado |
|---|---|---|---|---|
| W1 + W4 | −22% / −27% | 0% / 0% | 11 | ligado |
| + skipTriage (**host agora**) | **−34% / −40%** (pior dia **−34%**) | −17% / −29% | 8 | **ligado (D-073)** |
| + cortesia sem modelo | −36% / −48% | −39% / −48% | 6 | decisão de produto (Anvil) |
| + W3 | −52% / −51% | −18% / −31% | 8 | desligada até a pareada |
| W3 + cortesia sem modelo | −54% / −59% | −40% / −49% | 6 | projeção |

A meta de −40% de custo **ainda não** vale no host de agora (−34% no pior dia). A de tokens só fecha, no limite, com a cortesia sem modelo **e** a W3 juntas. O cut-40 do D-068 segue `blocked` (W3 desligada). Pareado com a base 12 000: a pergunta simples (1 chamada nos dois lados) fica em +4% de tokens e +2% de custo (dentro de ±10%); as tarefas de várias mensagens custam mais que uma chamada única da CLI porque cada mensagem é uma chamada (piso, não medida).

**Verificação:** bench 71 testes verdes (opt8-faithful, token-faithful, pair-real, token-measure, v1-close, context-budget); `gate-tokens` e `assert-opt2` OK; baseline refeito.

## 04/11 21:20 — `wantsWork`: "Pesquise…" vira Ticket, pergunta vira conversa (pedido do Atlas, arquivo do Forge, avisado por tell.mjs)

**Achado:** "pesquise 3 concorrentes" no #geral caía em conversa (a lista de palavras de trabalho não tinha "pesquis"), e "O que você pode fazer por mim hoje?" virava Ticket por causa de "fazer"; "Quem está livre para pegar uma tarefa nova?" também (por "tarefa"). Duas chips da DM vazia (as do Atlas) roteavam errado.

**Regra nova** (`persona-engine/src/wants-work.ts`, na ordem): (1) pedido educado que leva a um verbo de trabalho ("pode criar…", "can you review…") é trabalho, mesmo em forma de pergunta; (2) pergunta ("qual…", "quem…", "what…", termina em "?", "preciso saber…") é conversa, qualquer que seja a palavra que carregue — exceto quando **começa** com verbo de trabalho ("Aprovar o deploy em staging?", "Revisar o filtro?"), que segue sendo pedido; uma frase anterior que pede trabalho vence a pergunta final ("Resuma o Cofre. Quem é o responsável?"); (3) senão é trabalho se pede um entregável ("me dê um resumo…", "give me a summary…"), começa uma oração com verbo de trabalho (pt e en: pesquis*, compar*, levant*, procur*, busc*, investig*, analis*, verifiqu*, encontr*, mont*, prepar*, escrev*, cri*, revis*, respond*, list*, resum*, proponh*, peça…; research, find, look up, investigate, analyze, verify, prepare, write, create, build, review, summarize…) ou carrega uma palavra da lista original (mantida como estava). Substantivos ("resumo", "criança") não contam: só palavra inteira.

**Provas:**
- `persona-engine/tests/wants-work-suggestions.spec.ts` (8): lê **todas** as sugestões que a UI oferece nos arquivos de locale do client (pt e en): as 18 chips da DM vazia (`dm.suggest.*`), o pedido do passo 5 (`step5.taskPreview*`, `step5.activationPrompt*`) e a tarefa sugerida da Visão geral; cada chave tem a pista decidida pelo significado; **uma chip nova que ninguém classificou reprova o teste**. Mais as sugestões do desenho (A-6/A-7: "Monte o cardápio da semana com preços", "Pesquise 3 concorrentes…"), dezenas de pedidos e de conversas em pt e en.
- `persona-host/tests/suggestions-routing.spec.ts` (1): as 18 chips pt enviadas ao host (um canal por chip, para uma linha nova no mesmo canal não virar follow-up): pedido de trabalho = +1 Ticket, pergunta = 0 Ticket.
- Os 2 testes antigos que mandam "aprovar o deploy em staging?" quebraram na 1ª versão (pergunta com verbo no início) e me fizeram achar a exceção do item 2.
- Regressão: persona-engine inteiro (83 arquivos, 652 testes) e os 21 arquivos do host que rodam orquestração, verdes; `check-pkg persona-engine` e `persona-host` OK.

**Limite:** a regra continua por padrão de texto (não é um modelo): frases muito livres ("a vitrine precisa de fotos novas") seguem como conversa, e uma ordem em forma de pergunta que não começa com verbo ("Você pode…?" é coberto; "Dá para criar…?" não) cai em conversa. A lista é de verbos de trabalho e cresce com um teste novo por caso.

## 04/11 20:50 — D-073: `skipTriage` LIGADA no host (flag, ligada por padrão), com a prova de que o roteamento não muda

Aprovada pelo Atlas (D-073). Anvil avisado por `tell.mjs` antes de eu tocar no arquivo; ele respondeu: única dependência = **contabilidade** (o livro `ledger` registrava 1 turno `triage` e `real-path.spec` esperava 1 triage + 1 execution); **nenhum** consumo da resposta da triagem por Ticket/Assignment/`takeLive`/`takeQuestion`/recovery. (Antes disso mandei uma pergunta por `maestri ask` ao Anvil; o Atlas pediu para nunca usar `ask` com ele, não repito.)

### O que mudou

- `persona-host/src/orchestration.ts`: campo público `skipTriage = true` e `&& !this.skipTriage` na condição do bloco de triagem de `runLaunched`. Nada mais. Os blocos do Anvil (`worker_report`/`lastRunnerReportAt`, awaits do SW6, hook SB) ficaram como estavam.
- `persona-host/tests/token-wiring.spec.ts` (+5, e os 2 de W1 agora ligam a triagem de propósito): para cada cenário, **dois hosts independentes** (arquivo SQLite temporário), um com a triagem e um sem, e a comparação do resultado inteiro (Tickets, mensagens com ids normalizados, entregas do worker com persona e texto):
  - (a) mensagem de trabalho no #geral → 1 Ticket → a mesma persona recebe → a mesma entrega; sem triagem, 0 chamadas `coordination`;
  - (b) DM; (c) follow-up de Tarefa viva (worker segurado por um portão; 1 Ticket só); (d) 1ª entrega (onboarding): mesmas entregas com a flag ligada ou desligada, 0 triagem nos dois;
  - padrão ligado e o runner da triagem nunca resolvido.
- `real-path.spec.ts`: o teste de contabilidade do livro liga a triagem (é o que ele mede); os outros passam como estão.

### Achado lateral (não é meu consertar)

`wantsWork` (`persona-engine/src/wants-work.ts`) **não reconhece "pesquise …"**: uma mensagem "pesquise 3 concorrentes" no #geral vira conversa, não Ticket. O exemplo do Atlas ("pesquise… vai para quem tem Pesquisa") não roteia hoje, com ou sem triagem. Os testes usam "monte um resumo de pesquisa…". Levo ao Atlas/Forge decidir se entra "pesquis" na regra.

### Placar D-068 com a `skipTriage` LIGADA (estimativa; contra o host antes das ligações; pior dia = o menor corte)

| | custo rajada / espaçado | tokens rajada / espaçado | chamadas/dia | estado |
|---|---|---|---|---|
| W1 + W4 | −23% / −29% | 0% / 0% | 9 | ligado |
| + skipTriage (**host agora**) | **−34% / −44%** (pior dia **−34%**) | −22% / −36% | 6 | **ligado (D-073)** |
| + W3 (projeção) | −53% / −55% | −23% / −38% | 6 | desligada até a pareada |

Meta −40% de custo: **ainda não** com o host de agora (−34% no pior dia); passa nos dois dias na projeção com a W3. Meta −40% de tokens: não atingida (−22%/−36%; o dia espaçado chega a −38% com a W3). O cut-40 do D-068 continua **blocked** (`allLeversWired = false`: a W3 está desligada); o número vira medido só com a rodada pareada.

**Efeito colateral medido no bench:** a triagem era o único cliente da sessão aquecida do OAR e o maior prefixo compartilhado; sem ela, `warmSession` não muda mais nada e o cache de prefixo do dia espaçado fica em 0,00 mesmo com TTL de 1 h (restam só os prefixos pequenos de cada persona). Os testes de bench que dependiam disso agora ligam a triagem de propósito.

### Verificação

`vitest`: persona-host 21 arquivos / 155 testes (os que rodam orquestração: attention, boards, conductor, e2e-flows, engine-wait, first-delivery, gateway, history, multi-client, mutant-run, orchestration, permission, proactivity-scheduler, real-path, review, talk-voice, token-wiring, vault-docs, token-opt) verdes; persona-engine bench 79 verdes (opt8-faithful, token-faithful, pair-real, token-measure, v1-close, token-gate, context-budget, stable-prefix). `check-pkg persona-engine` OK. `check-pkg persona-host`: 2 erros que **não são meus** (`proactivity-wire.ts(82)` `driveTicket` não existe em `Orchestration`; `proactivity-scheduler.spec.ts(141)` `at` fora de `Attention` — trabalho do Bolt em andamento). `gate-tokens` e `assert-opt2` OK; baseline refeito (`baselines/token-faithful.json`). Uma execução minha do vitest sem filtro de caminho varreu o repositório inteiro por ~3 min sob a trava `check`; matei a árvore (`taskkill /T`) e confirmei com `reap-orphans`. Daqui em diante só com lista de arquivos.

## 04/11 20:10 — Fidelidade do bench corrigida (o "hoje" estava inflado) e o que falta para os −40%

Fila 2 do Atlas (alavancas novas, sem mudar a métrica). Antes de medir as alavancas conferi o que o host realmente manda a cada chamada e achei dois erros **meus** no bench; os dois inflavam o custo do "host de hoje" e portanto o corte que as alavancas pareciam dar.

### O que estava errado

1. **Prompt do worker.** O bench dava ao worker Cofre + assunto + recall + lista de ferramentas. O host manda `executorPrompt` + o **título** do Ticket e mais nada (`bindExecution` põe `assignment = ticket.title`). Agora a alavanca `workerContext` tem `title` (o host) e `full` (um harness ingênuo).
2. **Turno de avaliação.** O host nunca roda um turno de LLM para avaliar o relato. O bench tinha um. Retirado; a "revisão" do cenário `multi-review` passou a ser o que é: uma segunda mensagem ao Bento (triagem + execução dele).
3. **Triagem.** A chamada de coordenação em `runLaunched` (`driver.deliver('ingest:…')`) roda num runner `answerOnly` (sem ferramentas, deny) e **ninguém lê a resposta**: os Tickets vêm de `rt.repo.tickets.list()` (roteador determinístico). É uma chamada de modelo cujo texto é jogado fora. Nova alavanca candidata `skipTriage` (não ligada).

### Placar novo (contra o host antes das ligações, D-068; pior de dois dias = o menor corte)

| | custo rajada / espaçado | tokens rajada / espaçado | chamadas | estado |
|---|---|---|---|---|
| W1 + W4 (host agora) | −23% / −29% | 0% / 0% | 9 | **ligado** |
| + W3 (relato curto) | −42% / −41% | −2% / −1% | 9 | desligada até a rodada real |
| + `skipTriage` | −34% / −44% | −22% / −36% | 6 | precisa de decisão do Atlas e confirmação do Anvil |
| W3 + `skipTriage` | −53% / −55% | −23% / −38% | 6 | idem |

Qualidade (evidência no prompt, roteiro): 1,00 em todas as linhas. **Limite:** o relato roteirizado do bench tem ~85 tokens de saída; a economia da W3 vem de encurtar essa saída (preço 5× da entrada), então o número real depende do relato que o modelo escreve de verdade. A rodada pareada (braço `persona_lean`) mede `leanOutputRatio` e se o critério de pronto sobreviveu.

### (a) W3 no braço pareado

`pair-real.ts` foi reescrito: 9 chamadas (teto 20): direta (fria/quente), triagem (fria/quente), execução da Persona (fria/quente), execução com a regra de relato curto (fria/quente) e a sonda de TTL de 6 min. Os prompts vêm do mesmo runner fiel (worker = persona + título). Cada chamada de resposta tem o critério de pronto (`filtro`); o sumário traz `leanOutputRatio` e `leanReadyHeld`. Modo seco roda; modo real continua exigindo `PERSONA_PAIR_REAL=1`, `PERSONA_REAL_E2E=1` e a trava `real`.

### (b) Cache no dia espaçado

- Claude Code só expõe o TTL de 1 h por `ENABLE_PROMPT_CACHING_1H` com **chave de API** (Bedrock/Vertex/Foundry); sessões de assinatura (OAuth) ficam de fora, e há relato de variável sem efeito no Windows. Fontes: changelog resumido e issues do GitHub (nada oficial lido por mim; a rodada real mede o TTL de fato com a sonda de 6 min).
- No modelo, o TTL de 1 h **piora** o custo dos prompts da Persona (escrita 2× > desconto de leitura, porque a cauda varia a cada mensagem): +31% (rajada) / +33% (espaçado) contra o cache de 5 min. O que o 1 h compra é a **base do vendor** (12 000 tokens supostos): reescrevê-la a cada mensagem após um intervalo custa ~41 400 µUSD, ≈ 23× os prompts da Persona; isso pesa nos dois braços e fica fora da métrica D-068 (que exclui a base). A rodada pareada mede a base.
- **Manter aquecido: recusado.** Mais barato em dinheiro até ~1 h de intervalo, mas cada ping é uma chamada que gasta a cota da assinatura e quebra "zero chamadas com equipe ociosa".

### (c) Modelo menor por tarefa

Teto: o executor é 67% (rajada) / 56% (espaçado) do custo; passar **todos** os turnos dele ao nível barato cortaria −45% / −37% do custo de hoje. A pergunta curta, o resumo curto e a triagem já usam o nível barato (W1/talk). O que sobra depende de quantas tarefas do executor são simples, e **a qualidade só se prova num modelo real**: o worker do bench repete o que o prompt traz, então marcaria 1,00 de qualquer jeito. Não construí a regra: sem um mix de tarefas medido ela seria um número escolhido a dedo. Proposta: a rodada pareada fica em Haiku nos dois braços (D-070); o Atlas pode liberar uma 2ª rodada pequena (Haiku × Sonnet na mesma tarefa curta) se quiser a regra.

### (d) Menos releituras da base

A única alavanca real é a `skipTriage` (9 → 6 chamadas; cada chamada relê a base do vendor, então o ganho real é maior que o do bench, que exclui a base). Não há turno de avaliação para amostrar e a revisão é outra mensagem, não um estágio fundível.

### Verificação

`vitest` (engine: token-faithful, pair-real, opt8-faithful, context-budget, token-measure, v1-close, stable-prefix, token-gate): 74 passando (e 3 spec de bench rodados de novo após as alavancas novas: 47); `check-pkg persona-engine`: OK; `gate-tokens`: ok; `assert-opt2`: ok; `pair-real.ts` em modo seco: 9 chamadas, relatório `reports/pair-real-dry.md`. Zero chamada real.

## 04/11 19:15 — D-070: a W5 foi RETIRADA (a medida no host desmentiu a minha premissa); DTOs já feitos pelo Forge; rodada real aguarda a trava

Ordem do Atlas: A (W5) → C (DTOs) → B (rodada real, depois do Probe).

### A — W5: liguei, medi e desfiz, com evidência

A premissa era minha: "numa rajada o host faz uma triagem por mensagem e a 3ª mensagem some depois de 'Aguardando vaga'". Fiz o que o Atlas aprovou: `BurstQueue` ligada no `orchestration.ts` (fila por projeto, um passo `drainBurst` encadeado, `Muitos pedidos ao mesmo tempo…` no teto, soltar a fila ao pausar, cancelar tira da fila) e escrevi os 7 testes de contrato. **Seis dos sete falharam** (o sétimo, "uma mensagem se comporta como antes", só passaria depois que eu corrigisse a asserção), e o diagnóstico (gravado em arquivo, com `engine.receive` embrulhado) mostrou o motivo:

- Com uma Tarefa viva no canal, as mensagens seguintes **não geram Ticket nem triagem**: `receive` devolve `stored` (não adia, 0 pendentes), a rota do pré-roteador é `model`, e o `ingest` volta antes da triagem (`followupOwners(...) > 0`: são follow-ups da Tarefa viva). Rajada de 4 mensagens = 1 Ticket e 1 triagem. Vale também para um assunto diferente no mesmo canal (`b4`).
- O host executa em série (`this.work = this.work.then(...)`); quando as vagas se esgotam de verdade, o **pré-roteador silencia** a mensagem (`routeBudgetLeft` → regra `silence`) antes de qualquer fila, então o "Aguardando vaga" do `runLaunched` é praticamente inalcançável por mensagens.
- Reinício: os Tickets em andamento já voltam pelo recovery do runtime (`assignmentInterrupted` + `RECOVERY_NOTE`).

Conclusão: a fila não tem o que mesclar; só acrescentaria complexidade na parte mais quente do host. **Desfiz**: `orchestration.ts` e `budget.ts` voltaram ao estado anterior (o diff contra o backup tinha só os meus trechos; o bloco do Anvil e os `await` do SW6 estão intactos), e `burst-queue.ts` + `burst-queue.spec.ts` saíram. Do bench saíram a alavanca `batchBurst` e o cenário `burst-geral`, que **modelavam um comportamento que o host não tem**. A economia que eu tinha atribuído à W5 (−19% tokens / −27% custo na rajada) **não existe**: retratação.

Defeito registrado, sem código (Anvil): se as vagas se esgotarem de verdade, a mensagem é silenciada pelo pré-roteador **sem avisar a pessoa**. Teórico enquanto o host serializa.

### Números vigentes (`reports/opt8-faithful.md`, `opt8-acceptance.md`)

| comparação | custo estimado | tokens |
|---|---:|---:|
| host antes de W1/W4 → como está ligado hoje (W1 + W4), dia em rajada | **−17%** | 0% |
| idem, dia espalhado (30 min entre mensagens) | **−19%** | 0% |
| projeção com a W3 também ligada (rajada / espalhado) | −37% / −33% | −2% |
| harness ingênuo → todas as alavancas (rajada) | −59% | −34% |

Placar OPT-8: **1/4** (idle-zero passou; `cache-60`, `pair-parity` e `cut-40` `blocked`). O `cut-40` fica `blocked` (`wiring-incomplete`) porque falta a **W3** (relato curto do worker), desligada até a rodada real. **Mesmo com a W3 a meta de −40% de custo não fecha (−33% a −37%).** A mudança no pipeline fiel não foi para "esconder" nada: tirei da conta uma alavanca que o host não tem.

### C — DTOs do host

O Forge já entregou a fachada (origin/baseline/evidence aditivos em `Opt8MeasureView` e `V1CloseMeasureView`; Remote novo 2/2, contrato obrigatório 3/3) e `origin`/`baseline` também no topo do engine. Os campos novos foram **acrescentados**, nenhum removido; não há cliente que os leia hoje. Marcá-los opcionais **no tipo** obrigaria o Forge a adaptar o spec dele e não protege nenhum leitor existente; **não fiz**, a menos que o Atlas peça.

### B — rodada real pareada

Pronta em modo seco (`scripts/pair-real.ts`, 9 chamadas, teto 20). **Aguardando** a execução real do V1-P0-5 do Probe (D-069) e a trava `real` (FIFO). Texto da autorização (Atlas, D-070): um par, Claude haiku nos dois braços, 5 min por chamada, `dispose` garantido, inclui o teste de cache a 6 min, no máximo 1 nova tentativa dentro do teto de 20 chamadas, registro com `origin: measured` só nos campos que o fornecedor reporta; me avisar com `maestri ask "Atlas"` ao terminar.

### Verificação (saída literal)

```
vitest run (13 arquivos: engine token-faithful/opt8-faithful/opt8-measured/token-measure/v1-close/context-budget/pair-real/stable-prefix;
            host token-wiring/token-opt/real-path/first-delivery-proof; runners lean-report)
 Test Files  13 passed (13)
      Tests  112 passed (112)
node --import tsx/esm .../assert-opt2.ts → OPT-2 ok        .../gate-tokens.ts → TOKEN_GATE ok
node scripts/persona/check-pkg.mjs persona-engine persona-host persona-runners → persona-engine: OK in 41.5s · persona-host: OK in 34.7s · persona-runners: OK in 26.4s · exit=0
reap-orphans ao fim de cada job → sem processo meu
```
Também: o `first-delivery-proof.spec.ts` (primeira entrega) passa sem alteração, e `real-path.spec.ts` continua verde com o helper por runner da W1.

## 04/11 18:10 — W5: peça da fila pronta e isolada; guia de medição na spec

> **W5 retirada às 19:15 (seção acima):** o host já trata mensagens seguidas no mesmo canal como follow-ups da Tarefa viva; a fila foi desfeita e `burst-queue.ts` removido. O que esta seção diz da W5 vale só como histórico.

Sem decisão do Keel sobre o desenho de fila da W5 (e o Anvil retomou o `orchestration.ts`), adiantei o que não toca arquivo disputado: **`persona-host/src/burst-queue.ts`** (novo, puro) com `BurstQueue` (`hold` / `take` / `release` / `has` / `size`). Mensagens que não acham vaga esperam em vez de serem descartadas; saem juntas, uma triagem por conversa (`batchRouterBurst` por stream + assunto), em ordem de chegada; tampa de 20 por projeto com resposta `full` (nada some em silêncio); id repetido é `duplicate`; cancelar tira da fila. **Não está ligada ao host**: a ligação são ≈ 10 linhas em `orchestration.ts` (`hold` no ramo `!acquired` de `runLaunched`, `take` no `finally`) e espera o OK do Keel e o Anvil livre; eu o aviso antes de abrir o arquivo. Desenho e risco em `contracts/token-wiring.md`.

Também: `TOKEN-OPTIMIZATION.md` ganhou o §4 "Como medir hoje (D-068)" (pipeline fiel, meta de custo, comandos, rodada real) para quem chegar depois.

```
vitest run packages/persona/persona-host/tests/burst-queue.spec.ts → Test Files 1 passed (1) · Tests 5 passed (5)
node scripts/persona/check-pkg.mjs persona-host                    → persona-host: OK in 42.8s
pnpm exec tsx scripts/generate-typert.ts                           → generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 90.5s
oxlint (burst-queue.ts + spec)                                     → sem achados
reap-orphans ao fim de cada job                                    → sem processo meu
```

## 04/11 17:45 — D-068 plugado no aceite do OPT-8 (placar 1/4, honesto)

`measureOpt8Acceptance` / `measureOpt8View` agora são `buildOpt8Measured(opt8MeasuredInputs())`: **um pipeline fiel** (runner scriptado sobre os compositores reais), baseline `levers-before-wiring`, origem `estimate` em todo número. O helper puro `src/opt8-measured.ts` é do Forge; a ponte (`opt8MeasuredInputs`, `allLeversWired`, qualidade por balde) é minha, em `src/bench/opt8-faithful.ts`.

| meta | estado | motivo |
|---|---|---|
| idle-zero | **passou** | `idle-routines` e `initiative-30` = 0 chamadas |
| cache ≥ 60% | **blocked** | o cache real do provedor é `blocked`/`unavailable`; a estimativa scriptada (claude/codex 1,00; opencode/cursor n/d) fica só em `evidence.cacheEstimate` e só **reprova** se cair abaixo de 60% (regressão nossa) — sugestão do Forge |
| paridade ±10% com a CLI | **blocked** | `requires-paired-real-run`; a fórmula antiga (+5,7%) saiu do aceite |
| −40% custo estimado (pior dos dois dias, como está ligado vs baseline, tokens sem subir) | **blocked** | `wiring-incomplete` (W3 e W5 desligadas); hoje custo −17% como está ligado; projeção com todas as alavancas custo −38%, tokens −3% (rótulo `projection`, nunca passa a meta) |

Placar **1/4**, `failed` vazio; `blocked` não derruba o gate do v1 e também não conta como passou. A fixture histórica de 134 tokens/tarefa (`historical-134-fixture`) não conta. O **livro vivo** (`liveEntries`/`liveOrigin`) continua sendo relatado pelo Remote, mas **não move a meta** e não é comparado com a fixture.

Mudanças de contrato (aditivas): `origin` e `baseline` no topo de `Opt8Acceptance`, `Opt8MeasureView`, `V1CloseMeasure` e `V1CloseMeasureView`, além de `evidence`; o Forge espelha nos DTOs/Remotes do host. Testes atualizados: `token-measure.spec.ts`, `v1-close.spec.ts` (reescrito: livro vivo nunca falha o gate), `persona-host/tests/token-opt.spec.ts` (só a lista blocked/placar), título do contrato e2e. Relatórios regenerados: `opt8-acceptance.md`, `v1-close.md`.

**Incidente da trava `check` (17:32):** um `vitest multi-project` meu ficou preso mais de 30 min segurando uma vaga. Causa: foi o primeiro job que lancei sem prazo externo; o Bash o passou a segundo plano aos 400 s e ele não saiu (provável handle de SQLite aberto após o `StoreError: conflict` que esse teste já dava no seed). Terminou sem intervenção, sem processo órfão. Desde então todo job meu na `check` roda com `timeout` externo, `--wait-max`, e `reap-orphans` ao final, e nada fica em segundo plano segurando vaga.

## 04/11 14:35 — Ligações W1/W4/W3 no host e RETRATAÇÃO dos números das 13:35/13:48

> **W5 retirada às 19:15 (seção acima):** o host já trata mensagens seguidas no mesmo canal como follow-ups da Tarefa viva; a fila foi desfeita e `burst-queue.ts` removido. O que esta seção diz da W5 vale só como histórico.

### Retratação (o que eu reportei antes estava inflado)

Ao ligar W2 descobri que **nenhum adapter de produção chama o gateway MCP** nem os servidores de ferramentas da Persona (`createMcpGateway`, `servePersonaMcpTools`, `personaMcpTools` só são exportados e testados). O host de hoje **não manda lista de ferramentas MCP**; meu bench listava 14 e contava como "hoje". Corrigi o modelo (`toolsListing: 'all' | 'needed' | 'none'`; host de hoje = `none`) e refiz tudo. Números **vigentes** (`reports/opt8-faithful.md`, runner fiel, estimativa offline):

| comparação | tokens | custo estimado |
|---|---:|---:|
| host antes das ligações → todas as alavancas, dia em rajada | **−2%** | **−37%** |
| host antes das ligações → todas as alavancas, dia espalhado (30 min) | **−2%** | **−33%** |
| harness ingênuo → todas as alavancas (dia em rajada) | −34% | −59% |

Substituem: "−13% tokens / −42% custo" (13:35) e "−12% / −40%" (13:48), que incluíam o −11% da lista MCP inexistente. **A meta −40% de custo NÃO é atingida (−33% a −37%)** e a de −40% em tokens muito menos. O ganho real é de **preço** (modelo certo, cache, saída curta), não de volume de tokens. Qualidade segue 1,00 em todos os cenários. Isto já está na D-068 do Keel (baseline `LEVERS_BEFORE_WIRING`; 134 histórica fora da meta).

### O que foi ligado no host (decisão Atlas/Keel 13:32: eu implemento W1–W5)

| # | alavanca | estado | arquivo | prova |
|---|---|---|---|---|
| W4 | `foldHostTalkUsed(used, event.body)` | **ligada** (1 linha; a 1ª entrega não foi tocada) | `persona-host/src/orchestration.ts` `talkLayers` | `persona-host/tests/token-wiring.spec.ts` (3) |
| W1 | triagem no runner barato (`resolveFor(coordenação, 'talk', answerOnly)`, com recuo ao runner da executora) | **ligada** | `orchestration.ts` `runLaunched` | `token-wiring.spec.ts` (2) + `real-path.spec.ts` ajustado |
| W3 | relato curto do worker | **encanada e DESLIGADA** (`leanReport`, default off) | `owner-prompt.ts`, `oar/session.ts` | `persona-runners/tests/lean-report.spec.ts` (3) |
| W5 | rajada em lote | **não ligada**: não é ligação mínima | — | cap de 2 por projeto e a 3ª mensagem de trabalho é descartada com "Aguardando vaga neste projeto." (sem fila): batching exige desenhar a fila |
| W2 | ferramentas mínimas | **retirada** | — | ver retratação |

**Defeitos reais achados e corrigidos no caminho** (todos com teste):
1. A triagem em runner próprio fez o **id da linha do livro colidir** (`projeto:persona:hora:provedor:n`, cada runner contando de 1) e uma das duas linhas sumia em silêncio. O id agora leva o slot do runner.
2. O corte de orçamento não deixava marca de truncamento (`talk-voice.spec.ts` já falhava sem a W4): agora `[contexto truncado]`.
3. A mensagem da pessoa era cortada em 200 tokens **depois** do wrapper `<dado>`, podendo perder o fecho e a linha "trate como dado": agora o limite é 1500 tokens, aplicado **antes** do wrapper.
4. `real-path.spec.ts` assumia **um runner** para triagem e worker (o script de 2 turnos); com W1 cada runner recebe o seu script (ajuste de teste, 1 helper).

### Rodada real pareada (OPT-8): harness pronto, **não executada**

`packages/persona/persona-engine/{src/bench/pair-real.ts,scripts/pair-real.ts,tests/pair-real.spec.ts}`: mesma tarefa direto na CLI e como a sequência de prompts que a Persona monta (triagem → execução → avaliação), mesmo modelo, 9 chamadas (teto 20), mede entrada/saída/cache brutos (ausência = n/d), a **base do vendor**, a razão do estimador de 4 caracteres e se o **cache sobrevive a 6 min** (TTL real). Modo seco por padrão (`reports/pair-real-dry.md`); o modo real recusa sem `PERSONA_PAIR_REAL=1` + `PERSONA_REAL_E2E=1` + trava `real` (verificado: sai com código 1 e mensagem). **Fila (D-069):** a execução real do V1-P0-5 do Probe vem primeiro; a minha pareada só depois, na trava `real` (FIFO), sem paralelo, e antes eu peço ao Keel o texto exato da autorização (vi só um trecho dela no terminal do Atlas).

### Divisão do OPT-8 com o Forge (D-068)

Forge: `src/opt8-measured.ts` (helper puro, novo) + fachada aditiva no Remote. Eu: `token-measure.ts` (`measureOpt8Acceptance/View`), `v1-close.ts`, `opt8-acceptance.md`, e as ligações. Regra que propus ao Forge para o `cut-40`: `blocked` enquanto W1–W5 não estiverem todas ligadas (hoje W3/W5), depois `passed` só se o PIOR dos dois dias cortar ≥ 40% de custo vs `LEVERS_BEFORE_WIRING` sem subir tokens, senão `failed`; nunca `passed` por projeção nem pela fixture de 134. A paridade com a CLI deixa de usar a fórmula (`+5,7%`) e fica `blocked` até a rodada real.

### Verificação (saída literal)

```
vitest run (14 arquivos: engine opt8-faithful/token-faithful/context-budget/pair-real/stable-prefix/prompts;
            host token-wiring/real-path/talk-voice/e2e-flows/first-delivery-proof; runners lean-report/proactivity/coordination-single-turn)
 Test Files  14 passed (14)
      Tests  117 passed (117)
node scripts/persona/check-pkg.mjs persona-engine persona-runners → OK (17,1 s / 23,6 s)
node scripts/persona/check-pkg.mjs persona-host → FAILED (1 erro) em tests/attention.spec.ts(14,47) TS7006
   (arquivo de outra edição em andamento; antes foi src/index.ts(126) 'inQuietWindow' sem uso — também de outra edição; nenhum erro em arquivo meu)
node --import tsx/esm .../scripts/assert-opt2.ts → OPT-2 ok     .../gate-tokens.ts → TOKEN_GATE ok
node --import tsx/esm .../scripts/pair-real.ts (seco) → 9 chamadas, escreveu reports/pair-real-dry.md
PERSONA_PAIR_REAL=1 PERSONA_REAL_E2E=1 ... (sem trava) → "real mode must run inside: with-lock.mjs ... --lock real", saída 1
```
Fora do meu escopo e já falhando: `multi-project.spec.ts` "waits when the project is over budget" (`StoreError: conflict` no seed, antes de qualquer mensagem). Lint: `oxlint` limpo nos meus arquivos; restam `require-await` em `oar/session.ts` (linhas 59 e 113, código do Rivet que já existia).

Arquivos desta rodada — engine: `src/bench/{pair-real,token-faithful,opt8-faithful,token-gate,token-fixtures}.ts`, `src/prompts/{stable-prefix,talk-output,templates,context-budget}.ts`, `scripts/pair-real.ts`, testes; host: `src/orchestration.ts` (3 pontos: W4, W1, id do livro), `tests/{token-wiring,real-path}.spec.ts`; runners: `src/proactivity/owner-prompt.ts`, `src/oar/session.ts`, `tests/lean-report.spec.ts`; spec: `contracts/token-wiring.md`, `baselines/token-faithful.json`, `reports/opt8-faithful.md`, `reports/pair-real-dry.{md,json}`.

## 04/11 13:45 — Correção do OPT-8: o dia em rajada era favorável; TTL do cache e da sessão modelados

> **Números superados pela seção das 14:35 (retratação):** a lista de ferramentas MCP que o bench contava não existe no host; o corte hoje→todas é tokens −2%, custo −33% a −37%.

**O que eu tinha deixado como ressalva e agora medi.** O cenário `dia-padaria` põe as 7 mensagens com 1 minuto entre elas, então o cache do provedor (TTL de 5 min) e a sessão aquecida do OAR (10 min) nunca expiram. Um time que escreve ao longo do dia não é assim. O runner agora tem relógio virtual (`advance`), TTL do cache (`cacheTtlMin`, padrão 5) e TTL da sessão (10 min); `dia-espacado` é o mesmo dia com 30 min entre as mensagens.

| host de hoje, mesmo dia de 7 mensagens | TTL do cache | tokens | custo µUSD | prefixo em cache |
|---|---:|---:|---:|---:|
| rajada (1 min) | 5 min | 6593 | 15736 | 1,00 |
| espalhado (30 min) | 5 min | 7093 | 22437 | **0,00** |
| espalhado (30 min) | 60 min | 7093 | 20236 | 1,00 |

Efeitos, todos com teste (`opt8-faithful.spec.ts`, bloco "the spread day"):
- **A meta de ≥ 60% de cache no prefixo só vale em uso contínuo ou com cache estendido.** Com mensagens espaçadas e TTL de 5 min o prefixo é regravado em toda mensagem (0,00). Reportado como "passou" antes, no regime em rajada; agora o relato diz quando vale.
- **A sessão aquecida não paga no dia espalhado** (tokens idênticos com e sem `warmSession`); o prompt de coordenação (~500 tokens) volta em toda triagem.
- **Custo −40% (hoje → todas as alavancas) no dia espalhado: −40%, no limite** (13462 / 22437), contra −42% na rajada. A meta agora é lida no **pior** dos dois dias (`measureOpt8Faithful.dayCostCut = min`), para um formato favorável não passar sozinho. Tokens: −12% (espalhado) e −13% (rajada); a meta de −40% em tokens segue não atingida.
- Por isso o "−42%" do relato das 13:30 vale **para o dia em rajada**; o número a citar é "−40% a −42% de custo, conforme o ritmo de mensagens".

**Onde está o gasto no dia espalhado (host de hoje, 9 chamadas, 6730 tokens de entrada):** camada `system` = 3465 (**51%**), ferramentas 812, assunto 1330, recall 384, mensagem 383, saída 363. Por tipo de turno, custo: execução 10489, triagem 5561, resposta 4122, avaliação 2265. Com todas as alavancas: ferramentas 812 → 104, triagem 5561 → 1854, execução 10489 → 5742.

**Próximo alvo, sem feitura: o prefixo (`system`).** Candidatos medidos só por tamanho, **não implementados** porque mudam texto afinado de prompt sem prova de qualidade com modelo real:
- prompt de coordenação: 4 linhas repetidas entre `coordinator`, `dispatch` e `subscriptions` (injeção, escopo maior que o mandato, ambiguidade, mensagem em assunto seguido) ≈ 50 de 500 tokens, pagos em toda triagem no dia espalhado;
- `capabilities` do talk (texto do host, 60 tokens) repete regras que o template `talk` já diz ("não mencione ferramentas, shell…"): ≈ 30 tokens por resposta;
- linha "Normas de dono" da política de voz no talk (≈ 35 tokens por resposta de chat).
Cada um é ≈ 1–3% dos tokens do dia; vale só se o Atlas quiser pagar a rodada real para validar o comportamento.

**Verificação (saída literal)**
```
vitest run (12 arquivos de tokens/prompts/engine-policy/ledger)  → Test Files 12 passed (12) · Tests 82 passed (82)
node scripts/persona/check-pkg.mjs persona-engine                → persona-engine: OK in 16.8s
node --import tsx/esm .../scripts/assert-opt2.ts                 → OPT-2 ok
node --import tsx/esm .../scripts/gate-tokens.ts                 → TOKEN_GATE ok
node --test scripts/persona/token-gate-step.test.mjs             → ℹ pass 5  ℹ fail 0
oxlint nos arquivos alterados                                    → sem achados
node scripts/persona/reap-orphans.mjs                            → no vitest trees older than 15 min
```
Arquivos: `src/bench/{token-faithful,opt8-faithful}.ts` (relógio, TTL, `dia-espacado`, `ttlSensitivity`, meta lida no pior dia), `tests/opt8-faithful.spec.ts` (+4), `persona-spec/baselines/token-faithful.json` (re-congelado: cenário novo; os existentes não mudaram), `persona-spec/reports/opt8-faithful.md` (regerado).

## 04/11 13:30 — OPT-4, OPT-5, OPT-6 e OPT-8: antes → hoje → todas as alavancas (fila fechada)

> **Números superados pela seção das 14:35 (retratação):** a lista de ferramentas MCP que o bench contava não existe no host; o corte hoje→todas é tokens −2%, custo −33% a −37%.

> Correção das 13:45 (seção acima): o "−42% de custo" e o "cache 1,00" desta seção valem para o **dia em rajada**; no dia espalhado o corte é −40% (no limite) e o cache de prefixo é 0,00 com TTL de 5 min.

Tudo offline, runner fiel (`persona-engine/src/bench/token-faithful.ts`), **zero CLI real**. Os números são estimativa (4 caracteres ≈ 1 token; custo = preço de tabela). "Hoje" = como o host está ligado agora (`LEVERS_AS_WIRED`); "todas" = o que o repo entrega quando o contrato `persona-spec/contracts/token-wiring.md` for ligado.

### Resultado (tabela gerada por `print-tokens-faithful.ts`)

| cenário | ingênuo: tokens / µUSD / chamadas | hoje (host) | todas as alavancas | Δ tokens hoje→todas | Δ custo hoje→todas | qualidade |
|---|---|---|---|---:|---:|---:|
| geral-simple | 983 / 2510 / 2 | 501 / 656 / 1 | 501 / 656 / 1 | 0% | 0% | 1,00 → 1,00 → 1,00 |
| multi-review | 2016 / 9439 / 3 | 1905 / 9023 / 3 | 1485 / 4648 / 3 | -22% | -48% | 1,00 em todas |
| idle-routines | 20763 / 13868 / 99 | 0 / 0 / 0 | 0 / 0 / 0 | — | — | 1,00 |
| initiative-30 (dia quieto) | 20053 / 78582 / 30 | 0 / 0 / 0 | 0 / 0 / 0 | — | — | 1,00 |
| initiative-30-busy (5 mudanças) | 23404 / 86055 / 35 | 1746 / 7110 / 5 | 1746 / 2371 / 5 | 0% | -67% | 1,00 |
| padaria-lua | 3033 / 13072 / 3 | 2938 / 10433 / 3 | 2528 / 5833 / 3 | -14% | -44% | 1,00 |
| dia-padaria (7 mensagens) | 8542 / 21905 / 11 | 6593 / 15736 / 9 | 5763 / 9135 / 9 | -13% | -42% | 1,00 |
| burst-geral (5 linhas seguidas) | 2750 / 4007 / 5 | 704 / 3168 / 4 | 572 / 767 / 1 | -19% | -76% | 1,00 |

Nota de qualidade (critério de pronto): em todos os cenários e degraus a nota fica em **1,00**; ela é medida por fatos que o "modelo" só afirma se a evidência está no prompt (se um corte de contexto derrubar a evidência, a nota cai e o gate reprova). O teste `head clip drops late evidence; ranking keeps it inside the same budget` prova o caso em que o corte atual perde a nota certa e o ranking não.

### O que cada OPT entregou

**OPT-4 contexto mínimo** (código de produção, ligado por padrão onde é seguro)
- `prompts/context-budget.ts` (novo): `relevanceOverlap`, `rankRowsByRelevance`, `fitRowsToBudget` — orçamento por relevância, não por ordem de id.
- `foldHostTalkUsed(used, query?)`: com a pergunta, o recall sai mais relevante primeiro (as últimas mensagens do assunto ficam primeiro e em ordem cronológica); sem ela, comportamento idêntico ao de hoje. Falta o host passar `event.body` (1 linha, contrato W4).
- Normas de dono escritas uma vez no prompt do worker (`composePrompt` com `dedupeOwnerNorms`, default ligado): −55 tokens por prompt de worker, medido. Os runners ganham isso sem edição (`executorPrompt` → `composePrompt`).
- `composeTurnPrompt({ messageLimit })`: o corte padrão de 200 tokens da mensagem trunca um pedido de trabalho; `Number.POSITIVE_INFINITY` mantém inteiro (pedido do P0 do Forge; prefixo não muda, testado).
- Ferramentas mínimas: o gateway lista todas as ~14 ferramentas do nível da persona em todo turno; só as da tarefa → −11% tokens no dia (W2, Rivet).
- Honesto: o orçamento de recall **não economiza** nas fixtures (a recuperação estreita já cabe); ele é uma proteção de qualidade, não um corte.

**OPT-5 modelo certo + sessão aquecida**
- Já ligado: o chat roda no modelo barato (`purpose:'talk'`, Rivet) e o OAR reaproveita a sessão em memória por `personaId|cwd|model` (TTL 10 min). Rivet também já removeu o turno pago do `inject` da coordenação (instruções vão junto do ingest, inclusive em sessão fria).
- Não ligado (W1): a triagem usa o runner da **executora** (`orchestration.ts:1201/1218`); no barato: −16% de custo no dia, −67% na iniciativa. **A avaliação (revisão de código) fica no motor da persona**: a política do Forge a manda para o barato, mas isso é risco de qualidade que o offline não prova; não contei como economia.
- Ressalva: sessão aquecida só ajuda em rajada < 10 min; mensagens espaçadas pagam o prompt de coordenação (~500 tokens) de novo.

**OPT-6 saídas enxutas, proatividade com orçamento, batching**
- Chat: `finishHostTalk` já está ligado; o talk já pede "1 a 3 frases", então o efeito em tokens gerados é ~0 (só protege o canal).
- Relato do worker (W3): `composePrompt({ part:'worker', leanReport:true })` acrescenta uma linha de relato curto ("Resultado:" / "Bloqueio:", ≤ 100 palavras). **Opt-in, desligada por padrão e fora da primeira entrega**: muda o que o modelo escreve, e o ganho (−17% de custo no dia) depende de o modelo obedecer — só vira meta depois de rodada real.
- Rajada (W5): `batchRouterBurst` triagem 4 → 1 chamada (−19% tokens, −27% custo, qualidade 1,00); não está chamado no host (Anvil, ingest).
- Iniciativa: dia quieto 30 → 0 chamadas; dia com 5 mudanças 35 → 5 em lote dentro do orçamento de 400 tokens/persona.

**OPT-8 aceite** (`reports/opt8-faithful.md`, gerado por `write-opt8-faithful.ts`)

| meta | resultado |
|---|---|
| zero chamadas com equipe ociosa sem objetivo | passou |
| ≥ 60 % de cache no prefixo | passou: claude 1,00 · codex 1,00 · opencode/cursor n/d (não reportam; ausência ≠ 0 %) |
| −40 % **tokens** por tarefa (dia, hoje → todas) | **não atingido: −13 %** (−33 % sobre o ingênuo) |
| −40 % **custo estimado** por tarefa (dia, hoje → todas) | **passou: −42 %** (−58 % sobre o ingênuo), depende de W1–W3 ligados |
| paridade ±10 % com a CLI direta | **não comprovável offline** (ver abaixo) |

Proposta de renegociação (para o Atlas/Keel decidir): trocar "−40 % tokens" por **"−40 % custo estimado por tarefa concluída + tokens/tarefa não maior que hoje"**. Motivo: o que o modelo precisa ler não diminui em 40 % sem perder evidência; o que cai é o preço (modelo certo, cache, saída curta, menos chamadas).

**Paridade com a CLI direta — o que mudou.** O "+5,7–6,3 %" do relato anterior era uma fórmula (`armTokens`), não prompt real. No pareado fiel (mesmo modelo nos dois braços, regime de dia corrente, base do vendor como **parâmetro**): tarefa de uma chamada (`simple-ask`, base 12 000) tokens +4 %, custo +2 % (dentro de ±10 %); tarefa de várias chamadas (`multi-review`, `research-summary`) custo +178 % / +238 % sobre a CLI direta tratada como **uma** chamada, porque cada chamada da Persona relê a base do vendor. Isso é um piso para a CLI direta (um agente de CLI faz vários passos internos e cada um relê a base): **só a rodada pareada real decide** (`PERSONA_PAIR_REAL=1`, cap 1, liberação do Atlas; a base de 12 000 é suposição a medir). O que a Persona controla é **chamadas por tarefa**: pré-roteador, rajada em lote, primeira entrega em um turno (Forge/Anvil).

### Pedidos de ligação (contrato `persona-spec/contracts/token-wiring.md`)

| # | alavanca | quem | ganho sobre hoje (dia) |
|---|---|---|---|
| W1 | triagem no modelo barato | Anvil `orchestration.ts` + Rivet `resolve` | custo −16 % |
| W2 | ferramentas mínimas por turno | Rivet `mcp/gateway.ts` | tokens −11 %, custo −9 % |
| W3 | relato curto do worker (opt-in; validar com modelo real) | Rivet `oar/session.ts` | custo −17 % |
| W4 | `foldHostTalkUsed(used, event.body)` | Anvil `talkLayers` | 0 % (proteção de qualidade) |
| W5 | `batchRouterBurst` na rajada | Anvil ingest | rajada: tokens −19 %, custo −27 % |

Ao ligar cada uma, mover a chave em `LEVERS_AS_WIRED` (Tally) e re-congelar o baseline (`write-tokens-faithful.ts`); o gate passa a protegê-la.

### Arquivos (todos em `persona-engine` salvo indicação)

Novos: `src/prompts/context-budget.ts`, `src/bench/{opt8-faithful,token-faithful,token-gate,token-fixtures}.ts`, `tests/{context-budget,opt8-faithful,token-faithful}.spec.ts`, `scripts/{gate-tokens,write-tokens-faithful,write-opt8-faithful,print-tokens-faithful}.ts`, `persona-spec/{contracts/token-wiring.md,baselines/token-faithful.json,reports/opt8-faithful.md}`, `scripts/persona/token-gate-step.{mjs,test.mjs}`.
Editados (prompts do engine; Forge sem esses arquivos abertos): `src/prompts/stable-prefix.ts` (guard por relógio gerado, `messageLimit`), `src/prompts/templates.ts` (`dedupeOwnerNorms`, `leanReport`, `WORKER_LEAN_REPORT_RULE`), `src/prompts/talk-output.ts` (`foldHostTalkUsed(used, query?)`), `scripts/assert-opt2.ts`, `tests/stable-prefix.spec.ts` (+3 testes); `scripts/persona/persona-gate.mjs` (+3 linhas, autorizado pelo Keel). `src/index.ts` **não** tocado.

### Verificação (saída literal)

```
vitest run (12 arquivos: opt8-faithful, token-faithful, context-budget, prompts, stable-prefix, talk-eval, voice, lean-output, engine-policy, token-measure, v1-close, token-ledger)
 Test Files  12 passed (12)
      Tests  78 passed (78)
node scripts/persona/check-pkg.mjs persona-engine        → persona-engine: OK in 27.5s
pnpm exec tsx scripts/generate-typert.ts                 → generate-typert: wrote 40 Typert artifact(s) for 40 package(s) in 76.3s
node --import tsx/esm .../scripts/assert-opt2.ts         → OPT-2 ok
node --import tsx/esm .../scripts/gate-tokens.ts         → TOKEN_GATE ok
node --test scripts/persona/token-gate-step.test.mjs     → ℹ pass 5  ℹ fail 0
oxlint nos arquivos novos/alterados meus                 → sem achados
node scripts/persona/reap-orphans.mjs                    → no vitest trees older than 15 min
```

### Limitações e riscos

- Estimativa, não medição: `origin: estimate`. O livro vivo `measured` (real) só com liberação do Atlas.
- O baseline foi **re-congelado 4 vezes** durante esta rodada, sempre por causa de calibração do próprio runner (ferramentas MCP reais, divisão talk/apoio, cenário de rajada), nunca para esconder piora; qualidade 1,00 em todas. Daqui em diante o gate bloqueia piora de verdade (hoje informativo no persona-gate).
- Fidelity: o prompt de talk é reconstruído pelo bench em vez de chamar `composeHostTalk` direto (para isolar cada alavanca); o teste `rebuilds the host talk prompt byte for byte at the shipped context policy` prova que a reconstrução bate com o host.
- O prompt de worker via `composeTurnPrompt` (primeira entrega do Forge) ainda repete "Normas de dono" (template + política de voz, ~35 tokens); deixei de fora até o Forge pedir.
- `cut-40` do `v1-close` continua `blocked` por definição (baseline sintético de 134 tokens/tarefa × livro vivo medido não são comparáveis). Sugestão ao Forge: trocar o baseline por `LEVERS_AS_WIRED` do mesmo pipeline e a métrica por custo estimado (ver `opt8-faithful.md`). Não alterei `measureOpt8Acceptance` (contrato do Probe/Anvil).

## 04/11 12:58 — OPT-3: prefixo estável + cache, hit rate por motor

**Bug real achado e corrigido (P1).** `composeStablePrefix` chamava `assertPrefixStable` sobre o prefixo inteiro, e o regex rígido (`hoje|agora|contador|HH:MM|turno N|ISO`) pega **texto que o usuário escreveu** (instruções e personalidade da persona, regra obrigatória do Cofre, título). Reproduzido antes do conserto:

| entrada do usuário no prefixo | antes | depois |
|---|---|---|
| instruções: "Avise a equipe **hoje** se faltar farinha" | `UNSTABLE_PREFIX` → "não consegui responder" | ok |
| instruções: "Responda **agora** quando o cliente perguntar" | idem | ok |
| personalidade: "Fala como um **contador** paciente" / título "Contador" | idem | ok |
| Cofre: "standup às **10:00** no #geral" | idem | ok |
| relógio gerado (`2026-11-04T09:00`, `turno #7`, epoch ms) | `UNSTABLE_PREFIX` | `UNSTABLE_PREFIX` (continua protegendo) |

Conserto (`persona-engine/src/prompts/stable-prefix.ts`): `composeStablePrefix` agora usa `prefixHasGeneratedClock` (só relógio/contador que **máquina** injeta). `assertPrefixStable` / `prefixLooksVolatile` seguem com a API e o comportamento rígidos, e passam a valer para **texto do motor**: teste novo exige que todos os `PROMPT_TEMPLATES` estejam livres de relógio. Teste novo também prova que o prefixo não se move quando só mensagem, recall e assunto mudam (`two.prefix === one.prefix`). Forge avisado (Status + ask); ele confirmou que não tinha `stable-prefix`/`templates` abertos. Não toquei `src/index.ts` (Forge pediu combinar export novo): `prefixHasGeneratedClock` fica fora do índice por enquanto.

**Hit rate por motor** (cenário `dia-padaria`, `engineCacheTable`):

| motor | reporta cache | prefixo em cache antes → depois | meta ≥ 60 % |
|---|---|---:|---|
| claude | sim | 0,98 → 1,00 | passou |
| codex | sim | 0,98 → 1,00 | passou |
| opencode | não (adapter não lê cache do vendor) | n/d | n/d — ausência ≠ 0 % |
| cursor | não | n/d | n/d |

Leitura honesta: o caminho "snapshot" já colocava persona e Cofre obrigatório antes da mensagem, então o ganho de acerto de cache do OPT-3 **nesta fixture** é pequeno (0,98 → 1,00); o valor do OPT-3 foi o bug acima (um prefixo "estável" que mudava o comportamento do produto) e o contrato testado. Onde ele se paga de verdade é a camada de **sessão aquecida** (OPT-5: o prompt de coordenação de ~500 tokens deixa de ser reenviado, −500 tokens e −33 µUSD no `dia-padaria`).

**Verificação (saída literal)**
```
vitest run token-faithful.spec.ts stable-prefix.spec.ts → Test Files 2 passed (2) · Tests 24 passed (24)
node scripts/persona/check-pkg.mjs persona-engine       → persona-engine: OK in 32.4s
node --import tsx/esm .../scripts/assert-opt2.ts        → OPT-2 ok
oxlint nos arquivos novos/alterados meus                → sem achados (restam 5 achados em coord-eval/talk-eval/linha 37 do spec, que já existiam)
```
Também: `assert-opt2.ts` ganhou os imports em uso (o Forge viu o check-pkg falhar por import sem uso — meu trecho final não tinha sido aplicado; consertado e coberto: se faltar de novo o check-pkg acusa).

**Fica de fora:** TTL do cache (5 min / 1 h) não é modelado; aquecimento por keep-alive é do Rivet (OPT-5). Medição por motor real só com `PERSONA_PAIR_REAL=1`.

## 04/11 12:46 — OPT-2: gate de regressão sobre o runner scriptado FIEL

> Histórico: a tabela desta seção é a do primeiro congelamento (12:46). Os números **vigentes** estão na seção do topo (13:30), depois de calibrar as ferramentas MCP reais, separar chat/apoio e acrescentar a rajada.

**O que mudou na medição.** Os cenários antigos (`runTokenScenario`) eram constantes (prefixo fixo de 3 frases, saídas escritas à mão); o "+5,7–6,3% vs CLI" saía de uma fórmula (`armTokens`: prefixo + prompt + "triagem"), não de prompt real. O novo runner conta **os prompts que os compositores reais montam** (talk do host, coordenação, worker, Vigia, iniciativa) sobre fixtures da Padaria Lua (Cofre, histórico do assunto, descrições de ferramentas):

- entrada = `estimateTokens` do prompt completo do turno; saída = `estimateTokens` do que o "modelo" escreve;
- cache do provedor = **maior prefixo comum** com o prompt anterior da mesma chave (persona + finalidade) — prefixo instável perde acerto de verdade;
- qualidade = o "modelo" só afirma um fato se a **evidência está no prompt** dele; orçamento de contexto que derruba a evidência derruba a nota (critério de pronto = agulhas na resposta final);
- custo estimado = tokens × preço de tabela (barato 1/5, motor da persona 3/15 USD por Mtok; cache read ×0,1, write ×1,25). **Estimativa**, não fatura.

Cada alavanca é uma chave (`LeverSet`); `leverLadder(cenário)` liga uma de cada vez e devolve o antes/depois dela.

### Antes (todas as alavancas desligadas = harness ingênuo) × depois (como o repo entrega)

| cenário | antes: tokens / custo µUSD / chamadas | depois | Δ tokens | Δ custo | cache prefixo | qualidade |
|---|---|---|---:|---:|---:|---:|
| geral-simple | 983 / 2510 / 2 | 501 / 1969 / 1 | -49% | -22% | — | 1,00 → 1,00 |
| multi-review | 1928 / 9424 / 3 | 1417 / 3296 / 3 | -27% | -65% | — | 1,00 → 1,00 |
| idle-routines | 23931 / 61388 / 99 | 0 / 0 / 0 | -100% | -100% | — | 1,00 → 1,00 |
| initiative-30 (dia quieto) | 21313 / 97482 / 30 | 0 / 0 / 0 | -100% | -100% | — | 1,00 → 1,00 |
| initiative-30-busy (5 mudanças) | 24874 / 108105 / 35 | 1746 / 2371 / 5 | -93% | -98% | — | 1,00 → 1,00 |
| padaria-lua | 2945 / 13057 / 3 | 2488 / 7950 / 3 | -16% | -39% | — | 1,00 → 1,00 |
| dia-padaria (7 mensagens) | 8366 / 22275 / 11 | 5655 / 11603 / 9 | -32% | -48% | 1,00 | 1,00 → 1,00 |

"Antes" **não** é a Persona de ontem: é tudo desligado, para isolar cada alavanca. A Persona de hoje já tem várias ligadas (talk estável, pré-roteador, Vigia por regras); o que falta ligar está nos achados abaixo.

### Gate

- `persona-spec/baselines/token-faithful.json` congela antes/depois (`write-tokens-faithful.ts`).
- `scripts/gate-tokens.ts` (~3 s): falha por cenário se tokens **ou** custo sobem > 10 % sem ganho de qualidade ≥ 0,15, se a **qualidade cai** (menos token não pode custar entrega), se um dia ocioso passa a gastar, ou se chamadas sobem. Imprime `TOKEN_GATE ok` / `TOKEN_GATE failing=<cenários>`.
- `assert-opt2.ts` agora também roda esse gate (os cenários sintéticos antigos ficam por continuidade).
- `scripts/persona/persona-gate.mjs`: passo novo depois do check-pkg e antes do bundle (autorizado pelo Keel), **informativo**: falha vira `TOKEN_GATE_WARN failing=<cenários>` no log e não derruba o gate; `PERSONA_TOKEN_GATE=block` faz derrubar (`persona-engine` entra em failing); timeout de 60 s e travamento do passo nunca derrubam, nem em `block`. Lógica em `scripts/persona/token-gate-step.mjs` (testável).

### Arquivos

Novos: `persona-engine/src/bench/{token-faithful,token-gate,token-fixtures}.ts`, `persona-engine/tests/token-faithful.spec.ts`, `persona-engine/scripts/{gate-tokens,write-tokens-faithful}.ts`, `persona-spec/baselines/token-faithful.json`, `scripts/persona/token-gate-step.{mjs,test.mjs}`.
Editados: `persona-engine/scripts/assert-opt2.ts` (+gate fiel), `scripts/persona/persona-gate.mjs` (+1 import, +2 linhas; autorizado pelo Keel).
Nenhum arquivo do upstream tocado.

### Verificação (saída literal)

```
vitest run token-faithful + token-measure + stable-prefix + lean-output + engine-policy + v1-close + token-ledger
 Test Files  7 passed (7)
      Tests  41 passed (41)

node --test scripts/persona/token-gate-step.test.mjs
ℹ tests 5   ℹ pass 5   ℹ fail 0
  (passa / falha informativa / falha com block / timeout e crash / baseline real e baseline adulterado)

node --import tsx/esm packages/persona/persona-engine/scripts/gate-tokens.ts  →  TOKEN_GATE ok
node --import tsx/esm packages/persona/persona-engine/scripts/assert-opt2.ts   →  OPT-2 ok
node scripts/persona/check-pkg.mjs persona-engine                              →  persona-engine: OK in 19.2s
pnpm exec oxlint <6 arquivos novos>                                            →  sem achados
node scripts/persona/reap-orphans.mjs                                          →  no vitest trees older than 15 min
```

O teste de fumaça achou um defeito meu na hora: o resumo do gate listava o mesmo cenário duas vezes (achado de tokens + de custo). Corrigido (dedupe).

### Achados (dados, não opinião) — viram as próximas tarefas

1. **O corte por cabeça do OPT-4 (`clipTextToTokens` no recall) derruba evidência tardia.** Rodando o gate com o `recall` na ordem do host (`compileContext` reordena por tipo/id, `foldHostTalkUsed` concatena), uma pergunta ampla com a nota certa no fim perde a nota (teste `head clip drops late evidence; ranking keeps it`). Ordenar por relevância dentro do mesmo orçamento mantém a nota. → OPT-4.
2. **O prompt do worker repete as "Normas de dono"** (parágrafo do template `worker` + bloco `OWNER_NORMS` do `executorPrompt`; `prefixOwnerNorms` o envia a cada sessão de worker): ≈ 55 tokens por prompt de worker (medido). Dedupe testado (`workerPromptText(…, true)`). → OPT-4 (precisa do OK do Forge para mexer em `templates.ts`).
3. **Triagem roda no motor da executora.** `orchestration.ts` cria o `CoordinationDriver` com o `runner` resolvido para a **executora** (`resolveFor(executor, …, 'task')`); o OPT-5 manda triagem/avaliação/Vigia/iniciativa para o motor barato (−65 % de custo no multi-review só por isso, tokens iguais). → OPT-5 (Anvil `orchestration.ts` + Rivet `resolve`).
4. **O livro vivo grava `layers: EMPTY_LAYERS`** (`orchestration.ts`, `recordLedger`): sem o tamanho por camada real, o painel não separa onde o gasto está. O talk já devolve `layers` (`composeHostTalk`); falta passar. → OPT-8 (Anvil).
5. `stablePrefix` custa ~9 tokens de layout numa chamada fria isolada e se paga a partir da segunda quente; o teste de degrau tolera ≤ 1 % por isso.

### O que fica de fora / limitações

- Tudo é **estimativa** (4 caracteres ≈ 1 token; cache por prefixo comum sem TTL; preços de tabela). O ledger fica `origin: 'estimate'`. Medição real = `PERSONA_PAIR_REAL=1`, só com liberação do Atlas.
- Cache por motor: `claude`/`codex` reportam; `opencode`/`cursor` não (ausência ≠ 0 %, `cacheReported:false`). O relato do hit rate por motor entra no OPT-3.
- O pareado "CLI direta × Persona" (4 tarefas) segue o do Forge (fórmula); o pareado fiel entra no OPT-8.
- `tokens-baseline.md` / `bench-tokens.md` do Forge não foram regenerados; este relato é a fonte dos números fiéis até o OPT-8.

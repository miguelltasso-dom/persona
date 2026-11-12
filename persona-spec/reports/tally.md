# Relatos — Tally (otimização de tokens)

Mais recente no topo. Escopo: OPT-2..OPT-6 e OPT-8 (com o Forge). Medição **offline** (runner scriptado fiel); zero chamada real de CLI. **Fila fechada em 04/11 13:30** (resumo no topo).


## 12/11 01:20 — Item 13 (colheita): "Ligar a IA para a equipe toda" + "não consegui conferir" honesto, host e UI NO CÓDIGO (sem commit, zero IA real) · pendentes: OK da Muse nos textos, checklist "Importar N", capturas + pré-aceite

**Host (novos: `persona-host/src/{check-unconfirmed,team-connect,team-connect-host}.ts`; ganchos ancorados em `connection-probe.ts`, `types.ts`, `index.ts`):**
- **`unconfirmed`:** a checagem de login que passa do tempo vira "conferindo…" na 1ª vez e `unconfirmed: true` na 2ª seguida (`phase` segue `checking`, **sem `error`**: um cliente que não conhece o campo mostra "conferindo…", nunca "sem login"). Um passe que responde (logado OU deslogado) zera a conta. `retryEngine` agora chama `probe.retry()` ("Tentar de novo" esquece as checagens estouradas e confere de novo). 8 testes (RED provado antes).
- **`TeamConnect`:** "sem IA" só quando o motor da persona foi CONFIRMADO sem login/instalação (quem está conferindo ou "não consegui conferir" vira o número `unsure`, nunca entra no banner). Contas logadas ordenadas pela folga da janela mais apertada (mais folga primeiro, desconhecida por último, nunca presumida livre; ≥ 85% = "quase no limite"). Liga **uma persona por vez**, na ordem do time; quem já está no motor escolhido **mantém modelo e esforço** (só confere que responde); falha de uma não para as outras e tem "Tentar de novo" sozinha; reentrante (2º clique não abre 2ª rodada). 13 testes de domínio + 4 de host (probe injetado). **Não abre sessão de CLI nem chama modelo.**
- **4 Remote** (`getTeamAi`, `connectTeam` só dono do espaço, `getTeamConnect`, `retryTeamPersona`); tipos de fronteira exportados de `types.ts` (re-export) e **`generate-typert` ok (40 artefatos)**. Contrato para a tela: `persona-spec/contracts/team-connect.md`.

**UI (novos em `client-ui-persona/src/client/team-connect/`: wire, hook, `TeamAiBanner`, `TeamConnectDialog`, `ConnectedTeamAi`, css; textos `teamAi.*` em `locale-sources/shell.{pt,en}.json`, gerador rodado):** banner "N pessoas da equipe estão sem IA." com 40 px "Ligar para todas" (1 pessoa: "Ligar a IA"); modal com a arte `ligar-ia-equipe` 240×140, lista com anel tracejado "Sem motor", escolha da conta ("Codex · sobra bastante"; sem janela publicada só o nome; sem selo, sem dinheiro), 48 px "Ligar para as N"; progresso lido do host a cada 600 ms (anel tracejado → lavanda "Disponível" com check, preset `pose`; reduced-motion = fade de `--motion-reduced-fade`); falha "Não conectou · Tentar de novo"; fim "Pronto: a equipe toda tem IA." + Fechar. Ganchos: `OverviewView` (slot `teamAiSlot`, 3 linhas), `ConnectedOverviewView` (+5), `register-prism-screens` (+3, CRLF). 12 testes. CSS: higiene PASSOU (0 novo; tokens `--persona-font-text`, régua `--control-h-s`).
- **Pílula (Muse §13.4):** rail "Claude · conferindo…" (era "conectando…", spec nova da Muse; 8 asserts antigos atualizados) → "Claude · não consegui conferir" (tinta apagada, **nunca** aviso/vermelho) com ação **"Tentar de novo"** (`observable.retry` → `retryEngine`) → "Claude · sem login" **só** com logout confirmado.
- **ACHADO (falso "deslogado" que já existia):** `accountRowFromProbe` fazia `void phase`: um cartão ainda "conferindo" com `loggedIn: false` aparecia em Conexões como "Não conectada" com "Entrar"/comando de login. Agora `checking` ("Conferindo…", sem ação) e `unconfirmed` ("Não consegui conferir" + "Tentar de novo") são estados próprios e **não oferecem comando de login**; `Accounts` ganhou o estado `unconfirmed`. Regra: **um erro explícito da CLI é uma resposta** (só vale "conferindo" quando NÃO há erro). 8 testes (`honest-account-state.client.spec`).

**Também nesta rodada (Keel):** (a) `connections-remote` quebrou por bug meu (`phase` onde era `row.phase`): corrigido. (b) **Baseline OPT-2 regenerado** (`write-tokens-faithful.ts`): a linha do Rivet (`CHOICE_PROMPT_LINE`, 213 car. = **54 tokens**) subiu geral-simple/question 501→554 (+53) e initiative-30-busy 1746→2014 (+268 = 5 chamadas); a camada de fala do Anvil mora no host, 0 token no bench. Linhas de trabalho desceram sem relação com isto (multi-review 733→621, padaria-lua 369→314, dia-padaria 3352→3345; qualidade 1.00; template do worker OPT-10 já na árvore). Tabela: `.maestri/tmp/tally/token-faithful.delta.txt`. (c) A linha do Rivet saiu do template `talk` depois; `prefix-layers.host.spec` agora exige só "nunca na cauda, no máximo 1× no prefixo".

**Testes (01:17):** 20 arquivos meus (item 9 + 13: host, runners, client, engine) = 185 verdes; `check-pkg` persona-host / persona-runners / client-ui-persona OK; sala limpa PASSOU nos arquivos do item 13.

**Limitações / pendentes:** (1) **textos que a Muse não especificou** (pedi o OK direto às 00:09): botão com 1 pessoa, recusas ("Entre em uma conta do Claude ou do Codex…", "Agora todas… têm IA", "Não consegui ligar agora"), "Codex" (não "ChatGPT"), modal 560 do primitivo vs 520 da spec, "Não conectou" + botão sem o ponto central, "conectando…"→"conferindo…" no rail. (2) Falta o checklist **"Importar N"** (§13.5; o host já tem prévia + aplicar por item, só a tela) e a **cena na galeria + capturas claro/escuro 100%/200% + pré-aceite do Ember + aceite da Muse**. (3) Os 4 Remote só existem no app depois do próximo bundle do host (o cliente tipa por "o que a tela precisa"). (4) "Acordar" = pôr no motor + conferir que responde; não aquece sessão de CLI (porta `wake` pronta para o pré-aquecimento do Cobalt, item 2a). (5) Conta com casa própria: o veredito é o login daquela casa; qual conta cada turno usa segue a política de troca já existente. (6) Reverter: `.maestri/tmp/tally/item13-{unconfirmed,team,types,ui,pill,pill2,pill3}-hooks.cjs` e `item13-locale{,2}.cjs` (`--dry`/`--revert`).

## 11/11 22:35 — Item 9 (colheita), 1ª fatia VERDE: ferramentas estáveis (9a) + arte grande por referência (9b) + "fast" só ao vivo (9c, default OFF) · zero chamada real

**O que mudou (arquivos NOVOS, meus):** `persona-host/src/tool-stability.ts` (memória monotônica da lista de ferramentas por persona), `artifact-ref.ts` (puro: acha SVG/código grande, nomeia o arquivo, troca por 1 linha de referência), `artifact-spill.ts` (grava o bloco como arquivo no rascunho de quem enviou, datado no passado; troca só se o arquivo CHEGOU ao rascunho de quem recebe e ela abre arquivos), `persona-runners/src/resolve/turn-speed.ts` (política pura de velocidade). **Ganchos (strict-anchor, preservam EOL, reversíveis: `.maestri/tmp/tally/item9-hooks.cjs` e `item9-speed-hooks.cjs`, `--dry`/`--revert`):** `harness-turn.ts` (+4 linhas: campo `stable?` em `ProductToolsRules` e `neededToolNames`), `index.ts` (+3: import, `new StableTools()`, `stable:` em `toolRules`), `handoffs.ts` (+11, só `EntregaDoc.arts`, `keepEntrega`, `senderFiles`, `entregaBlock`, autorizado pelo Keel 22:04), `resolve-runner.ts` (+6, CRLF: campo `speed?` no spec CLI, decisão por propósito em `specForPurpose`, args em `extraLaunch`). Testes novos: `tool-stability.spec`, `artifact-ref.spec`, `artifact-ref.host.spec`, `harness-turn-stable.spec` (host); `turn-speed.spec`, `turn-speed-runner.spec` (runners).

**MEDIDO (zero modelo, host real; tokens = ESTIMATIVA de 3,5 car./token, nunca número do fornecedor):**
- **9b arte por referência:** prompt de quem recebe uma arte SVG de ~22 mil caracteres: **24.269 → 855 caracteres (−96%, ≈ −6,7 mil tokens por turno de quem recebe e a cada passada de revisão)**. O texto da produtora segue INTEIRO (só SVG/código > 1,5 KB vira referência; o arquivo chegou, byte a byte, ao rascunho de quem recebe). Sem rascunho ou persona só-texto: bloco fica inline (garantia P0-2 intacta).
- **9a lista estável:** 7 turnos da mesma persona com pedidos misturados (texto, quadro, rotina, sprint): **6 trocas de lista antes → 1 depois** (cada troca reabre a sessão quente da CLI). Custo do lado negativo: depois da 1ª vez que um pedido precisa de quadro/sprint/rotina a lista carrega as 11 ferramentas desses domínios: **≈ +1,15 mil tokens de definição** (4.035 car.; lean = ≈ 1,09 mil), no prefixo em cache. `persona_hire` fica FORA (continua por palavra do pedido); Task de revisão (`review_verdict`) não amplia nem recebe; sem concessão a persona nunca recebe quadro/sprint/rotina.
- **9c fast:** política pura + gancho. Persona que nunca pediu: ZERO argumento (default OFF; hoje nada na UI/host define `speed`). Pediu: conversa ao vivo (`talk`) em Codex = `service_tier="fast"`; Task/revisão/rotina/fundo = `features.fast_mode=false` explícito (a thread do Codex guarda a faixa entre turnos). Motor sem a faixa nunca recebe o argumento.
- **Prefixo (`talkLayers`/`compileUsed*`):** já coberto por `speech-wiring.host.spec` e `token-opt.spec` (prefixo idêntico entre turnos, sem relógio/id); não toquei no código.

**Testes:** host `tool-stability` 8 + `artifact-ref` 9 + `artifact-ref.host` 3 + `harness-turn-stable` 4 + `handoff-entrega` 6 (antigo, verde) + `harness-turn`/`harness-team` verdes; runners `turn-speed` 6 + `turn-speed-runner` 4 + `persona-effort`/`resolve-runner` 30 verdes. `check-pkg persona-runners` OK; `persona-host` com 5 erros que NÃO são meus (`browser/service.ts` do Onyx, `busy-status.host.spec.ts` do Flint). **Sala limpa** (`check-cleanroom.mjs --strict-names --files` nos 13 arquivos meus/tocados): PASSOU, 0 falhas, 0 avisos. `persona-ask-tool.spec` (1 teste, "sessions" 2 esperado, veio 1; `orchestration.ts:2825`) FALHA também com minha memória neutralizada em runtime: não é meu (fim de turno, Bolt).

**Limitações conhecidas:** (1) o ganho REAL em tokens/cota de uma rodada (sessão quente reaproveitada, cache lido) só se mede com 1 rodada real com teto, que depende de OK do Atlas: nenhuma foi feita. Nota de honestidade: dentro da MESMA Task a lista já era estável; o ganho de 9a é entre Tasks/pedidos da mesma persona no mesmo diretório (e o rascunho por Task já separa sessões por `cwd`), então o efeito real depende de quantas Tasks compartilham diretório. (2) 9b grava `entrega-<id>-arte-N.svg` no rascunho de quem ENVIOU (datado 6 h atrás para não virar "salvou neste turno"; mesmo precedente do `entrega-*.md`): o arquivo aparece em "Revisar mudanças" do remetente. (3) 9c: nada liga `speed` ainda (falta o campo por persona + texto da Muse) e `-c service_tier` no `app-server` do Codex não foi provado com um plano real. (4) 9a/9b/9c entram na árvore sem commit (Keel).

## 11/11 11:58 — D-103 (a)+(b) pronto: conector SÓ LEITURA onde não há gate provado · no máximo 2 chamadas por conta, jitter 400–800 ms (política seca; zero chamada real; `oar/session.ts` intacto)

**DECISÃO do Keel (11:58): NÃO entra na v1.1.1.** O limitador e a política embrulham todo runner de CLI e não houve rodada real; mudar o comportamento do motor sem prova real no instalado é risco que o Atlas não autorizou (a v1.1.1 é janela + dieta + UI). **Fica na árvore, sem commit, para a v1.1.2/v1.2 junto da prova real.** Pendências anotadas a pedido do Keel: (1) a tela ainda não mostra o aviso (falta ligar `connectorActions` / `engineConnectorNotice` na UI/host); (2) nomes de ferramenta de conector do Cursor/OpenCode a capturar numa rodada real; (3) leitura-por-nome pode bloquear demais.
**Para tirar da árvore (candidato v1.1.1) e pôr de volta:** `node .maestri/tmp/tally/d103/d103-tree.cjs --unapply [--dry]` desfaz as 6 edições com âncoras estritas (cada trecho tem de casar exatamente uma vez, então edições que outros fizeram nos mesmos arquivos DEPOIS ficam; nada é restaurado de backup velho) e ESTACIONA os 4 arquivos novos em `.maestri/tmp/tally/d103/parked/`; `--apply` põe tudo de volta. Ida e volta provados numa cópia (desfazer = os 5 arquivos idênticos aos de antes do patch; refazer = idêntico ao estado atual); `--unapply --dry` na árvore real: limpo. O `apply-src.cjs --revert` antigo restaurava o arquivo INTEIRO do backup (atropelaria edições alheias): não usar.

**(a) Falha fechada por motor.** Só o Claude tem o gate provado (hook `PreToolUse` → `PermissionGate`, `permissionPreview: 'hook'`). Em Codex, Cursor e OpenCode (e qualquer CLI desconhecida) nenhum conector da pessoa executa enviar/publicar/pagar/apagar/alterar, **mesmo para uma persona com `files: write` e `shell: write`** (o guarda de nível de ferramenta devolve o runner solto no nível `write`; era a brecha). Um turno que alcança essa ferramenta é cancelado e termina `blocked`, em palavras humanas ("Neste motor (Codex) só leio nos seus conectores: enviar ou publicar fica para o Claude, que tem a trava de permissão provada. Ferramenta: …").
- **Chave única:** o selo segue `permissionPreview`. No dia em que a trava de um motor for provada numa rodada real, ele abre sozinho (`withEngineConnectorPolicy(…, { proven })` e `engineGateProven`).
- **Leitura só se o NOME provar** (`isReadByName`: um verbo de leitura e nenhum verbo de escrita; nome sem verbo = "ação que sai", a mesma regra fail-closed do `classifyTool`). Ferramentas NATIVAS da CLI (`isNativeToolName`) ficam com o nível da persona; as ferramentas do produto OFERECIDAS àquele turno ficam com o gateway (isenção por nome exato, só para aquela corrida).
- **Selo/aviso para a tela:** `cliCapabilityReport(cli).connectorActions` = `'gated'` (Claude) | `'read-only'` (resto) e `engineConnectorNotice(cli)` (texto pt-BR: "Codex lê os seus conectores, mas ainda não tem a trava de permissão provada: aqui só leio; enviar, publicar, pagar e apagar ficam para o Claude."; `undefined` para o Claude).

**(b) Semáforo por conta.** `AccountLimiter` (contador + fila FIFO por `provider:accountId`; sem id = `provider:default`): no máximo **2** simultâneas; uma chamada que encontra a conta ocupada (ou que esperou vaga) espera um **jitter inteiro em 400–800 ms** ANTES de começar (a vaga já é dela durante o jitter, então o teto vale também ali); chamada sozinha começa na hora, sem jitter. A vaga é segurada do início do turno até o fim do stream (`ended`, cancel, leitor que desiste, `dispose`; liberada ANTES de o leitor ver o `ended`, então o próximo da fila começa quando o anterior reporta). Abandono (`AbortSignal`) na fila ou no jitter devolve a vaga. Vaga que ninguém devolve se libera sozinha em 30 min (`holdLimitMs`), para dois turnos esquecidos não matarem a conta. Ligado no `resolveRunner` (`wrap`): só CLI (assinatura), DSH/API key não é limitado; dentro do medidor e do teto de gasto (chamada recusada nunca entra na fila), por cima da recuperação de infra; limitador padrão do processo (`defaultAccountLimiter`) ou injetado em `accountLimiter`.

**Arquivos.** Novos: `persona-runners/src/resolve/engine-gate.ts`, `…/account-limit.ts`, `tests/engine-gate.spec.ts` (23), `tests/account-limit.spec.ts` (27). Editados (âncoras estritas, script em `.maestri/tmp/tally/d103/apply-src.cjs` com `--dry`/`--revert`): `src/resolve/tool-action.ts` (+`isReadByName`), `src/resolve/tool-level.ts` (+`isNativeToolName`, `offeredNames` exportada), `src/oar/isolation.ts` (+`ConnectorActions`, campo `connectorActions`), `src/resolve/resolve-runner.ts` (2 linhas no `wrap` + opção `accountLimiter` + 2 imports), `src/index.ts` (exports), `tests/cli-capability.spec.ts` (1 expectativa do campo novo).

**Provas.** RED (testes sozinhos: módulos ausentes + campo faltando; `.maestri/tmp/tally/d103-red.log`) → GREEN: `engine-gate` + `account-limit` + `cli-capability` 3/3 arquivos, 57/57 testes; `check-pkg persona-runners` OK (18,9 s); suíte inteira do pacote `persona-runners/tests/` 78/78 arquivos, 647/647 testes, exit 0, 22 s (o limitador padrão e a política agora embrulham todo runner de CLI; nenhum teste antigo precisou mudar). Nada tocado em `oar/session.ts`, host, UI.

**Limites, sem enfeite.**
1. É um OBSERVADOR: cancela quando a chamada é anunciada. O que o motor já recusou por conta própria nunca rodou (o Codex roda com `approvalPolicy: never` e recusa MCP não marcado como somente leitura), mas uma chamada que o motor executa na hora não é segurada por esta camada; por isso a palavra da decisão é "gate PROVADO". **Nenhuma rodada real** de Codex/Cursor/OpenCode foi feita (zero modelo; pausa do Atlas): provado só com runtime scriptado.
2. Leitura pelo nome pode BLOQUEAR demais (ferramenta de conector sem verbo, ex. `drive__files`); e os nomes que Cursor/OpenCode dão às ferramentas de conector não foram capturados por uma rodada: o que não é nativo conhecido (`isNativeToolName` + `NATIVE_ALIASES`) é tratado como conector. Se uma ferramenta nativa de algum motor aparecer bloqueada com "Neste motor … só leio", é lacuna da lista de nativas.
3. O selo/aviso existe como dado e texto; **a tela ainda não os mostra** (dono: UI, sob demanda: chamar `cliCapabilityReport(cli).connectorActions` / `engineConnectorNotice(cli)`).
4. O limitador é por PROCESSO (dois hosts na mesma conta não se enxergam); só vale para quem passa por `resolveRunner` (a chamada direta a `createCodexRunner` etc. não passa); `prime` (sessão sem chamada de modelo) não conta.

## 07/11 16:30 — P0 DE MEDIÇÃO (o livro gravava o ACUMULADO da sessão quente) corrigido · P0-1 "arte vira arquivo": lado do runner pronto

**1. O 329 mil da tentativa 3 era o acumulado (Atlas/Keel: P0 do corte).** Os 4 transcritos da CLI da rodada (`homes/real-attempt-3-*/projects/…`) são 4 SESSÕES quentes (Bia, Téo, Lia ×2; a sessão da persona é reusada entre Tarefas) e a soma das requisições de cada sessão bate EXATAMENTE com as linhas do livro (Téo 16.320 → 38.672 → 52.658 → 69.989). O `usage()` do adaptador devolvia o acumulado do OAR (`session.usage()`) e o `withUsageMeter` o gravava como se fosse o turno. **Real: 176.494 de entrada (não 329.293), 15.410 de saída (não 31.218), maior turno 23.178, ~57,7 mil por preço: DENTRO da faixa registrada; o "overbudget" do guarda foi falso.** Correção (`oar/adapter.ts` + `oar/usage-detail.ts`): o `Live` guarda a leitura do início do turno (`base`) e `usage(handle)` = acumulado − base (`usageSince`: contador que cai = a própria leitura, nunca negativo; campo ausente continua ausente), fixa no 1º read depois do fim. RED→GREEN: `tests/turn-usage.spec.ts` (10; a sessão de 4 turnos dava [16320, 38672, 52658, 69989] como o ledger, agora [16320, 22352, 13986, 17331]); consumidores (noteUsage, meter, estimate-*, guarda do Probe) somavam a linha como vem: sem subtração dupla. Runners + specs do host de ledger/estimate/token: 80 arquivos/622 verdes; `check-pkg` OK. `reports/team10-reading-attempt3.md` reescrito com os números por turno.

**2. P0-1 "a arte vira arquivo" — runner.** Causa: `persona.tools = {}` ⇒ `deny` ⇒ `--tools ''` (nenhuma ferramenta nativa) + gateway só de coordenação (o Téo confirmou: "não tenho ferramenta de escrita de arquivo"); o `needed` não influi. O runner já separava `files`/`shell`/`web`. Mudanças: `resolve/draft-path.ts` (`insideRoot`: realpath, `..`, outra unidade, junção), `permission-gate.ts` (`arm({ draftRoot })`; o gancho passa a ver Write/Edit/MultiEdit/NotebookEdit e NEGA fora do rascunho; sem `draftRoot` usa o cwd), `tool-level.ts` (`gatewayToolLevel`: `files:write` NÃO sobe o nível do gateway = nenhuma ferramenta de e-mail/navegador/computador/Telegram/report), `cli-policy.ts` (PowerShell negado sem shell; persona SÓ de arquivo recebe `--tools Read,Glob,Grep,Edit,Write,MultiEdit,NotebookEdit,ToolSearch`: a prova real mostrou que o conjunto padrão da CLI também oferecia Agent, Skill, Workflow, ScheduleWakeup, ListAgents). **Prova com a CLI real 2.1.319 (endpoint falso, zero modelo): `scripts/draft-files-dry.ts` 6/6 (`reports/draft-files-dry.json`)**: só-texto = nenhuma ferramenta de arquivo/shell; `files:write` = Write DENTRO do rascunho salva, Write FORA (pasta real) e por `..` NEGADOS, Bash e PowerShell NÃO executam. `draft-files.spec` + gate + cli-policy; runners inteiro **75 arquivos/592 verdes**, `check-pkg` OK. Falta (Anvil, avisado com os 4 pontos): `gatewayToolLevel` nos 2 lugares do gateway em `index.ts`, `ActionBridge.arm` com `draftRoot`, padrão `tools={files:'write'}` em projeto COM pasta + interruptor, teste guarda de host; fake do Probe (contrato enviado).

## 07/11 15:10 — TEAM-10 tentativa 3 lida (custo e cota, leitor corrigido) · RELEASE-NOTES: minhas linhas · congelamento do candidato (estável)

**Tentativa 3 (Probe, 14:59:59 → 15:02:29, 149 s, LIB 6 `7bd08b15`; `reports/team10-reading-attempt3.md`).** 10 turnos (teto 14; total das tentativas 2 + 1 + 10 = **13 de 17**). **Entrada total 329.293** (cache lido 258.071 + gravado 71.152 + 70 sem cache; o `input_tokens` do livro já é o total), **saída 31.218**, soma 360.511, maior chamada 69.989, modo `needed` nas 10. O guarda do host matou a rodada ao passar de 260.000 (a 10ª chamada pôs 69.989 em cima de 259.304): veredito do Probe `overbudget` + `harness-problem` (LEAK-1: o bilhete aparece no fio). Faixa registrada antes (59.433–217.462, esperado 120.000): **ACIMA** (1,51× o teto, 2,74× o esperado), e a rodada nem terminou. **Cota da semana (medidor oficial, minhas leituras 15:00:19 e 15:03:00): 9% → 9%** (a do próprio Probe veio `unavailable`; conta compartilhada: nunca atribuível só à rodada). Provou colaboração de verdade: plano da Coordenação por função, bilhete entregue, `pass_forward` por escolha do modelo (Bia → Téo), `ask_colleague` por escolha do modelo (2), revisão da Lia com selo; opinião do time e "Bom dia" sem chamada paga não rodaram (cortada). **Por que 329 mil:** a 1ª chamada de cada Tarefa custa o piso de ~13–16 mil; o resto são chamadas que RETOMAM a mesma Tarefa e releem o contexto acumulado: as três do Téo na Tarefa 363ff1 (#2, #8, #10) somam 138.967 (42%) — ele reenvia o SVG inteiro (saída 5.795 e 7.149) depois do pedido de ajustes da Lia; a Lia vai de 16.308 a 39.486 do mesmo jeito. Crescimento de contexto em ciclo de revisão, não peso de ferramenta nem de prompt. Em peso de preço o cache lido vale ~0,1 e o gravado ~1,25: ~115 mil "tokens de entrada equivalentes", e a cota não se mexeu. Alavancas (não decididas): limitar a revisão a 1 devolução, reenviar só o trecho alterado ou entregar em arquivo, e o guarda medir peso de preço. **Vigia:** `.maestri/tmp/tally/watch-attempt3.sh` tirou as duas leituras de cota sozinho (zero modelo).

**RELEASE-NOTES-v1.1.md (pedido do Keel 14:39):** editei SÓ as minhas linhas (releitura + `Edit`; um script de milissegundos quando o arquivo mudou de novo): "Estimativas que aprendem com você", "Conectores da sua conta, só o necessário", o Codex (esforço chega, modelo que recusa cai no padrão, o Persona não esconde do Codex o que a pessoa configurou, a confirmação antes de enviar/pagar/apagar só está provada no Claude) e "A cota é da conta inteira". **Aviso de custo da concessão (v1.2):** o texto que existe é `grant.iso5Warning` do `CONNECTOR-GRANT-SPEC` (anterior à D-084); perguntei à Muse se vale e onde aparece; sem resposta dela não preparo nada. **Congelamento do candidato (Keel 14:52):** estável; só leitura, testes e staging fora do tree.

## 07/11 14:45 — RETRATAÇÃO: o `input_tokens` do livro JÁ É O TOTAL (eu somava o cache por cima) · corrigido nos 3 pontos + contrato · TEAM-10 tentativa 2 lida · ht89 no instalado pronto para o Rivet

**1. Retratação (erro MEU).** Ao ler a tentativa 2 do TEAM-10 o meu leitor disse "cerca de 32 mil tokens de entrada" para uma linha de 16.180. O `input_tokens` do livro é o TOTAL e o cache lido e o gravado são PARTES dele: 16.180 = 11.046 lidos + 5.130 gravados + 4 sem cache; tentativa 1 (05/11) 5.246 = 2.319 + 2.925 + 2 e 5.148 = 2.319 + 2.827 + 2; D-069 308.902 com 308.900 gravados; a chamada real de hoje 14.892 = 10.475 + 4.413 + 4. O meu `pair-real.ts` já dizia isso em 04/11 (`inputOf`: "o adaptador do OAR reporta `inputTokens` como o TOTAL"), mas o leitor do TEAM-10 (`team10-reading.ts`, 05/11) somava o cache por cima. **A leitura da tentativa 1 que entreguei ("entrada 20.784, maior chamada 10.490") estava ERRADA; o certo é entrada 10.394, maior chamada 5.246, saída 1.290, soma 11.684** (a cota 82% → 83% não muda). O mesmo erro estava em dois arquivos do Anvil: `persona-host/src/estimate-calibration.ts:139` (OPT-9: "levou de a a b" até 2× alto quando o cache domina) e `estimate-account.ts:39` (tokens por ponto da cota), e o contrato `contracts/estimate-calibration.md:44` mandava somar. O Probe (`ledger-evidence.ts:200`) já tinha a guarda certa. **Na auditoria das 13:35 eu tinha marcado o OPT-9 DONE: estava DONE pelo contrato, e o contrato carregava o erro.**

**2. Correção no tree (Keel 14:02: v1.1; Anvil 13:57: "aplique você" nos arquivos dele).** A guarda do Probe nos 3 pontos: `total = inputTokens >= cacheRead + cacheWrite ? inputTokens : inputTokens + cacheRead + cacheWrite` (uma linha que vem de uma fonte que só registra o não-cacheado ainda soma o cache). Arquivos: `persona-engine/src/bench/team10-reading.ts` (`turnInputTotal`, 3 usos + comentários + texto do relatório técnico), `persona-host/src/ledger-input.ts` (NOVO, `ledgerInputTotal`, 2 importadores), `estimate-calibration.ts` (import + linha 139), `estimate-account.ts` (import + comentário + linha 39), contrato `estimate-calibration.md:44`. Testes: `team10-reading.spec` (a soma agora é 7.000, não 11.000; +2: as linhas REAIS das tentativas 1 e 2 e a guarda), `estimate-calibration.spec` (171/173 virou 101/103 + o caso "input abaixo do próprio cache soma o cache"), `estimate-account.spec` (+1 do TOTAL, o antigo virou o caso da guarda), `estimate-history-tokens.spec` (a fixture passa ao formato real; mesmos valores esperados). **RED antes: 5 testes falhando no código antigo; GREEN depois: 7 arquivos / 78 testes** (host: estimate-calibration, estimate-account, estimate-history-tokens, estimate-ask-remote, ledger-duration; engine: estimate-ask, team10-reading); `check-pkg persona-engine` e `persona-host` OK. Patch fail-closed e reversível: `.maestri/tmp/tally/inputof-fix/apply.cjs` (`--check`, `--tests`, `--src`, `--revert`; originais em `orig/`). Leituras REGERADAS com o leitor certo: `reports/team10-reading.md` (tentativa 1, com nota de correção no topo; o texto antigo em `.maestri/tmp/tally/inputof-fix/team10-reading.before-fix.md`) e `reports/team10-reading-attempt2.md`.

**3. TEAM-10 tentativa 2 (Probe, 13:38:22 → 13:42:28, 246 s).** 1 turno pago (teto 14; TEAM-10 total 2 + 1 = 3 de 25): Téo (haiku, modo `needed`), entrada **16.180 no total** (cache lido 11.046 + gravado 5.130 + 4), saída **2.054**, soma 18.234. Veredito do Probe: `failed` / `harness-problem` + "não colaborou" (a Lia deu o pedido INTEIRO ao Téo; ele fez uma pergunta estruturada à pessoa — "Qual é a promoção da Padaria Lua?" com chips — e a Tarefa ficou esperando a resposta; ninguém passou nem pediu ajuda; o transcrito mostra o marcador cru `[[persona-ask:…]]` como LEAK-1). **Cota da semana (medidor oficial): 2% (12:57, minha leitura depois da chamada do D-097) → 4% (13:45) = 2 pontos num intervalo de 47 min que inclui o trabalho das sessões Claude dos demais agentes na mesma conta: NÃO atribuível à rodada** (18 mil tokens de haiku; a minha chamada de 16,8 mil não moveu o medidor: 2% → 2%). O "antes" do próprio Probe veio `unavailable`. Observação para o Keel/Forge: com a MESMA frase natural, na chamada isolada a Bia (Redação) passou a arte ao Téo (`pass_forward`); no host, a Lia deu tudo ao Téo (a persona de Arte), que perguntou em vez de pedir texto à Bia — o uso das ferramentas depende de QUEM recebe o pedido.

**4. ht89 no INSTALADO (aceite do ISO-7) — pronto para o Rivet rodar.** `persona-spec/reports/ht89-installed.md` (comando exato com a trava, critério de PASS, o que fazer em cada falha) + `.maestri/tmp/tally/ht89-installed/packaged-gate-probe.mjs`: roda DENTRO do node do exe (padrão do `packaged-runners-probe.mjs`), importa o `PermissionGate` EMPACOTADO e roda os mesmos 7 cenários do `ht89-dry.ts` contra o `claude` real da máquina (2.1.319), endpoint falso, zero modelo. PASS = saída 0 + 7 cenários ok (o 1º pede uma vez) + `claudeVersion`; saída 1 = gate não obedecido (escrita só leitura, trava o ISO-7); saída 2 = build sem gate. Ensaio: `C:/p8i` (H2 #4) sai 2 "predates HT-8/9" (correto: aquele build não tem o gate; o comando documentado, com a trava, funciona); o stub MCP responde sob `Persona.exe` com `ELECTRON_RUN_AS_NODE=1`; a lógica dos 7 cenários com o claude real e o gate do código-fonte (shim): **PASS 7/7**. Limite: só o pack final mostra o gate empacotado de fato.

**Limitações.** (a) A guarda só reconhece como "aditiva" a linha cujo `inputTokens` é MENOR que o próprio cache; uma linha aditiva cujo não-cacheado fosse maior que o cache seria lida como total e subestimaria o cache. Nenhuma fonte grava assim hoje (o adaptador do OAR reporta o total; a fixture antiga do `estimate-history-tokens` era a única), mas é a suposição da guarda. (b) A cota segue sem atribuição possível por rodada enquanto outros agentes usam a conta. (c) O aviso de custo na tela de concessão (ISO-5/D-083 2) não existe no cliente: lacuna v1.2 registrada pelo Keel.

## 07/11 13:35 — AUDITORIA (pedido do Keel 13:12) das minhas seis linhas do PLAN: TODAS prontas para a v1.1 · o ledger do EFF-1 anexado · congelamento curto 13:25 respeitado (zero src depois das 12:50)

**Specs rodados HOJE sob `with-lock --lock check`, com timeout:** runners inteiro 13:01 (**73 arquivos / 569 verdes**; `check-pkg persona-runners` OK) + 13:20 engine/host/store/e2e abaixo (**16 arquivos / 215 testes verdes**; 1 deles, `persona-e2e/tests/engine-class-policy.spec.ts`, estourou os 5 s padrão sob carga porque o teste dispara `pnpm exec tsx` — levou 11,5 s — e passou sozinho com `--testTimeout 90000`; peço ao Probe um timeout no `it()` quando o congelamento soltar).

| linha | veredito | provas de hoje | o que falta (1 linha) | versão |
|---|---|---|---|---|
| **OPT-5** modelo certo + sessão aquecida | **DONE** | `engine-policy` (engine: triagem/Bibliotecário/Vigia/iniciativa/avaliação no motor barato; execução/resposta no da persona), `token-wiring` (host: `skipTriage` ligada, roteamento igual com/sem), `warm-runner-per-task` (host), `token-faithful` + `opt8-faithful` (engine: zero chamadas com equipe ociosa), `session-pool` + `resolve-runner` (runners), `engine-class-policy` (e2e) | nada para a v1.1. O TTL real saiu da pareada: a sonda de 6 min leu 302.561 tokens do cache (a premissa de 5 min não vale na assinatura); o gate do OPT-8 fechou honesto na D-094 (1,105, fora por 0,005) | v1.1 pronta; keep-alive de aquecimento (Rivet) = v1.2 |
| **OPT-9** calibração por pessoa | **DONE** | `estimate-ask` (engine, ≥ 5 amostras ⇒ "calibrado", senão "estimado"/`referencia-dev`), `estimate-calibration` (host: começa estimativa e calibra com os turnos medidos da PRÓPRIA pessoa; histórico de outro motor/conta NÃO calibra), `estimate-history-tokens`, `ledger-duration` (host: `durationMs` no livro), `turn-ledger` (store: `duration_ms`), `usage-meter.spec` "OPT-9 turn duration" (runners); contrato `contracts/estimate-calibration.md` | nada | v1.1 pronta |
| **OPT-10** requisições internas | **DONE** | `worker-prompt-opt10` (engine: −149 tokens no pareado, texto de antes congelado), `needed-round` (engine, 52), `owner-prompt-wrap`, `tool-level` (guarda do ToolSearch), `tool-observer`, `connector-fixture` (runners). Reais: censo a seco (`reports/opt10-proposal.md`: 1 requisição por tarefa, 0 auxiliares), a re-medição única (D-094) e o OPT-10b real PASS 7/7 (62.212 de entrada em 3 requisições); isolamento como braço (1ª entrega nativa 308.902 de entrada × `needed` ~31 mil por requisição) | nada. Um "limite de exploração" é impossível (a CLI 2.1.318 nem tem `--max-turns`): não fazer | v1.1 pronta |
| **ISO-2** concessão por persona | **DONE** | store `connector-grants` (v22: tabela própria + log só-acrescenta, pointer sem segredo, limite de 64, v21 abre intacto), host `connector-grants` (só o dono concede/revoga; conceder/mudar/revogar derruba os runners quentes DAQUELA persona ⇒ a próxima chamada sai das concessões de agora; auditoria + 1 linha no #geral; custo mostrado ANTES de confirmar), runners `permission-gate`/`-wire` + `account-connectors` (mandato por servidor, conector fora do mandato NEGADO sem cartão) | nada | v1.1 pronta (D-084: virou a permissão permanente "Sempre permitir") |
| **ISO-4** contadores do laço principal | **DONE** | `usage-detail` (runners, 11 testes): `mainLoopInputTokens?`/`mainLoopOutputTokens?`/`environment?` aditivos no `RunnerUsage`; o harness do OPT-8b (`pair-real-b`) grava os dois | nada | v1.1 pronta |
| **ISO-5** conectores de CONTA por persona | **DONE no runner** | `account-connectors` (22), `isolation-probe`, `stderr-redact`, `connector-unreached` (D-096) nos runners; prova seca `reports/iso5-dry.md` + real PASS 7/7 (OPT-10b); host `estimateConnectorGrantCost` testado no `connector-grants` do host | **UMA lacuna que não é minha:** o cliente nunca chama `estimateConnectorGrantCost` (procurei no `client-ui-persona/src`: zero usos), então o aviso da D-083 (2) "a Nina vai gastar mais por chamada" não aparece na tela de concessão | **v1.2** sugerido: a D-084 trocou a regra (conectores disponíveis, só o necessário entra por chamada); v1.1 só se o Atlas ainda exigir o aviso — dono Quill/Lumen + 1 texto da Muse |

**Para o PLAN (é do Keel):** as seis linhas podem ir a *done*; a única pendência real é a do aviso de custo na tela do ISO-5 (acima).

**Ledger do EFF-1 (Anvil, no tree 13:1x, sem migração): ANEXADO.** `persona-host/tests/eff1-ledger.host.spec.ts` **5/5 verdes hoje 13:13** (zero modelo): (1) persona Opus + Máximo ⇒ o spec que chega ao runner traz `opus`/`max` e a linha do turno em `host.ledger.list({projectId, personaId})` diz `model: opus`, `modelRequested: opus`, `effortRequested: max`, entrada 10/saída 5 e **nenhum** `modelDropped`/`effortDropped`; (2) "Padrão do motor" ⇒ nada fixo chega ao runner (sem esforço, `model: default`) e a linha NÃO tem nenhum dos cinco campos nem documento `turn_engine`; (3) modelo que o motor não oferece + esforço recusado ⇒ a Tarefa roda e a linha guarda as duas quedas; (4) valor que não é identificador não custa a medição; (5) `engineChoiceOf`. A cadeia inteira fica provada em três pontos: persona (host) → `--model`/`--effort` da CLI REAL (meu `eff1-dry`, 4 casos) → usage → sink (meu `usage-meter.spec`, +3) → linha do ledger (spec do Anvil).

## 07/11 13:10 — RETOMADA: EFF-1 provado no runner com a CLI real (zero modelo) e no sink do ledger · D-097: a chamada real fiel FEITA — o modelo USOU `pass_forward`

**Fila do Keel (12:20) cumprida, tudo no tree, nada commitado.**

**(1) Suíte e tipos.** `persona-runners/tests` inteiro: **73 arquivos / 569 testes verdes** (3 novos) e `check-pkg persona-runners` **OK** (23,8 s). A primeira rodada completa depois do EFF-1 (a que eu não tinha feito na pausa) achou DOIS erros meus: (a) um comentário de `oar/choice-report.ts` citava o nome "Atlas" e o guarda `coordination.spec` ("never mentions Atlas in runner or coordination source") ficou vermelho: troquei a frase; (b) `scripts/eff1-dry.ts` tinha um tipo que o `exactOptionalPropertyTypes` recusa (`check-pkg` pegou): corrigido.

**(2) EFF-1 provado com a CLI REAL e endpoint falso (zero modelo, nada gasto)** — `scripts/eff1-dry.ts`, saída em `persona-spec/reports/eff1-dry.json`:

| persona configurada | o que o OAR recebe (vira `--model`/`--effort`) | requisição que a CLI manda | usage do runner |
|---|---|---|---|
| Opus + Máximo | `model: opus`, `effort: max` | `claude-opus-5-5`, `output_config.effort: max` | `modelRequested: opus`, `effortRequested: max` |
| Sonnet + Alto | `sonnet`, `high` | `claude-sonnet-5-5`, `high` | `sonnet`, `high` |
| Padrão do motor (sem escolha) | **nada** (`model`/`effort` nulos) | o que a CLI decide sozinha (nesta máquina `claude-sonnet-5-5` + `xhigh`, das configurações do usuário) | **campos ausentes** |
| modelo inexistente + Alto | `model` nulo (cai no padrão), `effort: high` | `claude-sonnet-5-5`, `high` | `modelRequested` e `modelDropped: opus-9-9-nao-existe`; a Tarefa NÃO cai |

**O ledger (a gravação é do Anvil, SEM migração, combinado com o Keel):** o `MeasuredUsage` que o sink recebe (`usage-meter.ts`) leva `modelRequested`, `effortRequested`, `modelDropped` e, a pedido do Anvil (12:44), **`effortDropped`** (campo novo + a linha no `sink.record`; `tests/usage-meter.spec.ts` +3: os quatro como estão / sem escolha = AUSENTES (não string vazia) / só o modelo e só o esforço recusado). O desenho dele: JSON de detalhe em `screen_doc` (kind `turn_engine`, id = o da linha do ledger) só quando há escolha ou queda, `list()` devolve junto. **Pendente do meu lado:** anexar o `host.ledger.list` do turno Opus+Máximo do host quando o Anvil avisar o spec/rodada (a parte do runner até o sink está provada; a linha gravada é dele).

**(3) D-097 — a chamada REAL única (autorizada pelo Atlas, teto 1) — VEREDITO: O MODELO USOU A FERRAMENTA DE EQUIPE.** Montagem FIEL: `createOarSessionRunner` como o host (invólucro "Você é Bia, Redação" + normas de dono), pedido natural sem palavra-chave ("faz um cartaz da promoção da Padaria Lua com esta foto, quero algo bonito para o Instagram", com uma imagem sintética de faixas), o `TEAM_GUIDANCE` novo do Forge com o roster ("Equipe: Lia (Coordenação), Teo (Arte)." + "vale mais que as normas de dono"), persona com **modelo haiku escolhido explicitamente** (a sessão do OAR recebeu `{model: haiku}`; o sink recebeu `modelRequested: haiku`), chamada sem ferramentas nativas (`deny`, como os workers do TEAM-10), trava `real`, ambiente limpo, teto 1, sem dado pessoal e sem conector. Arquivo: `persona-spec/reports/team-offer-real-2.json`.
- **`modelChose: ["pass_forward"]`.** A Bia escreveu a parte dela (o texto do cartaz) e passou a arte ao Teo: o host recebeu `handoffs.ask` `kind: next`, `toPersonaId: teo`, título "Cartaz Instagram da promoção Padaria Lua: arte", com bilhete estruturado (`done`: o texto + a proposta; `needed`: montar o cartaz 1080×1350, **conferir a imagem** — percebeu que o arquivo era só uma faixa de quatro cores, sem foto de pão —, dados da promoção que faltam; `files`; `decisions`). Fala final: "Minha parte, o texto do cartaz, está pronta. A arte é do Teo, então passei para ele com a imagem e o texto." **Nada a ajustar no `TEAM_GUIDANCE_CORE`.**
- **Tokens do fornecedor:** entrada **14.892** (cache lido 10.475, escrito 4.413), saída **1.940**, 14,3 s, modo `needed` (`verified`); **cota da semana 2% → 2% (56 s entre as leituras; menos de 1 ponto)**. Um turno (teto 1 respeitado); não consumiu a tentativa 2 do TEAM-10 nem o total 25.
- **Texto que o modelo viu:** o mesmo do ensaio seco fiel desta rodada (`reports/team-offer-dry-2.json`, `rows[0].firstRequest.promptTextTheModelSaw`: identidade, normas de dono, o pedido, depois o parágrafo com o roster, depois a imagem); no modo real não há endpoint para capturar, a composição é a mesma função.
- **Custo do parágrafo novo (re-medido, ESTIMATIVA chars ÷ 2,483):** **493 caracteres ≈ 199 tokens** com 2 colegas (eram ~103): **+~96** (o Forge estimava +60 a +80; o roster custa ~6 tokens por colega, até 8). Sai em toda Tarefa que oferece as ferramentas de equipe.
- **`auto:5` pelo caminho do produto (sem o `--tool-search` manual) — refeito como subproduto do ensaio seco:** nas 3 configurações (`none/deny`, `read/deny`, `write/allow-once`) as 4 ferramentas de equipe vão INLINE na 1ª requisição (3.127 caracteres de definição), `deferred: false`, 2 requisições; o `pass_forward` roteirizado atravessa CLI → gateway → `TeamTools` → `handoffs.ask`.
- **Ressalvas honestas:** UMA chamada, UM pedido, haiku: prova que o CONJUNTO (invólucro da persona + roster + "vale mais que as normas" + "várias partes não é só texto") levou ao uso; NÃO separa qual elemento pesou (a 1ª chamada, sem invólucro e sem roster, não usou nenhuma). O modelo que o fornecedor REALMENTE rodou não aparece no contrato do runner (só o pedido): a prova do `--model haiku` é o argv entregue ao OAR + o ambiente da CLI no ensaio ("You are powered by the model named Haiku 5.5"). A linha "Tarefa que pede só uma resposta em texto… sem ferramentas" do molde do worker continua lá (o Forge não mexeu): neste pedido não impediu.

**Arquivos (sem commit):** `persona-runners/src/oar/choice-report.ts` (comentário), `src/resolve/usage-meter.ts` (+`effortDropped`), `tests/usage-meter.spec.ts` (+3), `scripts/eff1-dry.ts` (tipo), `scripts/team-offer-dry.ts` (tap da sessão do OAR + sink + campos do EFF-1 no usage), `.maestri/tmp/tally/team-offer-real-2.sh`; `persona-spec/reports/{eff1-dry,team-offer-dry-2,team-offer-real-2}.json`.

## ⏸ PAUSA TOTAL (05/11 ~06:42, ordem do Miguel via Atlas: cota semanal do Claude em 85%, só reseta no sábado) — ESTADO EXATO

**Parado no ponto seguro. Nenhum arquivo pela metade; nenhum job nem processo em segundo plano meu rodando; nada de IA real. Canceladas por ordem: a tentativa 2 do TEAM-10 e a 2ª chamada real do D-097.** A última verificação verde (06:3x): `persona-runners/tests/eff1-runner.spec.ts` + `persona-effort.spec.ts` + `resolve-runner.spec.ts` = **40/40** e `check-pkg persona-runners` **OK**. Depois dela só escrevi UM arquivo de script (abaixo, "nunca rodado"); nenhum `src` mudou.

### FEITO (verde)
- **OPT-10b real PASS 7/7** (04:35; 62.212 de entrada/244 de saída, 3 requisições, semana 80→80%); **TEAM-10 tentativa 1 lida** (rodada incompleta, 2 chamadas answer-only, semana 82→83%; `reports/team10-reading.md`).
- **D-096 runners na árvore** (05:49): `needed` por padrão + fallback "conector concedido não alcançado → UMA vez nativo" (`connectorsUnreached`/`connectorsFallback`); 13 arquivos; `persona-runners/tests` inteiro 72 arquivos/555 verdes na ocasião.
- **D-097:** custo medido das definições de equipe (CLI, zero modelo) e lean-a aplicado (Forge nas 4 ferramentas de equipe; eu no `persona_ask`): worker de equipe +1.626 (era +1.956), revisor +617 (+773), persona_ask +376 (+428); `contracts/team-tools-lean.md`. Teste seco do pedido natural (`scripts/team-offer-dry.ts`, `reports/team-offer-dry.json`): oferta + caminho provados. **1 chamada real** (OK do Atlas): o modelo NÃO usou as ferramentas de equipe; o teste foi INFIEL (sem o invólucro da persona), já corrigido no script (compõe pelo `createOarSessionRunner` como o host); o Forge reescreveu o `TEAM_GUIDANCE` (roster + "vale mais que as normas de dono").
- **EFF-1 no runner (NA ÁRVORE, tsc OK):** modelo e esforço por persona chegam à sessão (Claude: `--model`/`--effort`; **Codex agora também** recebe o esforço → `model_reasoning_effort` do OAR); **"Padrão do motor" (`model:'default'`, sem esforço) não manda nada e não diz nada**; **modelo que o motor não oferece NÃO derruba a Tarefa** (roda no padrão do motor; o runner de fallback não entra no pool); o usage traz `modelRequested`, `effortRequested`, `modelDropped` (+ o `effortDropped` que já existia) e o `MeasuredUsage` (a entrada do sink do ledger) os repassa; **tabela estática de níveis** `STATIC_EFFORT_LEVELS` (Claude low/medium/high/xhigh/max; Codex low/medium/high/xhigh/max/ultra, lidos das próprias CLIs) + `effortLevelsFor(cli, níveisDoMotor?)` com a origem (`engine`|`static`). O teste antigo "Codex nunca recebe esforço" foi reescrito e o de `model_unavailable` agora espera a queda no padrão.
- **D-097 interino (decisão do Keel 06:22): `ENABLE_TOOL_SEARCH=auto:5` só quando a sessão é `needed` E sem conector** (as 4 ferramentas ficam inline numa tarefa com ferramentas nativas; com conector nada muda; nativo/outras CLIs não): constante `TOOL_SEARCH_OURS_INLINE` + 3 testes (`eff1-runner.spec`) verdes. A prova manual com a CLI real + endpoint falso (`false`, `auto:1`, `auto:5` → inline, 2 requisições) está em `reports/team-offer-dry.json`.

### PELA METADE / NÃO VERIFICADO (nada quebrado, só não confirmado)
- `packages/persona/persona-runners/scripts/eff1-dry.ts`: **escrito completo, NUNCA rodado** (é a prova pedida pelo Keel: CLI real + endpoint falso, Opus+Máximo / Sonnet+Alto / sem escolha / modelo inexistente → sessão do OAR, requisição que a CLI manda e usage). Rodá-lo gasta zero modelo, mas é "lançar job": parado por ordem.
- Depois do EFF-1 **não rodei a suíte inteira de runners** nem os specs do host (só os 3 specs acima + `check-pkg`). Risco conhecido: qualquer consumidor do host que dependia do erro `model_unavailable` para um modelo escolhido (agora a Tarefa segue no padrão e o usage diz `modelDropped`).
- A prova com endpoint falso do `auto:5` **pelo caminho do produto** (sem o `--tool-search` manual) não foi refeita; os testes unitários cobrem a decisão.
- Não re-medi o custo do `TEAM_GUIDANCE` novo (o Forge estima +60 a +80 tokens sobre os ~103 antigos).
- Entregas que eu devia ao **Anvil** (EFF-1: o teste que prova o argv é `persona-effort.spec.ts` + `eff1-runner.spec.ts`; os campos do ledger `modelRequested/effortRequested/modelDropped` vêm no usage; falta ele gravar as colunas) e ao **Keel** (prazo 06:45) **não foram enviadas por escrito**: este relato é o estado.

### PRÓXIMOS PASSOS (quando o Atlas chamar; nada disto roda antes)
1. `persona-runners/tests` inteiro + `check-pkg persona-runners` + specs do host que leem usage/model (zero modelo).
2. Rodar `eff1-dry.ts` (CLI real + endpoint falso) e anexar a saída ao `reports/`; refazer a prova do `auto:5` pelo produto; re-medir o parágrafo novo.
3. Responder ao Anvil/Keel com a confirmação do runner do EFF-1 (acima) e apontar os testes.
4. **Só com nova autorização e cota:** a tentativa 2 do TEAM-10 (cancelada) e a leitura de custo/cota (`bash .maestri/tmp/tally/team10-take.sh before|after|read`, pronta); a 2ª chamada real do D-097 (cancelada; `team-offer-real.sh` pronto e guardado).

### ARQUIVOS (sem commit meu)
- **src (runners):** `contract.ts`, `index.ts`, `oar/adapter.ts` (Codex recebe esforço), `oar/choice-report.ts` (novo), `oar/effort-table.ts` (novo), `resolve/resolve-runner.ts` (queda do modelo, relato da escolha, auto:5), `resolve/usage-meter.ts`; `mcp/persona-tools.ts` (lean-a do persona_ask). **Antes (D-096):** `oar/connector-reach.ts`, `isolation.ts`, `isolation-gate.ts`, `env-mode.ts`.
- **testes:** `tests/eff1-runner.spec.ts` (novo), `persona-effort.spec.ts` e `resolve-runner.spec.ts` (reescritos nos pontos acima), `connector-unreached.spec.ts` + `support/unreached-world.ts` (D-096).
- **scripts:** `scripts/eff1-dry.ts` (novo, não rodado), `team-offer-dry.ts` (modo real guardado, desligado), `tools-lean-dry.ts`, `persona-engine/scripts/team10-reading.ts` e `persona-engine/src/bench/team10-reading.ts` (leitor de custo/cota da TEAM-10).
- **docs:** `contracts/connector-ports.md` (D-096), `contracts/team-tools-lean.md`, `reports/tally-d096-window2.md`, `reports/team10-reading.md`, `reports/team-offer-*.json`, `reports/tools-lean-*.json`. Scratch fora do repo: `.maestri/tmp/tally/*`.

## 05/11 06:25 — D-097: a chamada REAL (OK do Atlas 06:10): o modelo NÃO usou as ferramentas de equipe — e o teste NÃO foi fiel (faltou o prompt do worker)

**Resultado (haiku, teto 1, ledger novo, trava real, env limpo, sem dado pessoal, sem conector; `reports/team-offer-real.json`):** as 4 ferramentas foram OFERECIDAS (chamada sem ferramentas nativas, como as execuções do TEAM-10) e o modelo **não chamou nenhuma** (`modelChose: []`): respondeu direto "Não consigo gerar a imagem final nem salvar arquivos por aqui. Posso montar a arte em HTML/CSS, no formato 4:5…". Tokens do fornecedor: entrada **6.126**, saída **2.432** (a resposta foi longa), modo `needed`. **Cota da semana 85% → 85%** (09:10:45Z → 09:11:32Z). Não consumiu a tentativa 2 nem o total 25.

**Ressalva que muda a leitura (erro MEU do teste):** a chamada foi montada com o runner de turno cru, **sem o invólucro que o host usa** (o runner de sessão põe a identidade da persona e as normas de dono em volta da primeira entrega). O modelo recebeu o pedido + o parágrafo, sem "Você é Bia, Redação". Corrigi o script para compor pelo `createOarSessionRunner` como o host (ensaiado a seco, zero modelo: `personaIdentityInPrompt: true`, 2 requisições, `handoffs.ask` `kind next`). O OK de uma chamada foi gasto na versão infiel; **repetir pede novo OK (Keel)**.

**O que o texto REAL que o modelo vê sugere (captura em `reports/team-offer-dry.json`, `promptTextTheModelSaw`), para o Forge ajustar o `TEAM_GUIDANCE` a seco:** (1) o parágrafo **não diz QUEM está na equipe nem o que cada um faz** — sem isso o modelo não sabe a quem passar nem que "a arte" é de outro (o campo `colleague` exige um nome; hoje só aparece numa recusa); uma linha "Equipe: Teo (Arte), Lia (Coordenação)" custa ~15–25 tokens; (2) as **normas de dono** do prefixo mandam "termine o que o mandato pede, **sem devolver o que cabe a você**" e "nunca encerre com posso fazer X se você quiser": empurram a persona a FAZER tudo sozinha, o oposto de passar adiante; (3) a linha do worker "Tarefa que pede só uma resposta em texto…: sem ferramentas…; resultado e evidência no texto final" é condicional mas pode ser lida como a regra desta Tarefa; (4) o parágrafo vem DEPOIS do pedido (bom: recência) mas ao lado de uma escalada de "faça e reporte". Sem o roster e sem tirar a tensão com as normas, é provável que o modelo continue a não usar.

## 05/11 06:10 — D-097: custo das ferramentas e do parágrafo de equipe medido; teste seco do pedido NATURAL na CLI real

**Custo (CLI, zero modelo), com o lean-a do Forge + o do `persona_ask` aplicados (o "current" da árvore ficou IDÊNTICO ao lean-a):** `persona_ask` +376 (era +428), `ask_team_opinion` +455, `ask_colleague` +422, `pass_forward` +375, `review_verdict` +241; **worker de equipe +1.626 (era +1.956); revisor +617 (era +773).** O **parágrafo de orientação** (`TEAM_GUIDANCE`, 255 caracteres) custa ~**103 tokens** (ESTIMATIVA: caracteres ÷ 2,483, a razão que medi em prompts da Persona; `origin: 'estimate'`). Total da oferta incondicional por requisição de um worker de equipe: ~**1.730 tokens** (1.626 + ~103).

**Teste seco do pedido natural ("faz um cartaz da promoção da Padaria Lua com esta foto, quero algo bonito para o Instagram"), na CLI real com endpoint falso e chave de mentira (`scripts/team-offer-dry.ts`, `reports/team-offer-dry.json`):** pelo MESMO caminho do host (`TeamTools.toolsFor/guidanceFor`, `productToolsOpener`, gateway HT-0, runner real). **PROVA a OFERTA e o CAMINHO; NÃO prova que o modelo ESCOLHE usar** (um endpoint falso não decide nada).
- **Chamada SEM ferramentas nativas (`deny`, como as execuções do TEAM-10, que o ledger marcou answer-only):** a requisição que a CLI manda traz as 4 ferramentas com as definições inline (ask_colleague, ask_team_opinion, pass_forward, persona_ask; ~3,1 mil caracteres), o pedido natural e o parágrafo no prompt. Um "modelo" roteirizado que chama `pass_forward` atravessa CLI → gateway → `TeamTools.call` → `handoffs.ask` com `kind: next` (para o Teo, título "Arte do cartaz da Padaria Lua") e a resposta do host volta ao modelo. 2 requisições.
- **Tarefa COM ferramentas nativas (`allow-once`, persona com arquivo/shell):** a CLI **ADIA** as definições: elas NÃO vão na requisição, só os NOMES no texto do turno, e o modelo precisa chamar `ToolSearch` antes de usar uma delas (3 requisições em vez de 2; a requisição a mais carrega a abertura inteira, ~31 mil tokens em `needed`, bem mais que as definições). O caminho funciona (o roteirizado busca, chama, o host recebe `kind: next`), mas **dois efeitos**: a oferta incondicional NÃO custa o +1.626 por requisição nesse caso (as definições só carregam sob demanda) e **usar uma ferramenta de equipe custa uma requisição inteira a mais** — e é um degrau a mais para o modelo achar (provavelmente reduz o uso).

**O que falta e como saber:** se o modelo ESCOLHE usar as ferramentas com este pedido só uma chamada real mostra (haiku, ~10 mil tokens de entrada, menos de 1 ponto da semana). **Pedido de OK ao Atlas (via Keel): UMA chamada real, teto 1, ledger novo, `--lock real`, env limpo, SEM dado pessoal.** Sem o OK não faço.

## 05/11 05:55 — D-096 NA ÁRVORE (runners) · D-097: custo medido das definições de equipe e texto enxuto

**D-096 runners aplicado (05:49, GO do Keel e do Anvil):** `apply-d096.cjs` escreveu 13 arquivos (8 src + 5 testes) e removeu o staging; `persona-runners/tests` inteiro **72 arquivos / 555 testes verdes**, `check-pkg persona-runners` OK; os 5 specs do host que leem o padrão **39/39** com o runners novo na árvore. Anvil aplica o host depois do CV-6 (v25), com o fake `tests/support/unreached-world.ts`.

**D-097 (Keel 05:39):** o custo MEDIDO (pela CLI, zero modelo) das definições de equipe que TODA Tarefa recebe, e texto enxuto, em `contracts/team-tools-lean.md` (+ `reports/tools-lean-proposal.json`, `tools-lean-dry.json`). **Hoje: worker de equipe +1.956 (o +2.540 era de 03:33; as definições da árvore já encurtaram), revisor +773, persona_ask +428.** lean-a (só texto; mesmo contrato): worker +1.626 / revisor +617; lean-b (sem minItems/maxItems/additionalProperties; só se os handlers do host rejeitarem fora do limite): +1.507 / +541; **lean-c** (ask_colleague + pass_forward fundidas em `hand_off{kind}`, muda um nome de ferramenta): worker **+1.232**, o único que chega ao alvo ~1,2 mil. Entregue ao Forge e ao Keel; não toquei em `harness-tools.ts`/`persona-tools.ts`. Não provo que o modelo use as ferramentas igual com o texto mais curto: só a rodada real.

## 05/11 05:40 — TEAM-10, tentativa 1: a leitura de custo e cota (rodada INCOMPLETA) · janela de host aberta, D-096 na fila

**Medido (ledger do home da rodada + cota oficial antes 05:18:49 / depois 05:35:55):** 2 chamadas ao modelo (ambas `execution`, **`answer-only` nas duas, 0 nativo**), entrada 20.784, maior chamada 10.490, saída 1.290, soma 22.074 tokens. Cota da semana **82% → 83%** (+1 ponto, com outros usos da conta no intervalo; sem calibração nesta conta ainda). **A rodada FALHOU por um bug de produto (o worker recebeu o pedido TRUNCADO no título, não usou ferramenta de equipe): é INCOMPLETA e o número NÃO vale para a equipe inteira** — a faixa a seco (59–217 mil, ~11 chamadas) segue por validar na tentativa 2. Leitura para o Miguel (tokens e cota, sem dólar) em `persona-spec/reports/team10-reading.md` (o leitor ganhou `--incomplete` para não dizer "abaixo do previsto" de uma rodada que parou cedo).

**Validação parcial do orçamento a seco:** a maior chamada real (10.490) cai dentro da faixa que estimei para a 1ª requisição do worker (5.898–10.769): a conta por requisição confere; o total da rodada só se valida inteiro.

**Janela de host aberta (Keel 05:37), ordem: (0) fix do pedido truncado (Forge) → (1) CV-6 → (2) D-096 → (3) includeTextOnly.** Meu staging (13 arquivos, só `persona-runners/src` + tests, disjunto dos outros) espera o "go" do Anvil; sequência: `apply-d096.cjs --check` → apply → runners inteiro + `check-pkg persona-runners` → aviso ao Anvil. Checklist: `reports/tally-d096-window2.md`.

## 05/11 05:15 — TEAM-10: o leitor de custo e cota da rodada real da equipe está pronto (ensaiado, zero modelo) · staging do D-096 fora de packages

**Leitor (item 2 do Atlas).** `persona-engine/src/bench/team10-reading.ts` (puro, 12 testes, `check-pkg persona-engine` OK) + `persona-engine/scripts/team10-reading.ts` (lê a cópia do `turn_ledger` do `PERSONA_HOME` da rodada + a cota oficial antes/depois + a faixa a seco; ensaiado num banco sintético com a rodada de 11 chamadas). Devolve a leitura para o Miguel em **tokens e cota, sem dólar** (D-092): chamadas, entrada total (input + cache), saída, maior chamada, se ficou dentro da faixa registrada ANTES (59–217 mil, esperado ~120 mil — a faixa não é movida depois do dado), a cota da semana como o medidor oficial a mostra ("80% antes, 80% depois: menos de 1 ponto"; só uma conta calibrada ganha uma faixa de pontos) e um alarme se algum turno rodou nativo SEM o motivo permitido (D-096 `connector-unreached`). Relatório técnico com tudo o que a frase arredondou. Procedimento combinado com o Probe: eu leio a cota (pedido de controle, zero modelo) antes e depois da rodada dele; ele me dá o home e o início.

**Staging do D-096 movido (05:02, pedido do Keel):** `.maestri/tmp/tally/d096-staging/` (fora de `packages/`: dentro dela entraria na impressão digital do Probe; existiu em `packages/persona/persona-runners-d096` de ~04:40 a ~05:01, o Probe foi avisado do intervalo). Roda os testes do staging com `npx vitest run --config .maestri/tmp/tally/d096-staging/vitest.config.ts`. Um teste meu tinha uma bomba-relogio (data fixa que envelhecia o registro do gate): agora parte de `Date.now()`. Fake para o teste do host (Anvil): `tests/support/unreached-world.ts`.

## 05/11 05:05 — D-096 em STAGING (runners) · calibração da cota fechada ponta a ponta · varredura engine+runners

**D-096 (`needed` por padrão, 2 fallbacks) — pronto em staging, a aplicar na 2ª janela (~06:00).** Nada em `persona-runners/src` foi tocado (congelado 04:15/05:00): o trabalho está em `.maestri/tmp/tally/d096-staging/` (FORA de `packages/`, movido às 05:02 a pedido do Keel: dentro de `packages/persona` entraria na impressão digital do Probe; cópia de `src` e `tests`, um `node_modules` que é um LINK, config de vitest própria; **não é para commitar**: o script de aplicar apaga a pasta). Sinal combinado com o Anvil (04:48): `RunnerUsage.connectorsUnreached` (`{ ordinal, reason }[]`, ordinal = posição na lista deduplicada que o host passou) + `connectorsFallback` (`'native-once' | 'floor'`); **sem reexecução**: decidido antes do 1º token no `resolveRunner`; por Tarefa, sem pool, sem estado; `needs-auth`/`no-login` ficam no piso (o nativo também não alcança e custaria ~309 mil tokens/req à toa). Contrato: `contracts/connector-ports.md` (seção D-096). **Provas:** 19 testes GUARDA novos (`connector-unreached.spec.ts`); a suíte inteira de runners contra o src em staging com o novo padrão: **72 arquivos, 553 testes, 549 verdes + 4 que assumiam o padrão antigo (no novo local, 552/553: a única falha depende do caminho relativo da fixture do Probe)** (isolation-gate ×1, isolation-plan ×3), reescritos para o padrão `needed` e verdes; typecheck do src em staging sem erro nos arquivos tocados.

**Aplicar (2ª janela):** `node .maestri/tmp/tally/apply-d096.cjs --check` (só confere e lista: hoje "11 arquivos; src sem mudança desde a cópia", fail-closed se alguém mexeu em um dos 7 arquivos de src) → `node .maestri/tmp/tally/apply-d096.cjs` (copia 7 src + 4 testes e apaga a pasta de staging, removendo o link do node_modules sem seguir) → `persona-runners/tests` inteiro + `check-pkg persona-runners` + os specs do host que leem o padrão (`connector-bridge`, `connector-grants`, `connector-release.host`, `ht9-host-bridge`, `ledger-duration`).

**Alerta para o Probe/Keel (depois da virada, não antes da rodada real):** (1) `persona-e2e/src/team-round-guard.ts` mata todo turno `native`: o fallback 2 gera um `native` LEGÍTIMO (`envModeReason: connector-unreached`); a guarda deve aceitá-lo SÓ com esse motivo. (2) `isolationProofProblems` exige as provas de `answer-only` E `needed` no arquivo do gate, mas o prewarm prova só o modo em vigor (`cliEnvMode(env)`): com o padrão `needed` um arquivo novo só teria `needed`. (3) `team-round-tree-gate.ts` trata `answer-only` como o padrão (`PERSONA_CLI_ENV` vazio passa; `needed` explícito é acusado). A rodada real do Probe acontece ANTES da virada (padrão `answer-only`), então nada disso o atinge agora.

**Calibração da cota (USD-1) — fechada.** O Rivet entregou o rastro (`StoredOfficialQuota.readings`, `mergeQuotaReadings`, teto 200, só janelas 5h/semana, a trilha vem da linha anterior). O `readingsOf` do host já lia isso por estrutura; novo teste de PONTA A PONTA com o store de verdade (`persona-host/tests/estimate-account.spec.ts`, +2): quatro leituras oficiais por `putQuota` + o ledger medido ⇒ `week` calibrada (90–100 mil tokens/ponto, 3 pares, `origin: 'calibrated'`); a mesma leitura repetida / uma só NÃO fabrica calibração. Host `estimate-account.spec` 12/12.

**Varredura engine+runners (04:35):** 172 arquivos, 1.631 testes: **1.630 verdes**; a única falha, `history-review.spec` (EBUSY do OneDrive sob carga), passa SOZINHO 32/32. A outra falha antiga (`coordination.spec`, o nome do CTO no código-fonte) foi corrigida às 04:14 e verde.

## 05/11 04:35 — OPT-10b: PASS 7/7 na rodada real (conector de teste) · guarda do ToolSearch · "Bom dia": pedido agrupado sem pessoa e critério único Hoje × Precisa de você

**OPT-10b — veredito pela regra: PASS (7/7).** UMA rodada real (ordem do Atlas 04:12), conector de TESTE local de 30 ferramentas com dados sintéticos (nenhum dado pessoal), limite registrado antes do dado **39.432**, ledger novo, trava `real`, env limpo, teto 3: usou **1 tentativa**. A persona `read` em `needed` chamou `ToolSearch` (encanamento da CLI), depois `list_labels` no conector de teste (executada, sem erro) e respondeu com uma palavra do resultado; só o conector concedido, nenhuma escrita liberada, nenhuma recusa do portão. **Tokens do turno:** entrada **62.212**, saída **244**, 3 requisições; **maior requisição pela regra (total ÷ requisições) 20.738 ≤ 39.432**. Teto firme: o turno inteiro (62.212) é ~20% de UMA requisição do nativo (308.902). **Cota da semana 80% → 80%** (informativo; invisível a 1 ponto). Detalhe e limites: `contracts/needed-real-round.md` ("Resultado da rodada real"), `reports/needed-real.md/.json`; a tentativa 1+1 de antes segue guardada (`needed-real-tentativa-1.*`).

**Guarda do ToolSearch (aponte-me o arquivo/teste → Keel):** `persona-runners/tests/tool-level.spec.ts`: o teste de classificação e o novo "GUARD (OPT-10b): a read persona is NOT stopped at the CLI ToolSearch" (o turno segue pela `ToolSearch` até a próxima leitura; em `none` ainda para; `ToolSearchAndRun` segue escrita). Quebrar a linha em `src/resolve/tool-level.ts` derruba os dois.

**Congelamento:** a única edição minha em `persona-runners/src` hoje foi um COMENTÁRIO em `mcp/connector-fixture.ts` (04:14:37, antes do congelamento das 04:15; o teste de coordenação proíbe o nome do CTO no código-fonte). Durante a rodada (04:31–04:32) não toquei em `persona-host/src`, `persona-runners/src` nem `apps/cli/src`.

**"Bom dia" (janela do engine/host até 05:00, Keel/Bolt/Anvil).** (A) pedido agrupado sem pessoa: o engine ganhou `MorningTask.grouped` → `MorningLine.grouped`; a linha agrupada sai **"Campanha de lançamento ficou pronta (Texto, Arte e Posts)"** (as partes do título vão depois do verbo), sem nome e sem depender de `names` (a linha sem persona conhecida deixa de ser descartada); as demais seguem "Nome terminou Título"; ordem e "e mais n" iguais. (B) critério único: `MorningTask.needsPerson` — a Tarefa que conta em "Precisa de você" NÃO entra em "Hoje"; sem a flag, como antes. **Falta o host ligar as duas flags** (Anvil: `groupDone` põe `grouped: true`; `morningTasks()` põe `needsPerson: true` na revisão que conta em `needsYouCount`). Engine: `morning-brief.spec` 34/34, `check-pkg persona-engine` OK. Reparo de texto: "ficou pronta" é o verbo pedido; para título masculino ("Cardápio novo ficou pronta") sai errado em português — avisado ao Bolt (troca de uma linha em groupedPhrase se quiserem neutro).

## 05/11 03:55 — TEAM-10: o orçamento de tokens da rodada real da equipe, por contagem (sem modelo) e o limiar do vigia do Probe

**Como foi feito.** Os números que entram são MEDIDOS: (a) o peso das ferramentas que um turno recebe, **contado pela própria CLI** (`get_context_usage`, local, zero modelo; `persona-runners/scripts/tools-overhead-dry.ts`, CLI 2.1.318, lançada com os argumentos do produto: sem ferramentas nativas, `--strict-mcp-config`, fonte `project`), com um MCP que oferece exatamente as definições que o gateway HT-0 anuncia; (b) a base do answer-only (3.022 numa chamada haiku de uma linha, OPT-8b) e o custo do prompt da Persona (2,483 caracteres por token, OPT-8b); (c) a imagem (1500×1000 = 2.018 tokens, rodada real de 04/11; 1.816–2.220 pela regra, até 3.300 se o tamanho é desconhecido). Os prompts são os que o produto monta de verdade. `reports/tools-overhead-dry.json` e `reports/team10-budget-dry.json`.

**1) Peso das ferramentas por requisição (medido pela CLI).** Linha de base sem MCP: 1.608 tokens de prompt do sistema. `persona_ask` sozinha: **+428**. Worker com as ferramentas de equipe (`persona_ask` + `ask_colleague` + `pass_forward` + `ask_team_opinion`): **+2.540**. Revisor (`persona_ask` + `review_verdict`): **+773**. Worker de equipe + quadro: +2.865. As 19 ferramentas do gateway de uma vez: **+6.240** (328 por ferramenta; ~1,9 caractere por token de esquema JSON). Um turno real NÃO recebe as 19: o `productToolsOpener` filtra por `persona_ask` + as ferramentas de equipe daquele turno + as do quadro/sprint/rotina só se o texto do pedido as chama.

**2) Entrada por requisição, em answer-only (faixa, tokens).** Worker, 1ª requisição (Tarefa com o cartaz): **5,9–10,8 mil** (base 3.0 + ferramentas 0,4–2,9 + prompt do worker 0,4 + persona + pedido + imagem 1,8–3,3). Worker, requisição seguinte do mesmo turno (a chamada de ferramenta e o resultado voltam): 6,1–12,2 mil. Resposta de opinião de um colega (curta, SEM ferramenta, COM a imagem): **5,6–8,1 mil**. Consolidação pela autora (as respostas, SEM imagem): 4,1–7,4 mil. Revisor (o bilhete, sem imagem): 4,5–5,2 mil. Saída: resposta de opinião 30–150, consolidação 80–400, revisão 40–400, worker 150–1.500.

**3) A rodada de ~11–12 turnos (3 Tarefas, 1 rodada de opinião com 3 respostas + a consolidação, 2 revisões, 2 retomadas):** entrada somada de **59 mil a 217 mil tokens, esperado ≈ 120 mil**; saída ≈ 4–10 mil. (O mínimo é cada turno de 1 requisição; o máximo, 3 requisições por turno de worker com imagem de tamanho desconhecido.) Em cota: invisível a 1% (D-092), exatamente como as rodadas anteriores (58,6 mil tokens não mexeram a semana).

**4) O LIMIAR do vigia do Probe (">60 mil no 1º turno") está CERTO para pegar o nativo (309 mil) mas ERRADO nos dois sentidos para o resto:**
- **Baixo demais para pegar o meio-termo:** uma requisição de **31–45 mil** (o piso de uma chamada COM ferramentas nativas, 31.414, ou ele + um conector) passa no 60 mil e já é errado para este caso (o esperado é ≤ 12,2 mil por requisição).
- **Falso positivo possível se for a SOMA do turno:** o "inputTokens" de um turno soma todas as requisições dele; um worker que chama 4–5 ferramentas faz 5–6 requisições de ~10 mil = **50–60 mil num turno perfeitamente bom**.
- **Regra recomendada (3 linhas):** (1) o sinal principal não é número: **cada turno tem de reportar `envMode` = `answer-only`** (ou `needed` se for o caso); `native` = abortar; (2) teto por REQUISIÇÃO: **entrada do turno ÷ (chamadas de ferramenta + 1) > 25.000 = abortar** (aviso acima de 15.000; o esperado é ≤ 12,2 mil, o piso nativo 31 mil, o nativo 309 mil); (3) teto da rodada: **entrada acumulada > 260.000 = abortar** (1,2× o máximo estimado, 217 mil). Margem de modelo: medi em haiku; um modelo com outro tokenizador pode contar até ~1,35× mais, e 12,2 mil × 1,35 = 16,5 mil continua abaixo de 25 mil.

**Limitações.** (1) O peso das ferramentas é a contagem da CLI 2.1.318 para as definições de hoje; mudar uma descrição de ferramenta muda o número (reroda o script em segundos, zero modelo). (2) A forma da rodada (quantos turnos de cada tipo, quantas requisições por turno) é minha suposição de ~11–12 turnos; o total esperado é uma faixa, não uma previsão. (3) Se uma persona rodar com ferramentas nativas (arquivos/shell), o piso sobe ~28 mil por requisição e o limiar de 25 mil abortaria: é o comportamento certo, porque aí o answer-only não vale. (4) A imagem do cartaz só entra nos turnos que a recebem (Tarefa e cada colega da opinião, não a consolidação).

## 05/11 03:30 — OPT-10b construída e ensaiada (privacidade primeiro) · portas do HT-9 de leitura · `takeReleased` · cartão do dia em dois títulos

**OPT-10b a seco, nada gasto.** `engine/bench/needed-round.ts` (critério, guardas, escolha do conector; **52 testes**, escritos antes do dado), `runners/oar/tool-observer.ts` (vê cada chamada de ferramenta envolvendo o runtime, sem tocar no adapter; 7 testes) e `runners/scripts/needed-real.ts` (seco por padrão; `--preflight` sem modelo; real só com todos os guardas). **Ensaio na CLI real (2.1.318, 0 chamadas de modelo; `reports/needed-real-preflight.json`, ids opacos):** `needed` PROVADO; 7 conectores da conta, 5 usáveis; o escolhido é o de e-mail, que TEM ferramenta provada somente-leitura sem conteúdo; o de agenda não está conectado; o runner foi montado como o da rodada real e parou antes de qualquer turno; `ht89-dry` verde na versão (GATE OBEYED). **Sugestão do Keel aplicada:** a tarefa padrão LISTA RÓTULOS (ou agendas) e pede nomes (não só a contagem) para a resposta poder ser conferida; nada de ler mensagem; o observador nem guarda em memória o resultado de uma ferramenta de conteúdo; o item `no-content-read` reprova a rodada se uma for chamada; a leitura de UM item é só alternativa, com `PERSONA_NEEDED_ALLOW_CONTENT=1`. **Achado:** o custo medido do conector de e-mail é +0 (a CLI adia os esquemas); registrei ANTES do dado que o limite é 1,15 × (31.414 + max(medido, 2.875)) = **39.432** (2.875 = o que os 7 conectores somam, medido). Falta: a decisão do HT-9 das 12:00 e o OK do Atlas. `contracts/needed-real-round.md`.

**Portas do HT-9 de leitura (pedido do Anvil, prioridade).** `mcpStatusOf(cli)` (síncrona, cache enxuto SEM URL no formato que o `annotationTable` lê; enchida por `refreshMcpStatus`, ~5 s, zero modelo, nunca lança), `availableConnectorsOf(cli)` (os conectores conectados da conta, name + URL, URL só em memória, da MESMA sessão), `cliIsolationProven(cli, { version })` (só diz `full` se a versão foi PROVADA; sem versão/veredito, versão nova, native/answer-only, OpenCode sem sonda = `none`). Medido na CLI real: 5,2 s, 21 servidores (8 conectados), 412 ferramentas, 228 provadas somente-leitura, 117 destrutivas, plano `full`, provado `full`. `connector-ports.spec` (18); achei e corrigi um caso em que o refresh podia lançar. `PermissionGate.takeReleased()` (aditivo, 4 testes): só o que o gate REALMENTE liberou entre as aprovadas; o Anvil já a usa para marcar `sent`. Contrato `contracts/connector-ports.md`.

**Cartão do dia em dois títulos (Muse, via Keel).** O motor devolve `variant` (`morning`/`on-demand`) no cartão; `briefVariant` (agendado = morning; à mão = morning antes das 12:00 e on-demand depois; hora ilegível = on-demand), `briefTitle` ("Bom dia · {dia}" / "Resumo do dia · {hora}") e `briefShowsSpot` (o spot só no morning); o corpo abre com "Bom dia." ou "Resumo do dia.". 8 testes novos (morning-brief 25) + host 17. Prism (locale + esconder o spot) e Bolt/Anvil (passar o trigger e a hora) avisados; a frase final é da Muse. `contracts/morning-brief.md`.

**Provas.** Engine + runners inteiros e os specs do host que toquei: **177 arquivos, 1.680 testes verdes**; `check-pkg` engine, runners e host OK.

**Limitações.** (1) A rodada real do `needed` NÃO foi pedida: depende do HT-9 de 12:00 e do OK do Atlas. (2) A maior requisição é medida como total ÷ 2 (conservador) enquanto o OAR não der a entrada por requisição. (3) A rodada de agenda não rodaria nesta conta (a agenda não está conectada); a de rótulos de e-mail sim. (4) A ligação do `variant` no host (`morning-brief-host.ts`) e a frase na UI são de Anvil/Bolt e Prism/Muse.

## 05/11 02:50 — HT-9: o contrato ponta a ponta do portão, sem modelo (e uma costura que o teste achou) · OPT-10b no papel · calibração da cota pronta do meu lado

**HT-9 (minha parte: semântica do gate + testes de contrato; integra o Anvil).** O gate real já existia e estava provado (`permission-gate.spec` 19, `permission-gate-wire.spec` 5, `tool-gate.spec` 19, e a CLI real em `scripts/ht89-dry.ts`, 7 cenários, endpoint falso). Faltava provar a COSTURA: gate → cartão → aprovação → gate. `persona-host/tests/ht9-gate-contract.spec.ts` (**19**) compõe o gate REAL (o gancho HTTP que a CLI chama), o `ExternalActions` do Anvil e a política contra um conector falso que só "executa" quando o gancho diz `allow`, e fixa as 4 propriedades do Keel: (1) enviar sem aprovação → nada sai e há UM cartão; (2) aprovar → sai exatamente aquela ação (mesmo hash, ordem de chaves irrelevante), uma vez; (3) argumentos reescritos depois da aprovação → negado, vira outro cartão, a 2ª tentativa para, prévia cortada/escondida não se aprova às cegas; (4) pagar/apagar SEMPRE com prévia, mesmo com a permissão mais larga (send/pay/delete = never): o `send` passa, `pay`/`delete` não, "Não perguntar de novo" é ignorado. Contrato: `contracts/permission-gate.md` (seção ponta a ponta).

**Achados do teste (nenhum precisou de modelo).** (A) **Costura:** a prévia do gate é PLANA (`to[0]`, `paths[0]`, `message.body`) e o cartão lê campos de topo e listas como lista: com o gate real um **apagar não listava os arquivos** e um envio não mostrava o 2º destinatário (o spec do cartão passava arrays direto, por isso ninguém viu). `persona-host/src/action-input.ts` (`unflattenPreview`, 5 testes, arquivo meu) remonta; a cola do Anvil tem de chamá-la. Só muda a prévia, nunca o hash do que é aprovado. (B) **Duas verdades:** `decideConnectorUse` ainda deixa pay/delete virarem `run-and-report` sob `confirm.pay/delete = never`; o gate as ignora, então o resultado é prévia sempre (testado), mas sugeri ao Anvil tirar a via. (C) **Leitura só conta se o servidor provar `readOnly`** no pré-voo: sem isso até `list_emails` é tratada como `send` (fail closed, testado); o pré-voo do ISO-5 tem de alimentar o `annotationTable`.

**O que falta e de quem.** Cola do host (Anvil): criar o gate por persona × projeto × finalidade e passar `permissionGate` ao `resolveRunner`; após `blocked`: `takeRequests` → `unflattenPreview` → `record`; `onActionApproved` → reabrir a Tarefa com `approved` → `arm`; `markSent`; fechar o gate. Registrar o hook, limite e sem segredo no `blocked` (Rivet; a fiação existe, `permission-gate-wire.spec`). Nada é inviável; o risco é a cola.

**OPT-10b no papel** (`contracts/needed-real-round.md`): UMA tarefa de leitura num conector da conta em `needed`, teto 3 chamadas, critério registrado antes (conector chamado e sem erro; nenhum outro servidor; entrada ≤ 1,15 × (31.414 + conector medido no pré-voo); texto final com palavra do resultado da ferramenta; modo efetivo `needed`); sem controle nativo (os 308.902 são do Probe); ≈ 70 mil tokens, < 1 ponto da semana; privacidade: o script grava só booleanos e contagens. **Proposta, nada rodado; o OK do Atlas só depois do ensaio seco.**

**Calibração da cota (USD-1), meu lado pronto:** `quotaPairs` (pares de leituras de UM ciclo, fecha com ≥ 3 pontos, tolerância de 2 s no relógio de reinício) + `calibrateQuota` em P50–P90 (o uso FORA da Persona só baixa os tokens por ponto, então os pares baixos são os contaminados) + `ledgerTokensBetween` (medidos, mesmo motor e conta) + `accountForEstimate` lendo `readings` de forma estrutural: liga sozinho quando o Rivet colocar o rastro no store (ETA dele ~45 min). 15 testes novos (`estimate-account.spec` 10 + `quotaPairs` 5).

## 05/11 02:30 — W3 só para resposta curta (OPT-11): o portão está pronto, provado a seco e DESLIGADO; o efeito só uma rodada real mostra

**Feito.** `classifyShortAnswer` (`persona-engine/src/short-answer.ts`): conservador — pergunta ou verbo de consulta/conferência/cálculo, ≤ 240 caracteres, uma linha, ≤ 2 frases, sem entregável, sem imagem; **nunca** a 1ª entrega, prompt que já é de worker, revisão/bilhete, nem nada longo. `prefixOwnerNorms(…, { leanShortAnswers: true })` põe a regra do relato curto **uma vez** só nessas tarefas; padrão desligado; o `leanReport` antigo (todas as tarefas) intacto. **Handoff e revisão ficam com o relato/bilhete inteiro** (testado). Provas: `short-answer.spec` (engine, 12 curtas + 20 mantidas cheias + limite exato + 1ª entrega/revisão/bilhete) e `owner-prompt-wrap.spec` (+3). Contrato `contracts/w3-short-answer.md`.

**O que NÃO sei, e escrevo.** Não há número de saída de uma tarefa CURTA (os 828–908 tokens da rodada de 01:40 são de uma tarefa longa). Uma resposta curta pode já sair curta sem a regra; nesse caso a W3 não economiza nada, e a regra pré-registrada tem esse ramo ("nada a ganhar" se a saída sem a regra for < 300 tokens). O portão dá segurança de que a regra não chega a entregável nenhum; não prova economia.

**Proposta (OPT-11), NÃO rodada:** 6 tarefas curtas com agulhas × {sem, com a regra} × n = 2 = 24 chamadas haiku, teto 30; GO se saída com a regra ≤ 0,65× E todas as agulhas nos dois braços E "Resultado:" em todas; NÃO-GO se qualquer agulha faltar; ≈ 94 mil tokens, < 1 ponto da semana. Preciso do OK do Atlas (via Keel) e, para a chave valer no produto, de 2 linhas do Rivet em `oar/session.ts` (passar `leanShortAnswers` ao `prefixOwnerNorms`).

## 05/11 02:10 — USD-1 (D-092): assinatura nunca mostra dólar; a estimativa, a rodada de opinião e a revisão passaram a falar em cota

**Regra no código, num lugar só.** `persona-engine/src/ux/billing.ts`: `billingOf` (qual conta roda o motor), `quotaImpact` (o impacto na janela que o fornecedor PUBLICA: 5 h se existir, senão a semana), `calibrateQuota`, `shapeForAccount` (a única função que decide o que a tela vê) e `impactLine` (a linha em pt-BR). `estimateAsk`, `budgetOpinionRound` e `reviewCost` usam a mesma; o host (`estimate-account.ts`) diz o tipo de conta e as janelas oficiais. Contrato `contracts/usd-subscription.md` (+ notas em estimate-ask, opinion-budget, review-step).

**O que muda para a tela.** `billing` = `'subscription' | 'api' | 'unknown'`; `custo.microUsd` **só com API** (assinatura e desconhecida = `null`: nenhuma tela mostra dólar por engano); `quota` = `{window, pct|null, usedPct, remainingPct, resetsAt, origin}`; `impacto` = a linha pronta. Desconhecida esconde dinheiro como assinatura. O rodapé da opinião acrescenta "cerca de p% da sua janela da semana" (só com % calibrada) ou "≈ US$ … (estimativa)" (API), no mesmo critério dos tokens. O limite "pedir confirmação acima de X" do host continua usando o US$ de lista **interno** (`referenciaMicroUsd`), e a recusa agora diz "passa do que a pessoa aceita usar".

**A honestidade que custa:** o fornecedor publica só o % USADO de cada janela, a 1%, sem capacidade em tokens. O % de UM pedido = tokens ÷ (tokens por ponto da janela), e o segundo número só existe calibrado na conta da pessoa. O host guarda só a última leitura oficial, então **hoje o `pct` vem `null` = "cota não medida"** (nunca 0%); a tela pode mostrar o % usado oficial (`usedPct`, ex.: semana 70%) e as chamadas. Medido: 58,6 mil tokens não mexeram a semana (70% → 70%), 309 mil de uma 1ª entrega nativa também não: a capacidade é grande e a resolução é grosseira. Pedi ao Rivet um rastro curto das leituras (hora, % por janela) para a calibração existir.

**Provas.** `usd-subscription.spec` (engine, **26**): tabela de `billingOf`; janela 5 h/semana/nenhuma; calibração (mínimo de pares e de variação, P25–P75, janela certa); assinatura/desconhecida sem `microUsd`, sem "US$", sem "$", sem "custo" em NENHUM valor (`rotulo`, `motivo`, `impacto`, `basis` e o JSON inteiro); API com US$ rotulado estimativa; trocar de conta (assinatura → API → assinatura → desconhecida) troca a forma sem estado preso; rodada de opinião e revisão no mesmo regime. Host: `usd-subscription.host.spec` (**6**: Claude Max, CLI com chave de API, persona DSH que roda na CLI logada, desconhecida, troca da conta ativa trocando as janelas, mensagem sem chamada) e `opinion-host.spec` (+3). Engine + runners + os specs do host de estimativa/opinião/tokens/1ª entrega: 176 arquivos verdes (1.557 testes); 3 falhas do `history-review.spec` foram timeouts de EBUSY sob carga (a suíte rodou 230 s) e o arquivo passa sozinho, 32/32. `check-pkg` engine e host OK.

**Limitações.** (1) `pct` null até haver rastro de leituras (Rivet). (2) A conta da rodada de opinião é a de quem PEDE; colegas em contas diferentes teriam janelas diferentes. (3) Os relatórios técnicos (placar, pareado, este arquivo) seguem citando US$ de lista como referência interna, rotulados: não vão à tela. (4) O texto final das frases é da Muse; mudar a frase é uma linha em `impactLine`. (5) Não toquei nos locales/telas (Lumen, Muse, Flint).

## 05/11 01:40 — OPT-10, a ÚNICA re-medição real (OK do Atlas 01:23): entrada da Persona 3.487 → **3.340** (razão 1,153 → **1,105**), fora da banda por 0,005 · sem paridade pela regra · qualidade 3/3

**Condições (as do Keel).** 15 chamadas haiku (teto `PERSONA_REAL_TURN_CAP=40`, usadas 15), trava `real`, ledger absoluto fresco, env limpo (sem `CLAUDE_CODE_*`/`MAESTRI_*` do terminal), `answer-only` provado antes (15/15 efetivas `answer-only`: a rodada é válida), mesma regra pré-registrada (mediana de 3, razão [0,90; 1,10], dispersão ≤ 0,5, qualidade 3/3). Nada repetido. Relatório `reports/pair-real-b.md` (a rodada anterior ficou em `pair-real-b-r1-opt8b.md`).

| | OPT-8b (antes) | **agora (A+B)** |
|---|---|---|
| entrada direta (mediana) | 3.023 | **3.022** |
| entrada Persona (mediana, os 3 repetem igual: dispersão 0) | 3.487 | **3.340** (−147) |
| razão de paridade fria / quente | 1,153 / 1,153 | **1,105 / 1,105** (banda ≤ 1,10 = ≤ 3.324: faltam ~16 tokens) |
| pronto (critério de aceite) nas 3 repetições | sim | **sim, em todas as células** |
| saída Persona vs direta (mediana, fria / quente) | +40% / +57% | +15% / +9% — com n = 3 e a MESMA entrada direta variando 634–931, **não atribuo isso ao corte** |

**A calibração acertou.** Previ 3.338 (2,483 caracteres por token) e a CLI mediu 3.340: +2 tokens. O modelo de custo do prompt é confiável para os próximos cortes.

**Veredito pela regra pré-registrada: SEM PARIDADE** (as duas razões acima de 1,10, dispersão ≤ 0,5); `pair-parity` do placar D-068 segue `blocked`. É a MESMA conclusão qualitativa da rodada 1, 0,005 mais perto. Não é para repetir a rodada (ordem do Keel).

**Cota (D-092).** Semana **70% antes → 70% depois** (leitura oficial, 4 min de intervalo; resolução de 1%): as 15 chamadas ≈ **58,6 mil tokens** (47,3 mil de entrada, 11,3 mil de saída) não mexeram o medidor, então **o quanto isso pesou na semana não é mensurável** nesta conta (cabe em < 1 ponto). Entre a rodada 1 e esta a semana foi de 67% para 70% por uso de outras sessões, não desta rodada. Janela de 5 h: a conta Max não publica. Referência de preço de lista (só relatório técnico, não é a cobrança): ≈ US$ 0,10.

**Fecho (D-094, Atlas): a banda NÃO se muda depois do dado (o D-068 proíbe).** O `pair-parity` fecha assim, honesto: **não atingido por 0,005 (1,105 × 1,10); o custo absoluto é ~99% menor que o da CLI nativa (308.902 → 3.340 tokens de entrada por chamada); os +10% vêm do prompt do worker, que carrega o contexto da persona que a chamada direta não tem.** OPT-8 = 3/4 e não bloqueia a v1.1. O corte do prompt PARA aqui (decisão do Keel): o ganho real foi na primeira entrega (−427 tokens, −32%). Nenhuma nova chamada real.

## 05/11 01:25 — OPT-10: o prompt do worker perdeu o texto REPETIDO (−149 tokens no pareado, −427 na 1ª entrega real); 162 não fecha só com repetição · orçamento da 1ª entrega

**Feito, a seco, zero modelo (Keel aprovou A+B, recusou C).** (A) As Normas de dono tinham 3 cópias e a mesma regra dita 3 vezes: agora uma redação (`OWNER_NORMS` no engine) e o resto compactado, todas as regras mantidas: **−222 caracteres = −89 tokens** do fornecedor (calibrado no OPT-8b: 2,483 car./token; −56 pelo estimador). (B) Variante sem ferramentas (`tools:'none'`): sem "com as ferramentas da Persona quando disponíveis" e sem a frase da operação externa, inertes sem ferramenta: **−60 tokens** (total **−149**). Chamadas COM ferramentas mantêm o texto inteiro; na dúvida, completo.

**Achado maior que o pedido.** Olhando o prompt que o host REALMENTE manda na rota answer-only (primeira entrega), o prompt do worker ia **duas vezes**: o `firstDeliveryExecutionPrompt` já compõe o template e a sessão do runner (`oar/session.ts`, papel worker) o embrulhava em outro `prefixOwnerNorms` (template + normas + instruções da persona de novo). Antes **3.299 caracteres**, a segunda cópia com 910. O embrulho agora é idempotente (um texto que já tem `WORKER_PROMPT_MARK` não é embrulhado outra vez): **2.240 caracteres, −1.059 = −427 tokens por primeira entrega (−32%)**. O pareado do OPT-8b NÃO via isso (o braço Persona mede uma cópia só): o bench não era fiel à rota answer-only nesse ponto; o braço agora usa a variante sem ferramentas (a rodada é `permissionMode: 'deny'`).

**Placar do pareado (entrada, braço Persona):** 3.487 → **≈ 3.338** (razão 1,154 → **1,104**); a banda pede ≤ 3.325 (1,10): fora por 13 tokens. Fechar exigiria (C) cortar os exemplos de evidência "(teste, arquivo, comando, IDs, caminhos)": o Keel recusou (menos orientação ao modelo por 0,004). **Não foi rodado nada real**: a qualidade do texto cortado só uma rodada mostra (15 chamadas haiku, teto 40, mesmas regras do OPT-8b) — o Keel pede o OK ao Atlas.

**Provas.** `worker-prompt-opt10.spec` (texto de antes congelado + corte medido + inventário de 11 regras + variante sem ferramentas + bloco fixo para o cache) e `owner-prompt-wrap.spec` (runners). Rodei engine + runners inteiros e os specs do host de primeira entrega/tokens: **173 arquivos, 1.491 testes verdes**; `check-pkg` engine e runners OK. Contrato `contracts/worker-prompt.md`. Atualizei 4 testes que fixavam o texto antigo (prompts.spec, context-budget.spec, token-faithful.spec, proactivity.spec) para a nova redação da MESMA regra.

**Orçamento da 1ª entrega (linha do Keel).** 28,4 s medidos (D-069) + **≈ 17 s uma vez** da prova de isolamento a frio (CLI 2.1.318, zero modelo) = **≈ 45 s**, dentro dos 2 min. Com o pré-aquecimento do Anvil no boot (`handleReadyEngines`), a 1ª entrega nem espera esses 17 s; o limite de espera é 45 s e depois disso a chamada roda nativa (fail-safe).

**Limitações.** (1) 162 tokens não saem só de repetição: o que é repetição saiu (−149). (2) O terceiro "Normas de dono: Termine. Verifique…" da política de voz (`voice.ts`, ≈ 48 tokens) ainda aparece na rota answer-only; é texto de outro dono e de outra parte do prompt, não toquei. (3) Qualidade sem rodada real: não provada.

## 05/11 00:58 — (B) a 1ª entrega de uma instalação nova já sai isolada · (C) o leitor de cota agora lê o payload real da conta Max

**(B) Feito e provado na CLI real, sem modelo.** O problema: `decide` é síncrono; para uma versão nunca provada ele dispara a prova em segundo plano e devolve `native`, então a 1ª chamada de uma instalação nova (a entrega de boas-vindas) carregava o ambiente inteiro da pessoa (308,9 mil tokens numa requisição, medido). Agora `resolve-runner` chama `IsolationRuntime.settle` antes de decidir: espera a prova, com limite, e já roda `answer-only`. **Fail-safe**: prova lenta, travada, conta deslogada ou CLI ausente = a chamada roda `native` como antes, sem travar a entrega; a prova continua no fundo. Também `prewarmCliIsolation({ modelArgs })` (zero modelo, nunca lança) para o boot — **o Anvil liga no `handleReadyEngines`** (arquivo dele, 1x por versão, nunca no construtor).

**O que a CLI real mostrou e os testes com fake não mostravam.** Store vazio (TEMP novo), CLI 2.1.318 a frio: veredito 13 s + paridade 3,6 s = **≈ 17 s**. Meu limite inicial de 15 s estourava por 1,5 s e a 1ª chamada ainda saía nativa. Corrigido: `settleMs` = **45 s, contado do INÍCIO da prova** (não de cada chamada): as chamadas simultâneas de uma entrega esperam a mesma prova uma vez só, e uma prova que já passou do limite não segura mais ninguém (sem espera acumulada se ela travar). Reprova depois da correção, mesmo cenário: a 1ª chamada esperou 17,0 s e saiu `answer-only/verified` com `--strict-mcp-config --setting-sources project --disable-slash-commands` e as 3 variáveis `CLAUDE_CODE_DISABLE_*`; `modelCalls: 0` (`reports/first-call-isolated-real.json`; script `persona-runners/scripts/first-call-isolated-real.ts`, trava `real`, exige store vazio).

**Provas automatizadas.** `isolation-gate.spec` **29/29** (reescrevi 2 testes que assumiam "1ª chamada nativa"; novos: instalação nova com fake que registra o argv da 1ª chamada = piso + `--model/--effort` explícitos + env, e a 2ª chamada não prova de novo; prova lenta = nativa sem passar do limite e a PRÓXIMA já isolada; conta deslogada = nativa sem espera longa e sem condenar a versão; prova que nunca responde = o turno termina; prazo contado do início, 3 chamadas simultâneas isoladas, espera não acumula; `settle` unitário). Suíte do runners **478/478**, `check-pkg persona-runners` OK. Contrato `contracts/cli-isolation.md` atualizado.

**(C) Leitor de cota (arquivo do Rivet, correção mínima + teste).** O payload real da conta Max (`accountUsage`) é `windows:[{id:"seven_day", usedRatio:0.67, durationMs:604800000, resetsAt}, {id:"model_scoped:Fable", usedRatio:0, …}]`: razão 0..1, **sem janela de 5 h**. O leitor não lia `usedRatio`/`durationMs` (% saía indefinido) e a janela por modelo podia virar a "semana" da conta (0%). Agora lê a razão (×100, 0..100), a duração, mantém ids com `:` como janela própria, e o cartão ignora a janela por modelo. `persona-usage` 37/37, check-pkg OK. Rivet avisado.

**Limitações.** (1) Os 17 s são desta máquina a frio; o pré-aquecimento do boot existe para a 1ª entrega nem esperar, mas só vale depois que o Anvil ligar. (2) A prova é por versão + modelArg: uma persona com outro modelo espera a própria paridade (≈ 3,6 s). (3) Uma 1ª entrega com a CLI deslogada roda nativa (fail-safe) — correto, não há o que provar sem login.

## 05/11 00:30 — OPT-8b: o harness inteiro está PRONTO e a regra pré-registrada TRAVADA em código (nenhuma chamada feita; falta o D-069 real do Probe e o OK do Atlas)

Nada foi gasto. O que existe agora, para a rodada ser um comando só quando o Probe liberar: **(1) a regra como função** (`persona-engine/src/bench/pair-real-b.ts`: `buildPairRealBPlan` 15 chamadas, `assertPairRealBGuards` teto 40 + `answer-only` + trava `real` + limitador, `evaluatePairRealB` = mediana de 3, razão fria e quente na faixa [0,90; 1,10], dispersão ≤ 0,50, qualidade nas 3 de cada célula, validade pelo modo `answer-only` em TODAS as chamadas, falha da CLI substituída uma vez com as duas no cru, teto de 40 contando toda tentativa; `renderPairRealBReport`) com **21 testes escritos antes de existir dado**; **(2) o Adendo 2 do pré-registro** (`reports/opt8b-prereg.md`, registrado antes de qualquer chamada) fixando como ler os casos que o texto original deixava abertos (razões em sentidos opostos, razões na faixa mas qualidade falhou, célula com menos de 3 válidas = tudo "não mensurável", nunca preenchido); **(3) a prova do isolamento sem gastar** (`proveCliIsolation` no runners, 5 testes): sem `answer-only` provado para a versão da CLI a 1ª chamada rodaria nativa e invalidaria a rodada, então o script PARA antes de qualquer chamada de modelo; **(4) o script de entrada** (`persona-engine/scripts/pair-real-b.ts`): ensaio seco por padrão (roda o plano de 15 de ponta a ponta e escreve os arquivos), e no modo real exige as guardas, prova o isolamento, grava os contadores do vendor de cada tentativa (entrada total, laço principal, cache, saída, modo efetivo) e aplica o veredito. Comando real no cabeçalho do script. engine 21 + runners 5 testes verdes, `check-pkg` engine e runners OK.

## 05/11 00:25 — Leitura do Atlas do "Um dia da equipe" (TEAM-R*): meus itens (8) plateia da opinião e (2) revisão que falha

**(8) A plateia do `ask_team_opinion` — CORRIGIDO.** A opinião ia para as 7 personas, inclusive Financeiro e Pessoas recém-contratados, numa arte de campanha. Agora `audience: 'team'` (o padrão) = **as pessoas LIGADAS a este trabalho**: as outras Tarefas do mesmo pedido da pessoa (as partes de uma divisão por função), as colaboradoras da Tarefa (CV-5) e a Coordenação; quem não tem nada a ver com o trabalho não é chamada. `'everyone'` é o projeto todo, de propósito (e entra na regra de rodada grande, >5 colegas pede confirmação); uma lista de ids é exatamente aquela gente. Sem ninguém ligado, cai no projeto todo. A resposta à persona diz quando a rodada foi estreitada e como chamar todo mundo. Ligação em `persona-host/src/index.ts` (`involvedIn`, mesma região que o Anvil liberou), regra injetável em `OpinionTool`, esquema da ferramenta atualizado (`team | everyone | ids`). Provas: opinion-host.spec **25** + opinion-tool.host.spec **10** no host real (inclui: pedido que cita duas personas = uma Tarefa com colaboradora, e a colaboradora + a Coordenação respondem e a Lia, sem relação com o trabalho, NÃO; `everyone` chama as três) + opinion-tools.spec 5 = **40 verdes**; `check-pkg` runners OK. **Um bug meu achado ao verificar a divisão:** cada parte de um pedido composto é uma Tarefa de um evento filho próprio (`split:<mensagem>:<persona>`, com o autor `team:split` que o Atlas apontou no R4), então o `origin.triggerId` das partes é DIFERENTE e a primeira ligação das irmãs não as enxergava. Agora as irmãs se agrupam pelo prefixo `split:<mensagem>:`. Provado no host real com "preciso de uma campanha de lançamento: texto, arte e posts" numa equipe com Redação, Design, Redes sociais, Financeiro e Pessoas: a rodada da Bia vai para o Teo, o Caio e a Coordenação e **nunca** para Financeiro ou Pessoas (opinion-tool.host.spec **11** no host real).

**(2) A revisão "sempre falha" — NÃO é defeito do `reviewStep`; é lacuna do roteirizado, mais uma decisão de apresentação.** O `reviewStep` só devolve "entrega sem selo" (`reviewer-failed`) quando o texto do revisor não começa por `APROVADO` ou `AJUSTES` (`verdictFromText`, Forge), como projetado: uma revisão que não responde nunca segura a entrega. Na jornada do Forge o revisor é roteirizado (`liveText = 'APROVADO\nTudo certo.'`) e a revisão aprova com selo; no "Um dia da equipe" a Lia não recebe essa resposta, então TODA revisão cai no caminho de falha. **Lacuna do roteirizado do Gauge**: dar à Lia a resposta `APROVADO` (ou `AJUSTES` + pontos, para mostrar a volta). O que É do produto e o Atlas apontou: cada falha vira uma linha ("Lia não conseguiu revisar X", 6×), e isso é spam. Minha proposta ao Forge/Muse (o `handoffs.ts` é do Forge): **(a)** uma revisão que falha NÃO escreve linha por Tarefa; o motivo (`reviewer-failed`) fica no registro da revisão e aparece no detalhe da Tarefa ("sem revisão: o revisor não respondeu"); **(b)** no máximo UMA linha agrupada por revisor numa janela (30 min): "Lia não conseguiu revisar 3 entregas; o trabalho seguiu sem revisão"; **(c)** os passos intermediários de uma revisão que corre bem ("pediu a revisão", "Esperando a revisão de Lia") seguem a regra do ruído da Muse: ficam no quadro e no Caminho do trabalho, não no #geral.

## 04/11 23:35 — TEAM-4, lado HOST: a ferramenta `ask_team_opinion` ligada no host de verdade (assumido do Anvil, que revisa)

**O que já existia e eu NÃO dupliquei.** O Bolt tinha escrito o motor da rodada (`opinion-run.ts`, `TeamOpinions.run`: pedido, uma resposta curta por colega com a imagem, UMA consolidação pela persona, linhas `OpinionView`) e deixou escrito que a ferramenta, os contadores e o orçamento eram meus. Meu primeiro rascunho tinha reimplementado o motor, um formato `[[opinion:…]]` e uma 2ª ferramenta (`team_opinion_close`); ao ler o código dele **descartei tudo isso** e refiz o meu lado como a camada fina que ele descreve (e apaguei `opinion-wire.ts` e a ferramenta de fechar, que o `run` já cobre).

**O que é meu (`persona-host/src/opinion-host.ts`, `OpinionTool` + `withOpinionTool`; contrato `contracts/opinion-host.md`).** Antes de chamar alguém: identidade pela execução (nunca argumento), Tarefa viva, `Config.teamwork`, a chave "pode pedir a colegas", argumentos, plateia, e o `budgetOpinionRound`. Só `ask` chega ao `TeamOpinions.run`. **Contadores do host:** rodadas por Tarefa e pedidos do dia por persona, gravados antes do primeiro colega ser chamado, idempotentes por `callId` (a mesma chamada devolve a mesma resposta; uma repetição durante a execução diz `busy`); uma rodada em que o motor recusou antes de chamar ninguém é **devolvida** (não gasta rodada nem pedido). **Um número só para a pessoa:** `teamwork.askedToday` = pedidos a colegas (Forge) + rodadas de opinião, e a mesma soma entra no teto diário do orçamento; o `Handoffs` do Forge não foi tocado. A persona lê de volta as opiniões como DADO entre delimitadores (`opinionDigestFor`), com quem falhou, quem não foi chamado e por quê, o fechamento e se cabe outra rodada. **Ligação no `index.ts`** (Anvil liberou a região): 5 edições cirúrgicas; `harness-dispatch.ts` só perdeu o `team_opinion_close` (a ferramenta saiu) para a árvore compilar; o gancho `options.opinion` dele ficou sem uso (não traz o `ticketId` da execução).

**Provas.** `opinion-host.spec` **22** (portas falsas: off, execução forjada, Tarefa encerrada, chave desligada, argumentos, caps, idempotência, `busy`, rodada 2 sim e 3 não, config 1–3, soma diária, mais de 5 colegas = proposta, até 5 pelo id roda, limite de custo, pausa, sem visão, plateia, rodada devolvida, rodada parcial, composição) + `opinion-tool.host.spec` **8 no host de verdade** (a Bia, com uma Tarefa viva, chama a ferramenta: pedido por ela, uma resposta por colega como esse colega, fechamento dela; contadores; 2ª rodada passa e 3ª recusa sem escrever nada; mesma chamada = mesma resposta; a pessoa baixa o teto para 1; opinião + pedido a colega somam no teto diário; a autonomia padrão NÃO impede; chave desligada recusa). `check-pkg` persona-engine e persona-runners OK; persona-host OK exceto 1 erro que NÃO é meu (`index.ts` ~1592, `hireDirect`, código em andamento de outro builder). **Suíte completa do host: 155 arquivos / 866 verdes, 1 pulado** (rodada antes da mudança de autonomia; depois dela rodei de novo os 3 specs de opinião: 30 verdes).

**Autonomia (decisão do Keel, 23:36, já aplicada).** Eu tinha achado que uma persona nova, em "Sugere e espera", só receberia a PROPOSTA e não rodaria. O Keel decidiu que a autonomia governa ações EXTERNAS e irreversíveis, não pedidos internos ao time: com a chave "Pode pedir ajuda a colegas" ligada e dentro dos tetos a ferramenta RODA em "Sugere e espera" também; vira proposta só se a chave estiver desligada, se estourar um teto ou se a rodada for grande (**mais de 5 colegas** ou o limite de custo do host; escolher até 5 pelo id roda sem confirmar). Removi a dependência de autonomia do `OpinionTool` e do `index.ts`; o "Um dia da equipe" do Gauge não precisa mexer na autonomia. Um defeito meu pego pela jornada real: o resumo para a persona saía com a pergunta vazia; corrigido e travado. **Limites:** `imageSizes` existe mas o host não o liga (falta um `media.attachmentHead` do Bolt), então o custo da imagem sai `estimate` e largo, não `calibrated`; a resposta da pessoa à proposta não vira "autorização de uma rodada"; o cartão de teto (`opinion.roundsCap`) ainda não tem campo no fio.

## 04/11 22:55 — CUSTO REAL DE UMA IMAGEM medido (2 chamadas reais no haiku, OK do Atlas) · a minha estimativa estava errada e foi corrigida

**Rodada real (exatamente 2 chamadas, `reports/image-cost-real.md` + `.json`).** Condições do Keel/Atlas cumpridas: teto 2, trava `real`, limitador `PERSONA_REAL_TURN_CAP=2` com ledger absoluto e fresco (fechou com exatamente 2 turnos iniciados), env limpo, **sem conector nem ferramenta**, `answer-only` PROVADO para a CLI 2.1.318 antes de qualquer chamada, mesmo modo efetivo nas duas. O script foi validado ANTES contra um endpoint falso (zero gasto), as guardas foram testadas recusando setups errados (sem trava, teto 3, ledger relativo) e um `--preflight` provou o isolamento sem chamar o modelo. Mesmo texto nas duas chamadas (a diferença é só a imagem): chamada 1 sem imagem, chamada 2 com um PNG 1500×1000.

| | sem imagem | com imagem | diferença |
|---|---|---|---|
| entrada total (= laço principal) | 3.031 | 5.049 | **+2.018** |
| cache lido / gravado | 2.319 / 710 | 2.319 / 2.728 | gravado +2.018 |
| saída | 38 | 53 | +15 |
| modo | answer-only | answer-only | igual |

**Uma imagem 1500×1000 custa 2.018 tokens de entrada**, cobrados como ESCRITA de cache (1,25× na chamada que a envia; depois vem do cache a 0,1×); ≈ US$ 0,0025 por imagem no haiku. A persona descreveu a imagem certo ("faixa azul-clara em cima, verde embaixo"); sem a imagem disse que não havia (não inventou). **A base de uma chamada de conversa em `answer-only` é ~3 mil tokens** (3.031), contra ~31 mil de uma tarefa com ferramentas e ~377 mil na CLI nativa desta máquina: a imagem sozinha aumenta essa chamada barata em 67%.

**A minha estimativa estava errada** (eu prevera 1.381–1.600 por imagem): eu tinha suposto, além do limite de 1568 px no lado maior, um corte de ~1,15 megapixel e um teto de ~1.600 tokens. A medição desmentiu os dois a 1,5 MP; a regra do vendor (largura × altura ÷ 750) acerta com +0,9%. **Corrigido:** `image-tokens.ts` (sem corte de MP nem teto de 1.600; teto 3.300 = 1568×1568; escala pelo fator medido; `IMAGE_COST_MEASURED`, `IMAGE_CACHE_WRITE_FACTOR`), `opinion-budget.ts` (a imagem é cobrada a 1,25× em cada resposta e na consolidação; `imagens.origin: 'calibrated'` + `basis` quando todos os tamanhos são conhecidos, `estimate` e largo quando não) e **`estimateAsk`** (campo opcional `imagens`: entram na chamada que recebe a mensagem, em tokens e custo; resultado `imagens { count, tokens, origin, basis? }`; cortesia ignora). Exemplo recalculado: 3 colegas Claude + 1 imagem 1500×1000 = 4 chamadas, 9.098–13.554 tokens (a imagem 7.264–8.880), ≈ US$ 0,018–0,030; só texto 1.834–4.674 tokens. A imagem sozinha custa mais que o resto da rodada.

**Marcado `calibrated`, não `measured`:** a diferença entre duas entradas do vendor é aritmética sobre campos do vendor, não um campo do vendor; e é UMA medição (um tamanho, o haiku, a CLI 2.1.318, um PNG de faixas). JPEG, tamanhos que a CLI reduz e outros modelos não foram medidos; o tempo de uma rodada de equipe também não. **Nenhuma repetição foi feita.**

**Provas.** engine: image-tokens + opinion-budget + estimate-ask 73 verdes (inclui testes que TRAVAM o número: 1500×1000 ⇒ 1.816–2.220 cobrindo 2.018; +2.270 µUSD na conversa, +6.810 na execução; `calibrated`/`estimate` por tamanho conhecido); host estimate-ask* + estimate-history-tokens 12 verdes; `check-pkg persona-engine` e `persona-runners` OK. Contratos atualizados: opinion-budget, estimate-ask, team-images.

## 04/11 22:40 — D-090: TEAM-6 (revisão entre colegas como etapa) e TEAM-7 (resumo da manhã) ENTREGUES no engine, puros

Os dois são peças NOVAS e puras (sem relógio, store, rede nem modelo), exportadas do `persona-engine`; nenhum arquivo de outro dono foi editado além de linhas de export aditivas no `index.ts` do Forge (avisado). O host de cada um é do Anvil/Forge.

**TEAM-6 — `persona-engine/src/review-step.ts` (contrato `contracts/review-step.md`).** Política por projeto e tipo de tarefa (`off` | `all` | `types`; quem revisa: Coordenação | colega da mesma função | persona X; **projeto novo = ligada em todas as entregas, pela Coordenação**). `chooseReviewer`: o autor nunca revisa o próprio trabalho (nem a Coordenação, se foi ela); revisor pausado/no limite/sem motor cai para a Coordenação e depois para um colega da mesma função; ninguém elegível ⇒ a entrega segue sem revisão (`skip: no-reviewer`), nunca fica esperando. `reviewStep`: máquina de estados em JSON puro (`author-done` → `ask-review` → aprova ⇒ entrega com o **selo**; devolve ⇒ `return-to-author` com as notas no formato do bilhete, **no máximo 2 voltas**; na 3ª vez com pontos a entrega segue SEM selo e com os pontos à vista; revisor que falha não segura a entrega; eventos duplicados ou fora de ordem não mudam nada). Devolve também as linhas do fio (`asked`/`approved`/`returned` com 1 linha/`adjusted-approved`), o `MessageView.review` e o passo `reviewed` do caminho do trabalho. `readVerdict` (entrada não confiável do modelo do revisor, limpa como bilhete: segredo removido, ≤6 pontos), `reviewRequestFor`/`returnNoteFor` (bilhete como DADO entre delimitadores), `reviewCost` ("≈ 1 tarefa curta a mais", 1 a 5 chamadas, `estimate` até haver histórico medido). Prova: `review-step.spec` **26**, incluindo uma **varredura exaustiva de todas as sequências de 7 eventos**: nenhuma passa de 2 voltas nem de 3 passagens. **Encaixe combinado com o Forge:** o `ready` da autora vira entrega em `orchestration.runLaunched` (~l.2290, gancho `handoffWait`); a revisão entra pelo mesmo caminho (pedido kind `review` ao revisor ANTES do ready) e é ELE quem liga o `reviewStep` no `handoffs.ts`. **Risco avisado ao Forge:** `checkHandoff` não pode barrar o kind `review` por ciclo, nível, teto por Tarefa nem teto diário (a Coordenação que delegou está na cadeia e é quem revisa por padrão).

**TEAM-7 — `persona-engine/src/morning-brief.ts` (contrato `contracts/morning-brief.md`).** A porta é a que o Anvil propôs: `buildMorningBrief({ day, yesterdayStartIso, todayStartIso, tasks, needsYouCount, lastBrief?, maxYesterday? })` → `{ yesterday[], yesterdayMore, today[], needsYou, signature } | undefined` (`undefined` = não posta nada; sem "dia calmo"). Ontem = Tarefas `done` terminadas no dia local anterior (mais recente primeiro, até 3 + "e mais n"); Hoje = running/waiting/review, uma linha por persona ocupada; Precisa de você = a contagem do host; **só os ids e o título limpo (≤120) passam** (LEAK-1: nenhum campo extra da Tarefa sai). Uma diferença da proposta, por causa da spec: assinatura igual com algo esperando a pessoa AINDA posta (só some quando nada mudou **e** nada espera). Extras puros: `dayBounds` (limites do dia com fuso e virada de horário de verão), `briefDueNow` (1ª abertura depois das 6:00, senão 9:00, 1/dia), `renderMorningText` (corpo legível pt-BR; persona sem nome sai da frase, nunca vira id). Prova: `morning-brief.spec` **20**. Sem IA e sem custo por construção.

**Provas.** persona-engine **93 arquivos / 888 testes verdes** (inclui opinion-budget 27, image-tokens 9, review-step 26, morning-brief 20); persona-runners 62 arquivos / 455; `check-pkg persona-engine` e `persona-runners` OK. **Meus 4 itens do D-090 estão fechados do meu lado:** TEAM-5 (imagem, CLI real), TEAM-4 (orçamento), TEAM-6 (revisão), TEAM-7 (resumo). O que falta para o aceite NÃO é meu: o host de cada um (Anvil/Forge/Bolt), as telas (Flint/Ember/Prism/Lumen/Quill), o "Um dia da equipe" (Gauge). Limites declarados: a imagem foi provada em transporte, não o modelo descrevendo-a nem o custo real em tokens (rodada real do aceite b); as estimativas de custo não incluem a base do vendor (~31–38 mil tokens por chamada da CLI) até haver calibração.

## 04/11 22:25 — D-090: TEAM-5 (a imagem chega ao modelo) e TEAM-4 (orçamento e teto das rodadas de opinião) ENTREGUES

**TEAM-5 — prova seca na CLI Claude REAL (`reports/team5-image-dry.json`, zero modelo, zero gasto).** `scripts/team5-image-dry.ts` sobe o `claude` instalado pelo `resolveRunner` do produto (a mesma sessão OAR do host), apontado a um endpoint Anthropic FALSO local, HOME descartável, e olha o que a CLI manda ao "modelo". **7/7:** (1) a imagem chega como bloco `image` base64 `image/png` com os **bytes idênticos ao arquivo (sha256)**, na mesma mensagem do texto, e o caminho do arquivo não aparece no texto; (2) duas imagens, em ordem; (3) o turno seguinte sem imagem não leva imagem; (4) 5 imagens, arquivo acima de 5 MB, `.txt` e arquivo ausente são recusados **antes de abrir sessão**, em pt-BR, com **nenhuma requisição** ao endpoint. O OAR 0.67.0 já tinha a entrada de imagem nativa (`InputOptions.images`); faltava o runner passar. Código: `StartTurnInput.images`, `RunnerCapabilities.images` (só Claude diz `available`), `oar/turn-images.ts` (`checkTurnImages`, `ImagesRefusedError` com `reason` engine/count/size/type/unreadable, máx. 4 imagens de 5 MB, png/jpg/gif/webp), 3 pontos aditivos no `adapter.ts` (Rivet e Bolt avisados). Codex/OpenCode/Cursor recusam com `engine` (fallback honesto; quem decide pular a persona ou mandar só texto é o host). Contrato `contracts/team-images.md`. **Não provado:** o modelo descrever a imagem e o custo real em tokens: só na rodada real do aceite (b).

**TEAM-4 — o orçamento da rodada de opinião, no engine (puro, offline).** `persona-engine/src/ux/opinion-budget.ts` (`budgetOpinionRound`) + `image-tokens.ts` (`imageSizeOf` lê PNG/GIF/WebP/JPEG dos primeiros bytes sem biblioteca; `imageTokens` pela regra pública do vendor, ~largura×altura÷750 depois de reduzida; faixa larga 150–1.600 quando o tamanho é desconhecido). A ferramenta `ask_team_opinion` do Anvil chama antes de qualquer fan-out e recebe `ask` | `propose` ("Sugere e espera", com a frase "Posso pedir a opinião da equipe sobre {tema}? ≈ {n} respostas") | `stop` (`rounds-cap`, `daily-cap`, `nobody`, `no-vision`, `draft-empty`) com a linha honesta e **nenhuma chamada**. Regras: teto de rodadas por Tarefa padrão **2**, a pessoa ajusta 1–3, e nenhum contador (nem NaN, negativo ou gigante) reabre a Tarefa; teto diário **6** pedidos por persona (1 pedido de opinião conta uma vez); **ninguém é pulado em silêncio** (`skipped` com paused / at-limit / unavailable / no-vision / over-limit; quem pede nunca responde ao próprio pedido); chamadas **exatas** (1 resposta por colega + 1 consolidação pela persona); tokens e custo em faixa, `estimate` até o histórico medido sustentar (`calibrated`, ≥5 linhas), nunca `measured`; o rodapé do cartão só leva o custo quando todas as chamadas têm número medido (como a spec pede). Exemplo calculado: 3 colegas Claude + 1 imagem 1500×1000 = 4 chamadas, 7.358–11.074 tokens (a imagem sozinha 5.524–6.400), ≈ US$ 0,012–0,023; só texto 1.834–4.674 tokens. Os números de hoje NÃO incluem a base do vendor (~31–38 mil tokens por chamada da CLI): são um piso honesto (`baseDoVendorIncluida: false`), e é por isso que o rodapé não mostra custo até haver calibração. Um defeito real achado pelo teste: pergunta que já termina em "?" gerava "??" na frase da proposta (corrigido: tema sem pontuação final, cortado em palavra). Contrato `contracts/opinion-budget.md`.

**Provas.** persona-runners **62 arquivos / 455 testes verdes** (turn-images.spec 10); persona-engine: opinion-budget.spec 27 + image-tokens.spec 9 + estimate-ask 27 + connectors-needed 56 = 119 verdes; `check-pkg persona-runners` e `persona-engine` OK; `team5-image-dry` 7/7 na CLI real. **Limites:** o host ainda precisa (Anvil) guardar `roundsUsed` por Tarefa e `asksToday` por persona, e ligar a ferramenta; o teste de host do TEAM-4 ("para no teto com linha honesta; nada de loop") depende dessas peças do Anvil/Bolt/Forge. Próximo: TEAM-6 (revisão entre colegas como etapa) e TEAM-7 (resumo da manhã), combinando os encaixes com o Forge.

## 04/11 22:05 — HT-11 (skills pessoais por opção) e HT-12 (Codex honesto) em código · CORREÇÃO do meu ISO-5: o modo conector derrubava o CLAUDE.md do projeto

**Correção do ISO-5 (falha minha, achada ao testar o HT-11).** O modo conector lançava `--setting-sources local`, e a fonte `local` sozinha **derruba o CLAUDE.md do projeto** (projeto de teste: memória 419 tokens no chão, 0 com `local`, 419 com `local,project`; `reports/ht11-skills-dry3.json`). A persona perderia as instruções do projeto justo nas chamadas com conector. Agora `local,project`: o conector continua sendo o ÚNICO servidor, o servidor do `.mcp.json` do projeto não carrega, o CLAUDE.md volta; custos dos 3 conectores reais idênticos (+1.464/+375/+445, refeito com o código do produto). Teste de regressão em `account-connectors.spec`.

**HT-11 — "usar minhas skills do Claude", desligada por padrão.** A saída óbvia (fonte `user`) foi **descartada com medida**: traz as skills mas também o `settings.json` da pessoa (o esforço aplicado mudou `medium`→`xhigh`; carregaria a lista `permissions.allow` dela). Mecanismo adotado: pasta do PRODUTO com `.claude/skills/<nome>` = junção (Windows) / link simbólico para cada skill da pessoa + `--add-dir`, sem `--disable-slash-commands`. Ponteiro, não cópia; só confere se existe `SKILL.md`, nunca lê o conteúdo, nunca escreve na pasta da pessoa, tirar o ponteiro não toca a skill (testado). Peças: `oar/personal-skills.ts` (`syncSkillsRoot`), `isolationPlan({personalSkills})`, `probeSkills` + `IsolationRuntime.skillsReady` (prova por versão: a pasta acrescenta comandos E modelo/esforço/MCP ficam iguais; senão fail-closed), `resolveRunner({personalSkills})`, chave do pool, uso `personalSkills: 'loaded'|'dropped'`. **Medido na CLI real 2.1.318 (zero modelo):** 21 skills apontadas → +21 comandos, modelo e esforço idênticos, 0 servidores a mais, junto com 1 conector de conta (76 comandos contra 55); o contexto de abertura NÃO sobe (23.899 com ou sem: a CLI adia ferramentas embutidas quando há skills). A tela não promete percentual para skills. Só vale em modo `needed` (no `answer-only` a tarefa roda nativa e já tem tudo).
**Achado lateral para o OPT:** com as slash commands ligadas o contexto de abertura de uma chamada com ferramentas cai de 31.414 para 23.899 (-24%) porque ferramentas embutidas passam a "adiadas". Pode valer para o chão das tarefas, mas adiar ferramenta pode custar uma ida extra ao modelo (ToolSearch): só uma rodada real mede. Candidato a OPT-11, sem fazer nada agora.

**HT-12 — Codex honesto.** `cliCapabilityReport(cli, env)` (nível + o que NÃO está isolado + `connectors: selected|all-loaded|none` + `skills: optional|all-loaded|none` + `permissionPreview: hook|unconfirmed|none`). Codex: `all-loaded` em tudo e `unconfirmed` no cartão de prévia; "selected/optional" só existem em Claude no modo `needed` (teste varre todas as CLIs × modos). **Interceptação no Codex NÃO confirmada:** o codex 0.166.0 tem motor de hooks (eventos `pre_tool_use`, `permission_request`, fonte `session_flags`, `hooks` estável em `codex features`), visto no binário e na `hooks.json` da pessoa, mas nenhuma execução provou que dá para segurar uma ferramenta e mostrar o cartão. Confirmar = experimento com endpoint Responses falso (~2–3 h), proponho depois do D-090.

**Provas.** `personal-skills.spec` 19, `cli-capability.spec` 7, `account-connectors.spec` 22 (+ regressão das fontes); **persona-runners 61 arquivos / 445 testes verdes**; `check-pkg persona-runners` OK; `iso-dry.ts --skills` e `--connector 3` na CLI real OK (`reports/ht11-skills-preflight.json`, `iso5-preflight-dry.json`). Contrato: `contracts/cli-isolation.md` ("ISO-5 — EM CÓDIGO", "HT-11").

## 04/11 21:45 — ISO-5 (runner) EM CÓDIGO e medido na CLI real · HT-10 (roteador de conectores) · stderr nunca vaza · o gate convive com as ferramentas HT-0

**ISO-5 (D-083 item 2, aprovado pelo Atlas com 4 condições) — lado do runner.** Chamada COM ferramentas, modo `needed`, conectores escolhidos pelo roteador: `claude --setting-sources local --disable-slash-commands --settings {"allowedMcpServers":[{"serverUrl":<url>}]}` (sem `--strict-mcp-config`, que bloquearia todos). O `--settings` é único: lista por URL e gancho do gate são mesclados (`oar/flag-settings.ts`). Peças: `isolation.ts` (plano com `accountConnectors`), `isolation-run.ts` (`probeConnector`: lança exatamente como a tarefa, exige UM servidor `connected`, mede o custo contra o chão), `isolation-gate.ts` (`connectorCostOf`/`connectorsReady`, prova por (versão, hash da URL), "usável" vale pela versão, "não usável" revisto em 5 min, pré-voo que não responde em 40 s derruba o conector), `resolve-runner.ts` (opção `accountConnectors`, prova inline antes de abrir a sessão, chave do pool inclui os conectores, uso registra `connectorsLoaded`/`connectorsDropped`). **Falha fechada:** precisa de login, falhou, sumiu da conta, login perdido, CLI que deixa de respeitar a lista (mais de um servidor) ou versão desconhecida ⇒ conector descartado, a chamada roda no chão com o resto e o uso diz quantos caíram.
**Condições do Atlas:** (1) regressão por versão da CLI = a prova acima, por versão; (2) stderr nunca vaza nomes = `redactCliStderr` nos dois pontos de erro do adaptador (3 testes) e stderr do controle descartado; (3) custo real antes do confirmar = **medido com o código do produto contra a CLI 2.1.318, zero modelo (`reports/iso5-preflight-dry.json`, sem nome nem URL, só hash de 8 hex): três conectores reais conectados custam +1.464 / +375 / +445 tokens por chamada sobre um chão de 31.414 (+4,7% / +1,2% / +1,4%)**; o primeiro uso leva 8–13 s (uma vez por versão e conector), por isso a tela chama `connectorCostOf` antes do confirmar e a chamada encontra o cache; (4) concessão por persona e por URL, revogar evicta a sessão quente (chave do pool) = Anvil grava, Quill/Muse fazem a tela.
**Como o host liga:** `resolveRunner({ accountConnectors: [url…] })`; pré-voo da tela `defaultIsolationRuntime(command).connectorCostOf({ version, url })` (`ConnectorProbe | undefined`; sem número a tela não escreve percentual). A porta `connectorCostOf(cli, id)` do contrato antigo virou esta, por versão e URL (`contracts/cli-isolation.md` §4, subseção "ISO-5 — EM CÓDIGO").

**HT-10 (roteador de conectores, puro).** `persona-engine/src/connectors-needed.ts`: `connectorsNeededBy(HumanText, available)` → `{ chosen, missing }`; léxico fechado pt/en, no máximo 3 por chamada, chat/tarefas só por nome, janela de negação de 3 palavras, e-mails e URLs removidos, texto de conector nunca muda o resultado (a função só aceita `HumanText`). Contrato `contracts/connectors-needed.md`. Arquivo novo e aditivo no engine do Forge (avisado).

**Convivência com o HT-0 do Rivet.** As ferramentas de produto chegam como `mcp__persona__*` com `--allowedTools=mcp__persona`. O matcher do gate (`mcp__.*`) as casa, mas o gate foi criado com `ownServers: [DEFAULT_TOOL_SERVER]` e responde "sem opinião": ACL/aprovação do gateway decidem, sem dois cartões. Combinado com o Rivet (ele confirmou por escrito). Nome parecido (`personal`, `persona2`) continua controlado; sem `ownServers`, `persona` seria controlado como qualquer outro (testes em `permission-gate.spec`). **Pedido ao Anvil: o host que sobe o `PermissionGate` passa `ownServers: [DEFAULT_TOOL_SERVER]`.**

**Provas.** `account-connectors.spec` (**22**: plano, mesclagem, pré-voo conectado/precisa de login/falhou/ausente/sem login/vários, cache e TTL, hash-only, timeout, `resolveRunner` com gate no mesmo `--settings`, chave do pool); `stderr-redact.spec` 3; `connectors-needed.spec` 56. **persona-runners 59 arquivos / 419 testes verdes** (antes 383); `check-pkg persona-runners` OK 15,7 s; `check-pkg persona-engine` OK. Dry real: `node --import tsx/esm packages/persona/persona-runners/scripts/iso-dry.ts --mode needed --connector 3 --out persona-spec/reports/iso5-preflight-dry.json` → 3/3 OK (`CONNECTORS PROVEN`, claude 2.1.318), só pedidos de controle.

**Limites.** Nenhuma chamada de modelo com o conector carregado: o conector responder de verdade e o custo medido pelo vendor são o passo B (`needed`), que pede o OK do Atlas. Gate + conector no mesmo `--settings` está provado por teste de argumentos e o gate contra a CLI real separadamente, não numa só sessão. Só conectores de proxy do claude.ai; MCP local segue o ISO-2 (`--mcp-config`). Codex continua `partial`.

## 04/11 21:20 — HT-8/9: o GATE DE PERMISSÃO está em código e provado contra a CLI real

`persona-runners/src/resolve/permission-gate.ts` (+ `tool-action.ts`, `tool-input.ts`), contrato `contracts/permission-gate.md`. O host sobe um `PermissionGate` (servidor em 127.0.0.1, token por execução); `resolveRunner({ permissionGate })` instala o gancho `PreToolUse` HTTP da CLI em `--settings` (Claude); a CLI consulta antes de cada ferramenta MCP com os argumentos completos. Decisão síncrona: classe em `preAllow` passa (**`pay` e `delete` nunca**, mesmo listadas); `approved: [{ tool, argsHash }]` libera **uma** chamada, **uma vez**, só com o hash dos argumentos reais; o resto é negado e vira `PermissionRequest` (preview limitado, segredo mascarado, `truncated`/`masked`, `argsHash`, `verb`). O turno que deixou algo esperando termina `blocked` (`NEEDS_APPROVAL_TEXT`); o gate só decide **armado** e o fim do turno o desarma. **Regra medida:** o gate é a ÚNICA coisa que libera uma ferramenta controlada (falha do gancho é não bloqueante; com regra `allow` a ferramenta executaria; sem `allow` + `dontAsk` é fail-closed).
**Provas:** `permission-gate.spec` 19 + `permission-gate-wire.spec` 5 + `tool-gate.spec` 19; pasta persona-runners **383/383** (56 arquivos); `check-pkg` persona-runners e persona-e2e OK; **`scripts/ht89-dry.ts` contra a CLI real** (endpoint Anthropic falso, MCP falso, zero modelo, zero gasto), 7/7: nega sem aprovação e registra 1 pedido; executa com o hash aprovado; nega com outro hash; classe `send` pré-liberada executa; só leitura pré-liberada nega o envio; **gate fora do ar continua negado**; desarmado nega. A URL exata em `allowedHttpHookUrls` funciona. Regressão por versão da CLI = esse script. Pendências de outros: Anvil (ciclo de vida do gate, classes, `approved`, `confirm.pay/delete`, cartão, coluna), Muse (cartão).

## 04/11 21:10 — EFF-1 (runner) ENTREGUE · HT-8/9 RESOLVIDO a seco: o gate é um gancho PreToolUse HTTP da própria CLI · congelamento cancelado (D-087)

**D-087:** o Miguel prefere esperar a v1.1; o congelamento das 21:00 foi cancelado e a árvore segue construindo, sempre consistente e com UI arriscada atrás de flag. AO-1 segue entregue e ligado.

**HT-8/9 — experimento seco (`reports/ht89-permission-dry.md`, brutos `ht89-permission-dry.json`):** CLI real contra um endpoint Anthropic FALSO e um MCP local falso (zero modelo, zero gasto, nenhum login). (a) Sem gancho a CLI **nunca pergunta ao host**: nega em silêncio (`dontAsk` e modo padrão) e o OAR **não tem API para o host responder** a um pedido de permissão (roda YOLO): o caminho "app_request" do Rivet não existe como está. (b) O gancho `PreToolUse` recebe a ferramenta e os **argumentos completos** e decide: nada aprovado ⇒ nega; hash aprovado ⇒ **executa** (mesmo em `dontAsk`); **outro hash ⇒ nega** ("aprovei A, enviou B" não acontece). (c) O **gancho HTTP** (`type:"http"` + `allowedHttpHookUrls`, tudo em `--settings`) deixa o próprio host decidir num servidor local (porta efêmera + token por execução no cabeçalho): sem `node` no PATH, sem arquivos, sem patch no OAR. (d) **Regra de segurança imposta:** o gancho tem de ser a ÚNICA coisa que libera uma ferramenta controlada: com o servidor do gancho fora do ar e `dontAsk` sem `allow`, a ferramenta fica **negada** (fail-closed); mas com a ferramenta numa regra `allow` a falha do gancho é não bloqueante e ela **executa**. (e) As anotações (`readOnly`) chegam pelo `mcp_status` (`tools[].annotations`), então o pré-voo classifica. Fecha os gaps do Rivet (argumentos descartados, aprovar = reexecutar com checagem de hash, conectores da conta fora do gateway). Código na sequência (`resolve/permission-gate.ts`).

**EFF-1 (D-088), lado do runner:** `contracts/persona-effort.md`. `StartTurnInput.effort` e `PersonaRunnerSpec.effort` → `--effort` só no Claude e só no modelo PRÓPRIO da persona (a conversa barata não herda); sem escolha nada é enviado; se o motor recusa (modelo sem menu de esforço) a sessão reabre sem ele e o uso registra `effortDropped`; esforço na chave da sessão quente e do pool; o esforço da persona vence o que o AO-1 restauraria. **Menu da tela vindo do motor:** `detectConnections` ganhou `modelMenu` (nome + níveis de esforço por modelo; medido na CLI real: `default/opus/sonnet/fable/haiku` = low…max, modelos antigos sem `xhigh`, `haiku-4-5` sem esforço). **Provas:** persona-effort.spec 10 + model-menu.spec 4; pasta persona-runners **352/352** (53 arquivos) e host (conductor, host-inject, real-path, runner-plugin, streaming) no mesmo run 376/376; `check-pkg persona-runners` e `persona-engine`/`persona-e2e` OK. O `check-pkg persona-host` falha hoje em arquivos de outros donos (`orchestration.ts:744` FirstDeliveryRouteDirective e `tests/harness-routines.spec.ts`, exactOptionalPropertyTypes). Falta: Anvil (campo da persona + repasse ao spec), Quill/Prism (seletor a partir de `modelMenu`; parar de gravar `sonnet` fixo), Muse (forma).

## 04/11 20:40 — AO-1 ENTREGUE: answer-only é o padrão do corte final (D-085) · o achado dos 377 mil tokens · HT-8/9 puros

**Achado (seco, argumentos reais do produto, `reports/iso-dry-product.json`):** uma chamada SEM ferramentas (`--tools ''`) abre, na config nativa desta máquina, com **377 321 tokens** de definições MCP (21 servidores, 397 ferramentas) que ela nunca poderia usar, contra **1 608** com nada carregado (−99,6%). Com `--tools ''` a CLI para de adiar as definições MCP e carrega todas, inteiras. Era UMA requisição enorme, não "7 requisições": o misterio do OPT-10 está resolvido; a variação 2×–7× vem de os conectores da conta chegarem de forma assíncrona. Chamada COM ferramentas: nativo 28 223 contra 31 414 isolado (igual).

**AO-1 (D-085), em código e provado:** `persona-runners` — `oar/isolation.ts` (plano por CLI/modo/chamada; modos `native` | `answer-only` | `needed`; **padrão `answer-only`**), `oar/isolation-gate.ts` (veredito por versão da CLI e paridade por modelo + estado das settings; `decide` síncrono: modo não provado ⇒ `native`, prova em segundo plano; recuo de 10 min se a sonda não roda; login ausente não condena a versão), `oar/isolation-run.ts` + `oar/claude-control.ts` (as sondas, só pedidos de controle, zero modelo, stderr descartado), `oar/isolation-probe.ts` (veredito puro), `oar/env-mode.ts` (anota o modo de cada chamada), `scripts/iso-dry.ts` (a mesma prova à mão); ligação ADITIVA em `resolve/resolve-runner.ts` (`createCliRunner`: a política do fornecedor fica intacta e primeiro; o plano e os argumentos de paridade vêm depois). **Zero mudança de modelo E de esforço:** o isolamento sozinho mantinha o modelo mas derrubava o esforço de `xhigh` para `medium` (as `modelSettings` do usuário somem); o runner pergunta à própria CLI (`get_settings.applied`) e passa `--model`/`--effort` explícitos quando divergiria. **Prova real** (`reports/iso-dry-ao1.json`, login real, zero modelo): persona `default` nativo = opus/`xhigh`, isolado com `--model claude-opus-5-5 --effort xhigh` = opus/`xhigh`; persona `haiku` = haiku/`medium` nos dois, sem argumento extra; login igual; 0 MCP, 0 comandos, 0 tokens de ferramenta embutida na chamada sem ferramentas.
**Livro:** `RunnerUsage.envMode` (modo EFETIVO) e `envModeRequested` (só quando caiu para `native`) chegam ao `MeasuredUsage`/`UsageStorePort.record`; falta a coluna `turn_ledger.env_mode` (Anvil/Forge, combinado).
**HT-8/9, funções puras (v1.1, sem efeito no comportamento):** `classifyTool` (classe + verbo; a mais estrita entre anotação e nome; sem anotação e sem verbo ⇒ `send`), `argsHash`/`canonicalJson` (SHA-256 do JSON canônico do input REAL e COMPLETO), `boundedInput` (≤20 campos, 4 KiB, 16 KiB, segredo mascarado, `truncated` e `masked`). Exportados; o Anvil consome.
**Provas:** persona-runners **325/325** (50 arquivos: isolation-plan 21, isolation-gate 25, isolation-probe 7, usage-detail 11, tool-gate 19, usage-env-mode 4) + host (conductor, host-inject, real-path, runner-plugin, streaming) no mesmo run = 363/363; `check-pkg` persona-runners, persona-engine, persona-host e persona-e2e OK. **OPT-8b:** adendo 1 pré-registrado (os dois braços em `answer-only`; o modo vai ao cru; o ganho contra o nativo vai a relatório separado).

## 04/11 20:45 — ISO-4 ENTREGUE (contadores do laço principal + resumo do start) · ISO-5 investigado e APROVADO · fim do congelamento

**ISO-4 (D-081 a), aditivo no `persona-runners`, arquivos novos:** `src/oar/usage-detail.ts` (puro: `mainLoopOf(usage)` e `environmentOf(records)`) e `tests/usage-detail.spec.ts` (14). Aditivo: `contract.ts` (`RunnerEnvironment`; `RunnerUsage.mainLoopInputTokens?`, `mainLoopOutputTokens?`, `environment?`), `index.ts` (export do tipo), `oar/adapter.ts` (`usageOf` lê o `byAgent` do agente raiz e o `system/init` de `session.records()`, defensivo e com cache por sessão). **Regras:** o laço principal é o que o runtime reportou (entrada `byAgent` do agente raiz; sem quebra e sem parte "sem dono" o total é o do raiz; senão **ausente**, nunca 0 nem estimativa); o auxiliar é `total − laço principal`; o resumo do ambiente é só **contagens** (ferramentas, servidores MCP, skills, comandos, plugins) e o modelo — nunca um nome (teste prova que nome de servidor, ferramenta, skill e caminho de plugin não aparecem). `usage-meter.ts` **não** foi tocado (o `withUsageMeter` já repassa o `RunnerUsage` inteiro); colunas do livro ficam para depois (Anvil/Forge). **Provas:** usage-detail (11) + oar-runners + usage-meter = 33; pasta `persona-runners/tests` 248/249; `check-pkg` persona-runners, persona-engine, persona-host e persona-e2e OK. **O 1 vermelho não é meu e é um relógio:** `quota-recheck.spec.ts:224` (Rivet) usa `FIVE_HOUR = 2026-11-04T22:00Z` fixo e o relógio real passou (22:40Z): a cota "já expirou"; avisado com a correção (derivar de `Date.now()`). Falta a revisão do Rivet (pedida). O harness da OPT-8b grava os dois contadores quando eu o preparar.

**ISO-5 (D-083 item 2): APROVADO pelo Atlas.** `reports/iso5-dry.md`/`.json`. Mecanismo: `--setting-sources local` + `--settings {"allowedMcpServers":[{"serverUrl":"…"}]}` (por URL; por nome não casa), fail-closed, sem credencial copiada; custo medido +1 464 tokens/chamada (≈ +4,6%) para um conector de 8 ferramentas. Liga **depois do ISO-1** com o `--strict-mcp-config` como padrão, nas 4 condições do Atlas (regressão do `iso-dry.ts` por versão da CLI com volta ao strict; stderr com nomes nunca vai a tela nem log; pré-voo mede o custo real antes de confirmar; concessão por persona e por conector (URL) com revogar em 1 clique). Registradas em `contracts/cli-isolation.md` §4 (nova porta `connectorCostOf`). O D-082 acabou (hash `4b2c752b47`); voltei ao código na ordem ISO-4 → ISO-1 → ISO-5.

## 04/11 19:55 — D-081: PROVA SECA do isolamento do Claude (zero modelo, login real) e portas do ISO-2

`reports/iso-dry-claude.json` (contagens apenas): pedidos de **controle** (`initialize`, `mcp_status`) a `claude -p --input-format stream-json`, sem mensagem de usuário, 0 quadros de modelo. **Hoje o Claude do host enxerga 21 servidores MCP / 412 ferramentas (dynamic 11, user 3, claudeai 7) e 104 comandos.** `--strict-mcp-config` → **0 MCP em todos os escopos, conectores do claude.ai incluídos**; `--setting-sources project --disable-slash-commands` → 0 comandos; **login (assinatura) idêntico em todas as variantes**. Claude = `full`. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` encolhe os modelos de 13 para 5: fora do padrão; as outras 4 chaves de segundo plano não mudam nada visível.

Consequência de produto (levada ao Atlas): conectores do claude.ai não têm definição local → saem das chamadas da Persona e **não são concediveis** (só MCP locais). Condições do Keel incorporadas (nomenclatura `full|partial|none`, `notIsolated` para a tela, `auth.json` do Codex nunca copiado). Portas fixadas com o Anvil em `cli-isolation.md` §4: `connectorDefinitionOf(cli, id, source?) → 'local'|'remote'|'missing'`, `cliIsolation(cli)`, `cliIsolationReport(cli)`. O `connector-grants.md` do Anvil recebeu meus 4 acréscimos (fingerprint na sessão quente, `not-grantable`, `isolation-partial`, pré-voo de `readOnly`).

## 04/11 19:40 — D-081: contrato de isolamento por CLI (ISO-1) e dos contadores (ISO-4), só desenho — congelamento D-082 em vigor

Escrito `contracts/cli-isolation.md` (nenhum código; `packages/**` intocado desde antes do congelamento). Fatos verificados **a seco** (zero chamada de modelo) nesta máquina, que mostram o tamanho do vazamento do ambiente pessoal: **Claude** herda 3 MCP + conectores do claude.ai + 22 skills; **Codex** 4 MCP + plugins + hooks + skills + `AGENTS.md` do home; **OpenCode** config global com plugins.

**Por CLI:** (1) **OpenCode — isolado, PROVADO:** com `XDG_CONFIG_HOME` numa pasta vazia, `opencode mcp list` dá "No MCP servers configured" e `opencode providers list` mantém a credencial (o login mora em `~/.local/share/opencode/auth.json`, outro diretório). (2) **Claude — isolado por argumentos no diretório nativo** (`--strict-mcp-config` + `--mcp-config` só dos concedidos, `--setting-sources project`, `--disable-slash-commands`, chaves de ambiente de segundo plano), o que mantém o login por não tocar em credencial; **a provar a seco** (controle `initialize`/`mcp_status` sem mensagem de usuário) se cobre os conectores do claude.ai. `--bare` não serve (exige chave de API). (3) **Codex — PARCIAL, achado negativo provado:** `-c mcp_servers={}` não limpa (lista os mesmos) e `-c mcp_servers.<nome>.enabled=false` é rejeitado como config inválida; o `app-server` não tem `--ignore-user-config`; só se desligam recursos (`hooks`, `plugins`, `apps`, `skill_search`). O caminho completo (`CODEX_HOME` do produto com `auth.json` copiado) arrisca o login (token que gira), então **não é o padrão**; a tela deve dizer "parcial". (4) **Cursor:** SDK em processo, não instalado aqui; fora da promessa até haver teste real (Probe).

Novo: `RunnerCapabilities.isolation: 'isolated' | 'partial' | 'none'` para a tela nunca afirmar mais do que existe. **Decisão que talvez precise do Atlas:** aceitar o Codex como `parcial` por ora (D-081 diz "testar o login primeiro"; sem prova de que a cópia convive com a original eu não a faço).

**ISO-4** desenhado (§6 do contrato): `mainLoopInputTokens?`/`mainLoopOutputTokens?` de `session.usage().value.byAgent` (raiz) sem estimar, `environment` com contagens do `system/init`, aditivo no `withUsageMeter`. Arquivos novos planejados (`oar/usage-detail.ts`, `oar/isolation.ts`, testes e `scripts/iso-dry.ts`). Rivet respondeu: depois do pack o `persona-runners` é meu; ordem dos wrappers do ramo CLI e o lugar do isolamento por conta (`isolated-home.ts`, `native-cli-env.ts`) registrados. Keel: posso editar o `persona-runners` logo que ele anunciar o fim do congelamento com o hash.

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
